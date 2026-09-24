/**
 * Surface B — the Whale Dock.
 *
 * One shell that is either a button or a panel. Collapsed and expanded are the
 * same element with different dimensions, its transform origin pinned to the
 * right edge, so opening reads as the button growing inward rather than a
 * modal appearing somewhere else. The whale never moves between the two
 * states; it stays in the button, and the panel opens beside it.
 *
 * The interaction contract — one continuous surface, a stable side anchor, a
 * subtle hover response, reduced motion showing final states, and transitions
 * that survive being interrupted — is a Web reimplementation of the ideas in
 * dsh-notch (MIT). No AppKit or SwiftUI source was copied or translated; see
 * THIRD_PARTY_NOTICES.md, where it is recorded as design inspiration rather
 * than reused code.
 *
 * Interruption safety is handled with a generation counter: every open/close
 * takes a ticket, and a deferred callback that finds its ticket stale does
 * nothing. Rapid open → close → open therefore always settles on the state the
 * last click asked for.
 */
import { fallbackTranslate, type Translate } from '../locales.js'
import { DOCK_BUTTON, DOCK_PANEL_WIDTH, DOCK_TRANSITION_MS } from '../styles/plugin-css.js'
import { mountWhale, type WhaleView } from '../whale/view.js'
import { REDUCED_MOTION_QUERY } from '../whale/view.js'
import type { MotionMode, RandomSource, WhaleSemanticState } from '../whale/types.js'
import { makeDockDraggable, type DockDrag } from './dock-drag.js'
import { createDockPanel, type DockPanel } from './dock-panel.js'

/**
 * Whale width inside the collapsed button, CSS pixels.
 *
 * Fixed rather than configurable: the button is a 42 px hit target and the
 * whale plus its motion bleed has to stay inside it, so a user setting meant
 * for the inline surface must not be able to burst it.
 */
export const DOCK_WHALE_SIZE = 24

/** Mount options. */
export interface WhaleDockOptions {
  /** Element the dock roots itself in — the DSH shell overlay layer. */
  readonly host: Element
  readonly state: WhaleSemanticState
  readonly motion: MotionMode
  readonly inlineEnabled: boolean
  /** Whether the classic blue status row is switched on; defaults to off. */
  readonly classicStatus?: boolean
  /** Where the Dock sits on its edge, 0 (top) to 1 (bottom). */
  readonly dockTop?: number
  /** Copy; defaults to the built-in English dictionary. */
  readonly t?: Translate
  readonly random?: RandomSource
  readonly onInlineEnabled?: (enabled: boolean) => void
  readonly onClassicStatus?: (enabled: boolean) => void
  readonly onMotion?: (motion: MotionMode) => void
  /** Fired whenever the panel opens or closes. */
  readonly onToggle?: (expanded: boolean) => void
  /** Called when the user finishes moving the Dock along its edge. */
  readonly onDockTop?: (top: number) => void
}

/** A mounted dock. */
export interface WhaleDock {
  readonly element: HTMLElement
  readonly button: HTMLButtonElement
  readonly view: WhaleView
  isExpanded(): boolean
  setExpanded(expanded: boolean): void
  setState(state: WhaleSemanticState): void
  setMotion(motion: MotionMode): void
  setInlineEnabled(enabled: boolean): void
  setClassicStatus(enabled: boolean): void
  /** Move the Dock along its edge from outside a drag. */
  setDockTop(top: number): void
  retranslate(t: Translate): void
  destroy(): void
}

/** Marks the single dock root inside one host. */
export const DOCK_ROOT_ATTR = 'data-whale-buddy-dock'

/**
 * Mount the Whale Dock. Idempotent per host: a second call while a dock is
 * already mounted there returns null rather than producing a second one, which
 * is what keeps SPA navigation and React rerenders from stacking docks.
 * @param options - host, state, motion mode, copy and change callbacks.
 * @returns the dock handle, or null when the host already has one.
 */
