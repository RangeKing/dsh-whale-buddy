/**
 * The prop shapes, as SVG.
 *
 * Everything here is plugin-authored and drawn in the mark's own viewBox units
 * so it scales with the whale — the *motion* is budgeted in pixels, the
 * *drawing* is proportional. Nothing here overlaps the silhouette: these hang
 * above the head, and DeepSeek's geometry is never redrawn or covered.
 *
 * Each shape is built once and shown or hidden by the renderer. They are drawn
 * directly in `currentColor` rather than through the mark's luminance mask,
 * because the mask exists for one reason — keeping the eye a hole through the
 * body — and none of these needs a hole.
 *
 * Sizes are what survives the measurement: about 10 px of headroom inline at
 * 26 px, which is roughly 9 viewBox units. Every feature is therefore a circle,
 * a rounded rectangle or a stroke about 1 unit thick. An anatomical brain and a
 * figure carrying bricks were both tried on paper and both fail here — the
 * project's own rule is that a channel which cannot pass a pixel floor is an
 * absent channel, so they became a three-dot cloud and a brick.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Width of the prop field, viewBox units. Everything is drawn about x = 0. */
export const PROP_HALF_WIDTH = 4.6

/** How tall a prop may be, viewBox units, measured up from its baseline. */
export const PROP_HEIGHT = 5.4

/**
 * Where the silhouette's top edge sits under the prop anchor, viewBox units.
 *
 * Measured off a raster of the mark rather than taken from its bounding box:
 * the box top is the fluke tip over on the right, and the prop sits well left
 * of that, where the back is a unit lower. Reading the wrong one leaves every
 * prop hovering a visible gap above the whale.
 */
export const HEAD_TOP = 1.05

/** Gap between the whale's back and a prop that floats, viewBox units. */
export const PROP_GAP = 1.3

/**
 * Where the silhouette's bottom edge sits, viewBox units.
 *
 * Measured by hit-testing the silhouette down the middle third of the mark,
 * not read off {@link HEAD_TOP}'s counterpart — but unlike the top, the answer
 * here *is* the bounding box: the belly is the lowest thing in the drawing. A
 * first guess of 16.2 put the cards inside the body.
 */
export const BELLY_BOTTOM = 17

/**
 * Gap between the whale's belly and the top of the file stream, viewBox units.
 *
 * Measured to the top of a card rather than to its centre. Measuring to the
 * centre is the mistake that hid the first version: half the card was still
 * inside the mark, so instead of a stream under a whale it was a whale with
 * legs — the same same-ink merge that made a ball resting on the back read as
 * a knob, except that this one reads as anatomy, which is worse.
 */
export const BELLY_GAP = 1.5

/** Half the height of one file card, viewBox units. */
export const FILE_HALF_HEIGHT = 2.3

/** Where the file stream's own origin sits, viewBox units. */
export const BELLY_REST = BELLY_BOTTOM + BELLY_GAP + FILE_HALF_HEIGHT

/**
 * The one colour in the plugin.
 *
 * Chosen to read on both themes rather than to match either: a mid red that
 * stays legible against the light background and against the dark one, and
 * that is far enough from DSH's own blue label ink to register as "not the
 * usual thing" at a glance.
 */
export const ERROR_INK = '#e5484d'

/** Radius of the tossed ball, viewBox units. */
export const BALL_RADIUS = 2.6

/**
 * Gap between the whale's back and the ball it is balancing, viewBox units.
 *
 * A balanced ball touches, and drawing it touching was wrong. The prop and the
 * mark are the same flat ink, so contact merges them into one silhouette and
 * the ball reads as a knob grown out of the whale's back. A hair of background
 * between them is what separates the two objects — the same problem, and the
 * same answer, as the waterline being invisible where it crosses the body.
 */
export const BALL_GAP = 0.95

/** One built prop: its root element and the parts that animate inside it. */
export interface PropShape {
  readonly root: SVGGElement
  /** Called each frame with the prop's own 0-1 loop phase. */
  animate(phase: number): void
}

/** Build an element in the SVG namespace. */
function el<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
): SVGElementTagNameMap[K] {
  return doc.createElementNS(SVG_NS, tag)
}

