/**
 * The motion engine, driven by a controlled clock and a seeded random source.
 * Nothing here depends on real timing or on `Math.random`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

/** The size the inline whale ships at; most assertions use it. */
const INLINE_SIZE = 26

/** A fresh engine on a seeded random source. */
function engineOf(harness, options = {}) {
  return new harness.client.WhaleEngine({
    size: options.size ?? INLINE_SIZE,
    state: options.state ?? 'thinking',
    motion: options.motion ?? 'full',
    random: harness.client.seededRandom(options.seed ?? 1234),
  })
}

/** Step an engine for `seconds` at a fixed frame rate, collecting poses. */
function run(engine, seconds, fps = 60) {
  const dt = 1 / fps
  const poses = []
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    const pose = engine.step(dt)
    poses.push({ ...pose })
  }
  return poses
}

test('a ten-minute run produces only finite, in-range poses', () => {
  const harness = createHarness()
  const limits = harness.client.limitsFor(harness.client.budgetFor(INLINE_SIZE))
  for (const state of ['idle', 'thinking']) {
    const engine = engineOf(harness, { state })
    for (const pose of run(engine, 600, 30)) {
      for (const [key, value] of Object.entries(pose)) {
        assert.ok(Number.isFinite(value), `${state}.${key} went non-finite: ${value}`)
      }
      // One assertion over the rig's own bounds, rather than a copy of them
      // that can drift out of step with what the renderer makes room for.
      assert.ok(harness.client.isPoseSane(pose, limits), `${state}: pose left the rig's range`)
    }
  }
  harness.close()
})

test('travel scales with the drawn size, between a floor and a ceiling', () => {
  const harness = createHarness()
  const { budgetFor, MIN_TRAVEL_PX, MAX_TRAVEL_PX } = harness.client
  // The whole point of the redesign: amplitude lives in pixels, because that
  // is the unit perception works in.
  assert.equal(budgetFor(10).travel, MIN_TRAVEL_PX, 'a tiny whale must still clear the floor')
  assert.equal(budgetFor(400).travel, MAX_TRAVEL_PX, 'a huge whale must stay the same creature')
  assert.ok(budgetFor(56).travel > budgetFor(24).travel, 'travel does not grow with size')
  const peak = (size) =>
    Math.max(...run(engineOf(harness, { size, seed: 21 }), 120, 30).map((p) => Math.abs(p.bodyY)))
  assert.ok(peak(56) > peak(24) * 1.3, 'a larger whale did not travel further in pixels')
  harness.close()
})

test('the same seed and the same steps give the same poses', () => {
  const harness = createHarness()
  const a = run(engineOf(harness, { seed: 99 }), 30)
  const b = run(engineOf(harness, { seed: 99 }), 30)
  assert.deepEqual(a, b)
  const c = run(engineOf(harness, { seed: 100 }), 30)
  assert.notDeepEqual(a, c, 'two seeds produced identical motion')
  harness.close()
})

test('the integrator is frame-rate independent', () => {
  const harness = createHarness()
  // The honest form of this claim is about the integrator, not the engine. The
  // engine draws its waypoints on a clock, so 30 Hz and 120 Hz cross a dwell
  // boundary on different frames and consume the random stream in a different
  // order — after ten seconds they are simply running different animations,
  // and a tolerance that hides that is a tolerance tuned until it passed.
  const at = (fps) => {
    const spring = harness.client.createSpring(0, 8)
    spring.target = 4
    for (let i = 0; i < 3 * fps; i++) harness.client.integrate(spring, 1 / fps)
    return spring.value
  }
  const slow = at(30)
  const fast = at(120)
  assert.ok(Math.abs(slow - fast) < 0.002, `${slow} vs ${fast}`)
  harness.close()
})

test('both frame rates stay inside the same envelope', () => {
  const harness = createHarness()
  const budget = harness.client.budgetFor(INLINE_SIZE)
  for (const fps of [24, 30, 60, 120]) {
    for (const pose of run(engineOf(harness, { seed: 5 }), 12, fps)) {
      assert.ok(
        Math.abs(pose.bodyY) <= budget.travel,
        `${fps} Hz left the travel budget: ${pose.bodyY}`,
      )
    }
  }
  harness.close()
})

test('an absurd frame delta is clamped instead of integrated', () => {
  const harness = createHarness()
  const engine = engineOf(harness)
  run(engine, 5)
  const before = { ...engine.currentPose }
  engine.step(600)
  const after = { ...engine.currentPose }
  const budget = harness.client.budgetFor(INLINE_SIZE)
  for (const key of Object.keys(after)) {
    assert.ok(Number.isFinite(after[key]))
    // A 600 s frame integrates 0.1 s of simulation, so the pose may move a
    // little — but not a whole stroke's worth.
    const ceiling = key === 'bodyX' || key === 'bodyY' ? budget.travel * 0.4 : 1
    assert.ok(
      Math.abs(after[key] - before[key]) < ceiling,
      `${key} jumped: ${before[key]} -> ${after[key]}`,
    )
  }
  // Negative and NaN deltas are ignored rather than propagated.
  engine.step(-1)
  engine.step(Number.NaN)
  for (const value of Object.values(engine.currentPose)) assert.ok(Number.isFinite(value))
  harness.close()
})

test('changing state preserves position and velocity instead of resetting', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'idle' })
  run(engine, 7)
  const before = { ...engine.currentPose }
  engine.setState('thinking')
  const after = { ...engine.step(1 / 60) }
  for (const key of Object.keys(after)) {
    assert.ok(
      Math.abs(after[key] - before[key]) < 0.08,
      `${key} snapped on the state change: ${before[key]} -> ${after[key]}`,
    )
  }
  harness.close()
})

