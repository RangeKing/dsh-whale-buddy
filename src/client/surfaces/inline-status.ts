/**
 * Surface A — the inline thinking whale.
 *
 * A small decorative whale that exists only while the model is working, living
 * inside DSH's own running-turn status row, immediately left of its label.
 *
 * The whale itself is `aria-hidden`: the row it sits in is already an
 * `aria-live` region, and a screen reader does not need a second announcement
 * of the same fact. The *word* in that row is not decorative, though — this
 * plugin replaces DSH's single "Deep diving…" with one that says what the turn
 * is doing, and that replacement is read out exactly as DSH's own text was.
 *
 * Placement, attachment and restoration all live in `integration/status-anchor`;
 * this module owns only the whale.
 *
 * Framework-free on purpose: the DSH slot entry is a thin React shell around
 * `mountStatusWhale`, and the demo mounts the identical code against a stand-in
 * status row with no React at all, so what is reviewed visually is what ships.
 */
import {
  attachStatusAnchor,
  type StatusAnchor,
  type StatusRowKind,
} from '../integration/status-anchor.js'
import { activityTag } from '../integration/thinking-state.js'
import { mountWhale, type WhaleView } from '../whale/view.js'
import {
  sameActivity,
  type MotionMode,
  type RandomSource,
  type WhaleActivity,
} from '../whale/types.js'

/**
 * Shortest time a status word stays on screen, in milliseconds.
 *
 * Measured, not guessed: a `ls` in a real session put the plugin into
 * `working:running` for **18 ms** before the tool settled and it fell back to
 * `thinking`. A word nobody can read is worse than no word at all, because the
 * label strobes. Entering a state is immediate; leaving it waits.
 */
export const MIN_WORD_MS = 700

/** Optical gap between the mark and DSH's word, CSS px. */
const GAP_PX = 5

/**
 * Builds the row the whale lives in, given the callback that draws it.
 *
 * Normally DSH's own row, through `attachStatusAnchor`. The classic-row option
 * substitutes a row the plugin draws itself; everything above the seat — the
 * word hold, the once-per-turn breach, the rebuild on re-render — is the same
 * code either way.
 */
export type StatusSeat = (render: (host: HTMLElement) => void) => StatusAnchor

/** Mount options for the anchored inline whale. */
export interface InlineStatusOptions {
  readonly document: Document
  /** Recognises DSH's running-turn label. Unused when {@link seat} is given. */
  readonly match?: (text: string) => boolean
  /** Where to look for DSH's row; see `StatusAnchorOptions.scope`. */
  readonly scope?: Element
  /** Which of DSH's row shapes to take; see `StatusAnchorOptions.claim`. */
  readonly claim?: (kind: StatusRowKind) => boolean
  /** Told the shape of every DSH row found; see `StatusAnchorOptions.onFound`. */
  readonly onFound?: (kind: StatusRowKind) => void
  /** A row other than DSH's to live in. */
  readonly seat?: StatusSeat
  /** Whale width in CSS pixels. */
  readonly size: number
  readonly motion: MotionMode
  readonly activity: WhaleActivity
  /** The word to show in place of DSH's label, for the starting activity. */
  readonly word?: string | undefined
  /** False when a shared store already holds activity changes for all surfaces. */
  readonly holdActivity?: boolean
  readonly random?: RandomSource
}

/** A whale living inside DSH's status row. */
export interface InlineStatusWhale {
  /** True while the whale is actually inside DSH's status element. */
  isAttached(): boolean
  /**
   * The live whale view, or null while detached.
   *
   * A getter rather than a field because the view is rebuilt every time React
   * replaces the row underneath it; a captured reference goes stale within a
   * second of the elapsed clock appearing.
   */
  view(): WhaleView | null
  /** Change what the whale is reacting to, and the word beside it. */
  setActivity(activity: WhaleActivity, word: string | undefined): void
  setMotion(motion: MotionMode): void
  setSize(size: number): void
  destroy(): void
}

