/**
 * The sea: a deformable surface, the crown it throws up, and the droplets that
 * come off it.
 *
 * It exists only for the duration of a breach. A permanent line was rejected on
 * a measurement, not a preference: inline, the whale sits on a 14 px text
 * baseline immediately left of the status word, and a persistent horizontal
 * rule in that position reads as a strikethrough on the label.
 *
 * **The surface is a row of coupled springs, not a line.** Each node is a
 * damped oscillator about its rest height, and each is pulled toward the mean
 * of its neighbours — the discrete wave equation. That is the standard
 * spring-model water surface from 2D game development (see
 * https://prime31.github.io/water2d-part1/ and the Envato Tuts+ "dynamic 2D
 * water" tutorials); the maths is textbook and the implementation here is
 * written for this project's fixed-substep integrator rather than adapted from
 * either. It buys three things a rigid line cannot fake:
 *
 *  - a **dent** where the whale goes through, instead of the whole rule moving
 *  - a **crown** — the dent rebounds into a central peak, which is the shape
 *    every splash reference starts with (curtain, crown, break-up, droplets)
 *  - **ripples** spreading outward from the impact, which is what says the
 *    line is liquid rather than a divider
 *
 * The whale is drawn identically above and below it — no dimming, no occlusion,
 * no fade — so the entire burden of "this is water" rests on how the surface
 * behaves when it is hit.
 */
import { MAX_SUBSTEP, clampDelta } from './spring.js'
import type { AmplitudeBudget, Droplet, RandomSource, WaterState } from './types.js'
import type { Crossing } from './leap.js'

/**
 * Where the surface rests, in viewBox units, relative to the mark's own box.
 *
 * Negative: *above* the top of the mark, not at its bottom edge where it
 * started. That single number is what makes the whale begin and end a breach
 * completely under water — resting depth is already submerged, so neither end
 * of the arc has to pay for it in travel, and travel is the thing there is none
 * of. The margin clears the highest ink on the mark (the fluke tip, at
 * y = 0.01) so "submerged" is unambiguous rather than a tangent.
 */
export const WATER_REST_Y = -1.35

/**
 * How far the surface slides *down* at the peak of a breach, as a multiple of
 * the mark's own height.
 *
 * This is the line that makes a full breach possible, and it took being wrong
 * once to find. Getting the whale from "completely under" to "completely out"
 * needs its own height of separation — 19 px at the inline size — and the whale
 * cannot supply it: the clear space around DSH's status row caps its excursion
 * near 9 px, and the viewBox bleed is symmetric, so every pixel of travel is
 * charged twice. The conclusion drawn from that was "fully out is impossible".
 *
 * It was the wrong conclusion, because **separation does not have to come from
 * the whale**. The surface is a one-pixel line. It can travel as far as it
 * likes for nothing — the bleed is sized by the mark, not by the scenery — so
 * the remaining twelve pixels come from the sea sliding down instead. Both are
 * driven by the same arc value, which makes it a camera following the whale
 * rather than a tide going out.
 */
export const LINE_DROP_RATIO = 0.95

/** Points along the surface. Enough that a dent is a curve, not a corner. */
const NODES = 33

/** Node restoring frequency; how fast a lone dent returns to flat. */
const NODE_FREQUENCY = 11

/** Damping ratio per node. Under 1, so a dent rebounds into a crown. */
const NODE_DAMPING = 0.16

/**
 * Neighbour coupling. Sets how fast a ripple travels along the surface.
 *
 * Fast, because the interesting part of the ripple is the part that gets out
 * from behind the whale. The surface and the mark are the same ink, so
 * everything the impact does directly underneath the body is invisible; only
 * what travels clear of the silhouette is ever seen.
 *
 * Explicit integration of the wave equation is stable while `COUPLING * dt^2`
 * stays under about 4; at the 1/120 s substep this project integrates on that
 * leaves an order of magnitude of headroom, and the substep is what makes the
 * ripple travel at the same speed at 30 Hz and 120 Hz.
 */
