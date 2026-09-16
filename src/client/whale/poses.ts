/**
 * Motion profiles: how the whale swims, per semantic state.
 *
 * One mechanism produces everything. The body chases a waypoint with a spring;
 * where the waypoint lands and how long it rests there is the whole vocabulary.
 * Cruising draws a near waypoint, a `surge` draws a far one, a `settle` draws a
 * very near one and stays longer. There is no separate gesture layer stacked on
 * top of a base animation, which is why the travel and speed ceilings are
 * directly enforceable: waypoint distance bounds travel, spring frequency
 * bounds speed.
 *
 * Two rules carry intent rather than taste:
 *
 *  - `thinking` is more attentive, not more frantic. It differs from `idle` in
 *    posture, in reflex speed, and in how often it has an idea — **never in how
 *    far it travels**. Widening the amplitude is the cheap move and it reads as
 *    agitation.
 *  - Amplitudes are fractions of an {@link AmplitudeBudget} measured in pixels,
 *    so the same profile looks the same on an 18 px whale and a 56 px one.
 */
import type { AmplitudeBudget, MotionMode, WhaleSemanticState } from './types.js'

/** Inclusive-ish random range in seconds. */
export interface Cadence {
  readonly min: number
  readonly max: number
}

/** Everything the engine needs to animate one semantic state. */
export interface MotionProfile {
  /**
   * Share of the travel budget this state may spend.
   *
   * This is the one place the two states differ in amplitude, and it needed
   * saying out loud: the design rule is that `thinking` must not read as
   * agitation, which argues for identical travel — but the Dock is on screen
   * permanently, and a resting control that moves exactly as much as a working
   * one is both more intrusive at rest and harder to read at a glance. So idle
   * sits below the budget rather than thinking sitting above it, and the state
   * change still carries three other cues (posture, reflex speed, gesture
   * density) so that amplitude is never the signal doing the work alone.
   */
  readonly reachScale: number
  /**
   * Smallest and largest cruise waypoint radius, as a fraction of the reach.
   *
   * Cruising is the swim stroke, not idling between darts: consecutive cruise
   * waypoints alternate side and land near the rim, because a spring that only
   * ever wanders to the middle of its disc spends most of the travel budget on
   * nothing. Irregular dwell, a free horizontal component and the two gestures
   * are what keep that alternation from reading as a metronome.
   */
  readonly cruiseReach: readonly [number, number]
  /** Surge waypoint radius, same units. 1 spends the whole budget. */
  readonly surgeReach: number
  /** Settle waypoint radius, same units. */
  readonly settleReach: number
  /** How long the body rests on a cruise waypoint before drawing another. */
  readonly dwell: Cadence
  /** Dwell after a surge — short, so the burst reads as a burst. */
  readonly surgeDwell: Cadence
  /** Dwell after a settle — long, so the pause reads as a pause. */
  readonly settleDwell: Cadence
  /** Body spring frequency; higher darts, lower drifts. */
  readonly chase: number
  /** Heading spring frequency, as a fraction of `chase`. Lag is the point. */
  readonly headingLag: number
  /** Steady heading bias, degrees — the posture difference between states. */
  readonly posture: number
  /** Periods of the two breathing sines, seconds. Deliberately incommensurate. */
  readonly breathPeriods: readonly [number, number]
  readonly blinkEvery: Cadence
  readonly surgeEvery: Cadence
  readonly settleEvery: Cadence
  /**
   * Peak balancing wobble, degrees, and how often it swings, in Hz.
   *
   * Zero everywhere except `working`, where the whale has a ball on its head.
   * A sea lion balancing something does not hold still between throws — it
   * makes constant small corrections under it, and that is what tells you the
   * thing on its head is balanced rather than glued on. The prop does not
   * follow rotation, so the body turns underneath a ball that stays level,
   * which is exactly the right relationship.
   */
  readonly balanceDeg: number
  readonly balanceHz: number
}

/** Dock-at-rest profile: slow, sparse, easy to sit beside for an hour. */
const IDLE: MotionProfile = {
  reachScale: 0.62,
  cruiseReach: [0.72, 1],
  surgeReach: 1,
  settleReach: 0.16,
  dwell: { min: 0.9, max: 2.2 },
  surgeDwell: { min: 0.35, max: 0.7 },
  settleDwell: { min: 2.6, max: 4.8 },
  chase: 5.6,
  headingLag: 0.6,
  posture: 0,
  breathPeriods: [5.4, 8.9],
  blinkEvery: { min: 5.5, max: 11 },
  surgeEvery: { min: 14, max: 26 },
  settleEvery: { min: 18, max: 34 },
  // The ball lives here now, so the balancing does too. It costs a resting
  // whale nothing, because the engine scales it by how much of the ball is
  // actually on screen — and for the first nine seconds of quiet that is none.
  balanceDeg: 3.4,
  balanceHz: 1.15,
}

