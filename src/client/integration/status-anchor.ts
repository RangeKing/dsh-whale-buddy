/**
 * The only module in this plugin that writes into DSH's own DOM.
 *
 * DSH renders its running-turn label as a bare `<div role="status">` inside the
 * transcript, with no slot beside it and no slot around it. Putting the whale
 * to the left of that label — and replacing the label with a word that says
 * what the turn is actually doing — cannot be done through the slot registry,
 * so it is done here, against the live element, and nowhere else.
 *
 * The approach is the one dsh-thought-buddy used against the same element; the
 * implementation is new, because that plugin reached it through a third-party
 * loader's anchor table which the current DSH has no equivalent of.
 * BSD-3-Clause attribution for the technique is recorded in
 * THIRD_PARTY_NOTICES.md.
 *
 * What makes this survivable rather than merely fragile:
 *
 *  - **It is identified by role and by text, not by class.** DSH's class names
 *    are content-hashed (`EvIC1a_turnStatus`) and change every build; the
 *    `role="status"` contract and the label text do not.
 *  - **It matches once.** After the first match the element is tracked by
 *    identity and the text is never consulted again, which matters because the
 *    text is the very thing this module replaces. Re-matching a relabelled row
 *    is a livelock: the word no longer matches, so the anchor lets go and
 *    restores DSH's label, which matches again, so it relabels. The first
 *    version did exactly that and span the CPU until the tab was closed.
 *  - **It restores what it changed.** The original label is remembered and put
 *    back on detach, so disabling the plugin mid-turn leaves DSH's own UI intact.
 *  - **It observes only while a turn is running,** and disconnects the moment
 *    the turn ends. React re-renders that element roughly once a second once
 *    the elapsed clock appears, which is exactly when an un-observed injection
 *    would silently vanish.
 *  - **It fails quiet.** If the element never appears — a DSH version that
 *    renames the role, drops the label, restructures the transcript — nothing
 *    is thrown and nothing is left behind. The Dock is unaffected.
 */

/** Marks the element this module owns inside DSH's status row. */
export const STATUS_HOST_ATTR = 'data-whale-buddy-status'

/** How the caller recognises DSH's own label. */
export type StatusMatcher = (text: string) => boolean

/** Options for {@link attachStatusAnchor}. */
export interface StatusAnchorOptions {
  readonly document: Document
  /** Recognises DSH's running-turn label among the page's status regions. */
  readonly match: StatusMatcher
  /** Builds the whale into the host element the anchor creates. */
  readonly render: (host: HTMLElement) => void
  /** Called when the anchor attaches or re-attaches after a re-render. */
  readonly onAttach?: (host: HTMLElement) => void
}

/** A live attachment to DSH's status row. */
export interface StatusAnchor {
  /** True while the whale is actually inside DSH's status element. */
  isAttached(): boolean
  /**
   * Set the word shown in place of DSH's label.
   * @param word - the replacement, or undefined to restore DSH's own text.
   */
  setWord(word: string | undefined): void
  /**
   * Stamp the derived activity onto the injected element.
   *
   * Purely diagnostic, and worth the two lines: the word alone cannot tell you
   * whether the plugin decided "thinking" or merely failed to notice a tool,
   * because one of the words it shows is the same as DSH's own.
   * @param tag - a short label such as `working:reading`.
   */
  setTag(tag: string): void
  /** Remove the whale, restore DSH's label, and stop observing. */
  destroy(): void
}

/**
 * Find DSH's running-turn status element among the page's live regions.
 * @param doc - the document to search.
 * @param match - recognises the label.
 * @returns the element, or null when this DSH build does not render one.
 */
function findStatus(doc: Document, match: StatusMatcher): HTMLElement | null {
  for (const node of doc.querySelectorAll('[role="status"]')) {
    const element = node as HTMLElement
    if (match(stripHost(element))) return element
  }
  return null
}

/**
 * Match the first literal colour in a CSS value.
 *
 * Deliberately narrow: it reads the first stop of a gradient and nothing else.
 * `getComputedStyle` has already resolved every var() and named colour into
 * `rgb()` / `rgba()` by the time this sees the string.
 */
const FIRST_COLOR = /rgba?\([^)]*\)|#[0-9a-f]{3,8}/i

/** True for a colour that paints nothing. */
function isBlank(value: string): boolean {
  return value === '' || value === 'transparent' || /^rgba\([^)]*,\s*0\s*\)$/.test(value)
}

/**
 * Give the whale the same ink DSH gives its label.
 *
 * DSH paints the running-turn label with a shimmering blue gradient clipped to
 * the glyphs, which means the element's own `color` and `-webkit-text-fill-color`
 * are both transparent — inheriting from it would draw nothing, and the first
 * version of this surface therefore hard-coded the primary label colour and
 * shipped a near-black whale beside a blue word. Neither a CSS variable nor a
 * class carries that blue: it is written literally into a content-hashed rule.
 * So it is read off the row once per attach, from the one place it exists.
 *
 * Only the gradient's first stop is taken. Following the sweep would mean
 * repainting every frame to chase an animation the whale is beside, not part of.
 * @param row - DSH's status element.
 * @param target - the plugin's host span.
 */