/** A filled circle. */
function dot(doc: Document, cx: number, cy: number, r: number): SVGCircleElement {
  const c = el(doc, 'circle')
  c.setAttribute('cx', String(cx))
  c.setAttribute('cy', String(cy))
  c.setAttribute('r', String(r))
  c.setAttribute('fill', 'currentColor')
  return c
}

/**
 * The thought cloud: three dots that pulse in sequence, with a trail.
 *
 * This is where the brain went. At the size this draws, an anatomical brain is
 * a blob with no silhouette anyone can name; three dots in a row are the
 * typographic convention for thinking and every one of them clears the floor.
 * @param doc - owning document.
 * @returns the shape.
 */
function buildThink(doc: Document): PropShape {
  const root = el(doc, 'g')
  const dots = [-2.1, 0, 2.1].map((x) => dot(doc, x, -2.6, 0.95))
  for (const d of dots) root.appendChild(d)
  // Three dots and nothing else. An earlier version hung a small trailing dot
  // below the row, the way a comic-strip thought bubble tapers back toward its
  // thinker; at this size it did not read as a tail, it read as a fourth dot
  // that had fallen off the line.
  return {
    root,
    animate(phase) {
      for (let i = 0; i < dots.length; i++) {
        const local = (phase + i / dots.length) % 1
        const pulse = 0.72 + 0.28 * (1 + Math.sin(2 * Math.PI * local)) * 0.5
        dots[i]?.setAttribute('r', String(0.95 * pulse))
      }
    },
  }
}

/**
 * The speech bubble: a stroked rounded rectangle with a tail toward the head.
 *
 * Stroked rather than filled on purpose — a solid rounded rectangle at this
 * size could be anything, and the outline is what makes it a bubble.
 * @param doc - owning document.
 * @returns the shape.
 */
function buildSpeak(doc: Document): PropShape {
  const root = el(doc, 'g')
  const body = el(doc, 'rect')
  body.setAttribute('x', '-3.6')
  body.setAttribute('y', '-4.5')
  body.setAttribute('width', '7.2')
  body.setAttribute('height', '4.3')
  body.setAttribute('rx', '1.5')
  body.setAttribute('fill', 'none')
  body.setAttribute('stroke', 'currentColor')
  body.setAttribute('stroke-width', '0.95')
  const tail = el(doc, 'path')
  tail.setAttribute('d', 'M -1.5 -0.35 L -2.5 1.5 L 0.2 -0.35 Z')
  tail.setAttribute('fill', 'currentColor')
  root.appendChild(body)
  root.appendChild(tail)
  return {
    root,
    animate(phase) {
      // A slow breath, and a tail that flicks with it: the bubble is being
      // spoken into rather than parked above the whale.
      const breath = 1 + 0.045 * Math.sin(2 * Math.PI * phase)
      body.setAttribute('transform', `scale(${round(breath)} ${round(breath)})`)
      tail.setAttribute('transform', `rotate(${round(6 * Math.sin(2 * Math.PI * phase))} -1 0)`)
    },
  }
}

/**
 * The ball the whale balances and tosses.
 *
 * This was a brick, and a brick is what the Chinese idiom for grinding work
 * actually says. It did not survive contact with the drawing: rendered in the
 * same flat blue as the whale, at five pixels across and with no texture the
 * size could carry, it read as a rectangle rather than as masonry. A circle
 * says "ball" with no detail at all, and a ball being balanced and tossed says
 * the same thing about the work as the brick was supposed to.
 *
 * Drawn with its centre one radius above the origin so the origin sits where
 * the ball touches the whale — which is the point it squashes about.
 * @param doc - owning document.
 * @returns the shape.
 */
function buildBall(doc: Document): PropShape {
  const root = el(doc, 'g')
  root.appendChild(dot(doc, 0, -BALL_RADIUS, BALL_RADIUS))
  return { root, animate: () => {} }
}

/**
 * The question mark, as a stroked hook plus a dot.
 * @param doc - owning document.
 * @returns the shape.
 */
