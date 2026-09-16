/**
 * Gesture cadence.
 *
 * The whale must not look like a loop. Every gesture is scheduled on a bounded
 * random interval drawn from the active profile, and the two high-salience
 * gestures (surge, settle) refuse to fire while the other is still playing, so
 * the animation never produces a single large "event" made of two gestures
 * landing together.
 *
 * The cruise waypoint is not scheduled here — it belongs to the engine, which
 * redraws it whenever its dwell expires. This module owns only the things that
 * interrupt that cruise.
 *
 * Time and randomness are injected, so a test can drive an exact sequence.
 */
import type { Cadence, MotionProfile } from './poses.js'
import type { RandomSource } from './types.js'

/** Gestures the scheduler emits. */
export type GestureKind = 'blink' | 'surge' | 'settle'

/** Duration of the eye-closing envelope, seconds. */
export const BLINK_DURATION = 0.32

/** Surge and settle never overlap each other. */
const SALIENT: ReadonlySet<GestureKind> = new Set<GestureKind>(['surge', 'settle'])

/** Every kind, in firing order. */
const KINDS = ['blink', 'surge', 'settle'] as const

/** One fired gesture. */
export interface Gesture {
  readonly kind: GestureKind
  /** Signed unit amplitude, for gestures that have a direction. */
  readonly direction: number
}

/** Scheduler options. */
export interface SchedulerOptions {
  readonly random: RandomSource
  readonly profile: MotionProfile
}

/**
 * Bounded-random gesture cadence for one whale.
 */
export class GestureScheduler {
  private readonly random: RandomSource
  private profile: MotionProfile
  private readonly next: Record<GestureKind, number>
  private salientUntil = 0
  private elapsed = 0

  /**
   * @param options - random source and the profile to start on.
   */
  constructor(options: SchedulerOptions) {
    this.random = options.random
    this.profile = options.profile
    // Stagger the first draws so a fresh whale does not open with every gesture
    // at once, and so two surfaces mounted together drift apart.
    this.next = {
      blink: this.draw(this.profile.blinkEvery) * 0.7,
      surge: this.draw(this.profile.surgeEvery) * 0.5,
      settle: this.draw(this.profile.settleEvery),
    }
  }

  /**
   * Adopt a new profile without resetting pending timers, so a state change
   * mid-interval does not restart every gesture at once. Timers longer than
   * the new profile's maximum are pulled in to it.
   * @param profile - the profile to animate with from now on.
   */
  setProfile(profile: MotionProfile): void {
    this.profile = profile
    for (const kind of KINDS) {
      const latest = this.elapsed + this.cadenceFor(kind).max
      if (this.next[kind] > latest) this.next[kind] = latest
    }
  }

  /**
   * Advance the schedule and collect whatever fired.
   * @param dt - elapsed seconds since the previous call (already clamped).
   * @returns gestures that fired during this step, at most one per kind.
   */
  advance(dt: number): Gesture[] {
    this.elapsed += dt
    const fired: Gesture[] = []
    for (const kind of KINDS) {
      if (this.elapsed < this.next[kind]) continue
      if (SALIENT.has(kind) && this.elapsed < this.salientUntil) {
        // Defer rather than drop: the gesture still happens, just not on top
        // of the one already playing.
        this.next[kind] = this.salientUntil + this.draw(this.cadenceFor(kind)) * 0.35
        continue
      }
      fired.push({ kind, direction: this.random() < 0.5 ? -1 : 1 })
      if (SALIENT.has(kind)) this.salientUntil = this.elapsed + 1.2
      this.next[kind] = this.elapsed + this.draw(this.cadenceFor(kind))
    }
    return fired
  }

  /** Seconds until the named gesture is next due (for tests and diagnostics). */
  dueIn(kind: GestureKind): number {
    return this.next[kind] - this.elapsed
  }

  private cadenceFor(kind: GestureKind): Cadence {
    switch (kind) {
      case 'blink':
        return this.profile.blinkEvery
      case 'surge':
        return this.profile.surgeEvery
      case 'settle':
        return this.profile.settleEvery
    }
  }

  /** Draw one interval in seconds (never zero, so a timer cannot busy-fire). */
  private draw(cadence: Cadence): number {
    const span = Math.max(0, cadence.max - cadence.min)
    return Math.max(0.05, cadence.min + this.random() * span)
  }
}

/**
 * A small, fast, seeded generator so demos and tests can reproduce a run
 * without depending on `Math.random`'s sequence (mulberry32).
 * @param seed - any 32-bit integer.
 * @returns a random source in `[0, 1)`.
 */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
