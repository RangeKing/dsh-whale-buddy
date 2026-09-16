/**
 * Surface A: the whale inside DSH's running-turn status row.
 *
 * Attachment, relabelling and restoration are covered in `status-anchor.test.mjs`;
 * what is tested here is the whale itself once it is in there — that it is the
 * official mark, that it never changes size, that its numbers stay finite, and
 * that it stops cleanly.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness, numbersIn } from './harness.mjs'

const DEEP_DIVING = '深度求索中...'
const HOST = '[data-whale-buddy-status]'

/** Build a stand-in for DSH's running-turn status row. */
function addStatus(harness, label = DEEP_DIVING) {
  const status = harness.document.createElement('div')
  status.setAttribute('role', 'status')
  status.textContent = label
  harness.document.body.appendChild(status)
  return status
}

/** Mount the status whale into a fresh harness with one status row. */
function mount(options = {}) {
  const harness = createHarness(options.harness)
  const status = addStatus(harness, options.label)
  const whale = harness.client.mountStatusWhale({
    document: harness.document,
    match: options.match ?? ((text) => text.includes('深度求索')),
    size: options.size ?? 20,
    motion: options.motion ?? 'full',
    activity: options.activity ?? { state: 'thinking' },
    word: options.word ?? DEEP_DIVING,
    random: harness.client.seededRandom(7),
  })
  return { harness, status, whale, host: () => status.querySelector(HOST) }
}

test('one decorative whale, first in the row, not announced twice', () => {
  const { harness, status, whale, host } = mount()
  assert.equal(whale.isAttached(), true)
  assert.equal(status.querySelectorAll(HOST).length, 1)
  assert.equal(host().getAttribute('aria-hidden'), 'true')
  // The row is already an aria-live region; the word carries the meaning.
  assert.equal(status.firstChild, host())
  harness.close()
})

test('renders a valid whale mark with the official geometry', () => {
  const { harness, host } = mount()
  const svg = host().querySelector('svg')
  assert.ok(svg, 'the surface renders an svg')
  assert.equal(svg.getAttribute('aria-hidden'), 'true')
  const [minX, minY] = svg.getAttribute('viewBox').split(' ').map(Number)
  assert.ok(minX < 0 && minY < 0, 'the viewBox carries no motion headroom')
  // silhouette + hollow + cheek + eye. One copy each, and all of them inside
  // the mask — plugin-authored props are drawn outside it, never mixed in.
  assert.equal(svg.querySelectorAll('mask path').length, 4)
  assert.equal(svg.querySelectorAll('mask').length, 1)
  assert.equal(svg.querySelectorAll('clipPath').length, 0)
  assert.ok(svg.querySelector('rect[mask]'), 'the mark is painted through its mask')
  harness.close()
})

test('two status rows get two independent whales', () => {
  const harness = createHarness()
  const a = addStatus(harness, '深度求索中...')
  const b = addStatus(harness, 'Deep diving...')
  const first = harness.client.mountStatusWhale({
    document: harness.document, match: (t) => t.includes('深度求索'),
    size: 18, motion: 'full', activity: { state: 'thinking' }, word: '深度求索中...',
  })
  const second = harness.client.mountStatusWhale({
    document: harness.document, match: (t) => t.includes('Deep diving'),
    size: 24, motion: 'full', activity: { state: 'thinking' }, word: 'Deep diving...',
  })
  assert.equal(harness.document.querySelectorAll(HOST).length, 2)
  assert.equal(a.querySelectorAll(HOST).length, 1)
  assert.equal(b.querySelectorAll(HOST).length, 1)
  first.destroy()
  assert.equal(a.querySelectorAll(HOST).length, 0)
  assert.equal(b.querySelectorAll(HOST).length, 1, 'destroying one took the other with it')
  second.destroy()
  harness.close()
})

test('every rendered number stays finite across a long run', () => {
  const { harness, host } = mount()
  for (let i = 0; i < 20; i++) {
    harness.advance(3000)
    for (const value of numbersIn(host())) {
      assert.ok(Number.isFinite(value), `non-finite attribute value: ${value}`)
    }
  }
  harness.close()
})

test('the element never changes size, so neither motion nor arrival reflows', () => {
  const { harness, host } = mount()
  const svg = host().querySelector('svg')
  const before = [svg.getAttribute('width'), svg.getAttribute('height')]
  // This sits in the transcript's own status line, one text row above the
  // composer. A drawing that grew and shrank with the swim would move the word
  // beside it on every frame. The motion bleed is inside the element, so a
  // moving whale is exactly as large as a still one.
  for (let i = 0; i < 40; i++) {
    harness.advance(700)
    assert.deepEqual(
      [svg.getAttribute('width'), svg.getAttribute('height')],
      before,
      'the drawing resized mid-animation',
    )
  }
  harness.close()
})

test('the whale is laid out as a fixed inline neighbour of the word', () => {
  const harness = createHarness()
  const css = harness.client.PLUGIN_CSS
  const rule = css.slice(css.indexOf('.wb-status {'), css.indexOf('.wb-status svg'))
  assert.match(rule, /display:\s*inline-flex/)
  // Never stretched or shrunk by the row's flex layout.
  assert.match(rule, /flex:\s*none/)
  // DSH blanks -webkit-text-fill-color on that row to clip a gradient to the
  // glyphs; inheriting it would paint the whale as nothing.
  assert.match(rule, /-webkit-text-fill-color:\s*currentColor/)
  harness.close()
})