function buildAsk(doc: Document): PropShape {
  const root = el(doc, 'g')
  const hook = el(doc, 'path')
  hook.setAttribute('d', 'M -1.5 -3.9 A 1.55 1.55 0 1 1 0.15 -2.2 L 0.15 -1.35')
  hook.setAttribute('fill', 'none')
  hook.setAttribute('stroke', 'currentColor')
  hook.setAttribute('stroke-width', '1')
  hook.setAttribute('stroke-linecap', 'round')
  root.appendChild(hook)
  root.appendChild(dot(doc, 0.15, 0.15, 0.6))
  return { root, animate: () => {} }
}

/** Round to two decimals, keeping attribute text stable between frames. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The exclamation mark shown when a turn failed.
 *
 * The same construction as the question mark — a stroke and a dot — because at
 * this size they have to be told apart by two things: the straightness of the
 * stroke, and the colour. This is the **one prop that does not inherit
 * `currentColor`**. Everything else in this plugin is monochrome on purpose, so
 * that it rides DSH's own ink in either theme; an error is the one state where
 * the colour *is* the message, and a red mark says it before any shape is read.
 * @param doc - owning document.
 * @returns the shape.
 */
function buildBang(doc: Document): PropShape {
  const root = el(doc, 'g')
  const stem = el(doc, 'path')
  stem.setAttribute('d', 'M 0 -4.3 L 0 -1.5')
  stem.setAttribute('fill', 'none')
  stem.setAttribute('stroke', ERROR_INK)
  stem.setAttribute('stroke-width', '1.25')
  stem.setAttribute('stroke-linecap', 'round')
  const point = dot(doc, 0, 0.15, 0.65)
  point.setAttribute('fill', ERROR_INK)
  root.appendChild(stem)
  root.appendChild(point)
  return { root, animate: () => {} }
}

/**
 * The magnifier: a ring and a handle, both strokes.
 *
 * Filled, it is a lollipop. The hole is what makes it a lens, and a hole at
 * this size can only be an unfilled circle.
 * @param doc - owning document.
 * @returns the shape.
 */
function buildGlass(doc: Document): PropShape {
  const root = el(doc, 'g')
  const lens = el(doc, 'circle')
  lens.setAttribute('cx', '0')
  lens.setAttribute('cy', '-2.6')
  lens.setAttribute('r', '1.85')
  lens.setAttribute('fill', 'none')
  lens.setAttribute('stroke', 'currentColor')
  lens.setAttribute('stroke-width', '0.95')
  const grip = el(doc, 'path')
  grip.setAttribute('d', 'M 1.35 -1.25 L 2.5 -0.1')
  grip.setAttribute('stroke', 'currentColor')
  grip.setAttribute('stroke-width', '1.15')
  grip.setAttribute('stroke-linecap', 'round')
  root.appendChild(lens)
  root.appendChild(grip)
  return { root, animate: () => {} }
}

/**
 * The pencil: a shaft and a point, held at an angle with the point up and to
 * the left — the same slant as the magnifier, and the way a hand holds one.
 *
 * Drawn upright and then rotated by an inner group rather than baked into the
 * coordinates, because the slant *is* the design statement and a path of
 * pre-rotated decimals says nothing to whoever reads it next. The inner group
 * also keeps the rotation clear of the outer one, which the prop's own gesture
 * animates: the stroke swings about this pivot, so the point sweeps the way a
 * pencil writing a line does.
 * @param doc - owning document.
 * @returns the shape.
 */
function buildPencil(doc: Document): PropShape {
  const root = el(doc, 'g')
  const tilted = el(doc, 'g')
  // 135° turns "point down" into "point up and left"; the translate then lifts
  // the rotated shape — which would otherwise hang down and to the right of the
  // origin — back into the headroom above the whale.
  tilted.setAttribute('transform', 'translate(-2.5 -5.1) rotate(135)')
  root.appendChild(tilted)
  const shaft = el(doc, 'path')
  // Long for its width. Rotated 45° a short pencil reads as a dart, and the
  // one thing a pencil has that a dart does not is length.
  shaft.setAttribute('d', 'M -1.05 -6.2 L 1.05 -6.2 L 1.05 -1.5 L -1.05 -1.5 Z')
  shaft.setAttribute('fill', 'currentColor')
  const tip = el(doc, 'path')
  tip.setAttribute('d', 'M -1.05 -1.5 L 1.05 -1.5 L 0 0.2 Z')
  tip.setAttribute('fill', 'currentColor')
  tilted.appendChild(shaft)
  tilted.appendChild(tip)
  return { root, animate: () => {} }
}