const COUPLING = 4000

/** Impulse into the surface per crossing, in mark-heights per second. */
const KICK = { exit: -0.55, entry: 1.5 } as const

/** How many nodes either side of the impact take the hit. */
const KICK_SPREAD = 3

/** Fraction of the breach spent drawing the line out, and pulling it back in. */
const EXTEND = 0.1
const RETRACT_FROM = 0.9

/**
 * Half-length of the surface at full extension, as a fraction of mark width.
 *
 * Bounded by the one thing that can go wrong here rather than chosen for looks.
 * Inline, the status word begins a few pixels past the mark's right edge; at
 * 0.78 the line reached under it and became an underline on the label, which is
 * the exact failure the breach-only scope exists to prevent.
 */
const HALF_WIDTH_RATIO = 0.58

/** Droplets per crossing. Entry is the impact; exit only carries water up. */
const DROPS = { exit: 7, entry: 13 } as const

/** How long a droplet lives before it is gone, seconds. */
const DROP_LIFE = 0.62

/** Gravity on a droplet, in mark-heights per second squared. */
const DROP_GRAVITY = 13

/** Velocity a landing droplet puts back into the surface, as a fraction. */
const SECONDARY = 0.22

/**
 * Droplet radius, CSS px: proportional between a floor and a ceiling.
 *
 * The same shape of rule as the travel budget, and for the same reason. Pure
 * proportion makes a droplet invisible on a 26 px whale and a blob on a 64 px
 * one — at 0.1 of the mark's width the big ones came out as wide as its fluke.
 */
const DROP_RATIO = 0.095
const MIN_DROP_PX = 0.85
const MAX_DROP_PX = 2.2

/** One droplet's own state; the public {@link Droplet} is derived per frame. */
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  r0: number
  /** False once it has fallen back and rung the surface; then it is gone. */
  alive: boolean
}

/**
 * The water surface for one whale.
 *
 * Owns the surface nodes and the live droplets. Stepped by the engine, which
 * tells it when the arc crossed the line; it knows nothing about the arc's
 * shape, which is why retuning a phase boundary cannot desynchronise a splash.
 */
export class Water {
  private readonly random: RandomSource
  private readonly height = new Float64Array(NODES)
  private readonly velocity = new Float64Array(NODES)
  private readonly nodes: number[] = new Array<number>(NODES).fill(0)
  private readonly particles: Particle[] = []
  private readonly drops: Droplet[] = []
  private budget: AmplitudeBudget
  private size: number
  private presence = 0
  /** How far the surface has slid down to follow the whale, CSS px. */
  private drop = 0

  /**
   * @param budget - the size-derived amplitude budget.
   * @param size - the mark's drawn width in CSS px.
   * @param random - injected randomness, so a test can replay a splash.
   */
  constructor(budget: AmplitudeBudget, size: number, random: RandomSource) {
    this.budget = budget
    this.size = size
    this.random = random
  }

  /** Re-scale for a new drawn size. */
  setBudget(budget: AmplitudeBudget, size: number): void {
    this.budget = budget
    this.size = size
  }

  /** True while anything is drawn — the line, a droplet, or both. */
  get isActive(): boolean {
    return this.presence > 0 || this.particles.length > 0
  }

  /** The mark's drawn height, which every amplitude here is a fraction of. */
  private get markHeight(): number {
    return (this.size * 17.04) / 23.16
  }

  /** Half the surface's drawn length at full extension, CSS px. */
  private get span(): number {
    return HALF_WIDTH_RATIO * this.size
  }

  /** Drop the surface and every droplet, without animating them away. */
  reset(): void {
    this.height.fill(0)
    this.velocity.fill(0)
    this.particles.length = 0
    this.presence = 0
    this.drop = 0
  }

  /** Where the line's rest level is right now, CSS px below its rest height. */
  private get lineY(): number {
    return this.drop
  }