test('a frame delta the size of a backgrounded tab does not jump the whale', () => {
  const { harness, whale } = mount()
  harness.advance(2000)
  const before = whale.view().engine.currentPose.bodyY
  // One 30-second frame, as a resumed tab delivers.
  harness.frame(30000)
  const after = whale.view().engine.currentPose.bodyY
  assert.ok(Number.isFinite(after))
  // Clamped to 0.1 s of simulation, so the pose can only have moved a little.
  const budget = harness.client.budgetFor(20)
  assert.ok(
    Math.abs(after - before) < budget.travel * 0.4,
    `pose jumped by ${Math.abs(after - before)} px`,
  )
  harness.close()
})

test('destroy stops the frame loop, removes the whale and gives DSH its label back', () => {
  const { harness, status, whale } = mount()
  harness.advance(200)
  assert.ok(harness.pendingFrames() > 0)
  whale.destroy()
  harness.advance(200)
  assert.equal(harness.pendingFrames(), 0, 'a frame was still queued after destroy')
  assert.equal(status.querySelectorAll(HOST).length, 0)
  assert.equal(status.textContent, DEEP_DIVING)
  harness.close()
})

test('a row that loses the whale to a re-render gets it back', async () => {
  const { harness, status, whale, host } = mount()
  harness.advance(200)
  // React re-rendering that row wipes the injected child; the anchor's observer
  // is the only reason the whale survives the elapsed clock ticking.
  host().remove()
  await new Promise((done) => setTimeout(done, 0))
  assert.equal(status.querySelectorAll(HOST).length, 1, 'the whale did not come back')
  assert.equal(whale.isAttached(), true)
  whale.destroy()
  harness.close()
})

test('resizing rewrites the drawing without rebuilding it', () => {
  const { harness, whale, host } = mount({ size: 18 })
  const svg = host().querySelector('svg')
  const before = svg.getAttribute('width')
  whale.setSize(24)
  assert.equal(host().querySelector('svg'), svg, 'the svg element was replaced')
  assert.notEqual(svg.getAttribute('width'), before)
  harness.close()
})

test('the breach fits in the drawing, and the drawing fits in DSH row', () => {
  const { harness, whale, host, status } = mount({ size: 26 })
  const svg = host().querySelector('svg')
  const element = {
    w: Number(svg.getAttribute('width')),
    h: Number(svg.getAttribute('height')),
  }
  // The element carries the leap's headroom, so it is much taller than the mark.
  const markHeight = (26 * 17.04) / 23.16
  assert.ok(element.h > markHeight * 2, 'the drawing has no room for an arc')

  // ...and the negative margins hand exactly the mark's box back to layout, so
  // DSH's 26 px status row does not grow when a turn starts.
  const span = host()
  const bleed = whale.view().renderer.bleedPx
  assert.ok(Math.abs(bleed.y - (element.h - markHeight) / 2) < 0.02, 'the reported bleed is not the real one')
  assert.equal(span.style.marginTop, `${-bleed.y}px`)
  assert.equal(span.style.marginLeft, `${-bleed.x}px`)
  const marginBox = { w: element.w - bleed.x * 2, h: element.h - bleed.y * 2 }
  assert.ok(Math.abs(marginBox.w - 26) < 0.02, `the span contributes ${marginBox.w}px of width, not the mark's 26`)
  assert.ok(Math.abs(marginBox.h - markHeight) < 0.02, `the span contributes ${marginBox.h}px of height`)
  const gap = Number.parseFloat(span.style.marginRight) + bleed.x
  assert.ok(gap > 2 && gap < 9, `the optical gap to the word is ${gap}px`)

  // The drawing must not resize while the arc plays: a growing element in a
  // flex row moves the word beside it on every frame.
  whale.view().leap()
  for (let i = 0; i < 100; i++) {
    harness.advance(16)
    assert.equal(Number(svg.getAttribute('height')), element.h, 'the drawing resized mid-breach')
    assert.equal(Number(svg.getAttribute('width')), element.w)
  }
  assert.equal(status.querySelectorAll(HOST).length, 1)
  harness.close()
})

test('the breach plays once per turn, not once per re-render', async () => {
  const { harness, whale, host, status } = mount()
  assert.equal(whale.view().engine.isLeaping, true, 'mounting into a running turn did not breach')
  harness.advance(2000)
  assert.equal(whale.view().engine.isLeaping, false)

  // React replacing the row rebuilds the drawing. That must not replay the
  // arc: the row re-renders about once a second once the elapsed clock starts,
  // and a whale that breached on every one of those would be a strobe.
  for (let i = 0; i < 3; i++) {
    host().remove()
    await new Promise((done) => setTimeout(done, 0))
    harness.advance(50)
    assert.equal(whale.view().engine.isLeaping, false, 'a re-render replayed the breach')
  }
  assert.equal(status.querySelectorAll(HOST).length, 1)
  harness.close()
})
