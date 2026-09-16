/**
 * The breach: one scripted arc, played once when a turn begins.
 *
 * **This is the one place the project's "no gesture layer" rule is broken, on
 * purpose.** Everywhere else, motion is a spring chasing a waypoint, and the
 * gestures are nothing but waypoints placed differently — that is what keeps
 * the travel and speed ceilings enforceable rather than aspirational. A breach
 * cannot be built that way. A critically damped spring produces exactly one
 * shape: approach and stop. It cannot dip, launch, hang, tip over and fall,
 * because the shape of the arc *is* the content here, not a side effect of the
 * chase. So the arc is written out, and the rule it breaks is paid for by the
 * same discipline in a different form: the curve is normalised to ±1 and scaled
 * by the {@link AmplitudeBudget}, so its pixel envelope is still one number,
 * still derived from the drawn size, and still the same number the renderer
 * sizes its viewBox from.
 *
 * `height = 0` is the water line, and the curve is built out of forces rather
 * than out of easings — see {@link heightAt} for the phase table. The gather
 * phase at the start pays for itself three times over, which is why it survived
 * a round of trying to delete it: it is the wind-up that makes the launch read,
 * it is the window in which the water surface can draw itself out before
 * anything happens to it, and without it there is nothing to come *out* of.
 *
 * Rotation is not in the table because it is not authored: it is taken from the
 * curve's own slope, exactly as cruising heading is taken from the body's own
 * velocity. A nose angle drawn independently of the path is the difference
 * between a whale and a rotating sticker, and deriving it means the two can
 * never disagree.
 *
 * Opacity is not in the table either, and used to be. An earlier version faded
 * the whale out as it went under, because there was no water to hide behind.
 * There is now, so it does not.
 */

/** How long one breach lasts, seconds. */
export const LEAP_SECONDS = 1.5

/**
 * Phase boundaries as fractions of {@link LEAP_SECONDS}.
 *
 * These are not free parameters. The airborne phase is a true ballistic
 * parabola, so the velocity it must be launched with is fixed by how long it
 * lasts; the surge before it and the plunge after it then have to *match that
 * velocity at the seam*, or the whale visibly changes speed at the instant it
 * leaves or enters the water, which is exactly the thing that made the earlier
 * arc read as keyframed rather than thrown. See {@link DIP} and PLUNGE_END.
 */
const GATHER_END = 0.12
const SURGE_END = 0.24
const AIRBORNE_END = 0.62
const PLUNGE_END = 0.81

/**
 * How far the whale sinks before it launches, as a fraction of the dive.
 *
 * Derived, not chosen: `2 * surge / airborne`. The surge accelerates from rest
 * over its own duration and has to arrive at the surface doing exactly the
 * parabola's launch speed, and that is the depth which makes those two equal.
 */
const DIP = (2 * (SURGE_END - GATHER_END)) / (AIRBORNE_END - SURGE_END)

/** Slope that saturates the nose angle; above it, `tanh` flattens. */
const SLOPE_REFERENCE = 7

/** Interval used to differentiate the height curve numerically. */
const SLOPE_EPSILON = 1 / 240

/** One sample of the breach. */
export interface LeapSample {
  /** Height above the water line: 1 at the peak, -1 at the deepest point. */
  readonly height: number
  /** Nose angle as a fraction of the budget's peak tilt, -1 to 1. */
  readonly tilt: number
  /** False once the breach is over and the cruise owns the pose again. */
  readonly active: boolean
}

/** The pose a finished (or never-started) leap contributes: nothing. */
const RESTING: LeapSample = Object.freeze({ height: 0, tilt: 0, active: false })

/** Smoothstep. */
function ease(p: number): number {
  return p * p * (3 - 2 * p)
}