/**
 * Put the whale into DSH's running-turn status row.
 *
 * The view is rebuilt whenever React replaces the row, which is cheap and is
 * the only way to survive a re-render; the engine is not, so the whale does not
 * restart its swim every second when the elapsed clock starts ticking.
 * @param options - document, label matcher, size, motion and activity.
 * @returns the handle; `destroy` restores DSH's own row.
 */
export function mountStatusWhale(options: InlineStatusOptions): InlineStatusWhale {
  const win = options.document.defaultView
  let view: WhaleView | null = null
  let activity = options.activity
  let motion = options.motion
  let size = options.size
  /** When the currently shown word is allowed to be replaced. */
  let holdUntil = 0
  /** The breach plays once per turn, not once per React re-render. */
  let leapt = false
  let pending: { activity: WhaleActivity; word: string | undefined } | null = null
  let timer = 0
  let disposed = false

  const now = (): number => (win?.performance?.now() ?? Date.now())

  const clearPending = (): void => {
    if (timer !== 0) win?.clearTimeout(timer)
    timer = 0
    pending = null
  }

  const seat: StatusSeat =
    options.seat ??
    ((render) =>
      attachStatusAnchor({
        document: options.document,
        match: options.match ?? (() => false),
        render,
        ...(options.scope === undefined ? {} : { scope: options.scope }),
        ...(options.claim === undefined ? {} : { claim: options.claim }),
        ...(options.onFound === undefined ? {} : { onFound: options.onFound }),
      }))
  const anchor: StatusAnchor = seat((host) => {
    view?.destroy()
    view = mountWhale({
      host,
      size,
      state: activity.state,
      motion,
      // The turn has just begun — that is the whole trigger. This surface
      // exists only while one is running, so mounting *is* the event, and
      // nothing has to watch for a transition to notice it.
      leapOnMount: !leapt,
      ...(options.random === undefined ? {} : { random: options.random }),
    })
    leapt = true
    // The view is built from the state alone; the task has to be handed over
    // separately or a remount mid-turn drops back to the generic prop.
    view.setActivity(activity)
    // Keeps DSH's status row exactly the height it was: the whale overflows
    // the row rather than growing it.
    view.fitToMark(GAP_PX)
  })
  anchor.setTag(activityTag(activity))
  anchor.setWord(options.word)

  /** Show one activity: the word, the diagnostic tag and the whale's state. */
  const show = (next: WhaleActivity, word: string | undefined): void => {
    activity = next
    holdUntil = now() + MIN_WORD_MS
    view?.setActivity(next)
    anchor.setTag(activityTag(next))
    anchor.setWord(word)
  }

  return {
    isAttached: () => anchor.isAttached(),
    view: () => view,
    setActivity(next, word) {
      if (disposed) return
      if (sameActivity(next, activity)) {
        clearPending()
        return
      }
      const wait = holdUntil - now()
      // `waiting` is the one state that is about the user rather than the
      // model, so it never queues behind a word the model happened to produce.
      if (options.holdActivity === false || wait <= 0 || next.state === 'waiting' || win === null) {
        clearPending()
        show(next, word)
        return
      }
      // Queue the latest: a burst of short-lived states collapses to whichever
      // one the session actually ended up in.
      pending = { activity: next, word }
      if (timer !== 0) return
      timer = win.setTimeout(() => {
        timer = 0
        const queued = pending
        pending = null
        if (disposed || queued === null) return
        if (!sameActivity(queued.activity, activity)) show(queued.activity, queued.word)
      }, wait)
    },
    setMotion(next) {
      motion = next
      view?.setMotion(next)
      anchor.setMotion?.(next)
    },
    setSize(next) {
      size = next
      view?.setSize(next)
    },
    destroy() {
      disposed = true
      clearPending()
      anchor.destroy()
      view?.destroy()
      view = null
    },
  }
}
