/**
 * The prop the whale is carrying.
 *
 * Nine of them now — a thought cloud, a speech bubble, a ball, a question mark,
 * a red exclamation, a magnifier, a pencil, a wrench, and a stream of files —
 * and never more than one on screen.
 *
 * Eight hang above the head and one, the file stream, runs under the belly;
 * `anchorFor` in `types.ts` is the only place that distinction lives. They are plugin-authored
 * artwork drawn outside the mark's silhouette; nothing here touches DeepSeek's
 * geometry, and nothing here is drawn over it.
 *
 * Three constraints shaped all of this, and all three were measured:
 *
 *  - **About 10 px of headroom**, inline at 26 px. That budget already exists —
 *    it is the room the breach needs — and the two never share it, because no
 *    prop is shown during a leap. So a prop costs nothing in layout.
 *  - **Nothing survives 10 px except simple silhouettes.** An anatomical brain
 *    is a blob at that size and a figure carrying bricks is noise; the project
 *    has a standing rule that a channel which cannot pass a pixel floor is an
 *    absent channel, not a subtle one. So the brain became the three-dot cloud
 *    everyone already reads as thinking, and the bricklayer became a brick.
 *  - **One thing at a time.** Props swap by retracting and then extending,
 *    never by cross-fading: two 10 px shapes overlapping for 150 ms is one
 *    unreadable shape for 150 ms.
 *
 * The ball is the only prop with a gesture of its own. It is tossed off the
 * head like a sea lion's — the body heaves, the ball leaves, stretches, hangs,
 * and lands squashed — because the fin cannot be the thing that lifts it. That
 * was measured: the flipper is part of the single silhouette path, and the
 * clip-split limb rig that could have moved it was deleted after it turned out
 * to buy four degrees of rotation, which is 0.6 px at the size this ships at.
 * The body is the only channel with pixels, so the body does the work — and
 * between tosses it keeps doing it, with the balancing wobble that lives in the
 * `working` motion profile.
 */
import { createSpring, integrate, retarget, settle, type SpringState } from './spring.js'
import type { AmplitudeBudget, PropKind, PropState, RandomSource } from './types.js'

/** How long a prop takes to extend, and to retract, in seconds. */
export const PROP_REVEAL_S = 0.17

/**
 * Spring frequency that lands the reveal inside {@link PROP_REVEAL_S}.
 *
 * A critically damped spring approaches its target as `(1 + ft)e^-ft`, so it
 * needs `ft` of about 5.5 to be done to within a few percent. Setting the
 * frequency to `1 / PROP_REVEAL_S` instead — which reads right and is wrong —
 * made a swap take most of a second.
 */
const REVEAL_FREQUENCY = 5.5 / PROP_REVEAL_S

/**
 * Bounds on the gap between ball tosses, seconds.
 *
 * Slower than they were when this belonged to `working`. The gesture changed
 * meaning when it moved to `idle`: a work rhythm wants to look busy, and a
 * bored animal amusing itself does not — and this one plays on a Dock that is
 * on screen for hours, where anything faster stops being company and starts
 * being a fidget in the corner of the eye.
 */
const TOSS_EVERY = { min: 2.6, max: 4.4 }

/** How long one toss is airborne, seconds. */
const TOSS_FLIGHT = 0.62

/** How long the ball spends flattened after it lands, seconds. */
const TOSS_LAND = 0.16

/** Peak stretch at launch, and peak flattening on impact. */
const STRETCH = 0.3
const SQUASH = 0.66

/** Period of each prop's own idle motion, seconds. */
const PHASE_PERIOD: Readonly<Record<PropKind, number>> = {
  think: 1.05,
  speak: 2.4,
  ball: 1,
  ask: 3.1,
  bang: 1.6,
  glass: 3.4,
  pencil: 0.42,
  wrench: 0.78,
  files: 2.6,
}

/** Peak tilt of the question mark, degrees. */
const ASK_TILT = 11

/** How often the question mark hops, seconds. */
const ASK_HOP_EVERY = { min: 2.4, max: 4.6 }

/** Peak shake of the error mark, degrees, and how fast it decays. */
const BANG_SHAKE = 9

/** How far the magnifier sweeps from its anchor, as a fraction of the toss. */
const GLASS_SWEEP = { x: 1.15, y: 0.5 }

/** Peak swing of the pencil and the wrench, degrees. */
const PENCIL_SWING = 26
const WRENCH_SWING = 34

/**
 * Seconds of an unbroken `idle` before the ball comes out.
 *
 * The toss used to belong to `working` and it moved here, which is a better
 * home for it: it is a bored animal's gesture, not a busy one's. But the Dock
 * is on screen permanently and is idle most of the time, and a whale juggling
 * over the corner of the app forever is exactly the "does not continuously
 * bounce" rule being broken. So the ball waits for the user to have stopped.
 */
export const IDLE_PROP_DELAY = 9

/** Smoothstep. */
function ease(p: number): number {
  const t = p <= 0 ? 0 : p >= 1 ? 1 : p
  return t * t * (3 - 2 * t)
}