function adoptInk(row: HTMLElement, target: HTMLElement): void {
  const view = row.ownerDocument.defaultView
  if (view === null || typeof view.getComputedStyle !== 'function') return
  const style = view.getComputedStyle(row)
  // -webkit-text-fill-color wins over color when both are set, and is the
  // channel DSH actually blanks; engines that do not report it fall back to
  // color, which is the same answer everywhere except this one rule.
  const fill = style.webkitTextFillColor ?? ''
  if (!isBlank(fill === '' ? (style.color ?? '') : fill)) return
  const ink = FIRST_COLOR.exec(style.backgroundImage ?? '')
  if (ink === null || isBlank(ink[0])) return
  target.style.color = ink[0]
}

/** The element's text with the plugin's own subtree excluded. */
function stripHost(element: Element): string {
  let text = ''
  for (const child of element.childNodes) {
    if (child.nodeType === 1 && (child as Element).hasAttribute(STATUS_HOST_ATTR)) continue
    text += child.textContent ?? ''
  }
  return text
}

/**
 * Attach the whale to the left of DSH's running-turn label.
 * @param options - document, label matcher and whale renderer.
 * @returns the anchor handle; `destroy` restores DSH's own markup.
 */
export function attachStatusAnchor(options: StatusAnchorOptions): StatusAnchor {
  const doc = options.document
  const win = doc.defaultView

  let status: HTMLElement | null = null
  let host: HTMLElement | null = null
  /** DSH's own label, remembered so detaching can put it back. */
  let original: string | null = null
  let word: string | undefined
  let tag = 'idle'
  let applying = false
  let disposed = false

  const buildHost = (): HTMLElement => {
    const element = doc.createElement('span')
    element.setAttribute(STATUS_HOST_ATTR, tag)
    element.setAttribute('aria-hidden', 'true')
    element.className = 'wb-status'
    options.render(element)
    return element
  }

  /** Write our word over DSH's label, remembering what was there. */
  const applyWord = (target: HTMLElement): void => {
    for (const child of target.childNodes) {
      if (child.nodeType !== 3) continue
      const text = child.nodeValue ?? ''
      if (text.trim() === '') continue
      if (original === null) original = text
      const next = word ?? original
      if (child.nodeValue !== next) child.nodeValue = next
      return
    }
  }

  /**
   * Put the whale and the word in place; idempotent.
   *
   * The matcher runs only while nothing is tracked. Once an element is claimed
   * it is followed by identity until it leaves the document, because by then
   * its text is this plugin's word rather than DSH's label.
   */
  const attach = (): void => {
    if (disposed) return
    if (status !== null && !status.isConnected) {
      // The row React gave us is gone; drop it without trying to restore text
      // on a detached node, then look for its replacement.
      status = null
      host = null
      original = null
    }
    const found = status ?? findStatus(doc, options.match)
    if (found === null) return
    if (found !== status) {
      status = found
      original = null
      host = null
    }
    applying = true
    try {
      if (host === null || !host.isConnected || host.parentElement !== status) {
        host = buildHost()
        // First child: DSH's status row is a flex row, so this lands the whale
        // to the left of the label, which is the whole point.
        status.insertBefore(host, status.firstChild)
        adoptInk(status, host)
        options.onAttach?.(host)
      }
      applyWord(status)
    } finally {
      applying = false
    }
  }

  /** Undo everything on the current element. */
  const release = (restore: boolean): void => {
    const target = status
    status = null
    if (target === null) return
    applying = true
    try {
      if (restore && original !== null) {
        for (const child of target.childNodes) {
          if (child.nodeType !== 3) continue
          if ((child.nodeValue ?? '').trim() === '') continue
          child.nodeValue = original
          break
        }
      }
      host?.remove()
    } finally {
      applying = false
      host = null
      original = null
    }
  }

  // React owns this element and re-renders it — every second once the elapsed
  // clock appears — so the injection has to be re-applied rather than done once.
  const Observer = win?.MutationObserver
  /**
   * Re-entrancy guard. Every write this module makes is a mutation the
   * observer will see, so a future change that makes `attach` non-idempotent
   * would loop. Bailing out degrades that into "the whale stops updating"
   * rather than "the tab stops responding".
   */
  let burst = 0
  let burstTick = 0
  const observer =
    Observer === undefined
      ? null
      : new Observer(() => {
          if (applying || disposed) return
          const now = Date.now()
          if (now !== burstTick) {
            burstTick = now
            burst = 0
          }
          if (++burst > 60) return
          attach()
        })
  observer?.observe(doc.body, { childList: true, subtree: true, characterData: true })
  attach()

  return {
    isAttached: () => host !== null && host.isConnected,
    setTag(next) {
      if (tag === next) return
      tag = next
      if (host !== null) {
        applying = true
        try {
          host.setAttribute(STATUS_HOST_ATTR, tag)
        } finally {
          applying = false
        }
      }
    },
    setWord(next) {
      if (word === next) return
      word = next
      if (status !== null) {
        applying = true
        try {
          applyWord(status)
        } finally {
          applying = false
        }
      }
    },
    destroy() {
      disposed = true
      observer?.disconnect()
      release(true)
    },
  }
}
