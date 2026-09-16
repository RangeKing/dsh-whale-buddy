/**
 * Vertical repositioning for the Whale Dock.
 *
 * The Dock is a permanent ornament on an edge the app also uses, so where it
 * sits is a matter of taste and of whatever else is on screen. Dragging is the
 * cheapest way to settle that without the plugin having to guess.
 *
 * Three things make this more than a mousemove handler:
 *
 *  - **Drag must not eat the click.** The same control both opens the panel and
 *    moves; a pointer that travels less than a few pixels is a click, and the
 *    drag never starts. Past the threshold the click is suppressed exactly once.
 *  - **Keyboard parity.** A control that can only be positioned by dragging is
 *    a control some people cannot position. Arrow keys move it in steps and
 *    Home/End send it to the ends.
 *  - **The position is a fraction, not a pixel offset,** so the Dock keeps its
 *    place proportionally when the window is resized rather than sliding off
 *    the bottom of a shorter viewport.
 */

/** Pointer travel, in pixels, before a press becomes a drag rather than a click. */
export const DRAG_THRESHOLD = 4

/** How far one arrow-key press moves the Dock, as a fraction of the track. */
export const KEY_STEP = 0.08

/** Options for {@link makeDockDraggable}. */
export interface DockDragOptions {
  /** The positioned Dock root; its `--wb-dock-top` is what moves. */
  readonly root: HTMLElement
  /** The control the user presses — normally the collapsed button. */
  readonly handle: HTMLElement
  /** Current position, 0 (top) to 1 (bottom). */
  readonly initial: number
  /** Called with each new position while dragging, and once when it settles. */
  readonly onChange: (top: number, settled: boolean) => void
}

/** A live drag binding. */
export interface DockDrag {
  /** Apply a position from outside (a settings change, another surface). */
  set(top: number): void
  /** Whether a drag is in progress. */
  isDragging(): boolean
  /** Remove every listener this installed. */
  destroy(): void
}

/** Clamp into the 0..1 track, mapping anything unusable to the middle. */
function clampTop(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * Make the Dock draggable along its edge.
 * @param options - root, handle, starting position and change callback.
 * @returns the binding; `destroy` releases every listener.
 */
export function makeDockDraggable(options: DockDragOptions): DockDrag {
  const { root, handle } = options
  const doc = root.ownerDocument
  const win = doc.defaultView

  let top = clampTop(options.initial)
  let pointer: number | null = null
  let startY = 0
  let startTop = top
  let travelled = 0
  let suppressClick = false
  let disposed = false

  const paint = (): void => {
    root.style.setProperty('--wb-dock-top', String(Math.round(top * 1e4) / 1e4))
  }
  paint()

  /** Usable travel in pixels: the track minus the Dock's own height. */
  const trackHeight = (): number => {
    const parent = root.offsetParent as HTMLElement | null
    const height = parent?.clientHeight ?? win?.innerHeight ?? 0
    return Math.max(1, height - root.offsetHeight)
  }

  const commit = (next: number, settled: boolean): void => {
    top = clampTop(next)
    paint()
    options.onChange(top, settled)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (disposed || event.button !== 0 || pointer !== null) return
    pointer = event.pointerId
    startY = event.clientY
    startTop = top
    travelled = 0
    handle.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (pointer !== event.pointerId) return
    const delta = event.clientY - startY
    travelled = Math.max(travelled, Math.abs(delta))
    if (travelled < DRAG_THRESHOLD) return
    if (root.dataset.dragging === undefined) root.dataset.dragging = ''
    // A drag is a deliberate gesture; stop the page from selecting text under it.
    event.preventDefault()
    commit(startTop + delta / trackHeight(), false)
  }

  const endDrag = (event: PointerEvent): void => {
    if (pointer !== event.pointerId) return
    pointer = null
    handle.releasePointerCapture?.(event.pointerId)
    if (root.dataset.dragging === undefined) return
    delete root.dataset.dragging
    // The press moved: it was a drag, so the click it would otherwise produce
    // must not also toggle the panel.
    suppressClick = true
    commit(top, true)
  }

  const onClick = (event: MouseEvent): void => {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    const step =
      event.key === 'ArrowUp' ? -KEY_STEP
      : event.key === 'ArrowDown' ? KEY_STEP
      : 0
    if (step !== 0) {
      event.preventDefault()
      commit(top + step, true)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      commit(0, true)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      commit(1, true)
    }
  }

  handle.addEventListener('pointerdown', onPointerDown)
  handle.addEventListener('pointermove', onPointerMove)
  handle.addEventListener('pointerup', endDrag)
  handle.addEventListener('pointercancel', endDrag)
  // Capture, so the suppressed click never reaches the toggle handler.
  handle.addEventListener('click', onClick, true)
  handle.addEventListener('keydown', onKeyDown)

  return {
    set(next) {
      if (pointer !== null) return
      top = clampTop(next)
      paint()
    },
    isDragging: () => pointer !== null && root.dataset.dragging !== undefined,
    destroy() {
      disposed = true
      pointer = null
      delete root.dataset.dragging
      handle.removeEventListener('pointerdown', onPointerDown)
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', endDrag)
      handle.removeEventListener('pointercancel', endDrag)
      handle.removeEventListener('click', onClick, true)
      handle.removeEventListener('keydown', onKeyDown)
    },
  }
}
