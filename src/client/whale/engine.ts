/**
 * Whale motion engine: semantic state in, poses out.
 *
 * Knows nothing about DSH, about React, or about SVG — only how large it is
 * drawn, because perception is measured in pixels and an amplitude that ignores
 * scale is an amplitude that disappears. It is stepped by whoever mounts it:
 * `requestAnimationFrame` in a browser, a controlled clock in a test. Two
 * surfaces run two engines so their sizes and spring states stay independent,
 * and both speak this one vocabulary.
 *
 * **The whole animation is one mechanism.** The body chases a waypoint with a
 * critically damped spring; heading follows the body's own velocity, lagging
 * behind it; breathing is an independent slow sine; the eye blinks. Gestures
 * are not a layer stacked on top — a `surge` is a far waypoint and a `settle`
 * is a near one held longer. That is what makes the travel and speed ceilings
 * enforceable rather than aspirational: waypoint distance bounds travel,
 * spring frequency bounds speed, and critical damping means the body never
 * overshoots past a waypoint it was given.
 *
 * Fixed-step integration and frame-delta clamping are adapted from
 * dsh-thought-buddy (BSD-3-Clause); see `spring.ts` and THIRD_PARTY_NOTICES.md.
 */
import { crossingBetween, leapAt, LEAP_SECONDS } from './leap.js'
import { profileFor, swimReach, type MotionProfile } from './poses.js'
import { IDLE_PROP_DELAY, Props } from './props.js'
import { Water } from './water.js'
import { GestureScheduler, type Gesture } from './scheduler.js'
import { clampDelta, createSpring, integrate, retarget, settle, type SpringState } from './spring.js'
import {
  budgetFor,
  neutralPose,
  propFor,
  sameActivity,
  type AmplitudeBudget,
  type MotionMode,
  type RandomSource,
  type WhaleActivity,
  type WhaleEffects,
  type WhalePose,
  type WhaleSemanticState,
} from './types.js'

/** Construction options. */
export interface EngineOptions {
  /** The mark's drawn width in CSS px; the amplitude budget derives from it. */
  readonly size: number
  /** Starting semantic state. */
  readonly state?: WhaleSemanticState
  /** Configured motion mode; `'static'` holds the neutral pose forever. */
  readonly motion?: MotionMode
  /** Injected randomness; defaults to `Math.random`. */
  readonly random?: RandomSource
  /**
   * Share of the leap this engine may spend, 0-1.
   *
   * Must match the value the renderer was built with, because it sets both the
   * amplitude and the viewBox headroom that amplitude needs.
   */
  readonly leapScale?: number
}

/** Speed at which heading reaches its full deflection, px/s per unit of travel. */
const HEADING_SPEED_REFERENCE = 1.6

/** Below this fraction of the reference speed, heading stops tracking. */
const HEADING_DEADBAND = 0.12

/**
 * How long a state change takes to become fully audible in the motion, seconds.
 *
 * Spring *position* was already continuous across a state change — the value
 * and velocity are preserved, so the body never jumped. What jumped was the
 * character: chase frequency stepping from 3.4 to 10 changes the stiffness of
 * the rig between one frame and the next, and a `reachScale` step re-clamps the
 * live waypoint, which yanks the body toward a target it was not heading for.
 * Easing the four continuous profile fields removes both, and costs nothing
 * else: the whale arrives at the new state's character over a blink rather than
 * inside one frame.
 */
const PROFILE_BLEND_S = 0.45

/**
 * The compaction squeeze: how often it repeats, and the shape of one cycle.
 *
 * DSH gives no progress for a compaction — only that one is running — so the
 * gesture has to be a loop rather than a bar. One squeeze every second and a
 * half is slow enough to read as deliberate and far enough apart that the ring
 * from the previous one has died before the next begins.
 */
const SQUEEZE_PERIOD = 1.6

/**
 * Seconds spent pressing down, and seconds held at the bottom.
 *
 * The hold is a little over one period of the squeeze spring, and that is not
 * a coincidence: a shorter one releases before the body has finished arriving
 * at full compression, so the press — the half of the gesture that carries the
 * meaning — never actually lands, and the whole thing reads as a twitch.
 *
 * Press, hold and ring together take about half of {@link SQUEEZE_PERIOD}, and
 * the rest is stillness. That gap is not padding: filmed at 3 Hz the cycles ran
 * into each other and the result was a whale slowly breathing in and out, not a
 * whale being squeezed. A gesture needs a beat of nothing either side of it to
 * be read as a gesture.
 */
