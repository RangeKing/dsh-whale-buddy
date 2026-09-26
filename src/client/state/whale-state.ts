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
import { IDLE_ACTIVITY, sameActivity, type WhaleActivity, type WhaleSemanticState } from '../whale/types.js'

/** A readable activity is shared by all surfaces for at least this long. */
export const MIN_ACTIVITY_MS = 700

/** Session facts are renderer-independent; the DSH adapter supplies them. */
export interface WhaleSession {
  readonly activity: WhaleActivity
  readonly running: boolean
  readonly turn: number
  readonly turnStart: number | null
}

const NO_SESSION = { sessionId: null, running: false, turn: 0, turnStart: null } as const

/** What a subscriber is handed on every change. */
export interface WhaleSnapshot {
  readonly state: WhaleSemanticState
  readonly activity: WhaleActivity
  readonly session: {
    readonly sessionId: string | null
    readonly running: boolean
    readonly turn: number
    readonly turnStart: number | null
  }
  readonly config: Readonly<WhaleBuddyConfig>
  /**
   * Whether this DSH draws the blue running-turn row itself: `native` (0.1.5,
   * 0.1.6), `absent` (0.1.7), or `unknown` until a row or header has been
   * seen. The classic-row option draws only on `absent` — never on a guess —
   * so a DSH that still has the row never shows two. Latched: the first
   * verdict stands for the page, because a DSH build does not change shape
   * while it is open.
   */
  readonly classicRowHost: ClassicRowHost
}

/** See {@link WhaleSnapshot.classicRowHost}. */
export type ClassicRowHost = 'unknown' | 'native' | 'absent'

/** Change listener. */
export type WhaleListener = (snapshot: WhaleSnapshot) => void

/**
 * Shared semantic state and settings for every whale surface.
 */
export class WhaleStateStore {
  private snapshot: WhaleSnapshot
  private holdUntil = 0
  private pending: WhaleActivity | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly listeners = new Set<WhaleListener>()

  /**
   * @param config - initial configuration; defaults to the persisted one.
   */
  constructor(config: WhaleBuddyConfig = loadConfig()) {
    this.snapshot = { state: 'idle', activity: IDLE_ACTIVITY, session: NO_SESSION, config, classicRowHost: 'unknown' }
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
    this.setActivity({ state })
  }

  /** Publish a full activity immediately, for standalone surfaces and demos. */
  setActivity(activity: WhaleActivity): void {
    this.clearPending()
    if (sameActivity(activity, this.snapshot.activity)) return
    this.show(activity)
  }

  /**
   * One session publisher, one hold clock. The inline whale, classic row and
   * Dock consume this same activity instead of holding or dropping tasks on
   * their own. Turn/session boundaries cancel the old pending update.
   */
  publishSession(sessionId: string, next: WhaleSession): void {
    const before = this.snapshot.session
    const boundary = before.sessionId !== sessionId || before.turn !== next.turn
    const changed = boundary || before.running !== next.running || before.turnStart !== next.turnStart
    if (changed) {
      this.snapshot = { ...this.snapshot, session: { sessionId, running: next.running, turn: next.turn, turnStart: next.turnStart } }
    }
    if (!boundary && sameActivity(next.activity, this.snapshot.activity)) {
      this.clearPending()
      if (changed) this.emit()
      return
    }
    if (boundary || !next.running || next.activity.state === 'waiting' || next.activity.state === 'error') {
      this.clearPending()
      this.show(next.activity)
      return
    }
    const wait = this.holdUntil - performance.now()
    if (wait <= 0) {
      this.clearPending()
      this.show(next.activity)
      return
    }
    this.pending = next.activity
    if (changed) this.emit()
    if (this.timer !== undefined) return
    this.timer = setTimeout(() => {
      const activity = this.pending
      this.timer = undefined
      this.pending = null
      if (activity !== null) this.show(activity)
    }, wait)
  }

  /** A stale unmount must not clear the newly selected session. */
  clearSession(sessionId: string): void {
    if (this.snapshot.session.sessionId !== sessionId) return
    this.clearPending()
    this.snapshot = { ...this.snapshot, session: NO_SESSION }
    this.show(IDLE_ACTIVITY)
  }

  private show(activity: WhaleActivity): void {
    this.holdUntil = performance.now() + MIN_ACTIVITY_MS
    this.snapshot = { ...this.snapshot, state: activity.state, activity }
    this.emit()
  }

  private clearPending(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.pending = null
  }

  /**
   * Record whether DSH draws the classic row itself; the first verdict wins.
   * @param host - `native` when DSH's own row was seen, `absent` for a 0.1.7 header.
   */
  markClassicRowHost(host: Exclude<ClassicRowHost, 'unknown'>): void {
    if (this.snapshot.classicRowHost !== 'unknown') return
    this.snapshot = { ...this.snapshot, classicRowHost: host }
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
    this.clearPending()
    this.listeners.clear()
  }

  private emit(): void {
    // Copy first: a listener may unsubscribe from inside its own callback.
    for (const listener of [...this.listeners]) listener(this.snapshot)
  }
}
