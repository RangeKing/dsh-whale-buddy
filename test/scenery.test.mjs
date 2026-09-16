/**
 * Everything drawn outside the mark: the water, the splash, the prop.
 *
 * These carry a load the whale itself does not. The whale is drawn identically
 * above and below the surface — no dimming, no occlusion, no fade — so the only
 * thing telling a viewer that a horizontal line is water is that the line
 * *reacts* when the whale goes through it. If the surface stops being disturbed
 * by the crossings, the animation does not degrade gracefully: it becomes a
 * whale next to a rule.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

const SIZE = 26

/** An engine in a state, with a controlled random source. */
function engineOf(harness, options = {}) {
  return new harness.client.WhaleEngine({
    size: options.size ?? SIZE,
    state: options.state ?? 'thinking',
    motion: options.motion ?? 'full',
    random: harness.client.seededRandom(options.seed ?? 31),
  })
}

/** Play a whole breach, sampling the scenery every frame. */
function breach(harness, engine) {
  const frames = []
  engine.leap()
  const total = Math.ceil(harness.client.LEAP_SECONDS * 60) + 40
  for (let i = 0; i < total; i++) {
    engine.step(1 / 60)
    const e = engine.currentEffects
    frames.push({
      t: i / 60,
      water: { ...e.water },
      drops: e.splash.length,
      maxDrop: e.splash.reduce((m, d) => Math.max(m, d.r), 0),
      prop: e.prop.kind,
      height: -engine.currentPose.bodyY,
    })
  }
  return frames
}

test('there is no sea until a breach, and none afterwards', () => {
  const harness = createHarness()
  const engine = engineOf(harness)
  for (let i = 0; i < 300; i++) {
    engine.step(1 / 60)
    assert.equal(engine.currentEffects.water.opacity, 0, 'a sea appeared with no breach')
    assert.equal(engine.currentEffects.splash.length, 0)
  }
  const frames = breach(harness, engine)
  assert.ok(frames.some((f) => f.water.opacity > 0.9), 'the breach drew no sea at all')
  assert.equal(frames.at(-1).water.opacity, 0, 'the sea was left on screen after the breach')
  assert.equal(frames.at(-1).drops, 0, 'droplets outlived the breach')
  harness.close()
})

test('the surface is struck twice, and it moves the right way both times', () => {
  const harness = createHarness()
  const frames = breach(harness, engineOf(harness))
  // Each crossing throws droplets, so a burst is where the surface was hit.
  const hits = []
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].drops > frames[i - 1].drops) hits.push(i)
  }
  assert.equal(hits.length, 2, `${hits.length} strikes, not 2`)

  /** How far the surface had moved a few frames after a strike. */
  const swing = (at) => {
    const before = frames[at - 1]?.water.deflection ?? 0
    let worst = 0
    for (let i = at; i < Math.min(frames.length, at + 8); i++) {
      const d = (frames[i]?.water.deflection ?? 0) - before
      if (Math.abs(d) > Math.abs(worst)) worst = d
    }
    return worst
  }
  // Out through the surface pulls it up; in through it pushes it down. Without
  // both, the line is inert and nothing on screen says it is water.
  assert.ok(swing(hits[0]) < -0.02, `the exit moved the surface by ${swing(hits[0]).toFixed(3)}px`)
  assert.ok(swing(hits[1]) > 0.02, `the entry moved the surface by ${swing(hits[1]).toFixed(3)}px`)
  // It rebounds rather than creeping back: an underdamped surface passes its
  // rest height on the way home.
  const after = frames.slice(hits[1] + 6)
  assert.ok(after.some((f) => f.water.deflection < -0.01), 'the surface never rebounded')
  assert.ok(Math.abs(frames.at(-1).water.deflection) < 0.4, 'the surface never settled')
  harness.close()
})

