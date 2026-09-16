/** Renderer- and DSH-independent vocabulary shared by both whale surfaces. */

/**
 * What the whale is reacting to.
 *
 * Every one of these is backed by a fact DSH publishes, not by a guess at what
 * the model might be doing:
 *
 * | state        | signal |
 * | ---          | --- |
 * | `idle`       | nothing running |
 * | `thinking`   | `SessionSnapshot.running`, with no finer signal live |
 * | `responding` | `ChatSnapshot.timeline.partial` — an assistant is streaming |
 * | `working`    | `ChatSnapshot.timeline.runningCalls` is non-empty |
 * | `waiting`    | a pending interaction is addressed to this session |
 * | `compacting` | a Trajectory `RequestView` with `purpose: 'compaction'` is running |
 * | `error`      | `SessionSnapshot.lastAgentError` or `promptError` is set |
 *
 * `waiting` outranks the rest because it is the only one that is about the
 * user rather than the model.
 *
 * `compacting` and `error` were both listed in this document as *future* states
 * for a long time, with the standing rule that nothing may be added without a
 * signal. They were added when the signals turned up: `lastAgentError` is right
 * there on the session snapshot, and compaction is a provider request on the
 * Trajectory target, whose `useTrajectory` hook is declared on
 * `SessionStandardProps` and therefore handed to any session-scoped entry. The
 * Trajectory target is assembled whether or not its view is open — measured in
 * the running app, 34 request views with the view never opened.
 */
export type WhaleSemanticState =
  | 'idle'
  | 'thinking'
  | 'responding'
  | 'working'
  | 'waiting'
  | 'compacting'
  | 'error'

/**
 * What kind of tool is in flight, when one is.
 *
 * Only used to choose a word. It is deliberately a coarse family rather than
 * the tool name: DSH's tool roster is not this plugin's business, the names
 * change between versions, and "reading" is what a reader wants to know.
 */
export type WhaleTask = 'reading' | 'editing' | 'running' | 'searching' | 'delegating'

/** The full activity: a state, plus the detail that names it when there is one. */
export interface WhaleActivity {
  readonly state: WhaleSemanticState
  readonly task?: WhaleTask
}

/** Nothing is happening. */
export const IDLE_ACTIVITY: WhaleActivity = Object.freeze({ state: 'idle' })

/**
 * Whether two activities are the same, so a re-render does not restart motion.
 * @param a - one activity.
 * @param b - the other.
 * @returns true when both the state and the task match.
 */
export function sameActivity(a: WhaleActivity, b: WhaleActivity): boolean {
  return a.state === b.state && a.task === b.task
}

/** How much motion the plugin is allowed to produce. */
export type MotionMode = 'full' | 'subtle' | 'static'

/**
 * The whale's rig.
 *
 * Position is in **CSS pixels**, not viewBox units, and that is deliberate.
 * Perception happens in pixels: the same 0.3 viewBox units is a visible move on
 * a 56 px whale and nothing at all on an 18 px one. Defining the pose in the
 * unit the eye actually works in means the acceptance tests read these numbers
 * directly, with no conversion between what the engine promises and what the
 * renderer draws. The renderer owns the single px → unit conversion.
 *
 * The fields are mixed-unit on purpose: translation in px, rotation in degrees,
 * scale dimensionless.
 *
 * Neutral is all zeros except the scales and `eyeOpen`, which are 1 — that pose
 * renders the official mark unchanged.
 */
export interface WhalePose {
  /** Horizontal body offset, CSS px. */
  bodyX: number
  /** Vertical body offset, CSS px. */
  bodyY: number
  /** Heading, degrees. Positive lifts the nose (the head is at the left). */
  bodyRotation: number
  bodyScaleX: number
  bodyScaleY: number
  /** 1 open, 0 shut (vertical scale of the eye). */
  eyeOpen: number
  /**
   * 1 fully drawn, 0 gone.
   *
   * The one channel that is not a displacement, and it exists for the leap: at
   * icon scale there is no room to draw a sea, so the whale entering the water
   * has to be *shown by fading* rather than by being occluded or cropped. A
   * mark sliced by its own viewBox edge reads as a rendering bug; a mark that
   * dissolves as it descends reads as one going under. It doubles as the reason
   * the leap can overshoot the Dock's clipped shell safely — by the time the
   * whale reaches the crop it is already transparent.
   */
  opacity: number
}

/** The pose that reproduces the source mark exactly. */
export const NEUTRAL_POSE: Readonly<WhalePose> = Object.freeze({
  bodyX: 0,
  bodyY: 0,
  bodyRotation: 0,
  bodyScaleX: 1,
  bodyScaleY: 1,
  eyeOpen: 1,
  opacity: 1,
})

/** A fresh, mutable copy of the neutral pose. */
export function neutralPose(): WhalePose {
  return { ...NEUTRAL_POSE }
}