/**
 * The wrench: a shaft under a solid head with a notch bitten out of it.
 *
 * The first version drew the jaw as two thin strokes turning a corner, which at
 * ten pixels was a tuning fork on a stick. A wrench head is *massive* — that is
 * the whole visual idea of a spanner — so it is a filled block here, and the
 * jaw is a gap cut into it rather than a shape drawn around empty space. Same
 * lesson as the brick that had to become a ball: at this size a silhouette can
 * carry one idea, and it had better be the right one.
 * @param doc - owning document.
 * @returns the shape.
 */
function buildWrench(doc: Document): PropShape {
  const root = el(doc, 'g')
  const shaft = el(doc, 'path')
  shaft.setAttribute('d', 'M 0 -3.2 L 0 0.5')
  shaft.setAttribute('fill', 'none')
  shaft.setAttribute('stroke', 'currentColor')
  shaft.setAttribute('stroke-width', '1.4')
  shaft.setAttribute('stroke-linecap', 'round')
  const head = el(doc, 'path')
  // A V cut into the top, not a square one. A square notch is a socket; the V
  // is what every open-end spanner has and the one cue that survives being
  // four pixels wide.
  head.setAttribute(
    'd',
    'M -2.5 -5.3 L -0.95 -5.3 L 0 -4.05 L 0.95 -5.3 L 2.5 -5.3 L 2.5 -2.9 L -2.5 -2.9 Z',
  )
  head.setAttribute('fill', 'currentColor')
  root.appendChild(shaft)
  root.appendChild(head)
  return { root, animate: () => {} }
}

/** How many file cards are in flight under the whale at once. */
const FILE_COUNT = 3

/** Half the distance the stream runs, viewBox units. */
export const FILE_SPAN = 8.5

/**
 * The file stream: cards drifting right to left under the body.
 *
 * The only prop that is a *sequence* rather than an object, and the only one
 * whose layout is done here rather than by the prop state — three cards share
 * one looping phase, spaced a third of a cycle apart, each fading in at the
 * right edge and out at the left. Reading files is a stream of things going
 * past, and one icon wiggling cannot say that however it moves.
 * @param doc - owning document.
 * @returns the shape.
 */
function buildFiles(doc: Document): PropShape {
  const root = el(doc, 'g')
  const cards: SVGGElement[] = []
  for (let i = 0; i < FILE_COUNT; i++) {
    const card = el(doc, 'g')
    const body = el(doc, 'path')
    // A page with the corner turned down: the one detail that survives, because
    // it changes the silhouette rather than adding anything inside it.
    // Clearly portrait: at this size a square reads as a block, and a block
    // under a whale reads as a foot. The proportions are what say "page".
    body.setAttribute('d', 'M -1.4 -2.3 L 0.2 -2.3 L 1.4 -1.1 L 1.4 2.3 L -1.4 2.3 Z')
    body.setAttribute('fill', 'currentColor')
    card.appendChild(body)
    root.appendChild(card)
    cards.push(card)
  }
  return {
    root,
    animate(phase) {
      for (let i = 0; i < cards.length; i++) {
        const local = (phase + i / cards.length) % 1
        // Right to left.
        const x = FILE_SPAN - local * FILE_SPAN * 2
        // Fade in over the first fifth, out over the last fifth, so nothing
        // pops into or out of existence at either end of the run.
        const fade = Math.min(1, Math.min(local, 1 - local) / 0.2)
        const card = cards[i]
        if (card === undefined) continue
        card.setAttribute('transform', `translate(${round(x)} 0) scale(${round(0.8 + 0.2 * fade)})`)
        card.setAttribute('opacity', String(round(fade)))
      }
    },
  }
}

/**
 * Build every prop.
 * @param doc - owning document.
 * @returns each prop keyed by its kind.
 */
export function buildProps(doc: Document): Record<string, PropShape> {
  return {
    think: buildThink(doc),
    speak: buildSpeak(doc),
    ball: buildBall(doc),
    ask: buildAsk(doc),
    bang: buildBang(doc),
    glass: buildGlass(doc),
    pencil: buildPencil(doc),
    wrench: buildWrench(doc),
    files: buildFiles(doc),
  }
}