test('the surface bends rather than moving as one piece', () => {
  const harness = createHarness()
  const engine = engineOf(harness)
  let worstSpread = 0
  engine.leap()
  for (let i = 0; i < Math.ceil(harness.client.LEAP_SECONDS * 60); i++) {
    engine.step(1 / 60)
    const nodes = engine.currentEffects.water.nodes
    if (nodes.length < 2) continue
    worstSpread = Math.max(worstSpread, Math.max(...nodes) - Math.min(...nodes))
  }
  // A rigid rule has zero spread at every instant. A dent that rebounds into a
  // crown and sheds ripples is the only thing on screen saying the line is a
  // liquid, because the whale is drawn identically above and below it.
  assert.ok(worstSpread > 0.6, `the surface only ever bent by ${worstSpread.toFixed(2)}px`)
  harness.close()
})

test('a splash happens at each crossing and is thrown, not dribbled', () => {
  const harness = createHarness()
  const frames = breach(harness, engineOf(harness))
  const bursts = []
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].drops > frames[i - 1].drops) bursts.push(frames[i].t)
  }
  assert.equal(bursts.length, 2, `${bursts.length} splashes, not 2`)
  const biggest = frames.reduce((m, f) => Math.max(m, f.maxDrop), 0)
  // Big enough to see on a 26 px whale, small enough not to be a blob.
  assert.ok(biggest > 1.2, `the largest droplet is ${biggest.toFixed(2)}px`)
  assert.ok(biggest < 3, `the largest droplet is ${biggest.toFixed(2)}px`)
  harness.close()
})

test('the sea never reaches the word beside the whale', () => {
  const harness = createHarness()
  const frames = breach(harness, engineOf(harness))
  const widest = frames.reduce((m, f) => Math.max(m, f.water.halfWidth), 0)
  // The status word starts a few pixels past the mark's right edge. A surface
  // that runs under it stops being a sea and becomes an underline on the label
  // — which is the whole reason this thing is scoped to a breach.
  assert.ok(widest > SIZE * 0.4, `the surface is only ${widest.toFixed(1)}px wide`)
  assert.ok(widest <= SIZE * 0.6, `the surface reaches ${widest.toFixed(1)}px, into the word`)
  harness.close()
})

test('every state has its prop, and a breach wears none', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'idle' })
  const settle = () => {
    for (let i = 0; i < 40; i++) engine.step(1 / 60)
    return engine.currentEffects.prop
  }
  assert.equal(settle().kind, null, 'idle put something on the whale before its time')
  for (const [activity, kind] of [
    [{ state: 'thinking' }, 'think'],
    [{ state: 'responding' }, 'speak'],
    [{ state: 'waiting' }, 'ask'],
    [{ state: 'error' }, 'bang'],
    // Per-task props. This reverses the older "one prop for all five working
    // tasks" rule: the tasks are now told apart by the tool in the whale's
    // hand, not only by the word beside it.
    [{ state: 'working' }, 'wrench'],
    [{ state: 'working', task: 'running' }, 'wrench'],
    [{ state: 'working', task: 'reading' }, 'files'],
    [{ state: 'working', task: 'editing' }, 'pencil'],
    [{ state: 'working', task: 'searching' }, 'glass'],
  ]) {
    engine.setActivity(activity)
    const prop = settle()
    const name = activity.task === undefined ? activity.state : `${activity.state}:${activity.task}`
    assert.equal(prop.kind, kind, `${name} showed ${prop.kind}`)
    assert.ok(prop.reveal > 0.9, `${name}'s prop never finished arriving`)
  }
  // Compaction is the one running state with nothing on its head: the gesture
  // is the body itself being squeezed, and a prop would compete with it.
  engine.setActivity({ state: 'compacting' })
  assert.equal(settle().kind, null, 'compaction put something on the whale')
  engine.setActivity({ state: 'thinking' })
  settle()
  // One thing at a time: mid-breach the whale carries nothing.
  engine.leap()
  for (let i = 0; i < 30; i++) engine.step(1 / 60)
  assert.ok(
    engine.currentEffects.prop.reveal < 0.4,
    'the whale breached while still wearing a prop',
  )
  harness.close()
})