export function mountWhaleDock(options: WhaleDockOptions): WhaleDock | null {
  const host = options.host
  if (host.querySelector(`[${DOCK_ROOT_ATTR}]`) !== null) return null
  const doc = host.ownerDocument
  const win = doc.defaultView
  let t = options.t ?? fallbackTranslate()
  // Stable indirection: the panel is built once but the active dictionary can
  // change under it, so it must read `t` at call time rather than capture it.
  const translate: Translate = (key) => t(key)

  const element = doc.createElement('div')
  element.className = 'wb-dock'
  element.setAttribute(DOCK_ROOT_ATTR, '')

  const shell = doc.createElement('div')
  shell.className = 'wb-dock__shell'
  shell.dataset.expanded = 'false'
  shell.dataset.state = options.state

  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'wb-dock__button'
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-label', t('dock.open'))
  button.setAttribute('aria-describedby', '')
  button.removeAttribute('aria-describedby')
  button.title = t('dock.move')

  const mark = doc.createElement('span')
  mark.className = 'wb-dock__mark'
  button.appendChild(mark)
  shell.appendChild(button)
  element.appendChild(shell)
  host.appendChild(element)
  element.style.setProperty('--wb-dock-size', `${DOCK_BUTTON}px`)

  const view = mountWhale({
    host: mark,
    size: DOCK_WHALE_SIZE,
    state: options.state,
    motion: options.motion,
    // A full breach: the shell stops clipping while it is collapsed and
    // settled, so the whale is free to leap clear of its own button.
    leapScale: 1,
    ...(options.random === undefined ? {} : { random: options.random }),
  })
  view.fitToMark()

  let state = options.state
  let motion = options.motion
  let inlineEnabled = options.inlineEnabled
  let classicStatus = options.classicStatus ?? false
  let expanded = false
  let panel: DockPanel | null = null
  let generation = 0
  let disposed = false
  let drag: DockDrag | null = null
  /** Every deferred callback this dock owns, so teardown can cancel them all. */
  const timers = new Set<number>()

  const media =
    win !== null && typeof win.matchMedia === 'function'
      ? win.matchMedia(REDUCED_MOTION_QUERY)
      : null
  const reduced = (): boolean => media?.matches === true

  const clearTimers = (): void => {
    if (win !== null) for (const id of timers) win.clearTimeout(id)
    timers.clear()
  }

  /** Schedule a callback that this dock can cancel wholesale. */
  const defer = (callback: () => void): void => {
    if (win === null) {
      callback()
      return
    }
    const id = win.setTimeout(() => {
      timers.delete(id)
      callback()
    }, DOCK_TRANSITION_MS)
    timers.add(id)
  }

  /**
   * Height of the shell once the panel is laid out, measured at the open
   * *width* because the width decides how the text wraps.
   *
   * The measurement is done with transitions suppressed and while the panel is
   * still at opacity 0, which is what stopped the open from flickering: the
   * previous version appended the panel, flipped `data-expanded` to true — so
   * the panel became fully opaque immediately — and only then measured and
   * grew the shell. For one frame the full panel was painted inside a 42 px
   * box, which read as a flash of squeezed content before the shell caught up.
   */
  const measureExpanded = (): number => {
    const width = shell.style.width
    const height = shell.style.height
    shell.dataset.measuring = ''
    shell.style.width = `${DOCK_PANEL_WIDTH}px`
    shell.style.height = 'auto'
    const measured = shell.offsetHeight
    shell.style.width = width
    shell.style.height = height
    void shell.offsetHeight
    delete shell.dataset.measuring
    return measured > 0 ? measured : DOCK_BUTTON
  }

  /**
   * Drive the shell between its two geometries, keeping the right edge fixed
   * (the element is right-anchored in flow, so only width and height move).
   * @param next - the state being applied.
   * @param ticket - the generation that requested it.
   */
  const animateShell = (next: boolean, ticket: number, to: number): void => {
    const settleHeight = (): void => {
      if (disposed || ticket !== generation) return
      shell.style.height = expanded ? 'auto' : ''
      delete shell.dataset.transitioning
    }
    if (win === null || reduced()) {
      shell.style.height = next ? 'auto' : ''
      delete shell.dataset.transitioning
      return
    }
    const from = shell.offsetHeight
    if (from === to || from === 0) {
      shell.style.height = next ? 'auto' : ''
      delete shell.dataset.transitioning
      return
    }
    // Restores the shell's clip for the duration of the size change; collapsed
    // and settled it goes back to spilling so a breach is not sliced. See the
    // data-transitioning rule in plugin-css.ts.
    shell.dataset.transitioning = ''
    shell.style.height = `${from}px`
    void shell.offsetHeight
    shell.style.height = `${to}px`
    defer(settleHeight)
  }

  const buildPanel = (): DockPanel => {
    const created = createDockPanel({
      document: doc,
      t: translate,
      state,
      motion,
      inlineEnabled,
      classicStatus,
      ...(options.random === undefined ? {} : { random: options.random }),
      onClose: () => {
        setExpanded(false)
        button.focus()
      },
      onInlineEnabled: (value) => {
        inlineEnabled = value
        options.onInlineEnabled?.(value)
      },
      onClassicStatus: (value) => {
        classicStatus = value
        options.onClassicStatus?.(value)
      },
      onMotion: (value) => {
        motion = value
        view.setMotion(value)
        options.onMotion?.(value)
      },
    })
    shell.appendChild(created.element)
    return created
  }

  /**
   * Apply an expanded state. Safe to call with the value it already holds, and
   * safe to call again before a previous call's transition has finished.
   */
  function setExpanded(next: boolean): void {
    if (disposed || next === expanded) return
    const ticket = ++generation
    clearTimers()
    expanded = next
    if (!next) shell.dataset.expanded = 'false'
    button.setAttribute('aria-expanded', String(next))
    button.setAttribute('aria-label', t(next ? 'dock.close' : 'dock.open'))

    if (next) {
      // Build and measure *before* flipping the expanded flag, so the panel is
      // still transparent and the shell still collapsed while we read it.
      if (panel === null) panel = buildPanel()
      panel.setState(state)
      panel.setMotion(motion)
      panel.setInlineEnabled(inlineEnabled)
      panel.setClassicStatus(classicStatus)
      const target = measureExpanded()
      const hadFocus = doc.activeElement === button
      shell.dataset.expanded = 'true'
      animateShell(true, ticket, target)
      // The trigger is removed from the layout while expanded, so focus cannot
      // stay on it; hand it to the control that replaces it.
      if (hadFocus) panel.initialFocus.focus()
      options.onToggle?.(true)
      return
    }

    animateShell(false, ticket, DOCK_BUTTON)
    options.onToggle?.(false)
    const finish = (): void => {
      // A newer open/close has happened since this close was scheduled; the
      // panel belongs to that newer state, so leave it exactly as it is.
      if (disposed || ticket !== generation || expanded) return
      panel?.destroy()
      panel = null
    }
    if (reduced() || win === null) {
      finish()
      return
    }
    defer(finish)
  }

  drag = makeDockDraggable({
    root: element,
    handle: button,
    initial: options.dockTop ?? 0.5,
    onChange: (top, settled) => {
      if (settled) options.onDockTop?.(top)
    },
  })

  const onButtonClick = (): void => {
    setExpanded(!expanded)
  }
  button.addEventListener('click', onButtonClick)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !expanded) return
    setExpanded(false)
    button.focus()
  }

  const onPointerDown = (event: Event): void => {
    if (!expanded) return
    const target = event.target
    if (target instanceof Node && element.contains(target)) return
    setExpanded(false)
  }

  doc.addEventListener('keydown', onKeyDown)
  // Capture, so a host handler that stops propagation cannot strand the panel
  // open; pointerdown rather than click, so a drag that starts outside counts.
  doc.addEventListener('pointerdown', onPointerDown, true)

  return {
    element,
    button,
    view,
    isExpanded: () => expanded,
    setExpanded,
    setState(next) {
      // A turn beginning is the Dock's only cue to breach: unlike the inline
      // whale, which is mounted by the turn itself, the Dock is always there
      // and has to notice the edge.
      const begins = state === 'idle' && next !== 'idle'
      state = next
      shell.dataset.state = next
      view.setState(next)
      if (begins) view.leap()
      panel?.setState(next)
      if (begins) panel?.leap()
    },
    setMotion(next) {
      motion = next
      view.setMotion(next)
      panel?.setMotion(next)
    },
    setInlineEnabled(enabled) {
      inlineEnabled = enabled
      panel?.setInlineEnabled(enabled)
    },
    setClassicStatus(enabled) {
      classicStatus = enabled
      panel?.setClassicStatus(enabled)
    },
    setDockTop(top) {
      drag?.set(top)
    },
    retranslate(next) {
      t = next
      button.setAttribute('aria-label', t(expanded ? 'dock.close' : 'dock.open'))
      button.title = t('dock.move')
      panel?.retranslate()
    },
    destroy() {
      disposed = true
      clearTimers()
      doc.removeEventListener('keydown', onKeyDown)
      doc.removeEventListener('pointerdown', onPointerDown, true)
      button.removeEventListener('click', onButtonClick)
      drag?.destroy()
      drag = null
      panel?.destroy()
      panel = null
      view.destroy()
      element.remove()
    },
  }
}