const SQUEEZE_IN = 0.16
const SQUEEZE_HOLD = 0.14

/**
 * Frequency and damping of the squeeze spring.
 *
 * **The one underdamped channel that moves the mark**, and the exception is
 * deliberate. Everything else in this rig is critically damped because that is
 * what makes waypoint distance a hard bound on travel; this one has to pass its
 * rest height on the way back or the rebound reads as a lid closing rather than
 * as something elastic letting go. It is safe to make an exception here for a
 * reason that does not apply to the others: it is a *scale* channel, so its
 * overshoot is bounded by the spring's own ratio rather than by where a
 * waypoint happened to be, and that bound is charged to the viewBox as an
 * envelope in `rig.ts`.
 *
 * At ζ = 0.26 a release from full compression overshoots to about 43% of it,
 * then to 18%, then stops — two visible bounces, which is what "回弹" looks
 * like when it is done well and what one bounce never manages.
 */
const SQUEEZE_FREQUENCY = 5.5
const SQUEEZE_DAMPING = 0.26

/** Bounds on the squeeze value: 1 is fully flattened, negative is stretched. */
const SQUEEZE_RANGE = { min: -0.55, max: 1.15 }

/** How much of the squeeze goes sideways — a flattened body spreads a little. */
const SQUEEZE_LATERAL = 0.34

/** The continuous half of a profile — the part a state change interpolates. */
interface ProfileBlend {
  chase: number
  headingLag: number
  posture: number
  reachScale: number
  balanceDeg: number
}

/** Snapshot the interpolatable fields of a profile. */
function blendOf(profile: MotionProfile): ProfileBlend {
  return {
    chase: profile.chase,
    headingLag: profile.headingLag,
    posture: profile.posture,
    reachScale: profile.reachScale,
    balanceDeg: profile.balanceDeg,
  }
}

/** Smoothstep, so a blend leaves and arrives without a velocity step. */
function ease(t: number): number {
  const p = t <= 0 ? 0 : t >= 1 ? 1 : t
  return p * p * (3 - 2 * p)
}

/**
 * Procedural whale animation over a fixed-step spring rig.
 */
export class WhaleEngine {
  private readonly random: RandomSource
  private readonly leapScale: number
  private readonly pose: WhalePose = neutralPose()
  private readonly x: SpringState
  private readonly y: SpringState
  private readonly heading: SpringState
  private readonly eyeOpen: SpringState
  private scheduler: GestureScheduler
  private profile: MotionProfile
  private budget: AmplitudeBudget
  private activity: WhaleActivity
  private motion: MotionMode
  private elapsed = 0
  private dwellLeft = 0
  private blinkPhase = -1
  /** Seconds into the current breach, or a negative number when not leaping. */
  private leapPhase = -1
  /** Arc height on the previous frame, for detecting a surface crossing. */
  private lastHeight = 0
  private readonly water: Water
  private readonly props: Props
  private readonly effects: WhaleEffects
  /** Compression of the body during a compaction, 0 at rest, 1 flattened. */
  private readonly squeeze: SpringState
  /** Seconds into the current squeeze cycle, or negative when not squeezing. */
  private squeezePhase = -1
  /** Seconds the activity has been continuously `idle`. */
  private idleFor = 0
  /** Where the last state change started from, and how far through it is. */
  private blendFrom: ProfileBlend
  private blendLeft = 0
  /** The interpolated profile the rig is actually running right now. */
  private readonly live: ProfileBlend

