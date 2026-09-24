/**
 * The only module in this plugin that writes into DSH's own DOM.
 *
 * DSH has shipped its running-turn label in two shapes, and neither has a slot
 * beside it:
 *
 *  - **`legacy`** (0.1.5): a bare, visible `<div role="status">` at the end of
 *    the transcript — "深度求索中..." in a shimmering blue, plus an elapsed
 *    clock in a child span once the turn passes fifteen seconds.
 *  - **`process`** (0.1.7): the blue row is gone. The running label moved into
 *    the turn's fold header — a `<button data-turn-process>` reading
 *    "深度求索中，用时12秒" in secondary grey — and the `role="status"` element
 *    that still exists is a visually hidden announcement placed immediately
 *    before that button. Matching the old way lands the whale inside a 1 px
 *    clipped span: attached, and invisible.
 *
 * Both are found the same way — a `role="status"` element whose text is DSH's
 * label — and then told apart by one structural hop: whether the element's
 * next sibling carries `data-turn-process`. That is an attribute DSH writes on
 * purpose, not a content-hashed class, so the rule below still holds.
 *
 * Putting the whale to the left of that label — and replacing the label with a
 * word that says what the turn is actually doing — cannot be done through the
 * slot registry, so it is done here, against the live element, and nowhere
 * else.
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
 *  - **It never re-matches text it wrote.** A `legacy` row is tracked by
 *    identity after the first match, because its text is the very thing this
 *    module replaces. Re-matching a relabelled row is a livelock: the word no
 *    longer matches, so the anchor lets go and restores DSH's label, which
 *    matches again, so it relabels. The first version did exactly that and
 *    span the CPU until the tab was closed. A `process` row is re-checked on
 *    every pass, which is safe for exactly one reason: the text it is checked
 *    against is the hidden announcement, and this module never writes that.
 *  - **It keeps DSH's clock.** The `process` label carries the elapsed time in
 *    the same text node as the words, and React rewrites that node every
 *    second. Only the leading words are swapped — "读取文件中，用时12秒" — and
 *    whatever React writes next is taken as DSH's new original.
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

/** Stamped on the host with the shape of the row it was put into. */
export const STATUS_KIND_ATTR = 'data-whale-buddy-kind'

/** At most this many whale rebuilds per {@link REBUILD_WINDOW_MS}. */
const MAX_REBUILDS = 20
const REBUILD_WINDOW_MS = 1000

/** DSH's attribute on the 0.1.7 turn fold header. Not a class: stable by design. */
const PROCESS_ATTR = 'data-turn-process'

/** How the caller recognises DSH's own label. */
export type StatusMatcher = (text: string) => boolean

/** Which of DSH's two running-label shapes was found; see the module header. */
export type StatusRowKind = 'legacy' | 'process'

/** Options for {@link attachStatusAnchor}. */
export interface StatusAnchorOptions {
  readonly document: Document
  /**
   * Where to look, and what to observe; defaults to the whole document. Only
   * the demo narrows it, to host both DSH shapes on one page.
   */
  readonly scope?: Element
  /** Recognises DSH's running-turn label among the page's status regions. */
  readonly match: StatusMatcher
  /** Builds the whale into the host element the anchor creates. */
  readonly render: (host: HTMLElement) => void
  /** Called when the anchor attaches or re-attaches after a re-render. */
  readonly onAttach?: (host: HTMLElement) => void
  /**
   * Called with the shape of every row found, before {@link claim} decides.
   * This is how the plugin learns whether this DSH still draws the old blue
   * row itself.
   */
  readonly onFound?: (kind: StatusRowKind) => void
  /**
   * Whether to take a row of this shape. Declining one puts the anchor to
   * sleep for good — a DSH build does not change shape mid-turn, so there is
   * nothing left to watch for. Defaults to taking every row.
   */
  readonly claim?: (kind: StatusRowKind) => boolean
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
  /** Follow the plugin's motion setting; only a plugin-owned row has any. */
  setMotion?(motion: 'full' | 'subtle' | 'static'): void
  /** Remove the whale, restore DSH's label, and stop observing. */
  destroy(): void
}

/** One running label, resolved to the elements this module touches. */
interface StatusTarget {
  readonly kind: StatusRowKind
  /** The `role="status"` element whose text identified the label. */
  readonly announcer: HTMLElement
  /** Where the whale goes, as the first child. */
  readonly row: HTMLElement
  /** The element whose own text node carries the words. */
  readonly label: HTMLElement
}