/**
 * Height above the water line at one point in the breach.
 *
 * Five phases, and each one is the shape a force produces rather than a curve
 * that looked right:
 *
 * | phase | fraction | force |
 * | --- | --- | --- |
 * | gather | 0 – 0.12 | sinking to load, arriving at rest |
 * | surge | 0.12 – 0.24 | constant thrust, accelerating to the surface |
 * | airborne | 0.24 – 0.62 | constant gravity: a symmetric parabola |
 * | plunge | 0.62 – 0.81 | water drag, decelerating to a stop |
 * | float | 0.81 – 1 | buoyancy, easing back to the surface |
 *
 * The two water phases are deliberately not mirror images of the two air ones.
 * Air lets a body keep its speed; water takes it away within a fifth of a
 * second, and then gives it back slowly. Making the plunge and the float the
 * same shape is what made the old arc feel weightless.
 * @param u - progress through the breach, 0 to 1.
 * @returns -1 at the deepest point of the dive, 1 at the peak of the leap.
 */
export function heightAt(u: number): number {
  if (u <= 0 || u >= 1) return 0
  if (u < GATHER_END) {
    // Sinking to load. Arrives at the bottom with no speed, so the thrust that
    // follows reads as a push rather than as a continuation.
    return -DIP * ease(u / GATHER_END)
  }
  if (u < SURGE_END) {
    // Constant thrust from rest: displacement goes as the square of time.
    const p = (u - GATHER_END) / (SURGE_END - GATHER_END)
    return -DIP + DIP * p * p
  }
  if (u < AIRBORNE_END) {
    // Ballistic. Symmetric by construction, which is what a constant
    // downward force gives you and what "affected by gravity" means.
    const q = (u - SURGE_END) / (AIRBORNE_END - SURGE_END)
    return 4 * q * (1 - q)
  }
  if (u < PLUNGE_END) {
    // Hitting water: decelerating hard to a standstill. Entry speed matches
    // the parabola's exit speed because this phase is exactly half its length.
    const s = (u - AIRBORNE_END) / (PLUNGE_END - AIRBORNE_END)
    return -(2 * s - s * s)
  }
  // Buoyancy, which starts from nothing and builds — so the float back up is
  // the one part of the arc that is allowed to be slow.
  const s = (u - PLUNGE_END) / (1 - PLUNGE_END)
  return -(1 - ease(s))
}

/**
 * Sample the breach.
 * @param seconds - time since the breach began.
 * @returns height, nose angle, and whether the breach is still running.
 */
export function leapAt(seconds: number): LeapSample {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= LEAP_SECONDS) return RESTING
  const u = seconds / LEAP_SECONDS
  const height = heightAt(u)
  // Differentiated rather than authored per phase: one curve, so the nose can
  // never point somewhere the path is not going.
  const slope = (heightAt(u + SLOPE_EPSILON) - heightAt(u - SLOPE_EPSILON)) / (2 * SLOPE_EPSILON)
  return { height, tilt: Math.tanh(slope / SLOPE_REFERENCE), active: true }
}

/** Which way the whale went through the surface. */
export type Crossing = 'exit' | 'entry'

/**
 * Detect a crossing of the water line between two samples of the arc.
 *
 * The whale crosses `height = 0` exactly twice — out on the way up, in on the
 * way down — and those two instants are the only times a splash happens or the
 * surface is disturbed. Deriving them from the same curve that moves the body
 * is what keeps the splash welded to the impact; a separately scheduled splash
 * drifts off it the moment anyone retunes a phase boundary.
 * @param before - height on the previous frame.
 * @param after - height on this frame.
 * @returns the crossing, or null when the surface was not touched.
 */
export function crossingBetween(before: number, after: number): Crossing | null {
  // Exactly on the line counts as *in* the water. That is not a tie-break, it
  // is what makes the count come out at two: the arc both starts and ends at
  // height 0, so treating 0 as above water would make the wind-up an entry and
  // the final settle a third crossing — a splash as the whale sinks to gather,
  // and another one after everything is over.
  const side = (h: number): number => (h > 0 ? 1 : -1)
  const from = side(before)
  const to = side(after)
  if (from === to) return null
  return to === 1 ? 'exit' : 'entry'
}