test('props swap by retracting and then extending, never both at once', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'thinking' })
  for (let i = 0; i < 60; i++) engine.step(1 / 60)
  assert.equal(engine.currentEffects.prop.kind, 'think')

  engine.setState('waiting')
  let sawEmpty = false
  const seen = new Set()
  for (let i = 0; i < 60; i++) {
    engine.step(1 / 60)
    const p = engine.currentEffects.prop
    // At 10 px two overlapping props are one unreadable shape, so the old one
    // must be gone before the new one is drawn.
    if (p.reveal < 0.05) sawEmpty = true
    if (p.reveal > 0.2) seen.add(p.kind)
  }
  assert.ok(sawEmpty, 'the swap never passed through nothing')
  assert.deepEqual([...seen], ['think', 'ask'], `drawn during the swap: ${[...seen]}`)
  harness.close()
})

test('the ball is tossed off the head, and the body is what throws it', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'idle' })
  const budget = harness.client.budgetFor(SIZE)
  // The ball belongs to idle now, and idle makes it wait: it is a bored
  // animal's gesture, and a whale that starts juggling the instant a turn ends
  // is not bored, it is restless.
  for (let i = 0; i < harness.client.IDLE_PROP_DELAY * 60 - 1; i++) {
    engine.step(1 / 60)
    assert.notEqual(engine.currentEffects.prop.kind, 'ball', 'the ball came out too early')
  }
  let peak = 0
  let stretched = 0
  let flattened = 1
  let bodyKick = 0
  let previousY = 0
  let landed = 0
  let airborne = false
  for (let i = 0; i < 60 * 20; i++) {
    engine.step(1 / 60)
    const p = engine.currentEffects.prop
    peak = Math.min(peak, p.dy)
    stretched = Math.max(stretched, p.squash)
    flattened = Math.min(flattened, p.squash)
    // The heave goes through the body's own spring, so it shows up as the body
    // accelerating upward — the fin cannot lift anything, so the whale does.
    const y = engine.currentPose.bodyY
    bodyKick = Math.min(bodyKick, y - previousY)
    previousY = y
    if (p.dy < -0.5) airborne = true
    else if (airborne) {
      airborne = false
      landed++
    }
  }
  assert.ok(-peak > budget.propToss * 0.9, `the ball only rose ${(-peak).toFixed(2)}px`)
  // Squash and stretch, not spin: a circle turning in the air is a still circle.
  assert.ok(stretched > 1.15, `the ball never stretched past ${stretched.toFixed(2)}`)
  assert.ok(flattened < 0.8, `the ball never flattened below ${flattened.toFixed(2)}`)
  assert.ok(landed >= 3, `only ${landed} tosses in twenty seconds`)
  assert.ok(bodyKick < -0.04, 'the body never heaved; the ball threw itself')
  harness.close()
})

test('between tosses the whale keeps balancing, and only while working', () => {
  const harness = createHarness()
  /** Peak-to-peak heading swing once the state has settled. */
  const swing = (state) => {
    const engine = engineOf(harness, { state })
    for (let i = 0; i < 120; i++) engine.step(1 / 60)
    let low = Infinity
    let high = -Infinity
    for (let i = 0; i < 240; i++) {
      const r = engine.step(1 / 60).bodyRotation
      low = Math.min(low, r)
      high = Math.max(high, r)
    }
    return high - low
  }
  // A sea lion with something on its head does not hold still between throws;
  // the constant correction is what says the ball is balanced, not glued on.
  assert.ok(swing('working') > 4, `working swings only ${swing('working').toFixed(1)} degrees`)
  assert.ok(swing('waiting') < 3, 'a state with no ball is wobbling anyway')
  harness.close()
})

test('reduced motion has no sea, no splash and no prop', () => {
  const harness = createHarness({ reducedMotion: true })
  const engine = engineOf(harness, { state: 'working', motion: 'static' })
  engine.leap()
  for (let i = 0; i < 200; i++) {
    engine.step(1 / 60)
    const e = engine.currentEffects
    assert.equal(e.water.opacity, 0)
    assert.equal(e.splash.length, 0)
    assert.equal(e.prop.kind, null)
  }
  harness.close()
})