test('blink cadence stays inside the profile bounds', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'thinking' })
  const dt = 1 / 120
  const closings = []
  let wasOpen = true
  for (let i = 0; i < 120 * 240; i++) {
    const pose = engine.step(dt)
    const open = pose.eyeOpen > 0.75
    if (wasOpen && !open) closings.push((i * dt))
    wasOpen = open
  }
  assert.ok(closings.length > 20, `only ${closings.length} blinks in four minutes`)
  const gaps = closings.slice(1).map((t, i) => t - closings[i])
  const min = Math.min(...gaps)
  const max = Math.max(...gaps)
  // Profile says 3.5–7.5 s between blinks; the spring adds a little settling.
  assert.ok(min >= 3.3, `blinks came ${min.toFixed(2)} s apart`)
  assert.ok(max <= 8.5, `blinks were ${max.toFixed(2)} s apart`)
  harness.close()
})

test('idle is calmer than thinking without being frantic', () => {
  const harness = createHarness()
  const travel = (state) => {
    const poses = run(engineOf(harness, { state, seed: 3 }), 180, 30)
    let sum = 0
    for (let i = 1; i < poses.length; i++) {
      sum += Math.hypot(poses[i].bodyX - poses[i - 1].bodyX, poses[i].bodyY - poses[i - 1].bodyY)
    }
    return sum
  }
  const idle = travel('idle')
  const thinking = travel('thinking')
  assert.ok(thinking > idle * 1.5, `thinking (${thinking.toFixed(1)}) is not livelier than idle (${idle.toFixed(1)})`)
  // …and the difference is carried by reflexes and cadence, not only by reach:
  // the distance covered must grow faster than the reach does.
  const peak = (state) =>
    Math.max(...run(engineOf(harness, { state, seed: 3 }), 120, 30).map((p) => Math.abs(p.bodyY)))
  const reachRatio = peak('thinking') / peak('idle')
  assert.ok(
    thinking / idle > reachRatio * 1.3,
    `state change is carried by amplitude alone (travel x${(thinking / idle).toFixed(2)}, reach x${reachRatio.toFixed(2)})`,
  )
  harness.close()
})

test('static motion holds the source mark exactly', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { motion: 'static' })
  run(engine, 60)
  assert.deepEqual({ ...engine.currentPose }, {
    bodyX: 0,
    bodyY: 0,
    bodyRotation: 0,
    bodyScaleX: 1,
    bodyScaleY: 1,
    eyeOpen: 1,
    opacity: 1,
  })
  harness.close()
})

test('subtle motion travels less than full motion', () => {
  const harness = createHarness()
  const peak = (motion) =>
    Math.max(...run(engineOf(harness, { motion, seed: 8 }), 120, 30).map((p) => Math.abs(p.bodyY)))
  assert.ok(peak('subtle') < peak('full') * 0.7)
  harness.close()
})

test('a state change eases into its new character instead of snapping', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'waiting' })
  const calm = engine.liveProfile.chase
  engine.setState('working')
  const busy = harness.client.profileFor('working', 'full').chase
  assert.ok(calm < busy - 5, 'the two states are not different enough to test')

  // Immediately after the change the rig is still running the old character.
  assert.ok(Math.abs(engine.liveProfile.chase - calm) < 0.4, 'the spring stiffness snapped')
  const seen = []
  for (let i = 0; i < 40; i++) {
    engine.step(1 / 60)
    seen.push(engine.liveProfile.chase)
  }
  // It arrives, and it passes through the middle on the way — which is the
  // whole difference between an ease and a step.
  assert.ok(Math.abs(seen.at(-1) - busy) < 0.05, `ended at ${seen.at(-1)}, not ${busy}`)
  const midway = seen.filter((v) => v > calm + 1 && v < busy - 1)
  assert.ok(midway.length > 8, `only ${midway.length} frames between the two values`)
  harness.close()
})

test('interrupting a transition continues from where it had reached', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'waiting' })
  engine.setState('working')
  for (let i = 0; i < 12; i++) engine.step(1 / 60)
  const interrupted = engine.liveProfile.chase
  const idle = harness.client.profileFor('idle', 'full').chase
  engine.setState('idle')
  // The rig must not jump back to `waiting`'s value, nor forward to `idle`'s:
  // a blend that restarts from the state being left is a visible flick.
  assert.ok(
    Math.abs(engine.liveProfile.chase - interrupted) < 0.4,
    `restarted the blend from ${engine.liveProfile.chase} rather than ${interrupted}`,
  )
  for (let i = 0; i < 40; i++) engine.step(1 / 60)
  assert.ok(Math.abs(engine.liveProfile.chase - idle) < 0.05, 'the second change never arrived')
  harness.close()
})

test('no state change moves the body by more in one frame than a swim can', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'idle' })
  const budget = harness.client.budgetFor(26)
  const order = ['thinking', 'working', 'responding', 'waiting', 'idle', 'working']
  let previous = engine.currentPose.bodyY
  let worst = 0
  for (const state of order) {
    engine.setState(state)
    for (let i = 0; i < 90; i++) {
      const pose = engine.step(1 / 60)
      worst = Math.max(worst, Math.abs(pose.bodyY - previous))
      previous = pose.bodyY
    }
  }
  // One frame of the fastest legal swim; a re-clamped waypoint used to yank
  // the body further than this in the single frame after a state change.
  assert.ok(worst < budget.travel * 0.2, `a state change stepped the body ${worst.toFixed(3)}px in one frame`)
  harness.close()
})
