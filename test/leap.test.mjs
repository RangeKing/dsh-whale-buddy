/**
 * The breach.
 *
 * This is the one animation in the project that is authored rather than
 * produced by a spring chasing a waypoint, which means it is the one animation
 * whose shape nothing else constrains. So its shape is what gets asserted:
 * that it sinks before it launches, that it peaks where it says it does, that
 * it crosses the water line exactly twice — once out, once in — and that it
 * hands back to the cruise at rest rather than mid-air.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

/** Sample the whole arc at a fixed rate. */
function arc(client, steps = 400) {
  const { leapAt, LEAP_SECONDS } = client
  const out = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * LEAP_SECONDS
    out.push({ t, ...leapAt(t) })
  }
  return out
}

test('the whale sinks and gathers before it launches', () => {
  const harness = createHarness()
  const samples = arc(harness.client)
  const first = samples[0]
  assert.equal(first.height, 0, 'the arc does not start at the surface')

  // The wind-up: an early trough well below the line, before anything rises.
  const early = samples.filter((s) => s.t < harness.client.LEAP_SECONDS * 0.2)
  const dip = early.reduce((best, s) => (s.height < best.height ? s : best))
  assert.ok(dip.height < -0.4, `the wind-up only reaches ${dip.height.toFixed(2)}`)
  assert.ok(dip.height >= -1, 'the wind-up goes deeper than the dive it shares a budget with')
  harness.close()
})

test('the arc peaks at 1, bottoms at -1, and ends back on the surface', () => {
  const harness = createHarness()
  const samples = arc(harness.client)
  const peak = samples.reduce((best, s) => (s.height > best.height ? s : best))
  assert.ok(Math.abs(peak.height - 1) < 1e-6, `the peak is ${peak.height}, not 1`)

  const deepest = samples.reduce((best, s) => (s.height < best.height ? s : best))
  assert.ok(Math.abs(deepest.height + 1) < 1e-6, `the dive bottoms at ${deepest.height}, not -1`)
  assert.ok(deepest.t > peak.t, 'the whale dives before it leaps')

  const last = harness.client.leapAt(harness.client.LEAP_SECONDS * 0.9999)
  assert.ok(Math.abs(last.height) < 0.02, `the arc ends at ${last.height}, not at the water line`)
  harness.close()
})

test('the curve is continuous, so no phase boundary shows as a jump', () => {
  const harness = createHarness()
  const samples = arc(harness.client, 2000)
  let worst = 0
  for (let i = 1; i < samples.length; i++) {
    worst = Math.max(worst, Math.abs(samples[i].height - samples[i - 1].height))
  }
  // Four phases meet inside this curve; a mismatched boundary would show up
  // here as a step far larger than the fastest legitimate frame.
  assert.ok(worst < 0.02, `a discontinuity of ${worst.toFixed(4)} between samples`)
  harness.close()
})

test('the surface is crossed exactly twice: out, then in', () => {
  const harness = createHarness()
  const { crossingBetween } = harness.client
  const samples = arc(harness.client, 2000)
  const crossings = []
  for (let i = 1; i < samples.length; i++) {
    const c = crossingBetween(samples[i - 1].height, samples[i].height)
    if (c !== null) crossings.push({ kind: c, t: samples[i].t })
  }
  assert.deepEqual(crossings.map((c) => c.kind), ['exit', 'entry'])
  assert.ok(crossings[0].t < crossings[1].t)
  // Both crossings are the splash's only trigger, so they must sit inside the
  // arc rather than at its very edges where the water is still drawing itself.
  const span = harness.client.LEAP_SECONDS
  assert.ok(crossings[0].t > span * 0.15 && crossings[0].t < span * 0.35)
  assert.ok(crossings[1].t > span * 0.6 && crossings[1].t < span * 0.8)
  harness.close()
})

test('the nose follows the path rather than being pointed independently', () => {
  const harness = createHarness()
  const { heightAt, leapAt, LEAP_SECONDS } = harness.client
  // Compared against the curve's own local slope. Two phase boundaries are
  // deliberately not smooth — the launch is an impulse, and the bottom of the
  // dive turns around — so a wide difference straddling one of them says the
  // whale is going the other way while it visibly is not.
  const e = 1 / 240
  for (let i = 1; i < 400; i++) {
    const u = i / 400
    const slope = heightAt(u + e) - heightAt(u - e)
    if (Math.abs(slope) < 1e-5) continue
    const { tilt } = leapAt(u * LEAP_SECONDS)
    assert.ok(
      Math.sign(tilt) === Math.sign(slope),
      `at u=${u.toFixed(3)} the nose points ${tilt > 0 ? 'up' : 'down'} while ${slope > 0 ? 'rising' : 'falling'}`,
    )
  }

  // And the claim that actually matters to a viewer: nose up on the way out,
  // nose down on the way in.
  const climb = leapAt(LEAP_SECONDS * 0.3)
  const fall = leapAt(LEAP_SECONDS * 0.68)
  assert.ok(climb.tilt > 0.3, `climbing with tilt ${climb.tilt.toFixed(2)}`)
  assert.ok(fall.tilt < -0.3, `falling with tilt ${fall.tilt.toFixed(2)}`)
  harness.close()
})

test('outside its window the breach contributes nothing at all', () => {
  const harness = createHarness()
  const { leapAt, LEAP_SECONDS } = harness.client
  for (const t of [-1, -0.0001, LEAP_SECONDS, LEAP_SECONDS + 5, NaN, Infinity]) {
    assert.deepEqual({ ...leapAt(t) }, { height: 0, tilt: 0, active: false }, `at t=${t}`)
  }
  harness.close()
})