test('turning reduced motion on mid-breach clears the scenery too', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'working' })
  engine.leap()
  for (let i = 0; i < 40; i++) engine.step(1 / 60)
  assert.ok(engine.currentEffects.water.opacity > 0.5, 'nothing to interrupt')
  engine.settleNow()
  const e = engine.currentEffects
  assert.equal(e.water.opacity, 0, 'a sea was left behind')
  assert.equal(e.water.dy, 0)
  assert.equal(e.splash.length, 0, 'droplets were left hanging in the air')
  assert.equal(e.prop.kind, null)
  harness.close()
})

test('a breach starts and ends completely under water, and clears it entirely', () => {
  const harness = createHarness()
  const H = 17.04
  for (const size of [26, 24, 56]) {
    const engine = engineOf(harness, { size })
    const perPixel = harness.client.unitsPerPixel(size)
    let fullyOut = 0
    let fullyIn = 0
    let peak = 0
    engine.leap()
    const total = Math.ceil(harness.client.LEAP_SECONDS * 60) + 4
    const shares = []
    for (let i = 0; i < total; i++) {
      engine.step(1 / 60)
      const top = engine.currentPose.bodyY * perPixel
      const line = harness.client.WATER_REST_Y + engine.currentEffects.water.dy * perPixel
      // Share of the mark's height standing above the surface.
      const share = Math.min(1, Math.max(0, (line - top) / H))
      shares.push(share)
      peak = Math.max(peak, share)
      if (share >= 1) fullyOut++
      if (share <= 0) fullyIn++
    }
    // The whale cannot supply this separation on its own: it is 19 px tall at
    // the inline size and its travel is capped near 9 px by the clear space
    // around DSH's status row. The surface supplies the rest by sliding down —
    // it is a one-pixel rectangle, so its travel costs no viewBox bleed at all.
    assert.equal(peak, 1, `${size}px: the whale only ever gets ${(peak * 100).toFixed(0)}% out`)
    assert.ok(fullyOut >= 9, `${size}px: airborne for only ${fullyOut} frames`)
    assert.equal(shares[0], 0, `${size}px: the breach starts with the whale out of the water`)
    assert.equal(shares.at(-1), 0, `${size}px: the breach ends with the whale out of the water`)
    assert.ok(fullyIn > total / 3, `${size}px: submerged for only ${fullyIn} of ${total} frames`)
  }
  harness.close()
})

test('the surface and the whale move together, so it is a camera and not a tide', () => {
  const harness = createHarness()
  const engine = engineOf(harness)
  engine.leap()
  let worst = 0
  let previous = null
  for (let i = 0; i < Math.ceil(harness.client.LEAP_SECONDS * 60); i++) {
    engine.step(1 / 60)
    // `dy` is the slide alone — the deformation lives in `nodes`, which is
    // allowed to pull the surface up at the moment the whale tears out of it.
    const now = { body: engine.currentPose.bodyY, line: engine.currentEffects.water.dy }
    if (previous !== null) {
      const bodyUp = previous.body - now.body
      const lineDown = now.line - previous.line
      // Both are driven by the same arc value, so whenever the whale is rising
      // the surface is sliding the other way. Anything else reads as the sea
      // draining rather than as the whale leaving it.
      if (bodyUp > 0.05 && lineDown < -0.05) worst++
    }
    previous = now
  }
  assert.equal(worst, 0, `${worst} frames where the whale rose and the surface rose with it`)
  harness.close()
})