  /**
   * @param options - drawn size, starting state, motion mode and random source.
   */
  constructor(options: EngineOptions) {
    this.random = options.random ?? Math.random
    this.activity = { state: options.state ?? 'idle' }
    this.motion = options.motion ?? 'full'
    this.budget = budgetFor(options.size, options.leapScale ?? 1)
    this.leapScale = options.leapScale ?? 1
    this.profile = profileFor(this.activity.state, this.motion)
    this.blendFrom = blendOf(this.profile)
    this.live = blendOf(this.profile)
    this.water = new Water(this.budget, options.size, this.random)
    this.props = new Props(this.budget, this.random)
    // Through the same gate as every later change, so a whale constructed idle
    // waits out the same quiet stretch as one that becomes idle.
    this.syncProp()
    this.effects = {
      water: this.water.state,
      splash: this.water.droplets,
      prop: this.props.state,
    } as WhaleEffects
    this.scheduler = new GestureScheduler({ random: this.random, profile: this.profile })
    this.x = createSpring(0, this.profile.chase)
    this.y = createSpring(0, this.profile.chase)
    this.heading = createSpring(0, this.profile.chase * this.profile.headingLag)
    this.eyeOpen = createSpring(1, 26)
    this.squeeze = createSpring(0, SQUEEZE_FREQUENCY)
    this.squeeze.damping = SQUEEZE_DAMPING
  }

  /** The pose produced by the most recent step. Mutated in place each frame. */
  get currentPose(): Readonly<WhalePose> {
    return this.pose
  }

  /** The semantic state the engine is animating. */
  get semanticState(): WhaleSemanticState {
    return this.activity.state
  }

  /**
   * Switch activity — the state and, when there is one, the task.
   *
   * The task never reaches the motion profile: `working` moves the same way
   * whatever tool is open. It reaches the *prop*, because the props are now
   * per-task, and the engine is where the two meet.
   * @param activity - the new state and task.
   */
  setActivity(activity: WhaleActivity): void {
    if (sameActivity(activity, this.activity)) return
    const changed = activity.state !== this.activity.state
    this.activity = activity
    // Entering idle restarts the idle clock, so the ball is never inherited
    // from a stretch of quiet that a turn has since interrupted.
    if (changed) {
      this.idleFor = 0
      this.squeezePhase = activity.state === 'compacting' ? 0 : -1
      this.applyProfile()
    }
    this.syncProp()
  }

  /** The amplitude budget this engine was built for. */
  get amplitudeBudget(): AmplitudeBudget {
    return this.budget
  }

  /** True when the engine holds a fixed pose and needs no frame loop. */
  get isStatic(): boolean {
    return this.motion === 'static'
  }

  /** True while a breach is playing. */
  get isLeaping(): boolean {
    return this.leapPhase >= 0
  }

  /**
   * Everything drawn outside the mark this frame: the water, the splash, the
   * prop. Read after {@link step}; the object is rebuilt each frame from live
   * state, and the arrays inside it are reused.
   */
  get currentEffects(): WhaleEffects {
    const e = this.effects as { water: unknown; splash: unknown; prop: unknown }
    e.water = this.water.state
    e.splash = this.water.droplets
    e.prop = this.props.state
    return this.effects
  }

  /** True while the water, a droplet or a prop still needs a frame. */
  get hasEffects(): boolean {
    return this.water.isActive || this.props.isActive
  }

  /**
   * Breach: leap clear of the water, arc over, and dive back under.
   *
   * Played once when a turn begins, and ignored under `motion: 'static'` or a
   * zero leap budget — a surface that cannot make room for the arc must not
   * play a clipped one. Restarting mid-breach is allowed and simply replays
   * from the beginning; the curve starts submerged and faded, so there is no
   * visible cut.
   */
  leap(): void {
    if (this.motion === 'static' || this.budget.leapRise <= 0) return
    this.leapPhase = 0
    this.lastHeight = 0
    // One thing at a time: a whale mid-breach carries nothing on its head.
    this.syncProp()
  }

  /**
   * Show the prop this state wants, unless something else is happening.
   *
   * Two things withhold a prop. A breach wears none — one thing at a time. And
   * the idle ball waits out {@link IDLE_PROP_DELAY} seconds of unbroken quiet:
   * it is a bored animal's gesture, and a whale that starts juggling the
   * instant a turn ends is not bored, it is restless.
   */
  private syncProp(): void {
    const busy = this.motion === 'static' || this.leapPhase >= 0
    const waitingOutTheUser =
      this.activity.state === 'idle' && this.idleFor < IDLE_PROP_DELAY
    this.props.want(busy || waitingOutTheUser ? null : propFor(this.activity))
  }

