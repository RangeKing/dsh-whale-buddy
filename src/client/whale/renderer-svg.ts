/**
 * SVG renderer for one whale.
 *
 * The mark is drawn as a luminance mask over a `currentColor` rectangle. That
 * indirection buys one thing a plain `<path>` cannot: the eye stays a hole in
 * the body — so it reads on any background, light or dark — while still being a
 * separately transformable element, which is what a blink needs. Everything
 * else about the mark is untouched official geometry, drawn once.
 *
 * The viewBox carries per-axis bleed computed from the same limits the rig
 * clamps to, so a posed mark can never be shaved off by its own viewport, and
 * the padding shrinks as the whale grows (travel is budgeted in pixels).
 *
 * Elements are built once and cached; a frame writes two transform attributes,
 * and only when their text actually changed.
 */
import {
  BODY_PIVOT,
  PATH_CHEEK,
  PATH_EYE,
  PATH_HOLLOW,
  PATH_SILHOUETTE,
  VIEW_BOX,
} from './geometry.js'
import {
  BALL_GAP,
  BELLY_REST,
  buildProps,
  HEAD_TOP,
  PROP_GAP,
  type PropShape,
} from './props-svg.js'
import { WATER_REST_Y } from './water.js'
import { bleedFor, limitsFor, rigTransforms, unitsPerPixel, type RigLimits } from './rig.js'
import {
  anchorFor,
  budgetFor,
  NEUTRAL_POSE,
  NO_EFFECTS,
  type WhaleEffects,
  type WhalePose,
} from './types.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** The mask region reaches well past the mark; it costs nothing to be generous. */
const MASK_BLEED = 8

let uid = 0

/** A mounted whale drawing. */
export interface WhaleRenderer {
  /** The root `<svg>`; decorative, so it carries `aria-hidden`. */
  readonly svg: SVGSVGElement
  /** The limits the rig clamps to at the current size. */
  readonly limits: RigLimits
  /**
   * How far the element extends past the mark on each axis, CSS px.
   *
   * The element is bleed-inclusive so the drawing never resizes mid-animation,
   * which means it is larger than the whale the caller asked for — mostly
   * vertically, because the leap's headroom lives there. A surface that has to
   * sit inside a tight row cancels this with negative margins, so the whale
   * contributes exactly the mark's box to layout and overflows the rest.
   */
  readonly bleedPx: { readonly x: number; readonly y: number }
  /**
   * Apply a pose, and optionally everything drawn outside the mark.
   * Cheap enough to call every frame.
   * @param pose - the mark's rig.
   * @param effects - the water, the splash and the prop; omitted means none.
   */
  apply(pose: Readonly<WhalePose>, effects?: WhaleEffects): void
  /** Resize in CSS pixels, preserving the mark's aspect ratio. */
  resize(size: number): void
  /** Remove the drawing from its parent and drop references. */
  destroy(): void
}

/** Renderer options. */
export interface RendererOptions {
  /** Width of the *mark* in CSS pixels; the element is bleed-inclusive. */
  readonly size: number
  /** Owning document, so the renderer works in a test DOM. */
  readonly document: Document
  /**
   * Share of the leap this surface can afford, 0-1.
   *
   * It has to reach the renderer and not only the engine: the leap's amplitude
   * is what the viewBox makes room for, and the two deriving it from different
   * numbers is the exact failure this project already paid for once.
   */
  readonly leapScale?: number
}

/**
 * Build one whale drawing.
 * @param options - size and owning document.
 * @returns the renderer handle.
 */