/**
 * How far one whale may travel, derived from how large it is drawn.
 *
 * A pure pixel constant makes a 56 px whale look under-animated beside a 26 px
 * one (same travel, half the relative movement); pure proportion is what made
 * the first implementation invisible at icon scale. So: a pixel floor, growth
 * in proportion, and a ceiling that stops the large preview from turning into a
 * different animal than the small one beside it.
 */
export interface AmplitudeBudget {
  /** Peak-to-peak body travel, CSS px, along the dominant (vertical) axis. */
  readonly travel: number
  /** Horizontal travel as a fraction of vertical — the swim path is upright. */
  readonly lateralRatio: number
  /** Peak heading rotation, degrees. */
  readonly headingDeg: number
  /** Peak breathing scale delta, as a fraction. */
  readonly breath: number
  /**
   * Peak vertical *flatten* while the context is being compacted, as a
   * fraction — the whale squeezing down before it springs back.
   *
   * An order of magnitude above `breath`, like the leap is above `travel`, and
   * for the same reason: this is an event with something to say, not a
   * continuous idle motion anyone has to sit beside. It is also scale-free,
   * because a scale channel already is — the mark shrinks by the same
   * proportion at 26 px and at 64 px, so it reads the same at both.
   */
  readonly squash: number
  /** Peak vertical stretch on the rebound, as a fraction. */
  readonly stretch: number
  /**
   * Peak rise above centre during a breach, CSS px. 0 disables the leap.
   *
   * An order of magnitude larger than `travel`, and deliberately so: the leap
   * is a one-off event lasting just over a second, not a continuous motion
   * anyone has to sit beside. The ceiling that matters for cruising — "do not
   * read as agitation" — is the wrong ceiling for a breach, whose whole job is
   * to be noticed once. Everything downstream still derives from this one
   * number, so the rig's clamps and the renderer's viewBox cannot disagree
   * about how much room it needs.
   */
  readonly leapRise: number
  /** Peak depth below centre at the bottom of the dive, CSS px. */
  readonly leapDive: number
  /** Peak nose rotation during a breach, degrees. */
  readonly leapTiltDeg: number
  /** How far the ball rises off the whale's head, CSS px. */
  readonly propToss: number
}

/** Smallest travel that still reads as motion at icon scale, CSS px. */
export const MIN_TRAVEL_PX = 2.5

/** Largest travel, so a big preview stays the same creature as a small one. */
export const MAX_TRAVEL_PX = 4.5

/** Travel as a fraction of the mark's drawn width, between those bounds. */
export const TRAVEL_RATIO = 0.11

/** Peak heading rotation, degrees — bounded by what the viewBox bleed contains. */
export const MAX_HEADING_DEG = 5

/** Peak breathing scale delta. */
export const MAX_BREATH = 0.018

/**
 * How far the body flattens at the bottom of a compaction squeeze.
 *
 * The gesture is the metaphor: compaction makes the context smaller, so the
 * whale is made smaller, and then it comes back. Anything subtler than about a
 * quarter of the mark's height is the invisible-channel mistake again — this
 * has to be read across a 26 px silhouette from the corner of the eye.
 */
export const MAX_SQUASH = 0.322

/**
 * How far it stretches past its own height on the way back out.
 *
 * Roughly half the squash, which is what a released spring does and what makes
 * the rebound read as elastic rather than as a rewind. It is charged to the
 * viewBox bleed as an *alternative* to the leap's, never on top of it — the two
 * cannot happen in the same frame, and paying for both would cost real layout.
 */
export const MAX_STRETCH = 0.154

/**
 * Leap rise as a fraction of the mark's drawn width.
 *
 * Pushed to the layout ceiling on purpose. The water line rests *above* the
 * whale, so the rise is the only thing that gets any of it out of the sea, and
 * every pixel of it is one more pixel of whale that clears the surface.
 */
export const LEAP_RATIO = 0.36

/** Smallest leap rise that still reads as a breach rather than a bob, CSS px. */
export const MIN_LEAP_PX = 5.5

/**
 * Largest leap rise, CSS px.
 *
 * The ceiling is not taste, it is layout, and it is the number that decides how
 * much of the whale can ever leave the water. DSH's status row has 16 px of
 * clear space above and below it; the viewBox bleed is symmetric, so the whole
 * arc — rise and dive together — has to fit inside that, and so does the growth
 * the leap's tilt adds to the same bleed. 9 px and 15 degrees is the pair that
 * lands the element 15.9 px past the row; they trade against each other, so
 * raising either means lowering the other.
 *
 * A 26 px whale is 19.1 px tall, so a full-body breach would need twice this.
 * It is not available and no amount of tuning creates it. What the plugin does
 * instead is put the water line above the whale's head rather than under its
 * belly: at rest the whale is completely submerged, and the rise lifts about
 * 40% of it clear. Fully out is impossible; fully *in*, at both ends of the
 * arc, is free.
 */
