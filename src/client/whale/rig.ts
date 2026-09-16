/**
 * Pose to SVG transform. Pure maths, no DOM: the renderer applies what this
 * produces, and a test can assert on it directly.
 *
 * This is also the one place pixels become viewBox units. The pose speaks in
 * pixels because that is where perception lives; the SVG speaks in units
 * because that is where the artwork lives. Keeping the conversion here — and
 * deriving the clamps from the same {@link AmplitudeBudget} the renderer sizes
 * its bleed from — means the limits and the drawable area can no longer
 * disagree. They used to: hand-written clamps allowed a pose the bleed could
 * not contain, which sheared the tail off at the extremes.
 *
 * Every value is clamped and finiteness-checked here rather than in the
 * renderer, so a NaN can never reach an SVG attribute (browsers respond to one
 * by dropping the whole transform, which looks like the whale teleporting).
 */
import { BODY_PIVOT, EYE_CENTER, HALF_EXTENT, VIEW_BOX } from './geometry.js'
import type { AmplitudeBudget, WhalePose } from './types.js'

/** The bounds one budget permits, in the units each channel is expressed in. */
export interface RigLimits {
  /** Peak horizontal body offset from centre, CSS px. */
  readonly travelXPx: number
  /** Peak vertical body offset from centre, CSS px. */
  readonly travelYPx: number
  /** Peak heading, degrees, including the profile's posture bias. */
  readonly headingDeg: number
  readonly minScale: number
  readonly maxScale: number
  /**
   * The mutually exclusive extremes the drawing has to contain.
   *
   * `travelYPx` and `maxScale` above are the *union* of every pose the engine
   * can emit, which is what a sanity check wants. The viewBox wants something
   * else: the largest box any single frame can need. A breach and a compaction
   * squeeze never play together — the engine suppresses the squeeze mid-arc,
   * exactly as it suppresses the prop — so charging the bleed for the sum of
   * the two buys nothing and costs about two pixels of layout on a row that
   * only has sixteen. Each entry here is one thing that can actually happen;
   * {@link bleedFor} takes the largest, not the total.
   */
  readonly envelopes: ReadonlyArray<{ readonly travelYPx: number; readonly maxScale: number }>
}

/** Headroom over the budget, so a posture bias or a rounding edge never clips. */
const LIMIT_SLACK = 1.35

/**
 * Extra bleed covering the rounding in {@link fixed}.
 *
 * Transforms are written to four decimals, so a rendered offset can land a
 * fraction past the exact one the bleed was computed from. Without this the
 * extreme pose sits precisely on the viewBox edge and rounding decides whether
 * it clips — a hairline that only appears at the extremes, which is the worst
 * kind to debug.
 */
const ROUNDING_GUARD = 0.01

/**
 * Resolve the rig's hard limits from an amplitude budget.
 * @param budget - the size-derived budget the engine animates within.
 * @returns the bounds the rig will render, and the renderer will make room for.
 */
export function limitsFor(budget: AmplitudeBudget): RigLimits {
  // The leap and the swim are summed rather than chosen between. The engine
  // fades the swim out across an arc, so in practice the extremes do not
  // actually coincide — but the bound has to hold for any pose the engine can
  // emit, not for the one it usually does, and a rig that clamps is a rig that
  // flattens the top of the arc.
  const swimYPx = budget.travel / 2
  // The dive is deeper than the rise — the water line sits at the mark's bottom
  // edge, so the dive is the only part of the arc that puts any of the whale
  // under the surface. The bleed is symmetric, so it is sized from whichever of
  // the two is larger.
  const leapYPx = (swimYPx + Math.max(budget.leapRise, budget.leapDive)) * LIMIT_SLACK
  const squeezeYPx = swimYPx * LIMIT_SLACK
  const headingDeg = (budget.headingDeg + budget.leapTiltDeg) * LIMIT_SLACK
  const breath = budget.breath * LIMIT_SLACK
  // No slack on the squeeze. The slack elsewhere covers a posture bias added on
  // top of a budgeted amplitude; the squeeze has nothing added to it — the
  // engine clamps it to exactly this range — so slack here would only widen the
  // legal pose range, and a clamp that never binds is not a clamp.
  const stretch = budget.stretch
  return {
    // Horizontal is the swim's alone. The breach is vertical, and widening the
    // viewBox for travel that never happens is bleed the layout has to pay for.
    travelXPx: swimYPx * budget.lateralRatio * LIMIT_SLACK,
    travelYPx: Math.max(leapYPx, squeezeYPx),
    headingDeg,
    minScale: 1 - breath - budget.squash,
    maxScale: 1 + breath + stretch,
    envelopes: [
      // Mid-breach: the whole arc, and breathing, but no squeeze.
      { travelYPx: leapYPx, maxScale: 1 + breath },
      // Mid-squeeze: the swim only, and the rebound's stretch on top of it.
      { travelYPx: squeezeYPx, maxScale: 1 + breath + stretch },
    ],
  }
}

/**
 * Clamp to a range, mapping any non-finite input to the fallback.
 * @param value - candidate number.
 * @param min - lower bound.
 * @param max - upper bound.
 * @param fallback - value used when `value` is not finite.
 * @returns a finite number within `[min, max]`.
 */
export function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return value < min ? min : value > max ? max : value
}