test('compaction squeezes the body down and springs it back past its own height', () => {
  const harness = createHarness()
  const engine = engineOf(harness, { state: 'compacting' })
  const ys = []
  for (let i = 0; i < 60 * 6; i++) ys.push(engine.step(1 / 60).bodyScaleY)
  const flattest = Math.min(...ys)
  const tallest = Math.max(...ys)
  // The metaphor is the gesture: compaction makes the context smaller, so the
  // whale is made smaller. A quarter of its height is the floor for reading
  // that across a 26 px silhouette out of the corner of an eye.
  assert.ok(flattest < 0.78, `the body only squeezed to ${flattest.toFixed(3)}`)
  // And the rebound overshoots. This is the one underdamped channel that moves
  // the mark, and the overshoot is the whole reason for the exception: a
  // critically damped return is a lid closing, not a spring letting go.
  assert.ok(tallest > 1.06, `the rebound only reached ${tallest.toFixed(3)}`)

  // It repeats, because DSH publishes no progress for a compaction — only that
  // one is running — so the gesture has to be a loop rather than a bar.
  let presses = 0
  let down = false
  for (const y of ys) {
    if (y < 0.85) down = true
    else if (down && y > 0.99) {
      down = false
      presses++
    }
  }
  assert.ok(presses >= 3, `only ${presses} squeezes in six seconds`)

  // Leaving the state lets go of it, and the body returns to its own size.
  engine.setActivity({ state: 'thinking' })
  for (let i = 0; i < 180; i++) engine.step(1 / 60)
  const after = engine.currentPose.bodyScaleY
  assert.ok(Math.abs(after - 1) < 0.05, `the body stayed at ${after.toFixed(3)} after compacting`)
  harness.close()
})

test('a squeeze and a breach never exceed the viewBox they share', () => {
  const harness = createHarness()
  const { budgetFor, limitsFor, bleedFor, unitsPerPixel } = harness.client
  const limits = limitsFor(budgetFor(SIZE))
  const perPixel = unitsPerPixel(SIZE)
  const bleed = bleedFor(limits, perPixel)
  const engine = engineOf(harness, { state: 'compacting' })

  // `rig.ts` charges the viewBox for the larger of the two envelopes rather
  // than for their sum, which is sound only because a full arc and a full
  // stretch cannot land on the same frame — the engine releases the squeeze the
  // instant an arc begins. This is that claim measured, rather than the weaker
  // one about how fast the spring lets go: every frame of a compaction, and
  // every frame of a breach played *out of* one, has to fit the drawing.
  let worst = 0
  const measure = () => {
    const pose = engine.currentPose
    const angle = (Math.abs(pose.bodyRotation) * Math.PI) / 180
    const hx = 11.58 * Math.abs(pose.bodyScaleX)
    const hy = 8.52 * Math.abs(pose.bodyScaleY)
    const reach =
      Math.abs(pose.bodyY) * perPixel + hx * Math.sin(angle) + hy * Math.cos(angle)
    worst = Math.max(worst, reach)
  }
  for (let i = 0; i < 120; i++) {
    engine.step(1 / 60)
    measure()
  }
  engine.leap()
  for (let i = 0; i < Math.ceil(harness.client.LEAP_SECONDS * 60) + 60; i++) {
    engine.step(1 / 60)
    measure()
  }
  assert.ok(
    worst <= 8.52 + bleed.y + 1e-6,
    `a frame reached ${worst.toFixed(3)} units against a ${(8.52 + bleed.y).toFixed(3)} viewBox`,
  )
  const [leaping, squeezing] = limits.envelopes
  assert.ok(leaping.travelYPx > squeezing.travelYPx, 'the leap envelope lost its travel')
  assert.ok(squeezing.maxScale > leaping.maxScale, 'the squeeze envelope lost its stretch')
  harness.close()
})

test('the whale balances only while a ball is actually on its head', () => {
  const harness = createHarness()
  /** Peak-to-peak heading swing over a window, after `warm` seconds of idle. */
  const swing = (warm, secs) => {
    const engine = engineOf(harness, { state: 'idle' })
    for (let i = 0; i < warm * 60; i++) engine.step(1 / 60)
    let low = Infinity
    let high = -Infinity
    for (let i = 0; i < secs * 60; i++) {
      const r = engine.step(1 / 60).bodyRotation
      low = Math.min(low, r)
      high = Math.max(high, r)
    }
    return high - low
  }
  const before = swing(1, 6)
  const after = swing(harness.client.IDLE_PROP_DELAY + 2, 6)
  // The profile says an idle whale *may* balance; the prop says whether there
  // is anything up there to balance. Tying the wobble to the state instead left
  // the Dock making corrections under nothing, for hours.
  assert.ok(after > before * 1.4, `balancing added nothing: ${before.toFixed(2)}° vs ${after.toFixed(2)}°`)
  harness.close()
})