  /**
   * Switch semantic state. Spring positions and velocities are preserved, and
   * the current waypoint is kept, so the whale carries on from wherever it is
   * instead of restarting its swim.
   * @param state - the new semantic state.
   */
  setState(state: WhaleSemanticState): void {
    this.setActivity({ state })
  }

  /**
   * The profile fields the rig is running at this instant.
   *
   * Mid-blend these sit between two states' values, which is the point: a test
   * that asserts on `profileFor(state)` after a change is asserting on the
   * destination, not on what is being drawn.
   */
  get liveProfile(): Readonly<ProfileBlend> {
    return this.live
  }

  /**
   * Switch motion mode at runtime (settings change, reduced-motion change).
   * @param motion - the new motion mode.
   */
  setMotion(motion: MotionMode): void {
    if (motion === this.motion) return
    this.motion = motion
    if (motion === 'static') {
      this.blinkPhase = -1
      this.resetToNeutral()
      return
    }
    this.applyProfile()
    this.syncProp()
  }

  /**
   * Re-scale for a new drawn size. The pose is in pixels, so a resize changes
   * the budget rather than the maths.
   * @param size - the mark's new drawn width in CSS px.
   */
  setSize(size: number): void {
    const next = budgetFor(size, this.leapScale)
    if (next.travel === this.budget.travel) return
    this.budget = next
    this.water.setBudget(next, size)
    this.props.setBudget(next)
    // Rescale the live waypoint so the whale does not lurch on a resize.
    const reach = this.reach()
    this.x.target = clampTo(this.x.target, reach.x)
    this.y.target = clampTo(this.y.target, reach.y)
  }

  /**
   * Advance the simulation.
   * @param dt - elapsed seconds since the previous step; clamped internally, so
   *   a stalled tab or a backgrounded page resumes without a jump.
   * @returns the pose to render.
   */
  step(dt: number): Readonly<WhalePose> {
    if (this.motion === 'static') return this.pose
    const delta = clampDelta(dt)
    this.elapsed += delta

    this.advanceBlend(delta)
    if (this.leapPhase >= 0) {
      this.leapPhase += delta
      if (this.leapPhase >= LEAP_SECONDS) {
        this.leapPhase = -1
        this.lastHeight = 0
        this.syncProp()
      }
    }
    this.stepIdle(delta)
    this.stepSqueeze(delta)
    this.stepScenery(delta)

    for (const gesture of this.scheduler.advance(delta)) this.engage(gesture)

    this.dwellLeft -= delta
    if (this.dwellLeft <= 0) this.drawWaypoint(this.profile.cruiseReach, this.profile.dwell)

    if (this.blinkPhase >= 0) {
      this.blinkPhase += delta
      if (this.blinkPhase >= 0.32) this.blinkPhase = -1
    }
    retarget(this.eyeOpen, blinkOpenness(this.blinkPhase))

    integrate(this.x, delta)
    integrate(this.y, delta)
    integrate(this.eyeOpen, delta)
    this.driveHeading(delta)
    this.publish()
    return this.pose
  }

  /** Snap every channel to where it is heading; used for reduced motion. */
  settleNow(): Readonly<WhalePose> {
    if (this.motion === 'static') {
      this.resetToNeutral()
      return this.pose
    }
    // A half-played breach must not be left hanging in the air at whatever
    // height reduced motion happened to interrupt it.
    this.leapPhase = -1
    this.squeezePhase = -1
    this.blendLeft = 0
    settle(this.x)
    settle(this.y)
    settle(this.heading)
    settle(this.eyeOpen)
    this.squeeze.target = 0
    settle(this.squeeze)
    this.water.reset()
    this.props.reset()
    this.publish()
    return this.pose
  }

  /** Drop gesture state and return the rig to the source mark's pose. */
  private resetToNeutral(): void {
    for (const [spring, rest] of [
      [this.x, 0],
      [this.y, 0],
      [this.heading, 0],
      [this.eyeOpen, 1],
    ] as const) {
      spring.target = rest
      settle(spring)
    }
    this.dwellLeft = 0
    this.leapPhase = -1
    this.squeezePhase = -1
    this.squeeze.target = 0
    settle(this.squeeze)
    this.lastHeight = 0
    this.idleFor = 0
    this.blendLeft = 0
    this.water.reset()
    this.props.reset()
    this.publish()
  }