  /** Node index nearest an x offset from the mark's centre. */
  private indexAt(x: number): number {
    const t = (x / this.span + 1) / 2
    return Math.min(NODES - 1, Math.max(0, Math.round(t * (NODES - 1))))
  }

  /** Surface height at an x offset, interpolated between nodes. */
  private heightAtX(x: number): number {
    const t = Math.min(1, Math.max(0, (x / this.span + 1) / 2)) * (NODES - 1)
    const i = Math.min(NODES - 2, Math.floor(t))
    const f = t - i
    return (this.height[i] ?? 0) * (1 - f) + (this.height[i + 1] ?? 0) * f
  }

  /**
   * Disturb the surface and throw droplets off it.
   *
   * The impulse is spread over a few neighbouring nodes with a cosine falloff
   * rather than dumped into one. A single node takes the whole hit and snaps
   * back before the coupling can carry any of it outward — a spike, not a
   * splash. Spread over three either side it becomes a dent that rebounds into
   * a crown and sheds ripples, which is the shape every reference for water
   * entry starts from.
   * @param crossing - which way the whale went through.
   * @param atX - where it went through, CSS px from the mark's centre.
   */
  strike(crossing: Crossing, atX: number): void {
    const centre = this.indexAt(atX)
    const impulse = KICK[crossing] * this.markHeight
    for (let d = -KICK_SPREAD; d <= KICK_SPREAD; d++) {
      const i = centre + d
      if (i < 0 || i >= NODES) continue
      const falloff = 0.5 * (1 + Math.cos((Math.PI * d) / (KICK_SPREAD + 1)))
      this.velocity[i] = (this.velocity[i] ?? 0) + impulse * falloff
    }
    const count = DROPS[crossing]
    const scale = crossing === 'entry' ? 1 : 0.6
    for (let i = 0; i < count; i++) {
      // Fanned out and up from the impact, never straight up: a vertical column
      // of dots reads as a fountain rather than as a splash. The innermost ones
      // are the biggest and slowest — they are the crown's own walls — and the
      // outer ones are the fast little pieces that break off it.
      const side = i % 2 === 0 ? -1 : 1
      const rank = Math.floor(i / 2) / Math.max(1, Math.floor(count / 2))
      // Thrown from the *edges* of the body, not from its centre. The whale and
      // the water are the same ink, so a droplet born under the silhouette is
      // invisible until it has travelled half a whale — by which time the
      // splash is over. Starting them at the waterline where the body meets it
      // puts every one of them against empty background from frame one.
      const from = (0.3 + rank * 0.2 + this.random() * 0.08) * this.size
      const speed = 0.55 + rank * 0.75 + this.random() * 0.3
      this.particles.push({
        x: atX + side * from,
        y: this.lineY + this.heightAtX(atX + side * from),
        vx: side * speed * this.size * 0.7,
        // Thrown hard enough to arc: peak height is v^2/2g, and at the old
        // launch speed that worked out to a four-pixel hop on a whale ten times
        // that tall — water being lobbed, not water being knocked off.
        vy: -(3 - rank * 0.9 + this.random() * 0.7) * this.markHeight * scale,
        age: 0,
        r0:
          Math.min(MAX_DROP_PX, Math.max(MIN_DROP_PX, DROP_RATIO * this.size)) *
          (1 - rank * 0.45 + this.random() * 0.25) *
          (scale * 0.35 + 0.65),
        alive: true,
      })
    }
  }