export function createWhaleRenderer(options: RendererOptions): WhaleRenderer {
  const doc = options.document
  const id = `wb-${(++uid).toString(36)}`
  const el = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
    doc.createElementNS(SVG_NS, tag)

  const svg = el('svg')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('data-whale-buddy-mark', '')

  const defs = el('defs')
  const mask = el('mask')
  mask.setAttribute('id', `${id}-mask`)
  mask.setAttribute('maskUnits', 'userSpaceOnUse')
  mask.setAttribute('x', String(-MASK_BLEED))
  mask.setAttribute('y', String(-MASK_BLEED))
  mask.setAttribute('width', String(VIEW_BOX.width + MASK_BLEED * 2))
  mask.setAttribute('height', String(VIEW_BOX.height + MASK_BLEED * 2))

  // The mark, minus its own negative space.
  const core = el('g')
  core.appendChild(path(el, PATH_SILHOUETTE, '#fff'))
  core.appendChild(path(el, PATH_HOLLOW, '#000'))
  core.appendChild(path(el, PATH_CHEEK, '#000'))

  // The eye is punched last, so a blink closes a hole through the body rather
  // than painting a dot the background would have to match.
  const eye = el('g')
  eye.appendChild(path(el, PATH_EYE, '#000'))

  mask.appendChild(core)
  mask.appendChild(eye)
  defs.appendChild(mask)
  svg.appendChild(defs)

  // The water surface. Appended *after* the mark, below — it is drawn in front.
  const water = el('g')
  const waterGradient = el('linearGradient')
  waterGradient.setAttribute('id', `${id}-water`)
  // In user space, so the taper stays pinned to the surface's own ends rather
  // than to the bounding box of a path that changes shape every frame.
  waterGradient.setAttribute('gradientUnits', 'userSpaceOnUse')
  waterGradient.setAttribute('y1', '0')
  waterGradient.setAttribute('y2', '0')
  /*
   * Tapered ends: a line with two hard endpoints reads as a rule, and fading
   * out reads as a surface carrying on past the drawing.
   *
   * The fade is narrow, and that is not a style choice. The line and the whale
   * are the same ink, so wherever the line crosses the body it is simply
   * invisible — the waterline is read from the stretches either side of the
   * silhouette, which are the outer third of its length. A fade starting at 20%
   * put that entire readable stretch inside the taper, and the surface all but
   * disappeared at the moment the whale was widest across it.
   */
  for (const [offset, opacity] of [[0, 0], [0.1, 1], [0.9, 1], [1, 0]] as const) {
    const stop = el('stop')
    stop.setAttribute('offset', String(offset))
    stop.setAttribute('stop-color', 'currentColor')
    stop.setAttribute('stop-opacity', String(opacity))
    waterGradient.appendChild(stop)
  }
  defs.appendChild(waterGradient)
  // A path, not a rect: the surface deforms, and a dent that reads as a dent is
  // the whole reason anyone believes the line is liquid.
  const waterLine = el('path')
  waterLine.setAttribute('fill', 'none')
  waterLine.setAttribute('stroke', `url(#${id}-water)`)
  waterLine.setAttribute('stroke-linecap', 'round')
  waterLine.setAttribute('stroke-linejoin', 'round')
  water.appendChild(waterLine)

  const body = el('g')
  const plate = el('rect')
  plate.setAttribute('x', String(-MASK_BLEED))
  plate.setAttribute('y', String(-MASK_BLEED))
  plate.setAttribute('width', String(VIEW_BOX.width + MASK_BLEED * 2))
  plate.setAttribute('height', String(VIEW_BOX.height + MASK_BLEED * 2))
  plate.setAttribute('fill', 'currentColor')
  plate.setAttribute('mask', `url(#${id}-mask)`)
  body.appendChild(plate)
  svg.appendChild(body)

  /*
   * In front of the mark, and the order matters more than it looks.
   *
   * The surface line is drawn over the whale rather than under it. At full
   * opacity the two are the same ink so it makes no difference where they
   * overlap, but the line spends its first and last frames partly transparent
   * while it extends and retracts, and in front those frames composite over the
   * body instead of being swallowed by it.
   */
  svg.appendChild(water)

  // Then droplets, then the prop above the head.
  const splash = el('g')
  svg.appendChild(splash)
  const drops: SVGCircleElement[] = []

  const propHost = el('g')
  svg.appendChild(propHost)
  const shapes = buildProps(doc)
  for (const [kind, shape] of Object.entries(shapes)) {
    shape.root.setAttribute('opacity', '0')
    // Names the prop for tests and for anyone reading the DOM; the drawing is
    // aria-hidden, so it carries no meaning to a reader.
    shape.root.setAttribute('data-wb-prop', kind)
    shape.root.style.display = 'none'
    propHost.appendChild(shape.root)
  }
  let shownProp: PropShape | null = null

  const leapScale = options.leapScale ?? 1
  let limits = limitsFor(budgetFor(options.size, leapScale))
  let perPixel = unitsPerPixel(options.size)
  let bleedPx = { x: 0, y: 0 }
  const last = { body: '', eye: '', opacity: '' }

  const write = (element: SVGElement, key: 'body' | 'eye', value: string): void => {
    if (last[key] === value) return
    last[key] = value
    element.setAttribute('transform', value)
  }

  /** The water surface: a tapered stroke through its deformed nodes. */
  const drawWater = (effects: WhaleEffects): void => {
    const w = effects.water
    if (w.opacity <= 0.001 || w.halfWidth <= 0.001 || w.nodes.length < 2) {
      if (water.getAttribute('opacity') !== '0') water.setAttribute('opacity', '0')
      return
    }
    const half = w.halfWidth * perPixel
    const left = BODY_PIVOT.x - half
    const base = WATER_REST_Y + w.dy * perPixel
    let d = ''
    for (let i = 0; i < w.nodes.length; i++) {
      const x = left + (i / (w.nodes.length - 1)) * half * 2
      const y = base + (w.nodes[i] ?? 0) * perPixel
      d += `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`
      if (i < w.nodes.length - 1) d += ' '
    }
    waterLine.setAttribute('d', d)
    waterLine.setAttribute('stroke-width', String(round(Math.max(0.6, 0.062 * VIEW_BOX.height))))
    waterGradient.setAttribute('x1', String(round(left)))
    waterGradient.setAttribute('x2', String(round(left + half * 2)))
    water.setAttribute('opacity', String(round(w.opacity)))
  }

  /** The splash: droplets, created on demand and then reused. */
  const drawSplash = (effects: WhaleEffects): void => {
    const list = effects.splash
    while (drops.length < list.length) {
      const c = el('circle')
      c.setAttribute('fill', 'currentColor')
      splash.appendChild(c)
      drops.push(c)
    }
    for (let i = 0; i < drops.length; i++) {
      const node = drops[i]
      if (node === undefined) continue
      const d = list[i]
      if (d === undefined) {
        node.setAttribute('opacity', '0')
        continue
      }
      node.setAttribute('cx', String(round(BODY_PIVOT.x + d.x * perPixel)))
      node.setAttribute('cy', String(round(WATER_REST_Y + d.y * perPixel)))
      node.setAttribute('r', String(round(Math.max(0, d.r * perPixel))))
      node.setAttribute('opacity', String(round(d.opacity)))
    }
  }

  /**
   * The prop the whale is carrying.
   *
   * It follows the body's translation but *not* its rotation: a thought bubble
   * that tilts 19 degrees with the whale reads as one about to fall off.
   *
   * There are two anchors. Seven props hang above the head — the mark's head is
   * at the left, so they sit over the left third — with the ball resting almost
   * on the silhouette and the rest floating a little clear. The file stream
   * hangs under the belly instead, centred on the mark, because it is a
   * *stream*: things going past need a run to go past along, and the run that
   * exists is the width of the whale, not the sliver of headroom over its head.
   */
  const drawProp = (effects: WhaleEffects): void => {
    const p = effects.prop
    const shape = p.kind === null ? null : (shapes[p.kind] ?? null)
    if (shape !== shownProp) {
      if (shownProp !== null) shownProp.root.style.display = 'none'
      if (shape !== null) shape.root.style.display = ''
      shownProp = shape
    }
    if (shape === null || p.reveal <= 0.001) {
      shape?.root.setAttribute('opacity', '0')
      return
    }
    // Grows out of the anchor rather than fading in on the spot.
    const scale = 0.55 + 0.45 * p.reveal
    const belly = p.kind !== null && anchorFor(p.kind) === 'belly'
    // The ball is balanced on the whale and so sits almost on its back; the
    // others are thoughts and float clear of it. Nothing may actually touch —
    // same ink, so contact merges the two silhouettes into one.
    const rest = belly ? BELLY_REST : HEAD_TOP - (p.kind === 'ball' ? BALL_GAP : PROP_GAP)
    const anchorX = belly ? BODY_PIVOT.x : BODY_PIVOT.x - VIEW_BOX.width * 0.2
    const x = anchorX + (pose.bodyX + p.dx) * perPixel
    const y = rest + (pose.bodyY + p.dy) * perPixel
    // Squash conserves area, so a flattened ball spreads rather than shrinking.
    const sx = scale / Math.sqrt(p.squash)
    const sy = scale * p.squash
    shape.root.setAttribute(
      'transform',
      `translate(${round(x)} ${round(y)}) rotate(${round(p.rotation)}) scale(${round(sx)} ${round(sy)})`,
    )
    shape.root.setAttribute('opacity', String(round(p.reveal)))
    shape.animate(p.phase)
  }

  /** The pose the prop anchor follows; updated by every apply. */
  let pose: Readonly<WhalePose> = NEUTRAL_POSE

  const renderer: WhaleRenderer = {
    svg,
    get limits() {
      return limits
    },
    get bleedPx() {
      return bleedPx
    },
    apply(next, effects = NO_EFFECTS) {
      pose = next
      const t = rigTransforms(next, limits, perPixel)
      write(body, 'body', t.body)
      write(eye, 'eye', t.eye)
      if (last.opacity !== t.opacity) {
        last.opacity = t.opacity
        body.setAttribute('opacity', t.opacity)
      }
      drawWater(effects)
      drawSplash(effects)
      drawProp(effects)
    },
    resize(size) {
      const markWidth = Number.isFinite(size) && size > 0 ? size : 20
      limits = limitsFor(budgetFor(markWidth, leapScale))
      perPixel = unitsPerPixel(markWidth)
      const bleed = bleedFor(limits, perPixel)
      const boxWidth = VIEW_BOX.width + bleed.x * 2
      const boxHeight = VIEW_BOX.height + bleed.y * 2
      svg.setAttribute(
        'viewBox',
        `${round(-bleed.x)} ${round(-bleed.y)} ${round(boxWidth)} ${round(boxHeight)}`,
      )
      // `size` stays the width of the mark: the element is wider by the bleed,
      // so callers keep asking for "a 26 px whale" and getting one.
      const elementWidth = (markWidth * boxWidth) / VIEW_BOX.width
      const elementHeight = (elementWidth * boxHeight) / boxWidth
      svg.setAttribute('width', String(round(elementWidth)))
      svg.setAttribute('height', String(round(elementHeight)))
      const markHeight = (markWidth * VIEW_BOX.height) / VIEW_BOX.width
      bleedPx = {
        x: round((elementWidth - markWidth) / 2),
        y: round((elementHeight - markHeight) / 2),
      }
    },
    destroy() {
      svg.remove()
    },
  }

  renderer.resize(options.size)
  renderer.apply(NEUTRAL_POSE)
  return renderer
}

/** Build one filled `<path>` inside the mask. */
function path(
  el: <K extends keyof SVGElementTagNameMap>(tag: K) => SVGElementTagNameMap[K],
  d: string,
  fill: string,
): SVGPathElement {
  const node = el('path')
  node.setAttribute('d', d)
  node.setAttribute('fill', fill)
  return node
}

/** Round a value to two decimals. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}
