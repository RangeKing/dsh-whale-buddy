/**
 * Critically damped spring with fixed-step integration.
 *
 * Portions adapted from:
 * https://github.com/dsh-plugins/dsh-thought-buddy (src/client/index.ts,
 * the `tbRunAvatar` tick: substep loop, `1 / 120` step ceiling and frame-delta
 * clamping). BSD-3-Clause. See THIRD_PARTY_NOTICES.md.
 *
 * The reason for fixed substeps is stability rather than style: an explicit
 * Euler step scaled by a long frame delta (a background tab resuming, a stalled
 * main thread) diverges instead of settling. Clamping the delta and then
 * walking it in `<= 1/120 s` slices keeps the same visible behaviour at 30, 60
 * and 120 Hz, and makes a controlled-clock test reproduce the real thing.
 */

/** Largest frame delta the integrator will believe, in seconds. */
export const MAX_FRAME_DELTA = 0.1

/** Largest integration substep, in seconds. */
export const MAX_SUBSTEP = 1 / 120

/** Position and velocity of one rigged channel. */
export interface SpringState {
  value: number
  velocity: number
  target: number
  /** Angular frequency; higher settles faster. */
  frequency: number
  /**
   * Damping ratio. 1 is critical — the default, and what every channel of the
   * whale itself uses, because critical damping is what makes waypoint distance
   * a *hard* bound on travel rather than a hope.
   *
   * The one exception in this codebase is the water surface, which is
   * deliberately underdamped: a struck surface that returned to flat without
   * ever passing it would read as a lid closing, not as water. Anything that
   * moves the mark must leave this at 1.
   */
  damping: number
}

/**
 * Create a spring already at rest on `value`.
 * @param value - initial position and target.
 * @param frequency - angular frequency (rad/s-ish); higher is snappier.
 * @param damping - damping ratio; 1 (critical, the default) never overshoots.
 * @returns the spring state.
 */
export function createSpring(value: number, frequency: number, damping = 1): SpringState {
  return { value, velocity: 0, target: value, frequency, damping }
}

/**
 * Point a spring at a new target without touching its position or velocity,
 * so an interrupted gesture continues from where it actually is.
 * @param spring - the spring to retarget.
 * @param target - the new rest position.
 */
export function retarget(spring: SpringState, target: number): void {
  spring.target = target
}

/**
 * Advance one spring by `dt` seconds using fixed substeps.
 * @param spring - the spring to integrate (mutated in place).
 * @param dt - elapsed seconds; values above {@link MAX_FRAME_DELTA} are clamped
 *   and negative values are ignored.
 */
export function integrate(spring: SpringState, dt: number): void {
  let remaining = clampDelta(dt)
  const f = spring.frequency
  const zeta = Number.isFinite(spring.damping) && spring.damping > 0 ? spring.damping : 1
  while (remaining > 0) {
    const step = Math.min(remaining, MAX_SUBSTEP)
    const displacement = spring.value - spring.target
    spring.velocity += (-2 * zeta * f * spring.velocity - f * f * displacement) * step
    spring.value += spring.velocity * step
    remaining -= step
  }
  if (!Number.isFinite(spring.value) || !Number.isFinite(spring.velocity)) {
    spring.value = spring.target
    spring.velocity = 0
  }
}

/**
 * Clamp a frame delta into the range the integrator trusts.
 * @param dt - elapsed seconds, possibly negative, huge or not a number.
 * @returns a finite delta in `[0, MAX_FRAME_DELTA]`.
 */
export function clampDelta(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0
  return dt > MAX_FRAME_DELTA ? MAX_FRAME_DELTA : dt
}

/**
 * Snap a spring to its target, for reduced motion and for teardown.
 * @param spring - the spring to settle.
 */
export function settle(spring: SpringState): void {
  spring.value = spring.target
  spring.velocity = 0
}