  /**
   * Adopt the current state's profile.
   *
   * Cadences switch at once — they are resampled from a random range anyway, so
   * interpolating them would be interpolating noise. The four continuous fields
   * ease across {@link PROFILE_BLEND_S} from wherever the previous blend had
   * reached, so interrupting a transition halfway continues from there instead
   * of snapping back to the state being left.
   */
  private applyProfile(): void {
    this.blendFrom = { ...this.live }
    this.blendLeft = this.motion === 'static' ? 0 : PROFILE_BLEND_S
    this.profile = profileFor(this.activity.state, this.motion)
    this.scheduler.setProfile(this.profile)
    this.advanceBlend(0)
  }

  /** Step the state-change blend and push the result into the springs. */
  private advanceBlend(dt: number): void {
    const target = this.profile
    if (this.blendLeft > 0) {
      this.blendLeft = Math.max(0, this.blendLeft - dt)
      const t = ease(1 - this.blendLeft / PROFILE_BLEND_S)
      const mix = (from: number, to: number): number => from + (to - from) * t
      this.live.chase = mix(this.blendFrom.chase, target.chase)
      this.live.headingLag = mix(this.blendFrom.headingLag, target.headingLag)
      this.live.posture = mix(this.blendFrom.posture, target.posture)
      this.live.reachScale = mix(this.blendFrom.reachScale, target.reachScale)
      this.live.balanceDeg = mix(this.blendFrom.balanceDeg, target.balanceDeg)
    } else {
      this.live.chase = target.chase
      this.live.headingLag = target.headingLag
      this.live.posture = target.posture
      this.live.reachScale = target.reachScale
      this.live.balanceDeg = target.balanceDeg
    }
    this.x.frequency = this.live.chase
    this.y.frequency = this.live.chase
    this.heading.frequency = this.live.chase * this.live.headingLag
    // Pull the live waypoint into the current reach without moving the body: an
    // interrupted swim continues, it does not restart. Because the reach itself
    // is now easing, this tightens gradually rather than yanking.
    const reach = this.reach()
    this.x.target = clampTo(this.x.target, reach.x)
    this.y.target = clampTo(this.y.target, reach.y)
  }

  /** The swim ellipse at the blend's current reach, not the target profile's. */
  private reach(): { readonly x: number; readonly y: number } {
    return swimReach({ ...this.profile, reachScale: this.live.reachScale }, this.budget)
  }

  /**
   * Count unbroken idle time, and hand the ball over when it is long enough.
   *
   * The crossing is watched rather than the condition polled: asking for a prop
   * that is already up is free, but the edge is the only moment anything
   * actually has to happen, and watching it keeps the rule in one place.
   * @param delta - elapsed seconds.
   */
  private stepIdle(delta: number): void {
    if (this.activity.state !== 'idle') {
      this.idleFor = 0
      return
    }
    const before = this.idleFor
    this.idleFor += delta
    if (before < IDLE_PROP_DELAY && this.idleFor >= IDLE_PROP_DELAY) this.syncProp()
  }

  /**
   * The compaction squeeze: press down, hold, and let go.
   *
   * The target is *ramped* in and then released as a step. Stepping it both
   * ways looked like the obvious thing and is wrong: an underdamped spring
   * given a step overshoots on the way in as well, so the whale slams past full
   * compression before it has finished arriving and the press — the half of the
   * gesture that carries the meaning — is over in two frames. A shaped ramp in
   * and a step out is a hand squeezing something and then letting go of it,
   * which is the thing being described.
   *
   * It is suppressed mid-breach. That is not tidiness: `rig.ts` charges the
   * viewBox for the larger of the two envelopes rather than for both, which is
   * only sound if they cannot coincide.
   * @param delta - elapsed seconds.
   */
  private stepSqueeze(delta: number): void {
    const wanted = this.activity.state === 'compacting' && this.leapPhase < 0
    if (!wanted) {
      this.squeezePhase = -1
      retarget(this.squeeze, 0)
      integrate(this.squeeze, delta)
      return
    }
    if (this.squeezePhase < 0) this.squeezePhase = 0
    this.squeezePhase = (this.squeezePhase + delta) % SQUEEZE_PERIOD
    const t = this.squeezePhase
    const target = t < SQUEEZE_IN ? ease(t / SQUEEZE_IN) : t < SQUEEZE_IN + SQUEEZE_HOLD ? 1 : 0
    retarget(this.squeeze, target)
    integrate(this.squeeze, delta)
  }