/** What the engine needs back from a step, beyond the drawable state. */
export interface PropTick {
  /**
   * Upward impulse the body should take this frame, in px/s.
   *
   * The heave and the ball leaving the head are the same event, so they are
   * produced by the same frame rather than scheduled twice — a body that
   * pushes on its own clock and a ball that leaves on another is two
   * animations that drift apart within a minute.
   */
  readonly heave: number
}

/** No impulse this frame. */
const QUIET: PropTick = Object.freeze({ heave: 0 })

/**
 * The prop above the head, and its comings and goings.
 */
export class Props {
  private readonly random: RandomSource
  private readonly reveal: SpringState
  private budget: AmplitudeBudget
  private kind: PropKind | null = null
  private wanted: PropKind | null = null
  private elapsed = 0
  /** Seconds into the current toss, or negative when the ball is at rest. */
  private tossPhase = -1
  private tossIn = 0
  private hopPhase = -1
  private hopIn = 0
  /** Seconds into the landing squash, or negative when the ball is round. */
  private landPhase = -1
  private dx = 0
  private dy = 0
  private rotation = 0
  private squash = 1

  /**
   * @param budget - the size-derived amplitude budget.
   * @param random - injected randomness, so cadences are reproducible.
   */
  constructor(budget: AmplitudeBudget, random: RandomSource) {
    this.budget = budget
    this.random = random
    this.reveal = createSpring(0, REVEAL_FREQUENCY)
    this.tossIn = this.pick(TOSS_EVERY)
    this.hopIn = this.pick(ASK_HOP_EVERY)
  }

  /** Re-scale for a new drawn size. */
  setBudget(budget: AmplitudeBudget): void {
    this.budget = budget
  }

  /** True while anything is drawn or on its way out. */
  get isActive(): boolean {
    return this.kind !== null || this.reveal.value > 0.001
  }

  /**
   * Ask for a prop. Null hides whatever is up.
   *
   * A change does not cut: the prop on screen retracts first and the new one
   * extends after, so the two are never on screen together.
   * @param kind - the prop the current state wants, or null.
   */
  want(kind: PropKind | null): void {
    this.wanted = kind
  }

  /** Drop everything without animating it away; for reduced motion. */
  reset(): void {
    this.kind = null
    this.wanted = null
    this.reveal.target = 0
    settle(this.reveal)
    this.tossPhase = -1
    this.hopPhase = -1
    this.landPhase = -1
    this.dx = 0
    this.dy = 0
    this.rotation = 0
    this.squash = 1
  }

  /**
   * Advance the prop.
   * @param dt - elapsed seconds.
   * @returns what the body owes the prop this frame.
   */
  step(dt: number): PropTick {
    this.elapsed += dt

    // Retract before extending: the swap is sequential, never a cross-fade.
    if (this.kind !== this.wanted) {
      retarget(this.reveal, 0)
      if (this.reveal.value < 0.04) {
        this.kind = this.wanted
        this.resetGesture()
      }
    } else if (this.kind !== null) {
      retarget(this.reveal, 1)
    }
    integrate(this.reveal, dt)

    let heave = 0
    if (this.reveal.value > 0.7) {
      switch (this.kind) {
        case 'ball':
          heave = this.stepToss(dt)
          break
        case 'ask':
          this.stepAsk(dt)
          break
        case 'bang':
          this.stepBang(dt)
          break
        case 'glass':
          this.stepGlass()
          break
        case 'pencil':
          this.stepPencil()
          break
        case 'wrench':
          this.stepWrench()
          break
        default:
          break
      }
    }
    return heave === 0 ? QUIET : { heave }
  }

  /** The prop's drawable state this frame. */
  get state(): PropState {
    const period = this.kind === null ? 1 : PHASE_PERIOD[this.kind]
    return {
      kind: this.kind,
      reveal: ease(this.reveal.value),
      dx: this.dx,
      dy: this.dy,
      rotation: this.rotation,
      squash: this.squash,
      phase: (this.elapsed % period) / period,
    }
  }

  /** Clear whatever gesture the previous prop was mid-way through. */
  private resetGesture(): void {
    this.dx = 0
    this.dy = 0
    this.rotation = 0
    this.squash = 1
    this.tossPhase = -1
    this.hopPhase = -1
    this.landPhase = -1
    this.tossIn = this.pick(TOSS_EVERY)
    this.hopIn = this.pick(ASK_HOP_EVERY)
  }