/**
 * Find DSH's running-turn label among the page's live regions.
 * @param scope - the subtree to search.
 * @param match - recognises the label.
 * @returns the resolved label, or null when this DSH build does not render one.
 */
function findTarget(scope: ParentNode, match: StatusMatcher): StatusTarget | null {
  let legacy: StatusTarget | null = null
  for (const node of scope.querySelectorAll('[role="status"]')) {
    const element = node as HTMLElement
    if (!match(ownText(element))) continue
    const target = resolveTarget(element)
    // A 0.1.7 header is decisive. A legacy-shaped match is only a candidate:
    // it is recognised by what it is *not*, so an older live region that
    // happens to mention DeepSeek must not win over the real running label.
    if (target.kind === 'process') return target
    legacy ??= target
  }
  return legacy
}

/**
 * Whether this page already shows DSH 0.1.7's shape, without waiting for a
 * turn: every turn's fold header, closed ones included, is preceded by its
 * announcement. Lets the classic row decide at once on a page with history.
 * @param scope - the subtree to probe.
 * @returns `'process'` when the 0.1.7 pairing is present, otherwise null.
 */
export function probeStatusShape(scope: ParentNode): StatusRowKind | null {
  return scope.querySelector(`[role="status"] + [${PROCESS_ATTR}]`) === null ? null : 'process'
}

/**
 * Tell the two shapes apart; see the module header.
 * @param announcer - the matched `role="status"` element.
 * @returns the elements to write into.
 */
function resolveTarget(announcer: HTMLElement): StatusTarget {
  const next = announcer.nextElementSibling as HTMLElement | null
  if (next !== null && next.hasAttribute(PROCESS_ATTR)) {
    return { kind: 'process', announcer, row: next, label: labelOf(next) }
  }
  return { kind: 'legacy', announcer, row: announcer, label: announcer }
}

/**
 * The fold header's text-bearing child: its first element with words in it.
 * Falls back to the header itself so a restructured button still gets a whale.
 */
function labelOf(row: HTMLElement): HTMLElement {
  for (const child of row.children) {
    if (child.hasAttribute(STATUS_HOST_ATTR)) continue
    if ((child.textContent ?? '').trim() !== '') return child as HTMLElement
  }
  return row
}

/**
 * An element's own text: its direct text nodes, nothing nested. DSH's label is
 * always a direct text node, while the live regions that merely *contain*
 * text — a turn-error row, a retry row — keep theirs in child spans. Matching
 * on this rather than on the whole subtree is what keeps those out.
 */
function ownText(element: Element): string {
  let text = ''
  for (const child of element.childNodes) {
    if (child.nodeType === 3) text += child.nodeValue ?? ''
  }
  return text
}

/** First non-blank text node directly inside `element`. */
function wordNode(element: HTMLElement): Text | null {
  for (const child of element.childNodes) {
    if (child.nodeType === 3 && (child.nodeValue ?? '').trim() !== '') return child as Text
  }
  return null
}

/** A label without its trailing ellipsis: "深度求索中..." → "深度求索中". */
function stemOf(text: string): string {
  return text.trim().replace(/(?:\.{3}|…)+$/, '').trim()
}

/**
 * The text to show for one DSH label.
 *
 * A `legacy` row is the word and nothing else, as it always was. A `process`
 * row keeps DSH's own tail — the elapsed clock — and swaps only the words in
 * front of it; a label that does not start with DSH's words (the header has
 * already flipped to "用时12秒" because the turn closed) is left exactly as DSH
 * wrote it.
 */
