/**
 * Plugin settings.
 *
 * Kept in `localStorage` under one namespace, read defensively: a browser that
 * refuses storage (private mode, blocked site data) must still get a working
 * whale, and a value edited by hand must not be able to produce an unrenderable
 * one. Every read validates; anything unexpected falls back to the default.
 *
 * The storage shape is adapted from dsh-thought-buddy's `tbConfig`
 * (BSD-3-Clause); see THIRD_PARTY_NOTICES.md.
 */
import type { MotionMode } from './whale/types.js'

/** localStorage key prefix. */
export const CONFIG_NS = 'dsh-whale-buddy'

/** Everything a user can change. Deliberately short: no dead controls. */
export interface WhaleBuddyConfig {
  /** Master switch: off means neither surface mounts. */
  enabled: boolean
  /** The whale beside the model's thinking state. */
  inlineEnabled: boolean
  /** The right-edge companion dock. */
  dockEnabled: boolean
  /** Inline whale width in CSS pixels. The Dock's whale is fixed separately. */
  size: number
  /** How much motion the plugin may produce; the system preference still wins. */
  motion: MotionMode
  /**
   * Where the Dock sits on the right edge, as a fraction of the usable track
   * (0 top, 1 bottom). A fraction rather than a pixel offset so the Dock keeps
   * its place when the window is resized.
   */
  dockTop: number
}

/** Shipped defaults. */
export const DEFAULT_CONFIG: Readonly<WhaleBuddyConfig> = Object.freeze({
  enabled: true,
  inlineEnabled: true,
  dockEnabled: true,
  size: 26,
  motion: 'full' as MotionMode,
  dockTop: 0.5,
})

/**
 * Accepted inline sizes, in CSS pixels.
 *
 * The floor is where the mark stops being legible; the ceiling is where it
 * stops being a status ornament. The default sits at 26 because travel is
 * budgeted as a fraction of the drawn width — a smaller whale gets the pixel
 * floor and nothing more.
 */
export const MIN_SIZE = 18
export const MAX_SIZE = 36

const MOTION_MODES: ReadonlySet<string> = new Set(['full', 'subtle', 'static'])

/** The storage face this module needs; `localStorage` satisfies it. */
export interface ConfigStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Resolve the storage to use, tolerating environments that deny it. */
function resolveStorage(storage?: ConfigStorage): ConfigStorage | null {
  if (storage !== undefined) return storage
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Read one raw string, or null when storage is unavailable or empty. */
function read(storage: ConfigStorage | null, key: string): string | null {
  if (storage === null) return null
  try {
    const raw = storage.getItem(`${CONFIG_NS}.${key}`)
    return raw === null || raw === '' ? null : raw
  } catch {
    return null
  }
}

/**
 * Load the current configuration.
 * @param storage - storage to read from; defaults to `localStorage`.
 * @returns a valid configuration, whatever the stored bytes say.
 */
export function loadConfig(storage?: ConfigStorage): WhaleBuddyConfig {
  const store = resolveStorage(storage)
  const rawSize = Number.parseInt(read(store, 'size') ?? '', 10)
  const rawMotion = read(store, 'motion')
  const rawDockTop = Number.parseFloat(read(store, 'dockTop') ?? '')
  return {
    enabled: readBoolean(store, 'enabled', DEFAULT_CONFIG.enabled),
    inlineEnabled: readBoolean(store, 'inlineEnabled', DEFAULT_CONFIG.inlineEnabled),
    dockEnabled: readBoolean(store, 'dockEnabled', DEFAULT_CONFIG.dockEnabled),
    size:
      Number.isFinite(rawSize) && rawSize >= MIN_SIZE && rawSize <= MAX_SIZE
        ? rawSize
        : DEFAULT_CONFIG.size,
    motion:
      rawMotion !== null && MOTION_MODES.has(rawMotion)
        ? (rawMotion as MotionMode)
        : DEFAULT_CONFIG.motion,
    dockTop:
      Number.isFinite(rawDockTop) && rawDockTop >= 0 && rawDockTop <= 1
        ? rawDockTop
        : DEFAULT_CONFIG.dockTop,
  }
}

/**
 * Persist one setting. Failures are swallowed: a denied write must not break
 * the surface the user just interacted with.
 * @param key - the setting to write.
 * @param value - the new value.
 * @param storage - storage to write to; defaults to `localStorage`.
 */
export function saveConfig<K extends keyof WhaleBuddyConfig>(
  key: K,
  value: WhaleBuddyConfig[K],
  storage?: ConfigStorage,
): void {
  const store = resolveStorage(storage)
  if (store === null) return
  try {
    store.setItem(`${CONFIG_NS}.${key}`, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  } catch {
    /* storage denied; the in-memory value still applies for this session */
  }
}

/** Read a boolean written as `'1'` / `'0'`. */
function readBoolean(store: ConfigStorage | null, key: string, fallback: boolean): boolean {
  const raw = read(store, key)
  if (raw === null) return fallback
  return raw !== '0' && raw !== 'false'
}