  /**
   * The ball's toss: up, stretched; over, round; down, and squashed on landing.
   *
   * Squash and stretch along the direction of travel, which is the oldest
   * trick there is and the only one that survives ten pixels. It replaced a
   * spin — a brick turning in the air reads as turning, a circle does not.
   * @param dt - elapsed seconds.
   * @returns the upward impulse the body owes this frame.
   */
  private stepToss(dt: number): number {
    if (this.landPhase >= 0) {
      this.landPhase += dt
      if (this.landPhase >= TOSS_LAND) {
        this.landPhase = -1
        this.squash = 1
        return 0
      }
      // Recovering out of the flattening, decelerating into round.
      const p = this.landPhase / TOSS_LAND
      this.squash = SQUASH + (1 - SQUASH) * ease(p)
      return 0
    }
    if (this.tossPhase < 0) {
      this.tossIn -= dt
      if (this.tossIn > 0) return 0
      this.tossPhase = 0
      // The heave and the launch are the same instant. The body pushes up,
      // which is the whole of the work — the fin cannot, so the body does.
      return -this.budget.propToss * 2.2
    }
    this.tossPhase += dt
    if (this.tossPhase >= TOSS_FLIGHT) {
      this.tossPhase = -1
      this.landPhase = 0
      this.tossIn = this.pick(TOSS_EVERY)
      this.dy = 0
      this.squash = SQUASH
      return 0
    }
    const p = this.tossPhase / TOSS_FLIGHT
    // A real toss: leaves fast, hangs, comes back. 4p(1-p) peaks at 1 halfway.
    this.dy = -this.budget.propToss * 4 * p * (1 - p)
    // Fastest at both ends of the flight, still at the apex.
    this.squash = 1 + STRETCH * Math.abs(1 - 2 * p)
    return 0
  }

  /** The question mark: a slow curious tilt, with the odd hop. */
  private stepAsk(dt: number): void {
    this.rotation = ASK_TILT * Math.sin((2 * Math.PI * this.elapsed) / PHASE_PERIOD.ask)
    if (this.hopPhase < 0) {
      this.hopIn -= dt
      if (this.hopIn <= 0) this.hopPhase = 0
      this.dy = 0
      return
    }
    this.hopPhase += dt
    if (this.hopPhase >= 0.34) {
      this.hopPhase = -1
      this.hopIn = this.pick(ASK_HOP_EVERY)
      this.dy = 0
      return
    }
    const p = this.hopPhase / 0.34
    this.dy = -this.budget.propToss * 0.35 * 4 * p * (1 - p)
  }

  /**
   * The error mark: a fast shake that decays, then stillness.
   *
   * Deliberately not the question mark's lazy tilt. A question is patient and
   * an error is not, and at ten pixels the difference between the two shapes is
   * small enough that the *motion* has to carry most of it.
   */
  private stepBang(dt: number): void {
    if (this.hopPhase < 0) {
      this.hopIn -= dt
      if (this.hopIn <= 0) this.hopPhase = 0
      this.rotation = 0
      return
    }
    this.hopPhase += dt
    if (this.hopPhase >= 0.5) {
      this.hopPhase = -1
      this.hopIn = this.pick(ASK_HOP_EVERY)
      this.rotation = 0
      return
    }
    const p = this.hopPhase / 0.5
    this.rotation = BANG_SHAKE * (1 - p) * Math.sin(2 * Math.PI * 4 * p)
  }

  /**
   * The magnifier: looking around, up and down as well as side to side.
   *
   * Two sines whose periods do not divide into each other, so the path never
   * closes and never looks like a loop — the same rule as every other cadence
   * in this engine, applied to a shape instead of to a schedule.
   */
  private stepGlass(): void {
    const t = this.elapsed
    this.dx = GLASS_SWEEP.x * this.budget.propToss * Math.sin((2 * Math.PI * t) / 2.9)
    this.dy = GLASS_SWEEP.y * this.budget.propToss * Math.sin((2 * Math.PI * t) / 1.7 + 1.1)
    // Tipped into the direction of travel, the way a hand holding one would be.
    this.rotation = 9 * Math.cos((2 * Math.PI * t) / 2.9)
  }

  /**
   * The pencil: short fast strokes with a slow drift, like writing a line.
   *
   * The drift is what stops it reading as a metronome — a pencil that waves on
   * the spot is a windscreen wiper.
   */
  private stepPencil(): void {
    const t = this.elapsed
    this.rotation = PENCIL_SWING * Math.sin((2 * Math.PI * t) / PHASE_PERIOD.pencil)
    this.dx = 0.55 * this.budget.propToss * Math.sin((2 * Math.PI * t) / 2.3)
    this.dy = 0.12 * this.budget.propToss * Math.sin((2 * Math.PI * t) / PHASE_PERIOD.pencil)
  }

  /**
   * The wrench: a turn and a reset, not a symmetric wave.
   *
   * A bolt only goes one way. The swing pulls through its arc and snaps back,
   * which is a sawtooth rather than a sine, and that asymmetry is the whole
   * difference between turning something and waving at it.
   */
  private stepWrench(): void {
    const p = (this.elapsed % PHASE_PERIOD.wrench) / PHASE_PERIOD.wrench
    const pull = p < 0.62 ? ease(p / 0.62) : 1 - ease((p - 0.62) / 0.38)
    this.rotation = WRENCH_SWING * (pull - 0.5)
    this.dy = -0.14 * this.budget.propToss * Math.sin(Math.PI * pull)
  }

  /** A value from a bounded range, from the injected source. */
  private pick(range: { readonly min: number; readonly max: number }): number {
    return range.min + this.random() * Math.max(0, range.max - range.min)
  }
}