/** Round to 4 decimals and normalise `-0`, keeping attribute text stable. */
export function fixed(value: number): string {
  const rounded = Math.round(value * 1e4) / 1e4
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/** The transforms one pose produces, ready for `setAttribute('transform')`. */
export interface RigTransforms {
  readonly body: string
  readonly eye: string
  /** Body opacity, already clamped and rounded for an attribute. */
  readonly opacity: string
}

/**
 * Convert a pose into the transform strings the renderer applies.
 * @param pose - the pose to render, with translation in CSS px.
 * @param limits - the bounds to clamp into.
 * @param unitsPerPixel - viewBox units per CSS pixel at the drawn size.
 * @returns transform attribute values; always finite, always parseable.
 */
export function rigTransforms(
  pose: WhalePose,
  limits: RigLimits,
  unitsPerPixel: number,
): RigTransforms {
  const scaleFactor = Number.isFinite(unitsPerPixel) && unitsPerPixel > 0 ? unitsPerPixel : 1
  const bodyX = clamp(pose.bodyX, -limits.travelXPx, limits.travelXPx, 0) * scaleFactor
  const bodyY = clamp(pose.bodyY, -limits.travelYPx, limits.travelYPx, 0) * scaleFactor
  const rotation = clamp(pose.bodyRotation, -limits.headingDeg, limits.headingDeg, 0)
  const scaleX = clamp(pose.bodyScaleX, limits.minScale, limits.maxScale, 1)
  const scaleY = clamp(pose.bodyScaleY, limits.minScale, limits.maxScale, 1)
  const eyeOpen = clamp(pose.eyeOpen, 0.02, 1, 1)
  const opacity = clamp(pose.opacity, 0, 1, 1)

  const body =
    `translate(${fixed(bodyX)} ${fixed(bodyY)})` +
    ` rotate(${fixed(rotation)} ${fixed(BODY_PIVOT.x)} ${fixed(BODY_PIVOT.y)})` +
    ` translate(${fixed(BODY_PIVOT.x)} ${fixed(BODY_PIVOT.y)})` +
    ` scale(${fixed(scaleX)} ${fixed(scaleY)})` +
    ` translate(${fixed(-BODY_PIVOT.x)} ${fixed(-BODY_PIVOT.y)})`

  const eye =
    `translate(${fixed(EYE_CENTER.x)} ${fixed(EYE_CENTER.y)})` +
    ` scale(1 ${fixed(eyeOpen)})` +
    ` translate(${fixed(-EYE_CENTER.x)} ${fixed(-EYE_CENTER.y)})`

  return { body, eye, opacity: fixed(opacity) }
}

/**
 * How far past the artwork's own box a clamped pose can reach, in viewBox
 * units. The renderer pads its viewBox by exactly this, so the drawn mark can
 * never be clipped by its own viewport — and the padding shrinks as the whale
 * grows, because the travel budget is in pixels.
 * @param limits - the rig's bounds.
 * @param unitsPerPixel - viewBox units per CSS pixel at the drawn size.
 * @returns per-axis bleed in viewBox units.
 */
export function bleedFor(
  limits: RigLimits,
  unitsPerPixel: number,
): { readonly x: number; readonly y: number } {
  const angle = (limits.headingDeg * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  let x = 0
  let y = 0
  // The largest of the mutually exclusive extremes, not their sum. Falling back
  // to the union bound keeps an older caller — or a hand-built limits object —
  // correct rather than merely lucky.
  const envelopes =
    limits.envelopes.length > 0
      ? limits.envelopes
      : [{ travelYPx: limits.travelYPx, maxScale: limits.maxScale }]
  for (const envelope of envelopes) {
    // Compose scale then rotation, rather than adding each one's growth
    // separately: the two multiply, and the difference — small, but real — is
    // exactly the kind of gap that lets a legal pose fall outside its viewBox.
    const scaledX = HALF_EXTENT.x * envelope.maxScale
    const scaledY = HALF_EXTENT.y * envelope.maxScale
    const rotatedX = scaledX * cos + scaledY * sin
    const rotatedY = scaledX * sin + scaledY * cos
    x = Math.max(x, limits.travelXPx * unitsPerPixel + rotatedX - HALF_EXTENT.x + ROUNDING_GUARD)
    y = Math.max(y, envelope.travelYPx * unitsPerPixel + rotatedY - HALF_EXTENT.y + ROUNDING_GUARD)
  }
  return { x: Math.max(0, x), y: Math.max(0, y) }
}

/** viewBox units per CSS pixel when the mark is drawn `size` pixels wide. */
export function unitsPerPixel(size: number): number {
  const width = Number.isFinite(size) && size > 0 ? size : 20
  return VIEW_BOX.width / width
}

/**
 * Whether every number in a pose is finite and inside the rig's range. Used by
 * tests as a single assertion over a long simulated run.
 * @param pose - the pose to check.
 * @param limits - the bounds it must respect.
 * @returns true when the pose is renderable as-is.
 */
export function isPoseSane(pose: WhalePose, limits: RigLimits): boolean {
  const values = [
    pose.bodyX,
    pose.bodyY,
    pose.bodyRotation,
    pose.bodyScaleX,
    pose.bodyScaleY,
    pose.eyeOpen,
    pose.opacity,
  ]
  if (!values.every((v) => Number.isFinite(v))) return false
  return (
    Math.abs(pose.bodyX) <= limits.travelXPx &&
    Math.abs(pose.bodyY) <= limits.travelYPx &&
    Math.abs(pose.bodyRotation) <= limits.headingDeg &&
    pose.bodyScaleX >= limits.minScale &&
    pose.bodyScaleX <= limits.maxScale &&
    pose.bodyScaleY >= limits.minScale &&
    pose.bodyScaleY <= limits.maxScale &&
    pose.eyeOpen >= 0 &&
    pose.eyeOpen <= 1 &&
    pose.opacity >= 0 &&
    pose.opacity <= 1
  )
}
