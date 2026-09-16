/**
 * One mounted whale: an engine, a renderer, and the frame loop between them.
 *
 * The rAF lifecycle (start on mount, clamp the delta, cancel on teardown) is
 * adapted from dsh-thought-buddy (BSD-3-Clause); see THIRD_PARTY_NOTICES.md.
 * Reduced motion is resolved here rather than in the engine, because the
 * system preference has to beat the plugin's own setting and can change while
 * the whale is mounted.
 */
import { WhaleEngine } from './engine.js'
import { createWhaleRenderer, type WhaleRenderer } from './renderer-svg.js'
import type { MotionMode, RandomSource, WhaleActivity, WhaleSemanticState } from './types.js'

/** Mount options. */
export interface WhaleViewOptions {
  /** Element the whale's `<svg>` is appended to. */
  readonly host: Element
  /** Width in CSS pixels. */
  readonly size: number
  /** Starting semantic state. */
  readonly state: WhaleSemanticState
  /** Configured motion mode; the system preference can still override it. */
  readonly motion: MotionMode
  /** Injected randomness, for deterministic demos and tests. */
  readonly random?: RandomSource
  /** Window to schedule frames on; defaults to the host element's own. */
  readonly window?: Window
  /**
   * Share of the breach this surface can afford, 0-1; 0 removes it.
   *
   * Passed to the engine and the renderer from here so they cannot be given
   * different values: one sets the amplitude, the other makes room for it.
   */
  readonly leapScale?: number
  /** Play a breach as soon as the whale is mounted. */
  readonly leapOnMount?: boolean
}

/** A live whale drawing bound to a frame loop. */
export interface WhaleView {
  readonly renderer: WhaleRenderer
  readonly engine: WhaleEngine
  setState(state: WhaleSemanticState): void
  /**
   * Switch state *and* task. Surfaces that know which tool is running should
   * use this rather than {@link WhaleView.setState}: the task never reaches the
   * motion profile, but it does reach the prop, so a surface that drops it
   * shows a wrench for every tool DSH runs.
   */
  setActivity(activity: WhaleActivity): void
  setMotion(motion: MotionMode): void
  setSize(size: number): void
  /** Play a breach, and make sure a frame loop is running to draw it. */
  leap(): void
  /**
   * Take the drawing's bleed out of layout with negative margins on the host.
   *
   * The element is deliberately larger than the mark — it carries the leap's
   * headroom, and it must never resize mid-animation — so left alone it sizes
   * whatever row it sits in. This makes the host contribute exactly the mark's
   * own box and lets the arc overflow, which is what every surface here wants:
   * a whale that grows its container when a turn starts is a whale that reflows
   * the page when a turn starts.
   * @param gapRight - space to leave after the mark, CSS px.
   */
  fitToMark(gapRight?: number): void
  /** True while a frame loop is scheduled. */
  isAnimating(): boolean
  /** Stop the loop, drop listeners, and remove the drawing. */
  destroy(): void
}

/** The query whose `reduce` value outranks any plugin motion setting. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Mount a whale into `host` and start animating it.
 * @param options - host, size, state, motion mode.
 * @returns the view handle; call `destroy` to release everything it owns.
 */
export function mountWhale(options: WhaleViewOptions): WhaleView {
  const doc = options.host.ownerDocument
  const view = options.window ?? (doc.defaultView as Window | null) ?? undefined
  const leapScale = options.leapScale ?? 1
  const engine = new WhaleEngine({
    size: options.size,
    state: options.state,
    motion: options.motion,
    leapScale,
    ...(options.random === undefined ? {} : { random: options.random }),
  })
  const renderer = createWhaleRenderer({ size: options.size, document: doc, leapScale })
  options.host.appendChild(renderer.svg)

  let configured: MotionMode = options.motion
  let frame = 0
  let last = 0
  let disposed = false

  const media =
    view !== undefined && typeof view.matchMedia === 'function'
      ? view.matchMedia(REDUCED_MOTION_QUERY)
      : null

  /** The system preference wins; otherwise the plugin's own setting applies. */
  const effectiveMotion = (): MotionMode => (media?.matches === true ? 'static' : configured)

  const stop = (): void => {
    if (frame !== 0 && view !== undefined) view.cancelAnimationFrame(frame)
    frame = 0
    last = 0
  }

  const tick = (timestamp: number): void => {
    if (disposed) return
    // A detached host means the surface was torn down without us: stop rather
    // than animate into a document fragment nobody will ever see.
    if (!renderer.svg.isConnected) {
      stop()
      return
    }
    const dt = last === 0 ? 0 : (timestamp - last) / 1000
    last = timestamp
    renderer.apply(engine.step(dt), engine.currentEffects)
    if (view !== undefined) frame = view.requestAnimationFrame(tick)
  }

  const start = (): void => {
    if (disposed || frame !== 0 || view === undefined) return
    if (engine.isStatic) return
    last = 0
    frame = view.requestAnimationFrame(tick)
  }

  const syncMotion = (): void => {
    const motion = effectiveMotion()
    engine.setMotion(motion)
    if (motion === 'static') {
      stop()
      renderer.apply(engine.settleNow(), engine.currentEffects)
      return
    }
    start()
  }

  const onMediaChange = (): void => {
    syncMotion()
  }
  media?.addEventListener('change', onMediaChange)

  syncMotion()
  if (options.leapOnMount === true) {
    engine.leap()
    if (!engine.isStatic) start()
  }

  return {
    renderer,
    engine,
    setState(state) {
      engine.setState(state)
      if (!engine.isStatic) start()
    },
    setActivity(activity) {
      engine.setActivity(activity)
      if (!engine.isStatic) start()
    },
    setMotion(motion) {
      configured = motion
      syncMotion()
    },
    setSize(size) {
      // Both halves must agree on the size: the engine budgets its travel in
      // pixels from it, and the renderer sizes its bleed from the same number.
      engine.setSize(size)
      renderer.resize(size)
    },
    leap() {
      engine.leap()
      if (!engine.isStatic) start()
    },
    fitToMark(gapRight = 0) {
      const style = (options.host as Partial<HTMLElement>).style
      if (style === undefined) return
      const bleed = renderer.bleedPx
      style.margin = `${-bleed.y}px ${-bleed.x}px`
      style.marginRight = `${gapRight - bleed.x}px`
    },
    isAnimating() {
      return frame !== 0
    },
    destroy() {
      disposed = true
      stop()
      media?.removeEventListener('change', onMediaChange)
      renderer.destroy()
    },
  }
}
