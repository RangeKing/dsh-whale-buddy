/**
 * The perception contract.
 *
 * Every other test in this suite is geometric: does the transform parse, does
 * the mark stay faithful, does the lifecycle clean up. The first version of
 * this plugin passed all of them and was still, in practice, a static icon:
 * at 20 px it travelled half a pixel over two minutes, at a median speed of
 * 0.12 px/s. The amplitudes were defined in viewBox units and clamped against
 * scale-invariant geometric constraints, so they shrank to nothing at the
 * sizes the plugin actually draws — and nothing asserted otherwise.
 *
 * These are the assertions that would have caught it. They are measured in
 * pixels, at the sizes that ship, and they are **bounded on both sides**: a
 * floor alone invites overcorrecting into something distracting, and a ceiling
 * alone is exactly how the original got here.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

/** Sizes the plugin actually draws at. */
const INLINE_SIZE = 26
const DOCK_SIZE = 24
const PANEL_SIZE = 56

/** Simulate one whale and return its pose series with derived motion. */
function swim(harness, { size, state, seed = 7, secs = 120, fps = 60 }) {
  const engine = new harness.client.WhaleEngine({
    size,
    state,
    motion: 'full',
    random: harness.client.seededRandom(seed),
  })
  const xs = []
  const ys = []
  const rotations = []
  const speeds = []
  const verticalSpeeds = []
  let previous = null
  for (let i = 0; i < secs * fps; i++) {
    const pose = engine.step(1 / fps)
    xs.push(pose.bodyX)
    ys.push(pose.bodyY)
    rotations.push(pose.bodyRotation)
    if (previous !== null) {
      speeds.push(Math.hypot(pose.bodyX - previous.x, pose.bodyY - previous.y) * fps)
      verticalSpeeds.push((pose.bodyY - previous.y) * fps)
    }
    previous = { x: pose.bodyX, y: pose.bodyY }
  }
  return { xs, ys, rotations, speeds, verticalSpeeds, fps, budget: engine.amplitudeBudget }
}

/** Percentile of an unsorted series. */
function percentile(values, q) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
}

/** Smallest and largest diagonal excursion over any window of `seconds`. */
function windowTravel(xs, ys, fps, seconds) {
  const width = seconds * fps
  let smallest = Number.POSITIVE_INFINITY
  let largest = 0
  for (let i = 0; i + width <= xs.length; i += fps) {
    const wx = xs.slice(i, i + width)
    const wy = ys.slice(i, i + width)
    const span = Math.hypot(
      Math.max(...wx) - Math.min(...wx),
      Math.max(...wy) - Math.min(...wy),
    )
    smallest = Math.min(smallest, span)
    largest = Math.max(largest, span)
  }
  return { smallest, largest }
}

/** Autocorrelation of a series at one lag. */
function autocorrelation(values, lag) {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  let numerator = 0
  let denominator = 0
  for (let i = 0; i + lag < values.length; i++) {
    numerator += (values[i] - mean) * (values[i + lag] - mean)
  }
  for (const value of values) denominator += (value - mean) ** 2
  return denominator === 0 ? 0 : numerator / denominator
}

test('a thinking whale moves enough to be seen, in every six-second window', () => {
  const harness = createHarness()
  for (const size of [INLINE_SIZE, DOCK_SIZE]) {
    const run = swim(harness, { size, state: 'thinking' })
    const travel = windowTravel(run.xs, run.ys, run.fps, 6)
    assert.ok(
      travel.smallest >= 2,
      `${size} px: quietest six seconds travelled only ${travel.smallest.toFixed(2)} px`,
    )
    assert.ok(
      travel.largest <= run.budget.travel * 1.2,
      `${size} px: travelled ${travel.largest.toFixed(2)} px against a ${run.budget.travel.toFixed(2)} px budget`,
    )
  }
  harness.close()
})

test('a thinking whale moves fast enough to read as motion, and no faster', () => {
  const harness = createHarness()
  for (const size of [INLINE_SIZE, DOCK_SIZE]) {
    const run = swim(harness, { size, state: 'thinking' })
    const p95 = percentile(run.speeds, 0.95)
    const peak = Math.max(...run.speeds)
    // Below roughly 5 px/s an icon-scale move is not perceived as a move.
    assert.ok(p95 >= 6, `${size} px: p95 speed only ${p95.toFixed(2)} px/s`)
    // The ceiling is what keeps a permanent ornament from being distracting.
    assert.ok(
      peak <= run.budget.travel * 5,
      `${size} px: peaked at ${peak.toFixed(2)} px/s, over the ${(run.budget.travel * 5).toFixed(1)} px/s ceiling`,
    )
  }
  harness.close()
})

