/**
 * Test harness: load the real production bundle into a jsdom window with a
 * controlled clock, frame queue and media query.
 *
 * The philosophy — exercise `lib/client.js` rather than the TypeScript sources,
 * through the same `window.__ModuleLoader__.load` shell DSH uses — is adapted
 * from dsh-thought-buddy's `test/verify.mjs` (BSD-3-Clause). See
 * THIRD_PARTY_NOTICES.md. The DOM itself is jsdom rather than a hand-written
 * stub, because this plugin's Dock needs real events, focus and class handling.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Path to the artefact under test. */
export const BUNDLE_PATH = resolve(root, 'lib', 'client.js')

/** The bundle source, read once. */
export const BUNDLE = readFileSync(BUNDLE_PATH, 'utf8')

/**
 * Build a window with the plugin bundle loaded and every source of time under
 * the test's control.
 * @param options.reducedMotion - initial value of the reduced-motion query.
 * @returns the loaded module plus the controls the tests drive.
 */
export function createHarness({ reducedMotion = false } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: false,
  })
  const { window } = dom

  // ---- frame queue -------------------------------------------------------
  let frames = new Map()
  let frameSeq = 0
  let now = 0
  window.requestAnimationFrame = (callback) => {
    const id = ++frameSeq
    frames.set(id, callback)
    return id
  }
  window.cancelAnimationFrame = (id) => {
    frames.delete(id)
  }

  // ---- timer queue -------------------------------------------------------
  let timers = new Map()
  let timerSeq = 0
  window.setTimeout = (callback, delay = 0) => {
    const id = ++timerSeq
    timers.set(id, { callback, at: now + delay })
    return id
  }
  window.clearTimeout = (id) => {
    timers.delete(id)
  }
  // The word hold in `inline-status.ts` measures elapsed time with
  // performance.now(). Leaving that on the real clock makes the hold a race
  // against how fast the test runner happens to be, so it reads the same
  // simulated clock as the frame and timer queues.
  Object.defineProperty(window, 'performance', {
    configurable: true,
    value: { now: () => now },
  })

  // ---- reduced motion ----------------------------------------------------
  let reduced = reducedMotion
  const mediaListeners = new Set()
  window.matchMedia = (media) => ({
    media,
    get matches() {
      return media.includes('prefers-reduced-motion') ? reduced : false
    },
    addEventListener: (_type, fn) => mediaListeners.add(fn),
    removeEventListener: (_type, fn) => mediaListeners.delete(fn),
    addListener: (fn) => mediaListeners.add(fn),
    removeListener: (fn) => mediaListeners.delete(fn),
    onchange: null,
    dispatchEvent: () => false,
  })

  // ---- module loader shell ----------------------------------------------
  let loaded = null
  let declaration = null
  const react = {
    createElement: () => null,
    useEffect: () => {},
    useRef: () => ({ current: null }),
  }
  window.__ModuleLoader__ = {
    load(spec) {
      declaration = spec
      loaded = spec.factory((id) => {
        if (id === 'react') return react
        throw new Error(`unexpected external module: ${id}`)
      })
    },
  }
  window.eval(BUNDLE)

  return {
    dom,
    window,
    document: window.document,
    /** The plugin's browser exports. */
    client: loaded,
    /** The `{ id, factory }` object the loader shell handed over. */
    declaration,
    /** Current simulated time in milliseconds. */
    time: () => now,
    /** Number of frames waiting to run. */
    pendingFrames: () => frames.size,
    /** Number of timers waiting to fire. */
    pendingTimers: () => timers.size,
    /**
     * Advance the clock, running frames and timers in order.
     * @param ms - total time to advance.
     * @param stepMs - size of each simulated frame.
     */
    advance(ms, stepMs = 16) {
      const end = now + ms
      while (now < end) {
        now = Math.min(now + stepMs, end)
        runTimers()
        runFrames()
      }
    },
    /** Run one frame without moving the clock forward more than `stepMs`. */
    frame(stepMs = 16) {
      now += stepMs
      runTimers()
      runFrames()
    },
    /** Run only the timers due at the current time. */
    flushTimers() {
      runTimers()
    },
    /** Set the reduced-motion preference and notify listeners. */
    setReducedMotion(value) {
      reduced = value
      for (const fn of [...mediaListeners]) fn({ matches: value })
    },
    /** Release the jsdom window. */
    close() {
      frames = new Map()
      timers = new Map()
      window.close()
    },
  }

  function runFrames() {
    const due = [...frames.entries()]
    frames = new Map()
    for (const [, callback] of due) callback(now)
  }

  function runTimers() {
    for (let guard = 0; guard < 1000; guard++) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= now)
      if (due.length === 0) return
      for (const [id, timer] of due) {
        timers.delete(id)
        timer.callback()
      }
    }
  }
}

/**
 * Read every numeric value out of an SVG element tree's transform and geometry
 * attributes, so a test can assert that none of them went non-finite.
 * @param element - root of the tree.
 * @returns every number found.
 */
export function numbersIn(element) {
  const found = []
  const walk = (node) => {
    for (const attribute of node.attributes ?? []) {
      if (!/^(transform|points|d|x|y|width|height|cx|cy|r)$/.test(attribute.name)) continue
      for (const token of attribute.value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []) {
        found.push(Number.parseFloat(token))
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(element)
  return found
}