  /** Act on a fired gesture by redirecting the swim. */
  private engage(gesture: Gesture): void {
    switch (gesture.kind) {
      case 'blink':
        this.blinkPhase = 0
        return
      case 'surge':
        this.drawWaypoint([this.profile.surgeReach, this.profile.surgeReach], this.profile.surgeDwell)
        return
      case 'settle':
        this.drawWaypoint(
          [this.profile.settleReach, this.profile.settleReach],
          this.profile.settleDwell,
          true,
        )
        return
    }
  }

  /**
   * Place the next waypoint inside the swim ellipse and set how long the body
   * rests there.
   *
   * The vertical component crosses to the other side of centre unless the
   * caller asks it to stay. That crossing is the stroke: two waypoints drawn
   * independently would usually land on the same side and waste most of the
   * budget, which is exactly how the first implementation ended up invisible.
   * @param reach - `[min, max]` fraction of the reach this waypoint may spend.
   * @param dwell - how long to hold it, in seconds.
   * @param hold - keep the current side instead of crossing (a settle stays put).
   */
  private drawWaypoint(
    reach: readonly [number, number],
    dwell: { readonly min: number; readonly max: number },
    hold = false,
  ): void {
    const span = this.reach()
    const [low, high] = reach
    const magnitude = low + this.random() * Math.max(0, high - low)
    const side = hold ? Math.sign(this.y.value) || 1 : -(Math.sign(this.y.target) || -1)
    this.y.target = side * magnitude * span.y
    this.x.target = (this.random() * 2 - 1) * magnitude * span.x
    this.dwellLeft = dwell.min + this.random() * Math.max(0, dwell.max - dwell.min)
  }

  /**
   * Point the head where the body is already going.
   *
   * Heading is driven by the body's own vertical velocity rather than by its
   * target, and it rides a slower spring than the body does, so the whale turns
   * *into* a move it has already begun. That lag is the whole difference
   * between a mark that swims and a mark that slides. Below a deadband the
   * deflection fades out, so a resting whale does not twitch its angle around
   * near-zero velocity.
   * @param dt - elapsed seconds.
   */
  private driveHeading(dt: number): void {
    const reference = this.budget.travel * HEADING_SPEED_REFERENCE
    const normalised = reference === 0 ? 0 : -this.y.velocity / reference
    const magnitude = Math.abs(normalised)
    const weight = magnitude <= HEADING_DEADBAND ? 0 : Math.min(1, (magnitude - HEADING_DEADBAND) / 0.5)
    // The balancing wobble rides on the heading target rather than on the pose,
    // so it goes through the same lagging spring everything else does and can
    // never step the angle between frames.
    //
    // It is scaled by how much of the ball is drawn, not by the state. The
    // profile says an idle whale *may* balance; the prop says whether there is
    // currently anything on its head to balance. Tying it to the state instead
    // left the Dock making corrections under nothing for the nine seconds
    // before the ball arrives — and forever, on a surface that is idle most of
    // the time, which is the "does not continuously bounce" rule broken.
    const carrying = this.props.state.kind === 'ball' ? this.props.state.reveal : 0
    const balance =
      this.live.balanceDeg === 0 || carrying === 0
        ? 0
        : this.live.balanceDeg *
          carrying *
          Math.sin(2 * Math.PI * this.profile.balanceHz * this.elapsed)
    const target =
      this.budget.headingDeg * Math.tanh(normalised) * weight + this.live.posture + balance
    retarget(this.heading, target)
    integrate(this.heading, dt)
  }