/** Model-is-working profile: same reach, quicker reflexes, slight lean in. */
const THINKING: MotionProfile = {
  reachScale: 1,
  cruiseReach: [0.72, 1],
  surgeReach: 1,
  settleReach: 0.16,
  dwell: { min: 0.45, max: 1.1 },
  surgeDwell: { min: 0.3, max: 0.6 },
  settleDwell: { min: 1.9, max: 3.4 },
  chase: 9,
  headingLag: 0.6,
  posture: -1.6,
  breathPeriods: [4.1, 6.7],
  blinkEvery: { min: 3.5, max: 7.5 },
  surgeEvery: { min: 6, max: 13 },
  settleEvery: { min: 9, max: 17 },
  balanceDeg: 0,
  balanceHz: 0,
}

/**
 * Streaming an answer: the turn has settled into producing output, so the
 * whale settles too — thinking's reflexes, a longer dwell, no forward lean.
 */
const RESPONDING: MotionProfile = {
  ...THINKING,
  dwell: { min: 0.8, max: 1.8 },
  posture: -0.4,
  surgeEvery: { min: 9, max: 18 },
  settleEvery: { min: 7, max: 13 },
}

/**
 * A tool is running: busier cadence, the same reach, a slight lean in.
 *
 * The balancing wobble used to live here, back when the ball did. It went with
 * it: a head making constant small corrections means there is something up
 * there to correct for, and `working` now carries a wrench or a pencil, which
 * is a thing being *used* rather than a thing being balanced.
 */
const WORKING: MotionProfile = {
  ...THINKING,
  dwell: { min: 0.35, max: 0.8 },
  chase: 10,
  posture: -2.2,
  surgeEvery: { min: 4, max: 9 },
  settleEvery: { min: 11, max: 20 },
  balanceDeg: 0,
  balanceHz: 0,
}

/**
 * Waiting on the user. The one state that is not about the model working, so
 * it is the one state that stops swimming: nearly still, nose up, blinking —
 * a whale looking back at you rather than one getting on with something.
 */
const WAITING: MotionProfile = {
  ...IDLE,
  reachScale: 0.3,
  dwell: { min: 1.6, max: 3.4 },
  chase: 3.4,
  posture: 2.4,
  blinkEvery: { min: 2.6, max: 5 },
  surgeEvery: { min: 26, max: 48 },
  settleEvery: { min: 8, max: 15 },
}

/**
 * Squeezing the context. The body is being compressed, so the swim gets out of
 * the way: nearly still, slow, and level — a whale holding its breath while
 * something happens to it.
 */
const COMPACTING: MotionProfile = {
  ...IDLE,
  reachScale: 0.22,
  dwell: { min: 1.4, max: 2.8 },
  chase: 3,
  posture: 0,
  blinkEvery: { min: 2.2, max: 4.4 },
  surgeEvery: { min: 30, max: 60 },
  settleEvery: { min: 6, max: 12 },
}

/** The last turn failed. Deflated: nose down, slow, blinking more than usual. */
const ERROR: MotionProfile = {
  ...WAITING,
  reachScale: 0.26,
  posture: -3.2,
  chase: 3,
  blinkEvery: { min: 1.8, max: 3.6 },
}

const PROFILES: Readonly<Record<WhaleSemanticState, MotionProfile>> = Object.freeze({
  idle: IDLE,
  thinking: THINKING,
  responding: RESPONDING,
  working: WORKING,
  waiting: WAITING,
  compacting: COMPACTING,
  error: ERROR,
})

/** How much of a profile's reach `motion: 'subtle'` keeps. */
const SUBTLE_REACH = 0.45

/** How much `motion: 'subtle'` stretches every cadence. */
const SUBTLE_CADENCE = 1.6

/**
 * Resolve the profile for a state under a motion mode.
 * @param state - current semantic state.
 * @param mode - configured motion mode (`'static'` is handled by the engine,
 *   which never starts a frame loop, so it resolves like `'subtle'` here).
 * @returns the profile to animate with.
 */
export function profileFor(state: WhaleSemanticState, mode: MotionMode): MotionProfile {
  const base = PROFILES[state]
  if (mode === 'full') return base
  const stretch = (c: Cadence): Cadence => ({
    min: c.min * SUBTLE_CADENCE,
    max: c.max * SUBTLE_CADENCE,
  })
  return {
    ...base,
    reachScale: base.reachScale * SUBTLE_REACH,
    posture: base.posture * SUBTLE_REACH,
    dwell: stretch(base.dwell),
    surgeDwell: base.surgeDwell,
    settleDwell: stretch(base.settleDwell),
    blinkEvery: stretch(base.blinkEvery),
    surgeEvery: stretch(base.surgeEvery),
    settleEvery: stretch(base.settleEvery),
  }
}

/**
 * The half-extents of the swim ellipse, in CSS px.
 * @param profile - the active profile.
 * @param budget - the size-derived amplitude budget.
 * @returns peak offsets from centre along each axis.
 */
export function swimReach(
  profile: MotionProfile,
  budget: AmplitudeBudget,
): { readonly x: number; readonly y: number } {
  // The body is critically damped, so it never overshoots a waypoint: peak
  // travel is exactly the distance between the two furthest waypoints, which
  // makes `reachScale` a hard bound rather than a hope.
  const y = (budget.travel / 2) * profile.reachScale
  return { x: y * budget.lateralRatio, y }
}