function displayFor(target: StatusTarget, original: string, word: string | undefined): string {
  if (word === undefined) return original
  if (target.kind === 'legacy') return word
  const stem = stemOf(ownText(target.announcer))
  if (stem === '' || !original.startsWith(stem)) return original
  return stemOf(word) + original.slice(stem.length)
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

/**
 * Attach the whale to the left of DSH's running-turn label.
 * @param options - document, label matcher and whale renderer.
 * @returns the anchor handle; `destroy` restores DSH's own markup.
 */
export function attachStatusAnchor(options: StatusAnchorOptions): StatusAnchor {
  const doc = options.document
  const win = doc.defaultView
  const scope: Element = options.scope ?? doc.body

  let target: StatusTarget | null = null
  let host: HTMLElement | null = null
  /** DSH's own label, remembered so detaching can put it back. */
  let original: string | null = null
  /** What this module last wrote, so a write by React can be told apart. */
  let written: string | null = null
  let word: string | undefined
  let tag = 'idle'
  let applying = false
  let disposed = false
  /** Set when a row was found and declined; nothing more is ever done. */
  let dormant = false
  /** Recent host builds, for the rebuild guard in {@link attach}. */
  const builds: number[] = []

  const buildHost = (kind: StatusRowKind): HTMLElement => {
    const element = doc.createElement('span')
    element.setAttribute(STATUS_HOST_ATTR, tag)
    element.setAttribute(STATUS_KIND_ATTR, kind)
    element.setAttribute('aria-hidden', 'true')
    element.className = 'wb-status'
    options.render(element)
    return element
  }

  /**
   * Write our word over DSH's label, remembering what was there.
   *
   * Any text that is not the last thing this module wrote is DSH's: that is
   * how a clock React advanced a second ago becomes the new original instead
   * of being overwritten with a stale one.
   */
  const applyWord = (current: StatusTarget): void => {
    const node = wordNode(current.label)
    if (node === null) return
    const text = node.nodeValue ?? ''
    if (original === null || text !== written) original = text
    const next = displayFor(current, original, word)
    if (text !== next) node.nodeValue = next
    written = next
  }

  /** Is the tracked row still the running label it was when claimed? */
  const stillValid = (current: StatusTarget): boolean => {
    if (!current.row.isConnected || !current.announcer.isConnected) return false
    if (current.kind === 'legacy') return true
    // Safe to re-match: this module never writes into the announcer.
    return (
      current.announcer.nextElementSibling === current.row &&
      (current.label === current.row || current.label.parentElement === current.row) &&
      options.match(ownText(current.announcer))
    )
  }

  /**
   * Put the whale and the word in place; idempotent.
   *
   * The matcher only looks for a new row while nothing valid is tracked. A
   * `legacy` row is then followed by identity, because by then its text is
   * this plugin's word rather than DSH's label.
   */
  const attach = (): void => {
    if (disposed || dormant) return
    if (target !== null && !stillValid(target)) release(target.row.isConnected)
    const found = target ?? findTarget(scope, options.match)
    if (found === null) return
    if (found !== target) {
      options.onFound?.(found.kind)
      if (options.claim !== undefined && !options.claim(found.kind)) {
        dormant = true
        observer?.disconnect()
        return
      }
      target = found
      original = null
      written = null
      host = null
    }
    applying = true
    try {
      if (host === null || !host.isConnected || host.parentElement !== found.row) {
        // Second guard, aimed at the one loop that is not about text: a row
        // the anchor keeps rebuilding. React replacing a row is a few times a
        // turn; the same row claimed, released and rebuilt on every mutation
        // is a bug, and costs the inline whale rather than the tab.
        const stamp = Date.now()
        builds.push(stamp)
        while (builds.length > 0 && stamp - (builds[0] ?? stamp) > REBUILD_WINDOW_MS) builds.shift()
        if (builds.length > MAX_REBUILDS) {
          dormant = true
          observer?.disconnect()
          release(true)
          return
        }
        host?.remove()
        host = buildHost(found.kind)
        // First child: both shapes are flex rows, so this lands the whale to
        // the left of the words, which is the whole point.
        found.row.insertBefore(host, found.row.firstChild)
        adoptInk(found.row, host)
        options.onAttach?.(host)
      }
      applyWord(found)
    } finally {
      applying = false
    }
  }

  /** Undo everything on the current row. */
  function release(restore: boolean): void {
    const current = target
    target = null
    if (current === null) return
    applying = true
    try {
      if (restore && original !== null) {
        const node = wordNode(current.label)
        // Only undo our own write; a value React put there since is DSH's.
        if (node !== null && node.nodeValue === written) node.nodeValue = original
      }
      host?.remove()
    } finally {
      applying = false
      host = null
      original = null
      written = null
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
  observer?.observe(scope, { childList: true, subtree: true, characterData: true })
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
      if (target !== null) {
        const current = target
        applying = true
        try {
          applyWord(current)
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