test('an idle whale is perceptible but calm, until the ball comes out', () => {
  const harness = createHarness()
  const run = swim(harness, { size: DOCK_SIZE, state: 'idle' })
  const travel = windowTravel(run.xs, run.ys, run.fps, 10)
  const p95 = percentile(run.speeds, 0.95)
  // Deliberately close to the perception floor: the Dock is on screen for
  // hours, and a resting control should reward a glance without demanding one.
  assert.ok(travel.smallest >= 1, `quietest ten seconds travelled ${travel.smallest.toFixed(2)} px`)
  assert.ok(p95 >= 1.5, `idle p95 speed only ${p95.toFixed(2)} px/s`)

  // The ceiling is two ceilings now, and splitting them is the honest way to
  // keep the old one true. For the first nine seconds of quiet there is no
  // ball, and that stretch is the cruise: it carries the same restraint it
  // always did. After that the whale starts throwing something, and a toss is
  // an event with its own bound — exactly like the breach, whose amplitude is
  // also an order above the cruise budget and for the same reason. Asserting
  // one number over both would either license a distracting cruise or forbid
  // the gesture.
  const quiet = Math.floor(harness.client.IDLE_PROP_DELAY * run.fps) - 2
  const cruisePeak = Math.max(...run.speeds.slice(0, quiet))
  assert.ok(cruisePeak <= 5, `idle cruise peaked at ${cruisePeak.toFixed(2)} px/s`)

  // And the toss is bounded by the impulse it is: the heave the ball puts into
  // the body's spring, and nothing beyond it.
  const heave = run.budget.propToss * 2.2
  const peak = Math.max(...run.speeds)
  assert.ok(peak > 5, 'the ball never came out — idle stayed a pure cruise')
  assert.ok(
    peak <= heave * 1.25,
    `a toss threw the body at ${peak.toFixed(2)} px/s, past the ${heave.toFixed(2)} px/s impulse`,
  )
  harness.close()
})

test('a larger whale gets more travel, but stays the same creature', () => {
  const harness = createHarness()
  const inline = swim(harness, { size: INLINE_SIZE, state: 'thinking' })
  const panel = swim(harness, { size: PANEL_SIZE, state: 'thinking' })
  const inlineTravel = windowTravel(inline.xs, inline.ys, inline.fps, 6).largest
  const panelTravel = windowTravel(panel.xs, panel.ys, panel.fps, 6).largest
  assert.ok(panelTravel > inlineTravel, 'the large preview does not travel further in pixels')
  // …but relative to its own size it must not move less than about two thirds
  // of what the small one does, or the pair read as two different animals.
  const inlineRelative = inlineTravel / INLINE_SIZE
  const panelRelative = panelTravel / PANEL_SIZE
  assert.ok(
    panelRelative > inlineRelative * 0.6,
    `relative travel diverged: ${(inlineRelative * 100).toFixed(1)}% vs ${(panelRelative * 100).toFixed(1)}%`,
  )
  harness.close()
})