export const MAX_LEAP_PX = 9

/**
 * How far below its resting depth the whale plunges, as a fraction of the rise.
 *
 * Small, and it used to be large. When the water line rested at the mark's
 * bottom edge the dive was the only thing that put any of the whale under, so
 * it had to carry half a body. The line now rests above the whale's head, which
 * means resting depth *is* submerged and the dive only has to read as a plunge
 * — the re-entry going deeper than the whale floats, and the wind-up gathering
 * before the launch. Shrinking it handed its share of the symmetric viewBox
 * bleed to the rise, which is the half that shows.
 */
export const LEAP_DIVE_RATIO = 0.42

/**
 * Peak nose rotation through a breach, degrees.
 *
 * Trades directly against {@link MAX_LEAP_PX}: a rotated mark is a taller mark,
 * and both grow the same symmetric viewBox bleed out of the same 16 px of clear
 * space around DSH's status row. This used to be 18, and the four degrees were
 * spent on rise instead — the rotation is how the whale is *angled*, the rise
 * is how much of it leaves the sea, and only one of those was asked for.
 */
export const LEAP_TILT_DEG = 15

/** How high the ball is tossed off the whale's head, as a fraction of size. */
export const PROP_TOSS_RATIO = 0.23

/** Toss bounds in CSS px — a floor to read, a ceiling the headroom can hold. */
export const MIN_PROP_TOSS_PX = 4
export const MAX_PROP_TOSS_PX = 8

/**
 * Horizontal reach as a fraction of vertical.
 *
 * One constant, read by the profiles, the rig's clamps and the renderer's
 * bleed alike. Splitting it across those three is how a rig ends up permitting
 * a pose its own viewBox cannot contain.
 */
export const LATERAL_RATIO = 0.45

/**
 * Resolve the amplitude budget for one drawn size.
 * @param size - the mark's drawn width in CSS px.
 * @param leapScale - how much of the full leap this surface can afford, 0-1.
 *   0 removes the leap and the viewBox headroom it needs, for a surface with
 *   nowhere to put an arc. Both surfaces currently pass 1: the Dock's shell
 *   stops clipping while it is collapsed and settled, precisely so that it can.
 * @returns the budget every other amplitude is derived from.
 */
export function budgetFor(size: number, leapScale = 1): AmplitudeBudget {
  const width = Number.isFinite(size) && size > 0 ? size : 20
  const travel = Math.min(MAX_TRAVEL_PX, Math.max(MIN_TRAVEL_PX, TRAVEL_RATIO * width))
  const scale = Number.isFinite(leapScale) ? Math.min(1, Math.max(0, leapScale)) : 1
  const leapRise = Math.min(MAX_LEAP_PX, Math.max(MIN_LEAP_PX, LEAP_RATIO * width)) * scale
  return {
    travel,
    lateralRatio: LATERAL_RATIO,
    headingDeg: MAX_HEADING_DEG,
    breath: MAX_BREATH,
    squash: MAX_SQUASH,
    stretch: MAX_STRETCH,
    leapRise,
    leapDive: leapRise * LEAP_DIVE_RATIO,
    leapTiltDeg: LEAP_TILT_DEG * scale,
    propToss: Math.min(MAX_PROP_TOSS_PX, Math.max(MIN_PROP_TOSS_PX, PROP_TOSS_RATIO * width)),
  }
}

/**
 * Which prop is above the whale's head.
 *
 * Plugin-authored artwork, drawn outside the mark's silhouette and never over
 * it: a code licence grants no right to redraw someone's trademark. They all
 * hang from one anchor above the head and only one is ever on screen, because
 * a whale doing two things at once is a whale doing neither legibly.
 */
export type PropKind =
  | 'think'
  | 'speak'
  | 'ball'
  | 'ask'
  | 'bang'
  | 'glass'
  | 'pencil'
  | 'wrench'
  | 'files'

/**
 * The prop one activity puts on the whale, if any.
 *
 * **This is now per *task*, not per state**, which revises a rule this document
 * used to state the other way round ("one prop for all five `working` tasks;
 * five icons differing by two pixels of detail is the invisible-channel mistake
 * wearing a new hat"). The reason that rule was right and is now wrong: the
 * five tools were being distinguished by *detail*, and the replacements are
 * distinguished by **silhouette and by motion** — a magnifier sweeping, a
 * pencil scribbling, a wrench turning, a row of files scrolling past. Those are
 * different shapes doing different things, which survives ten pixels; five
 * variations on one shape does not. The pixel floor in
 * `test/perception.test.mjs` is what keeps the distinction honest.
 *
 * `compacting` deliberately has no prop: that state squashes the *body*, and a
 * prop riding a whale being crushed is two things at once.
 * @param activity - the state, and the task when there is one.
 * @returns the prop to show, or null.
 */
