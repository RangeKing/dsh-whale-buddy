/**
 * The artwork contract: the shipped bundle must still contain the official
 * mark, unedited, and must still reproduce it exactly at the neutral pose.
 *
 * These digests are the tripwire. `scripts/derive-geometry.mjs` checks the
 * constants against a real `FishLogo.tsx`; this checks that what was verified
 * there is what actually ships, without needing the harness checkout present.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { BUNDLE, createHarness } from './harness.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** sha256 (first 12 hex) of each subpath of the official mark, in source order. */
const EXPECTED = {
  PATH_SILHOUETTE: '0200f9f4aea9',
  PATH_HOLLOW: 'e2e9785724bc',
  PATH_EYE: 'c0184c4c34d3',
  PATH_CHEEK: '1dee914882ec',
}

test('the source constants are the official mark, byte for byte', () => {
  const source = readFileSync(resolve(root, 'src/client/whale/geometry.ts'), 'utf8')
  for (const [name, digest] of Object.entries(EXPECTED)) {
    const match = new RegExp(`${name} =\\s*\\n?\\s*'([^']+)'`).exec(source)
    assert.ok(match, `${name} is missing from geometry.ts`)
    assert.equal(
      createHash('sha256').update(match[1]).digest('hex').slice(0, 12),
      digest,
      `${name} no longer matches the official mark`,
    )
  }
})

test('the shipped bundle carries the same four subpaths', () => {
  const source = readFileSync(resolve(root, 'src/client/whale/geometry.ts'), 'utf8')
  for (const name of Object.keys(EXPECTED)) {
    const match = new RegExp(`${name} =\\s*\\n?\\s*'([^']+)'`).exec(source)
    assert.ok(BUNDLE.includes(match[1]), `${name} did not survive the build`)
  }
})

test('the rendered mark draws the official geometry exactly once', () => {
  const harness = createHarness()
  const renderer = harness.client.createWhaleRenderer({ size: 64, document: harness.document })
  const ds = [...renderer.svg.querySelectorAll('mask path')].map((p) => p.getAttribute('d'))
  // Silhouette, hollow, cheek, eye — one copy each, and all four inside the
  // mask. An earlier rig drew the silhouette three times so two clip-split
  // limbs could rotate; that bought 0.6 px of motion on a 26 px whale and was
  // retired. The plugin's own props are drawn outside the mask, which is the
  // line this counts: official geometry in, authored artwork out.
  assert.equal(ds.length, 4)
  const authored = [...renderer.svg.querySelectorAll('path')].length - ds.length
  assert.ok(authored > 0, 'the props are gone')
  for (const d of [...renderer.svg.querySelectorAll('path')]
    .filter((p) => p.closest('mask') === null)
    // The water surface has no `d` until it is first drawn.
    .map((p) => p.getAttribute('d') ?? '')) {
    assert.ok(!d.startsWith('M22.9168'), 'the official silhouette is drawn outside the mask')
  }
  assert.equal(ds.filter((d) => d.startsWith('M22.9168')).length, 1, 'the silhouette is drawn once')
  assert.equal(ds.filter((d) => d.startsWith('M12.141 8.25988')).length, 1, 'the eye is drawn once')
  assert.equal(renderer.svg.querySelectorAll('clipPath').length, 0, 'a clip-split layer survived')
  harness.close()
})

test('viewBox headroom is derived per size, and `size` still means the mark', () => {
  const harness = createHarness()
  for (const size of [18, 26, 42, 56]) {
    const renderer = harness.client.createWhaleRenderer({ size, document: harness.document })
    const [minX, minY, width, height] = renderer.svg.getAttribute('viewBox').split(' ').map(Number)
    assert.ok(minX < 0 && minY < 0, `no headroom at ${size} px`)
    assert.ok(width > 23.16 && height > 17.04)
    // Travel is budgeted in pixels, so the headroom a big whale needs is a
    // smaller share of its own artwork than a small whale's.
    const elementWidth = Number(renderer.svg.getAttribute('width'))
    assert.ok(
      Math.abs((elementWidth * 23.16) / width - size) < 0.06,
      `size stopped meaning mark width at ${size} px`,
    )
  }
  harness.close()
})

test('the headroom contains every pose the rig will render', () => {
  const harness = createHarness()
  const { budgetFor, limitsFor, bleedFor, unitsPerPixel, rigTransforms } = harness.client
  // The bug this replaces: hand-written clamps allowed a pose the constant
  // bleed could not contain, so the tail was sheared off at the extremes.
  for (const size of [18, 20, 26, 42, 56]) {
    const limits = limitsFor(budgetFor(size))
    const perPixel = unitsPerPixel(size)
    const bleed = bleedFor(limits, perPixel)
    // One extreme per envelope, not one extreme over the union of them. A
    // breach and a compaction squeeze are mutually exclusive — the engine
    // suppresses the squeeze mid-arc — so the viewBox is sized for the larger
    // of the two rather than for a frame that combines a full arc with a full
    // stretch and can never be drawn.
    assert.ok(limits.envelopes.length >= 2, 'the limits lost their envelopes')
    for (const envelope of limits.envelopes) {
      const extreme = {
        bodyX: limits.travelXPx,
        bodyY: envelope.travelYPx,
        bodyRotation: limits.headingDeg,
        bodyScaleX: envelope.maxScale,
        bodyScaleY: envelope.maxScale,
        eyeOpen: 1,
      }
      const body = rigTransforms(extreme, limits, perPixel).body
      const [, tx, ty] = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(body).map(Number)
      const angle = (limits.headingDeg * Math.PI) / 180
      const hx = 11.58 * envelope.maxScale
      const hy = 8.52 * envelope.maxScale
      const reachX = Math.abs(tx) + hx * Math.cos(angle) + hy * Math.sin(angle)
      const reachY = Math.abs(ty) + hx * Math.sin(angle) + hy * Math.cos(angle)
      assert.ok(reachX <= 11.58 + bleed.x + 1e-6, `${size} px: pose reaches past the viewBox in x`)
      assert.ok(reachY <= 8.52 + bleed.y + 1e-6, `${size} px: pose reaches past the viewBox in y`)
    }
  }
  harness.close()
})