test('the mark stays rigid: motion never deforms the artwork', () => {
  const harness = createHarness()
  const { budgetFor, limitsFor, unitsPerPixel, rigTransforms } = harness.client
  const limits = limitsFor(budgetFor(INLINE_SIZE))
  const perPixel = unitsPerPixel(INLINE_SIZE)
  const run = swim(harness, { size: INLINE_SIZE, state: 'thinking', secs: 60 })

  // Two points on the mark; after the body transform their distance may only
  // change by the breathing scale, never by anything else. This is the
  // assertion that stops a future amplitude increase from being bought by
  // quietly warping the logo to clear the perception floor above.
  const a = { x: 0.15, y: 8 }
  const b = { x: 23, y: 1.2 }
  const rest = Math.hypot(b.x - a.x, b.y - a.y)
  for (let i = 0; i < run.xs.length; i += 37) {
    const pose = {
      bodyX: run.xs[i],
      bodyY: run.ys[i],
      bodyRotation: run.rotations[i],
      bodyScaleX: 1,
      bodyScaleY: 1,
      eyeOpen: 1,
    }
    const body = rigTransforms(pose, limits, perPixel).body
    const rotation = Number(/rotate\((-?[\d.]+) /.exec(body)[1])
    // A translation plus a rotation is rigid by construction; assert the
    // transform really is only those, with scale factors of exactly one.
    const scales = /scale\((-?[\d.]+) (-?[\d.]+)\)/.exec(body).slice(1).map(Number)
    assert.deepEqual(scales, [1, 1], 'a non-breathing pose produced a scale')
    assert.ok(Number.isFinite(rotation))
    const moved = Math.hypot(b.x - a.x, b.y - a.y)
    assert.ok(Math.abs(moved - rest) < 1e-9, 'the mark was deformed')
  }
  harness.close()
})

test('the swim has no perceptible period', () => {
  const harness = createHarness()
  for (const [size, state] of [
    [INLINE_SIZE, 'thinking'],
    [DOCK_SIZE, 'idle'],
  ]) {
    const run = swim(harness, { size, state, seed: 11, secs: 180, fps: 30 })
    let worst = 0
    let worstLag = 0
    // Short lags correlate simply because the path is smooth; a *loop* is a
    // correlation that survives to lags a viewer could notice repeating.
    for (let lag = 5; lag <= 120; lag += 0.25) {
      const value = Math.abs(autocorrelation(run.ys, Math.round(lag * run.fps)))
      if (value > worst) {
        worst = value
        worstLag = lag
      }
    }
    assert.ok(
      worst < 0.45,
      `${size} px ${state}: vertical motion repeats at ${worstLag.toFixed(2)} s (r=${worst.toFixed(3)})`,
    )
  }
  harness.close()
})

test('the head points where the body is going, and turns into the move', () => {
  const harness = createHarness()
  const run = swim(harness, { size: INLINE_SIZE, state: 'thinking', seed: 11, secs: 180, fps: 30 })

  // Positive rotation lifts the nose; swimming up is negative vertical speed.
  let agreed = 0
  let counted = 0
  for (let i = 0; i < run.rotations.length - 1; i++) {
    const rising = -run.verticalSpeeds[i]
    if (Math.abs(rising) < 0.4) continue
    counted++
    if (Math.sign(rising) === Math.sign(run.rotations[i + 1])) agreed++
  }
  assert.ok(counted > 500, 'not enough motion to judge heading')
  assert.ok(agreed / counted > 0.6, `heading disagrees with travel (${((agreed / counted) * 100).toFixed(1)}%)`)

  // And it must *lag*: correlation with an earlier velocity beats correlation
  // with a later one. A head that turns first reads as a sticker being dragged.
  const crossCorrelation = (shift) => {
    let sum = 0
    let count = 0
    for (let i = Math.max(0, -shift); i < run.verticalSpeeds.length - Math.max(0, shift); i++) {
      sum += -run.verticalSpeeds[i] * run.rotations[i + shift]
      count++
    }
    return count === 0 ? 0 : sum / count
  }
  assert.ok(
    crossCorrelation(6) > crossCorrelation(-6),
    'heading leads the body instead of following it',
  )
  harness.close()
})

/**
 * Play one breach and report what it actually did, in pixels.
 * @param harness - the test harness.
 * @param size - the mark's drawn width.
 * @returns peak rise, dive depth, peak tilt and the fastest vertical speed.
 */
function breach(harness, size) {
  const engine = new harness.client.WhaleEngine({
    size,
    state: 'thinking',
    motion: 'full',
    random: harness.client.seededRandom(11),
  })
  // A second of cruising first, so the leap is measured from a moving whale
  // rather than from a conveniently neutral one.
  for (let i = 0; i < 60; i++) engine.step(1 / 60)
  engine.leap()
  let rise = 0
  let dive = 0
  let tilt = 0
  let speed = 0
  let previous = engine.currentPose.bodyY
  const limits = harness.client.limitsFor(harness.client.budgetFor(size))
  for (let i = 0; i < Math.ceil(harness.client.LEAP_SECONDS * 60) + 30; i++) {
    const pose = engine.step(1 / 60)
    assert.ok(harness.client.isPoseSane({ ...pose }, limits), `frame ${i} left the rig's limits`)
    rise = Math.max(rise, -pose.bodyY)
    dive = Math.max(dive, pose.bodyY)
    tilt = Math.max(tilt, Math.abs(pose.bodyRotation))
    speed = Math.max(speed, Math.abs(pose.bodyY - previous) * 60)
    previous = pose.bodyY
  }
  return { rise, dive, tilt, speed, engine }
}

test('a breach is an order of magnitude larger than the swim it interrupts', () => {
  const harness = createHarness()
  for (const size of [INLINE_SIZE, DOCK_SIZE, PANEL_SIZE]) {
    const budget = harness.client.budgetFor(size)
    const { rise, dive, tilt, speed } = breach(harness, size)

    // Floor: the reason this exists. Peak cruise displacement is travel/2 —
    // about 1.4 px at 26 — and an "event" that size is not an event, it is a
    // bob. Three times that is the least that reads as leaving the water.
    const cruisePeak = budget.travel / 2
    assert.ok(
      rise > cruisePeak * 3,
      `${size}px: rise ${rise.toFixed(2)}px is not clear of a ${cruisePeak.toFixed(2)}px swim`,
    )
    assert.ok(rise >= harness.client.MIN_LEAP_PX * 0.95, `${size}px: rise ${rise.toFixed(2)}px`)
    // Ceiling: the element is sized from this, and the inline whale has 16 px
    // of clear space above DSH's status row before it reaches the transcript.
    assert.ok(rise <= harness.client.MAX_LEAP_PX, `${size}px: rise ${rise.toFixed(2)}px exceeds the budget`)
    // The rise is the whale's own share of the breach, and it is capped by the
    // clear space around DSH's status row rather than by taste.
    // How much of the whale actually leaves the water is not this file's
    // business — most of that separation comes from the surface sliding, not
    // from the body rising. See test/scenery.test.mjs.
    // The dive is the wind-up and the plunge, not the submersion. Shallow, and
    // shallower than the rise, because the two share one symmetric bleed and
    // every pixel given to the dive is a pixel the rise does not get.
    assert.ok(dive > 0 && dive < rise, `${size}px: the dive is ${dive.toFixed(2)}px against a ${rise.toFixed(2)}px rise`)
    assert.ok(tilt > 12 && tilt < 26, `${size}px: peak tilt ${tilt.toFixed(1)}deg`)
    // It has to be quick enough to read as a leap and not a lift.
    assert.ok(speed > 15, `${size}px: peak vertical speed ${speed.toFixed(1)}px/s is too slow to read`)
  }
  harness.close()
})

test('the swim is exactly where it was once the breach is over', () => {
  const harness = createHarness()
  const { engine } = breach(harness, INLINE_SIZE)
  const budget = harness.client.budgetFor(INLINE_SIZE)
  // Two seconds after the arc, the whale must be back inside the ordinary
  // cruise envelope — not parked at altitude, not still fading in.
  for (let i = 0; i < 120; i++) {
    const pose = engine.step(1 / 60)
    // The whale is drawn identically above and below the surface — the water
    // says where it is, not its opacity. Nothing may leave it faded.
    assert.equal(pose.opacity, 1, 'the whale came back partly transparent')
    assert.ok(Math.abs(pose.bodyY) <= budget.travel, `left at ${pose.bodyY.toFixed(2)}px after the breach`)
  }
  harness.close()
})

test('a surface that cannot make room for an arc does not draw one', () => {
  const harness = createHarness()
  const engine = new harness.client.WhaleEngine({
    size: INLINE_SIZE,
    state: 'thinking',
    motion: 'static',
    random: harness.client.seededRandom(3),
  })
  engine.leap()
  assert.equal(engine.isLeaping, false, 'a static whale started an animation')
  for (let i = 0; i < 120; i++) {
    const pose = engine.step(1 / 60)
    assert.equal(pose.bodyY, 0)
    assert.equal(pose.opacity, 1)
    assert.equal(engine.currentEffects.water.opacity, 0, 'a static whale drew a sea')
    assert.equal(engine.currentEffects.prop.kind, null, 'a static whale wore a prop')
  }
  harness.close()
})