  /** Copy spring positions into the shared pose object (no allocation). */
  private publish(): void {
    const [slow, slower] = this.profile.breathPeriods
    const t = this.elapsed
    const breath =
      this.motion === 'static'
        ? 0
        : 0.62 * Math.sin((2 * Math.PI * t) / slow + 0.9) +
          0.38 * Math.sin((2 * Math.PI * t) / slower)
    // The breach rides on top of a swim that never stopped running, so the
    // frame the leap ends on is already the frame the cruise wants — there is
    // no handover to smooth, because there is no handover.
    //
    // It does fade the swim out while it is airborne, though. Leaving the cruise
    // at full strength cost about a fifth of the arc's height to a spring
    // pulling the other way, and a whale that wobbles on its own idle rhythm
    // mid-leap is a whale doing two things at once. The weight is |height|, so
    // it is 1 at the water line — where the leap begins and ends — and 0 at
    // both extremes, which is what makes the two ends continuous.
    const arc = leapAt(this.leapPhase)
    const lift = arc.height >= 0 ? this.budget.leapRise : this.budget.leapDive
    const swim = 1 - Math.min(1, Math.abs(arc.height))
    this.pose.bodyX = this.x.value * swim
    this.pose.bodyY = this.y.value * swim - arc.height * lift
    this.pose.bodyRotation = this.heading.value * swim + arc.tilt * this.budget.leapTiltDeg
    // Breathing and the squeeze multiply rather than add: one is the size the
    // whale is, the other is what is being done to it.
    const squeeze = clampTo2(this.squeeze.value, SQUEEZE_RANGE.min, SQUEEZE_RANGE.max)
    // The budget names the flatten at the *extreme* of the spring's range, so
    // the coefficient is per unit of squeeze rather than per unit of value —
    // otherwise the overshoot multiplies the budget instead of reaching it.
    const flatten =
      squeeze >= 0
        ? this.budget.squash / SQUEEZE_RANGE.max
        : this.budget.stretch / -SQUEEZE_RANGE.min
    this.pose.bodyScaleY = (1 + breath * this.budget.breath) * (1 - flatten * squeeze)
    this.pose.bodyScaleX =
      (1 - breath * this.budget.breath * 0.6) * (1 + flatten * SQUEEZE_LATERAL * squeeze)
    // A whale mid-breach has its mouth shut and its eye open.
    this.pose.eyeOpen = arc.active ? 1 : this.eyeOpen.value
    // The whale is drawn the same above and below the surface. It used to fade
    // out on the way under, back when there was no water to go under; now the
    // line and the splash say where it is, and a mark that dissolves says
    // something else entirely.
    this.pose.opacity = 1
  }

  /**
   * Advance the water and the prop, and let them push back on the body.
   *
   * The surface is disturbed by crossings derived from the same curve that
   * moves the whale, so a splash cannot drift off its impact however the phase
   * boundaries are retuned. The brick's toss returns an impulse rather than
   * setting a position, so the heave goes through the body's own spring and
   * inherits its damping instead of fighting it.
   * @param delta - elapsed seconds.
   */
  private stepScenery(delta: number): void {
    const height = this.leapPhase >= 0 ? leapAt(this.leapPhase).height : 0
    if (this.leapPhase >= 0) {
      const crossing = crossingBetween(this.lastHeight, height)
      if (crossing !== null) this.water.strike(crossing, this.x.value)
    }
    this.lastHeight = height
    this.water.step(delta, this.leapPhase < 0 ? -1 : this.leapPhase / LEAP_SECONDS, height)
    const tick = this.props.step(delta)
    if (tick.heave !== 0) this.y.velocity += tick.heave
  }
}

/** Clamp into an asymmetric range. */
function clampTo2(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return value < min ? min : value > max ? max : value
}

/** Clamp a magnitude without changing its sign. */
function clampTo(value: number, limit: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-limit, Math.min(limit, value))
}

/**
 * Eye openness during a blink.
 * @param phase - seconds into the blink, or a negative number when not blinking.
 * @returns 1 with the eye open, falling to near zero at the closed point.
 */
export function blinkOpenness(phase: number): number {
  if (phase < 0) return 1
  const p = phase / 0.32
  if (p >= 1) return 1
  // Fast close, slower open — the asymmetry is what makes a blink read as one.
  const value = p < 0.42 ? 1 - p / 0.42 : (p - 0.42) / 0.58
  return Math.max(value, 0.05)
}
