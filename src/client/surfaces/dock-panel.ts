/**
 * The Whale Dock's expanded content.
 *
 * Deliberately small for V0.1: a larger live whale, the semantic state in
 * words, and the three settings the implementation actually honours. No task
 * list, no approvals, no session switching.
 *
 * The "independent community plugin" line that used to sit at the bottom was
 * removed at the owner's request: it is a permanent apology in a surface the
 * user opens many times, and the same statement is made where it actually
 * needs to be made — the README, THIRD_PARTY_NOTICES.md, and the package
 * description.
 *
 * `openInside` is the seam a later release can fill to hand off to a richer
 * companion surface; nothing here depends on one existing.
 */
import type { Translate } from '../locales.js'
import { mountWhale, type WhaleView } from '../whale/view.js'
import type { MotionMode, RandomSource, WhaleSemanticState } from '../whale/types.js'

/** Whale width inside the panel, CSS pixels. Big enough to read the eye. */
export const PANEL_WHALE_SIZE = 56

/** Panel construction options. */
export interface DockPanelOptions {
  readonly document: Document
  readonly t: Translate
  readonly state: WhaleSemanticState
  readonly motion: MotionMode
  readonly inlineEnabled: boolean
  /** Whether the classic blue status row is on; defaults to off. */
  readonly classicStatus?: boolean
  readonly random?: RandomSource
  /** Called when the user asks to close the panel. */
  readonly onClose: () => void
  /** Called when the inline-whale toggle changes. */
  readonly onInlineEnabled: (enabled: boolean) => void
  /** Called when the classic-row toggle changes. */
  readonly onClassicStatus?: (enabled: boolean) => void
  /** Called when the motion mode changes. */
  readonly onMotion: (motion: MotionMode) => void
}

/** A built panel. */
export interface DockPanel {
  readonly element: HTMLElement
  readonly view: WhaleView
  /** Receives keyboard focus when the collapsed trigger leaves the layout. */
  readonly initialFocus: HTMLElement
  setState(state: WhaleSemanticState): void
  setMotion(motion: MotionMode): void
  /** Play a breach in the panel's larger preview. */
  leap(): void
  setInlineEnabled(enabled: boolean): void
  setClassicStatus(enabled: boolean): void
  /** Re-read every label after a locale change. */
  retranslate(): void
  destroy(): void
}

/**
 * Build the panel body.
 * @param options - document, copy, current state and change callbacks.
 * @returns the panel handle.
 */