export function propFor(activity: WhaleActivity): PropKind | null {
  switch (activity.state) {
    case 'idle':
      return 'ball'
    case 'thinking':
      return 'think'
    case 'responding':
      return 'speak'
    case 'waiting':
      return 'ask'
    case 'error':
      return 'bang'
    case 'compacting':
      return null
    case 'working':
      switch (activity.task) {
        case 'reading':
          return 'files'
        case 'editing':
          return 'pencil'
        case 'searching':
          return 'glass'
        default:
          // Every other tool, named or not, is "a tool is being used".
          return 'wrench'
      }
    default:
      return null
  }
}

/**
 * Where a prop hangs.
 *
 * Almost everything sits above the head. The file stream is the exception: it
 * runs *under* the body, right to left, like something being fed past. There is
 * as much unused bleed below the mark as above it — the dive needs far less
 * than the rise — so the second anchor costs nothing.
 */
export type PropAnchor = 'head' | 'belly'

/** Where this prop hangs. */
export function anchorFor(kind: PropKind): PropAnchor {
  return kind === 'files' ? 'belly' : 'head'
}

/** One airborne splash droplet, in CSS px relative to the mark's centre. */
export interface Droplet {
  readonly x: number
  readonly y: number
  /** Radius in CSS px; shrinks over the droplet's life. */
  readonly r: number
  readonly opacity: number
}

/** The water surface during a breach. */
export interface WaterState {
  /**
   * Total vertical offset from its rest height, CSS px — what the renderer
   * draws. It is the sum of two unrelated motions, and they are worth keeping
   * apart when reasoning about either: a slow slide down that follows the whale
   * out of the sea, and {@link deflection}, the fast disturbance of being hit.
   */
  readonly dy: number
  /**
   * The disturbance alone, CSS px. Positive is pushed down.
   *
   * The mean of {@link nodes}. Separated from `dy` because the slide dwarfs it
   * — during a rise the total is a dozen pixels down while the strike is a
   * fraction of one, and anything checking that the surface reacted has to look
   * here.
   */
  readonly deflection: number
  /**
   * Vertical offset of each point along the surface, CSS px, positive down.
   *
   * The surface is not a rule. It is a row of coupled springs, so a whale going
   * through it leaves a dent that rebounds into a crown and spreads outward as
   * ripples — which is the only thing on screen saying the line is a liquid.
   * Evenly spaced across `2 * halfWidth`; the array is reused every frame.
   */
  readonly nodes: readonly number[]
  /** Half the drawn length, CSS px. 0 while the surface is not there. */
  readonly halfWidth: number
  readonly opacity: number
}

/** The prop above the head. */
export interface PropState {
  /** Null while nothing is shown — including for the whole of a breach. */
  readonly kind: PropKind | null
  /** 0 hidden, 1 fully out. Drives the prop's own scale and opacity. */
  readonly reveal: number
  /** Offset from the anchor, CSS px. The brick's toss lives here. */
  readonly dx: number
  readonly dy: number
  /** Degrees; the question mark's tilt, the wrench's turn, the pencil's stroke. */
  readonly rotation: number
  /**
   * Vertical stretch. 1 is round, above 1 elongated, below 1 flattened.
   *
   * Squash and stretch, for the ball. It replaced a spin: a brick turning in
   * the air showed its rotation, and a circle does not — a spinning ball at
   * 10 px is a still ball. Deforming along the direction of travel is the
   * vocabulary that actually reads, and it is also the one that says "ball"
   * rather than "dot", which a static circle at this size does not.
   */
  readonly squash: number
  /** 0-1, looping. Drives each prop's own internal motion. */
  readonly phase: number
}

/**
 * Everything drawn outside the mark.
 *
 * Kept apart from {@link WhalePose} on purpose: the pose is the mark's rig and
 * carries only official geometry, and this is the plugin's own scenery. The
 * renderer draws the two from different elements, and the mask trick that keeps
 * the eye a hole applies to the mark alone.
 */
export interface WhaleEffects {
  readonly water: WaterState
  readonly splash: readonly Droplet[]
  readonly prop: PropState
}

/** Nothing outside the mark is being drawn. */
export const NO_EFFECTS: WhaleEffects = Object.freeze({
  water: Object.freeze({ dy: 0, deflection: 0, nodes: Object.freeze([]), halfWidth: 0, opacity: 0 }),
  splash: Object.freeze([]),
  prop: Object.freeze({ kind: null, reveal: 0, dx: 0, dy: 0, rotation: 0, squash: 1, phase: 0 }),
})


/** Deterministic number source; the engine never calls `Math.random` itself. */
export type RandomSource = () => number

/** Millisecond clock; the engine never reads `performance.now` itself. */
export type Clock = () => number