  /**
   * Advance the surface and its droplets.
   * @param dt - elapsed seconds.
   * @param leapProgress - progress through the breach, 0-1, or -1 when idle.
   * @param height - the arc's current height, 1 at the peak, -1 at the deepest.
   */
  step(dt: number, leapProgress: number, height: number): void {
    // The surface follows the whale up, which supplies the separation the
    // whale's own travel budget cannot. Only while it is above the line: below
    // it, the whale plunges and the sea stays put.
    this.drop = LINE_DROP_RATIO * this.markHeight * Math.max(0, height)
    this.presence =
      leapProgress < 0
        ? Math.max(0, this.presence - dt / (EXTEND * 1.2))
        : leapProgress < EXTEND
          ? leapProgress / EXTEND
          : leapProgress < RETRACT_FROM
            ? 1
            : Math.max(0, 1 - (leapProgress - RETRACT_FROM) / (1 - RETRACT_FROM))

    this.integrateSurface(dt)
    this.stepDroplets(dt)
    if (this.presence === 0 && this.particles.length === 0) {
      this.height.fill(0)
      this.velocity.fill(0)
    }
  }

  /**
   * Step every node, in substeps.
   *
   * Restoring force, damping and neighbour coupling in one pass — the discrete
   * wave equation with a spring to rest. Reflective at both ends, so a ripple
   * that reaches the edge of the drawn surface comes back rather than vanishing
   * into a boundary the viewer cannot see.
   * @param dt - elapsed seconds.
   */
  private integrateSurface(dt: number): void {
    let remaining = clampDelta(dt)
    const f = NODE_FREQUENCY
    while (remaining > 0) {
      const step = Math.min(remaining, MAX_SUBSTEP)
      for (let i = 0; i < NODES; i++) {
        const h = this.height[i] ?? 0
        const left = this.height[i === 0 ? 0 : i - 1] ?? 0
        const right = this.height[i === NODES - 1 ? NODES - 1 : i + 1] ?? 0
        const accel =
          COUPLING * (left + right - 2 * h) - 2 * NODE_DAMPING * f * (this.velocity[i] ?? 0) - f * f * h
        this.velocity[i] = (this.velocity[i] ?? 0) + accel * step
      }
      for (let i = 0; i < NODES; i++) {
        const next = (this.height[i] ?? 0) + (this.velocity[i] ?? 0) * step
        this.height[i] = Number.isFinite(next) ? next : 0
      }
      remaining -= step
    }
  }

  /**
   * Advance every droplet, and let the ones that land ring the surface.
   *
   * That last part is the "secondary splash" every animation reference calls
   * out: a droplet coming back down is itself an impact, and without it the
   * water throws pieces of itself into the air and then ignores them.
   * @param dt - elapsed seconds.
   */
  private stepDroplets(dt: number): void {
    const gravity = DROP_GRAVITY * this.markHeight
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      if (p === undefined) continue
      p.age += dt
      p.vy += gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      const surface = this.lineY + this.heightAtX(p.x)
      if (p.alive && p.vy > 0 && p.y >= surface) {
        p.alive = false
        const j = this.indexAt(p.x)
        this.velocity[j] = (this.velocity[j] ?? 0) + p.vy * SECONDARY
      }
      if (!p.alive || p.age >= DROP_LIFE) {
        // Swap-remove: the frame loop must not allocate, and droplet order is
        // not something anyone can see.
        const last = this.particles.pop()
        if (last !== undefined && i < this.particles.length) this.particles[i] = last
      }
    }
  }

  /** The surface's drawable state this frame. */
  get state(): WaterState {
    const ease = this.presence * this.presence * (3 - 2 * this.presence)
    let sum = 0
    for (let i = 0; i < NODES; i++) {
      const h = this.height[i] ?? 0
      this.nodes[i] = h
      sum += h
    }
    return {
      dy: this.lineY,
      deflection: sum / NODES,
      nodes: this.nodes,
      halfWidth: ease * this.span,
      opacity: ease,
    }
  }

  /**
   * The live droplets. Reuses one array and one object per droplet so a splash
   * costs no allocation per frame.
   */
  get droplets(): readonly Droplet[] {
    this.drops.length = 0
    for (const p of this.particles) {
      const life = 1 - p.age / DROP_LIFE
      this.drops.push({
        x: p.x,
        y: p.y,
        r: p.r0 * (0.4 + 0.6 * life),
        opacity: Math.min(1, life * 1.8),
      })
    }
    return this.drops
  }
}
