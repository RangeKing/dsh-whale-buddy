/**
 * The props: the artwork the whale carries, and where it hangs.
 *
 * Two things are being defended here that no motion test can see. The first is
 * the pixel floor — the project's standing rule is that a channel which cannot
 * pass one is an absent channel, and it applies to artwork exactly as it does
 * to motion, because a two-pixel detail on a ten-pixel icon is not a subtle
 * detail. The second is the licensing boundary: every one of these is
 * plugin-authored, drawn outside the mark, and — with one deliberate,
 * documented exception — monochrome in DSH's own ink.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

/** The size the inline whale ships at. */
const SIZE = 26

/** CSS pixels per viewBox unit at that size. */
const PX = SIZE / 23.16

/** Every prop, and the state or task that asks for it. */
const PROPS = ['think', 'speak', 'ball', 'ask', 'bang', 'glass', 'pencil', 'wrench', 'files']

/** Mount a renderer and index its prop groups by kind. */
function propsOf(harness) {
  const renderer = harness.client.createWhaleRenderer({ size: SIZE, document: harness.document })
  const found = new Map()
  for (const g of renderer.svg.querySelectorAll('[data-wb-prop]')) {
    found.set(g.getAttribute('data-wb-prop'), g)
  }
  return { renderer, found }
}

test('every state and task has a prop, and every prop is drawn', () => {
  const harness = createHarness()
  const { propFor, anchorFor } = harness.client
  const wanted = new Set()
  for (const state of ['idle', 'thinking', 'responding', 'waiting', 'error', 'compacting']) {
    const kind = propFor({ state })
    if (kind !== null) wanted.add(kind)
  }
  for (const task of [undefined, 'reading', 'editing', 'running', 'searching', 'delegating']) {
    wanted.add(propFor(task === undefined ? { state: 'working' } : { state: 'working', task }))
  }
  const { found } = propsOf(harness)
  for (const kind of wanted) assert.ok(found.has(kind), `${kind} is asked for but never drawn`)
  for (const kind of PROPS) assert.ok(found.has(kind), `${kind} is drawn nowhere`)
  // Only the file stream hangs below; everything else is on the head.
  assert.equal(anchorFor('files'), 'belly')
  for (const kind of PROPS.filter((k) => k !== 'files')) assert.equal(anchorFor(kind), 'head')
  harness.close()
})

test('no prop feature is finer than a pixel at the size it ships at', () => {
  const harness = createHarness()
  const { found } = propsOf(harness)
  for (const kind of PROPS) {
    const group = found.get(kind)
    const inks = []
    for (const node of group.querySelectorAll('*')) {
      const stroke = node.getAttribute('stroke-width')
      if (stroke !== null) inks.push(Number(stroke))
      const r = node.getAttribute('r')
      // A stroked circle's ink is its stroke; a filled one's is its diameter.
      if (r !== null && node.getAttribute('fill') !== 'none' && stroke === null) {
        inks.push(Number(r) * 2)
      }
      // A filled path's ink is the narrow side of the shape it encloses. These
      // are all polygons, so the coordinate list is the outline.
      const d = node.getAttribute('d')
      if (d !== null && stroke === null && node.getAttribute('fill') !== 'none') {
        const numbers = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
        const xs = numbers.filter((_, i) => i % 2 === 0)
        const ys = numbers.filter((_, i) => i % 2 === 1)
        inks.push(Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
      }
    }
    assert.ok(inks.length > 0, `${kind} has no measurable ink`)
    const finest = Math.min(...inks) * PX
    // Below about a pixel of ink the feature is a grey smudge on a screen and
    // gone entirely on a low-DPI one. The props were simplified until they
    // passed this — that is why the brain is three dots and the bricklayer is
    // a ball.
    assert.ok(finest >= 1, `${kind}'s finest feature is ${finest.toFixed(2)} px`)
  }
  harness.close()
})

test('the props are monochrome, except the one where colour is the message', () => {
  const harness = createHarness()
  const { found } = propsOf(harness)
  for (const kind of PROPS) {
    for (const node of found.get(kind).querySelectorAll('*')) {
      for (const attribute of ['fill', 'stroke']) {
        const value = node.getAttribute(attribute)
        if (value === null || value === 'none') continue
        if (kind === 'bang') {
          // The one colour in the plugin. An error is the state where the
          // colour *is* the message — it says "something went wrong" before
          // any ten-pixel shape has been read — and at this size the straight
          // stroke alone is too close to the question mark's hook to carry it.
          assert.equal(value, harness.client.ERROR_INK, 'the error mark lost its red')
          continue
        }
        assert.equal(value, 'currentColor', `${kind} hard-codes a ${attribute}: ${value}`)
      }
    }
  }
  harness.close()
})

test('the file stream runs right to left under the belly, fading in and out', () => {
  const harness = createHarness()
  const { renderer, found } = propsOf(harness)
  const { NEUTRAL_POSE, NO_EFFECTS, FILE_SPAN } = harness.client
  const files = found.get('files')

  /** Draw one frame of the stream at a phase and read the cards back. */
  const at = (phase) => {
    renderer.apply(NEUTRAL_POSE, {
      ...NO_EFFECTS,
      prop: { kind: 'files', reveal: 1, dx: 0, dy: 0, rotation: 0, squash: 1, phase },
    })
    return [...files.children].map((card) => ({
      x: Number(/translate\((-?[\d.]+)/.exec(card.getAttribute('transform'))[1]),
      opacity: Number(card.getAttribute('opacity')),
    }))
  }

  const start = at(0)
  assert.ok(start.length >= 3, 'a stream of one thing is not a stream')
  for (const card of start) assert.ok(Math.abs(card.x) <= FILE_SPAN + 1e-6, 'a card left its run')

  // Right to left, which is the direction reading goes and the direction a
  // queue drains. Sampled on one card across a phase step small enough that it
  // cannot have wrapped.
  const later = at(0.05)
  assert.ok(later[0].x < start[0].x, 'the stream ran the wrong way')

  // Fading at both ends: a card that pops into existence at the edge of the
  // run reads as a glitch, not as something arriving.
  const edge = at(0.001)
  const middle = at(0.25)
  assert.ok(edge[0].opacity < 0.05, `a card appeared at ${edge[0].opacity.toFixed(2)} opacity`)
  assert.ok(middle[0].opacity > 0.9, 'a card never reached full opacity mid-run')

  // And it hangs below the mark rather than over the head, because a stream
  // needs a run to go past along and the run that exists is the whale's width.
  const anchor = Number(/translate\([-\d.]+ (-?[\d.]+)\)/.exec(files.getAttribute('transform'))[1])
  assert.ok(anchor > 17.04, `the stream sits at y ${anchor}, inside the mark`)
  harness.close()
})
