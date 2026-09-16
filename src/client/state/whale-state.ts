/**
 * The one place both surfaces agree on.
 *
 * Holds the current semantic state and the current configuration, and tells
 * subscribers when either changes. Deliberately tiny and DSH-free: the DSH
 * adapter pushes into it, the surfaces read from it, and neither knows about
 * the other. A future renderer (a 3D whale elsewhere) can subscribe to exactly
 * this and need nothing else.
 */
import { loadConfig, saveConfig, type WhaleBuddyConfig } from '../config.js'
import type { WhaleSemanticState } from '../whale/types.js'

/** What a subscriber is handed on every change. */
export interface WhaleSnapshot {
  readonly state: WhaleSemanticState
  readonly config: Readonly<WhaleBuddyConfig>
}

/** Change listener. */
export type WhaleListener = (snapshot: WhaleSnapshot) => void

/**
 * Shared semantic state and settings for every whale surface.
 */
export class WhaleStateStore {
  private snapshot: WhaleSnapshot
  private readonly listeners = new Set<WhaleListener>()

  /**
   * @param config - initial configuration; defaults to the persisted one.
   */
  constructor(config: WhaleBuddyConfig = loadConfig()) {
    this.snapshot = { state: 'idle', config }
  }

  /** The current state and configuration. */
  getSnapshot(): WhaleSnapshot {
    return this.snapshot
  }

  /**
   * Subscribe to changes.
   * @param listener - called on every change, never synchronously from here.
   * @returns an idempotent unsubscribe.
   */
  subscribe(listener: WhaleListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Publish the semantic state derived from DSH.
   * @param state - `'thinking'` while a model turn is running.
   */
  setState(state: WhaleSemanticState): void {
    if (state === this.snapshot.state) return
    this.snapshot = { ...this.snapshot, state }
    this.emit()
  }

  /**
   * Change one setting and persist it.
   * @param key - the setting to change.
   * @param value - the new value.
   */
  setConfig<K extends keyof WhaleBuddyConfig>(key: K, value: WhaleBuddyConfig[K]): void {
    if (this.snapshot.config[key] === value) return
    this.snapshot = { ...this.snapshot, config: { ...this.snapshot.config, [key]: value } }
    saveConfig(key, value)
    this.emit()
  }

  /** Drop every subscriber; called from the plugin's own teardown. */
  dispose(): void {
    this.listeners.clear()
  }

  private emit(): void {
    // Copy first: a listener may unsubscribe from inside its own callback.
    for (const listener of [...this.listeners]) listener(this.snapshot)
  }
}
