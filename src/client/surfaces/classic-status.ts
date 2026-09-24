/**
 * The classic status row — DSH 0.1.5's blue "深度求索中..." drawn by the plugin.
 *
 * DSH 0.1.7 removed the shimmering blue label that sat at the foot of a running
 * turn and folded the running state into the turn's grey fold header, at the
 * *top* of the turn. That header scrolls away as the turn grows, and the whale
 * attached to it goes with it. This row is the opt-in way back: the same words,
 * the same gradient sweep, the same late clock, and the whale beside them, in a
 * row directly above the composer — which is where the old label ended up
 * whenever the transcript was scrolled to the bottom.
 *
 * It is plugin DOM from end to end. Nothing here reads or writes DSH's markup;
 * it implements the same {@link StatusAnchor} face the DSH anchor does, so the
 * whale, the word hold and the once-per-turn breach above it are shared code.
 *
 * The row is `aria-hidden`. DSH still publishes its own live announcement for
 * the running turn, and that stays the accessible signal; a second live region
 * saying nearly the same thing would be read twice.
 *
 * The look is an independent re-creation of DSH 0.1.5's `turnStatus` style
 * (MIT, DeepSeek); see THIRD_PARTY_NOTICES.md.
 */
import type { StatusAnchor } from '../integration/status-anchor.js'
import { STATUS_HOST_ATTR, STATUS_KIND_ATTR } from '../integration/status-anchor.js'
import type { Translate } from '../locales.js'
import type { MotionMode } from '../whale/types.js'
import type { StatusSeat } from './inline-status.js'

/** Marks the plugin's own classic row. */
export const CLASSIC_ROW_ATTR = 'data-whale-buddy-classic'

/** DSH 0.1.5 held the clock back until a turn had run this long, in ms. */
export const CLASSIC_CLOCK_AFTER_MS = 15_000

/** Clock tick, ms. The clock shows whole seconds. */
const TICK_MS = 1000

/** Options for {@link classicSeat}. */
export interface ClassicRowOptions {
  readonly document: Document
  /** The element the row is appended to. */
  readonly container: HTMLElement
  /** Shown when no activity word is set — normally the plugin's "thinking". */
  readonly fallbackWord: string
  /**
   * When the turn began, epoch ms, or a getter read on every tick — DSH may
   * publish the start a moment after the row appears. Absent or null counts
   * from when the row was built.
   */
  readonly startTime?: number | null | (() => number | null | undefined)
  /**
   * Whether the turn is still open, read on every tick. Once it is not, the
   * clock stops where it was: the row can outlive the turn by an error pulse,
   * and DSH's own clocks stop at the turn's end.
   */
  readonly live?: () => boolean
  /** Formats elapsed milliseconds the way DSH 0.1.5 did: "12秒", "1m 05s". */
  readonly formatClock: (elapsedMs: number) => string
  /** The starting motion setting; later changes arrive through `setMotion`. */
  readonly motion?: MotionMode
  /** Clock source, epoch ms. Injected by tests. */
  readonly now?: () => number
}

/**
 * Format an elapsed time the way DSH 0.1.5's status clock did: whole seconds,
 * then minutes with zero-padded seconds. The templates are the ones DSH used.
 * @param elapsedMs - elapsed milliseconds; negatives clamp to zero.
 * @param t - the plugin's translate function.
 * @returns "12秒" / "1分05秒", or "12s" / "1m 05s".
 */
export function formatClassicClock(elapsedMs: number, t: Translate): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes === 0) return t('clock.seconds').replace('{seconds}', String(seconds))
  return t('clock.minutes')
    .replace('{minutes}', String(minutes))
    .replace('{seconds}', String(seconds).padStart(2, '0'))
}

/**
 * A seat for `mountStatusWhale` that builds the classic row.
 * @param options - where to put the row and how to label it.
 * @returns the seat; the row is built when the whale mounts into it.
 */
export function classicSeat(options: ClassicRowOptions): StatusSeat {
  return (render) => createClassicRow(options, render)
}

/**
 * Build the row and return the anchor face that drives it.
 * @param options - where to put the row and how to label it.
 * @param render - draws the whale into the host span.
 * @returns the anchor; `destroy` removes the row and stops the clock.
 */
function createClassicRow(
  options: ClassicRowOptions,
  render: (host: HTMLElement) => void,
): StatusAnchor {
  const doc = options.document
  const win = doc.defaultView
  const now = options.now ?? (() => Date.now())
  const builtAt = now()
  const startOf = (): number => {
    const value = typeof options.startTime === 'function' ? options.startTime() : options.startTime
    return value ?? builtAt
  }

  const row = doc.createElement('div')
  row.className = 'wb-classic'
  row.setAttribute(CLASSIC_ROW_ATTR, '')
  row.setAttribute('aria-hidden', 'true')
  // "Still" means still: the sweep is motion too, whatever the OS says.
  row.toggleAttribute('data-still', options.motion === 'static')

  const host = doc.createElement('span')
  host.className = 'wb-status'
  host.setAttribute(STATUS_HOST_ATTR, 'idle')
  host.setAttribute(STATUS_KIND_ATTR, 'classic')

  const words = doc.createElement('span')
  words.className = 'wb-classic__word'
  words.textContent = options.fallbackWord

  const clock = doc.createElement('span')
  clock.className = 'wb-classic__clock'
  clock.hidden = true

  row.appendChild(host)
  row.appendChild(words)
  row.appendChild(clock)
  options.container.appendChild(row)
  render(host)

  const tick = (): void => {
    if (options.live !== undefined && !options.live()) return
    const elapsed = Math.max(0, now() - startOf())
    const show = elapsed >= CLASSIC_CLOCK_AFTER_MS
    if (clock.hidden === show) clock.hidden = !show
    if (!show) return
    const text = options.formatClock(elapsed)
    if (clock.textContent !== text) clock.textContent = text
  }
  tick()
  const timer = win === null ? 0 : win.setInterval(tick, TICK_MS)
  let disposed = false

  return {
    isAttached: () => !disposed && row.isConnected,
    setWord(word) {
      const text = word ?? options.fallbackWord
      if (words.textContent !== text) words.textContent = text
    },
    setTag(tag) {
      host.setAttribute(STATUS_HOST_ATTR, tag)
    },
    setMotion(motion) {
      row.toggleAttribute('data-still', motion === 'static')
    },
    destroy() {
      if (disposed) return
      disposed = true
      if (timer !== 0) win?.clearInterval(timer)
      row.remove()
    },
  }
}