export function createDockPanel(options: DockPanelOptions): DockPanel {
  const { document: doc, t } = options
  const element = doc.createElement('div')
  element.className = 'wb-dock__panel'

  const head = doc.createElement('div')
  head.className = 'wb-dock__head'
  const title = doc.createElement('span')
  title.className = 'wb-dock__title'
  title.textContent = t('dock.title')
  const close = doc.createElement('button')
  close.type = 'button'
  close.className = 'wb-dock__close'
  close.textContent = '×'
  close.setAttribute('aria-label', t('dock.close'))
  close.addEventListener('click', options.onClose)
  head.appendChild(title)
  head.appendChild(close)

  const stage = doc.createElement('div')
  stage.className = 'wb-dock__stage'
  const preview = doc.createElement('div')
  preview.className = 'wb-dock__preview'
  stage.appendChild(preview)
  const stateBox = doc.createElement('div')
  stateBox.className = 'wb-dock__state'
  const stateName = doc.createElement('strong')
  const stateHint = doc.createElement('span')
  stateBox.appendChild(stateName)
  stateBox.appendChild(stateHint)
  stage.appendChild(stateBox)

  const controls = doc.createElement('div')
  controls.className = 'wb-dock__controls'

  const inlineRow = doc.createElement('div')
  inlineRow.className = 'wb-dock__row'
  const inlineLabel = doc.createElement('label')
  const inlineToggle = doc.createElement('input')
  inlineToggle.type = 'checkbox'
  inlineToggle.className = 'wb-dock__switch'
  inlineToggle.setAttribute('role', 'switch')
  inlineToggle.id = 'wb-dock-inline'
  inlineToggle.checked = options.inlineEnabled
  inlineLabel.htmlFor = inlineToggle.id
  inlineLabel.textContent = t('control.inline')
  inlineToggle.addEventListener('change', () => {
    classicToggle.disabled = !inlineToggle.checked
    options.onInlineEnabled(inlineToggle.checked)
  })
  inlineRow.appendChild(inlineLabel)
  inlineRow.appendChild(inlineToggle)

  const classicRow = doc.createElement('div')
  classicRow.className = 'wb-dock__row'
  const classicLabel = doc.createElement('label')
  const classicToggle = doc.createElement('input')
  classicToggle.type = 'checkbox'
  classicToggle.className = 'wb-dock__switch'
  classicToggle.setAttribute('role', 'switch')
  classicToggle.id = 'wb-dock-classic'
  classicToggle.checked = options.classicStatus ?? false
  classicToggle.disabled = !options.inlineEnabled
  classicLabel.htmlFor = classicToggle.id
  classicLabel.textContent = t('control.classic')
  classicToggle.addEventListener('change', () => {
    options.onClassicStatus?.(classicToggle.checked)
  })
  classicRow.appendChild(classicLabel)
  classicRow.appendChild(classicToggle)

  const motionRow = doc.createElement('div')
  motionRow.className = 'wb-dock__row'
  const motionLabel = doc.createElement('label')
  const motionSelect = doc.createElement('select')
  motionSelect.id = 'wb-dock-motion'
  const motionField = doc.createElement('span')
  motionField.className = 'wb-dock__select'
  motionField.appendChild(motionSelect)
  motionLabel.htmlFor = motionSelect.id
  motionLabel.textContent = t('control.motion')
  const MOTION_KEYS = ['full', 'subtle', 'static'] as const
  for (const mode of MOTION_KEYS) {
    const option = doc.createElement('option')
    option.value = mode
    option.textContent = t(`motion.${mode}`)
    motionSelect.appendChild(option)
  }
  motionSelect.value = options.motion
  motionSelect.addEventListener('change', () => {
    const value = motionSelect.value
    if (value === 'full' || value === 'subtle' || value === 'static') options.onMotion(value)
  })
  motionRow.appendChild(motionLabel)
  motionRow.appendChild(motionField)

  controls.appendChild(inlineRow)
  controls.appendChild(classicRow)
  controls.appendChild(motionRow)

  element.appendChild(head)
  element.appendChild(stage)
  element.appendChild(controls)

  const view = mountWhale({
    host: preview,
    size: PANEL_WHALE_SIZE,
    state: options.state,
    motion: options.motion,
    ...(options.random === undefined ? {} : { random: options.random }),
  })
  view.fitToMark()

  let state = options.state
  const paintState = (): void => {
    // Every semantic state has a name and a hint, so this reads the state
    // rather than testing for one: the version that asked `=== 'thinking'`
    // silently reported "Idle" for the three states added after it.
    stateName.textContent = t(`state.${state}` as const)
    stateHint.textContent = t(`state.${state}.hint` as const)
  }
  paintState()

  return {
    element,
    view,
    initialFocus: close,
    setState(next) {
      state = next
      paintState()
      view.setState(next)
    },
    leap() {
      view.leap()
    },
    setMotion(motion) {
      motionSelect.value = motion
      view.setMotion(motion)
    },
    setInlineEnabled(enabled) {
      inlineToggle.checked = enabled
      classicToggle.disabled = !enabled
    },
    setClassicStatus(enabled) {
      classicToggle.checked = enabled
    },
    retranslate() {
      title.textContent = t('dock.title')
      close.setAttribute('aria-label', t('dock.close'))
      inlineLabel.textContent = t('control.inline')
      classicLabel.textContent = t('control.classic')
      motionLabel.textContent = t('control.motion')
      const options_ = motionSelect.options
      for (let i = 0; i < MOTION_KEYS.length; i++) {
        const option = options_.item(i)
        const key = MOTION_KEYS[i]
        if (option !== null && key !== undefined) option.textContent = t(`motion.${key}`)
      }
      paintState()
    },
    destroy() {
      close.removeEventListener('click', options.onClose)
      view.destroy()
      element.remove()
    },
  }
}
