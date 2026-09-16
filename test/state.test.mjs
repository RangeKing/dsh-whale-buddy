/**
 * The shared semantic state: how DSH facts become `idle` / `thinking`, and how
 * one store keeps both surfaces speaking the same vocabulary.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

/** Longer than MIN_WORD_MS, so a queued word has settled. */
const MIN_HOLD = 800

test('thinking is read from the session facts, not from status text', () => {
  const harness = createHarness()
  const { stateOfSession, stateOfSessionList } = harness.client

  assert.equal(stateOfSession({ running: false, awaitingFirstTurn: false }), 'idle')
  assert.equal(stateOfSession({ running: true }), 'thinking')
  // A prompt accepted but not yet durable still counts, so the whale appears
  // with the status line rather than a beat later.
  assert.equal(stateOfSession({ running: false, awaitingFirstTurn: true }), 'thinking')
  assert.equal(stateOfSession(undefined), 'idle')
  assert.equal(stateOfSession(null), 'idle')

  assert.equal(stateOfSessionList({ current: 'a', byId: { a: { running: true } } }), 'thinking')
  assert.equal(stateOfSessionList({ current: 'a', byId: { a: { running: false } } }), 'idle')
  assert.equal(stateOfSessionList({ current: undefined, byId: {} }), 'idle')
  // A running session that is not the selected one must not light the dock.
  assert.equal(stateOfSessionList({ current: 'a', byId: { a: { running: false }, b: { running: true } } }), 'idle')
  assert.equal(stateOfSessionList(undefined), 'idle')
  harness.close()
})

test('the text fallback stays isolated and still recognises both locales', () => {
  const harness = createHarness()
  const { stateOfStatusText } = harness.client
  assert.equal(stateOfStatusText('Deep diving...'), 'thinking')
  assert.equal(stateOfStatusText('深度求索中...'), 'thinking')
  assert.equal(stateOfStatusText('Ready'), 'idle')
  assert.equal(stateOfStatusText(null), 'idle')
  harness.close()
})

test('one store drives both surfaces from the same state', () => {
  const harness = createHarness()
  const store = new harness.client.WhaleStateStore({
    enabled: true,
    inlineEnabled: true,
    dockEnabled: true,
    size: 20,
    motion: 'full',
  })
  const status = harness.document.createElement('div')
  status.setAttribute('role', 'status')
  status.textContent = '深度求索中...'
  harness.document.body.appendChild(status)
  const inline = harness.client.mountStatusWhale({
    document: harness.document,
    match: (text) => text.includes('深度求索'),
    size: 20,
    motion: 'full',
    activity: { state: store.getSnapshot().state },
    word: '深度求索中...',
  })
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: store.getSnapshot().state,
    motion: 'full',
    inlineEnabled: true,
  })
  store.subscribe((snapshot) => {
    inline.setActivity({ state: snapshot.state }, snapshot.state)
    inline.setMotion(snapshot.config.motion)
    dock.setState(snapshot.state)
    dock.setMotion(snapshot.config.motion)
  })

  store.setState('thinking')
  assert.equal(inline.view().engine.semanticState, 'thinking')
  assert.equal(dock.view.engine.semanticState, 'thinking')

  // The whale reacts to the word, so the minimum-legible hold governs both:
  // the engine changes state when the label does, not before it.
  harness.advance(MIN_HOLD)
  store.setState('idle')
  assert.equal(inline.view().engine.semanticState, 'idle')
  assert.equal(dock.view.engine.semanticState, 'idle')

  // Independent engines: the same vocabulary, not a shared spring.
  assert.notEqual(inline.view().engine, dock.view.engine)
  inline.destroy()
  harness.close()
})

test('unsubscribing during a notification is safe', () => {
  const harness = createHarness()
  const store = new harness.client.WhaleStateStore(harness.client.DEFAULT_CONFIG)
  const seen = []
  const stop = store.subscribe(() => {
    seen.push('a')
    stop()
  })
  store.subscribe(() => seen.push('b'))
  store.setState('thinking')
  store.setState('idle')
  assert.deepEqual(seen, ['a', 'b', 'b'])
  harness.close()
})

test('configuration validates whatever is in storage', () => {
  const harness = createHarness()
  const { loadConfig, DEFAULT_CONFIG } = harness.client

  const empty = loadConfig({ getItem: () => null, setItem: () => {} })
  assert.deepEqual({ ...empty }, { ...DEFAULT_CONFIG })

  const nonsense = loadConfig({
    getItem: (key) =>
      ({
        'dsh-whale-buddy.size': '9000',
        'dsh-whale-buddy.motion': 'interpretive-dance',
        'dsh-whale-buddy.enabled': '',
      })[key] ?? null,
    setItem: () => {},
  })
  assert.equal(nonsense.size, DEFAULT_CONFIG.size)
  assert.equal(nonsense.motion, DEFAULT_CONFIG.motion)
  assert.equal(nonsense.enabled, true)

  const chosen = loadConfig({
    getItem: (key) =>
      ({ 'dsh-whale-buddy.size': '24', 'dsh-whale-buddy.motion': 'subtle', 'dsh-whale-buddy.dockEnabled': '0' })[key] ??
      null,
    setItem: () => {},
  })
  assert.equal(chosen.size, 24)
  assert.equal(chosen.motion, 'subtle')
  assert.equal(chosen.dockEnabled, false)

  // Storage that throws on every access must not break the plugin.
  const hostile = loadConfig({
    getItem() {
      throw new Error('denied')
    },
    setItem() {
      throw new Error('denied')
    },
  })
  assert.deepEqual({ ...hostile }, { ...DEFAULT_CONFIG })
  harness.client.saveConfig('size', 22, {
    getItem: () => null,
    setItem() {
      throw new Error('denied')
    },
  })
  harness.close()
})

test('the neutral pose renders the source mark with no transform at all', () => {
  const harness = createHarness()
  const limits = harness.client.limitsFor(harness.client.budgetFor(26))
  const t = harness.client.rigTransforms(
    harness.client.NEUTRAL_POSE,
    limits,
    harness.client.unitsPerPixel(26),
  )
  assert.equal(
    t.body,
    'translate(0 0) rotate(0 11.58 8.52) translate(11.58 8.52) scale(1 1) translate(-11.58 -8.52)',
  )
  assert.equal(t.eye, 'translate(12.4373 8.2599) scale(1 1) translate(-12.4373 -8.2599)')
  assert.ok(harness.client.isPoseSane(harness.client.NEUTRAL_POSE, limits))
  harness.close()
})

test('a poisoned pose is clamped rather than written to the DOM', () => {
  const harness = createHarness()
  const limits = harness.client.limitsFor(harness.client.budgetFor(26))
  const poison = {
    bodyX: 1e9,
    bodyY: Number.NaN,
    bodyRotation: Number.POSITIVE_INFINITY,
    bodyScaleX: -50,
    bodyScaleY: Number.NaN,
    eyeOpen: Number.NEGATIVE_INFINITY,
  }
  assert.equal(harness.client.isPoseSane(poison, limits), false)
  const t = harness.client.rigTransforms(poison, limits, harness.client.unitsPerPixel(26))
  for (const value of Object.values(t)) {
    assert.ok(!/NaN|Infinity/.test(value), `transform leaked a bad number: ${value}`)
    for (const token of value.match(/-?\d*\.?\d+/g)) {
      assert.ok(Number.isFinite(Number.parseFloat(token)))
    }
  }
  // Two different recoveries, and the difference matters: a finite-but-absurd
  // value is clamped to the rig's bound (1e9 px of travel becomes the maximum
  // offset, -50 scale becomes the minimum), while a non-finite one falls back
  // to neutral, because there is no sensible bound to pick for NaN.
  assert.match(t.body, /^translate\(0\.7738 0\)/, 'bodyX was not clamped, bodyY was not neutralised')
  assert.match(t.body, /rotate\(0 /, 'an infinite rotation should neutralise, not saturate')
  // 0.654: one minus the breathing delta (with slack) and the compaction
  // squeeze's full flatten. The squeeze is what widened this bound, and it is
  // widened on purpose — the whale really does get that small mid-compaction.
  assert.match(t.body, /scale\(0\.6537 1\)/, 'scaleX was not clamped, scaleY was not neutralised')
  assert.equal(t.eye, 'translate(12.4373 8.2599) scale(1 1) translate(-12.4373 -8.2599)')
  harness.close()
})

test('the activity is derived from DSH facts, in priority order', () => {
  const harness = createHarness()
  const { activityOf } = harness.client
  assert.deepEqual({ ...activityOf({ running: false }) }, { state: 'idle' })
  assert.deepEqual({ ...activityOf({ running: true }) }, { state: 'thinking' })
  assert.deepEqual(
    { ...activityOf({ running: true, streaming: true }) },
    { state: 'responding' },
  )
  // A tool in flight outranks streaming: the turn is blocked on the tool.
  assert.deepEqual(
    { ...activityOf({ running: true, streaming: true, toolName: 'fs_read' }) },
    { state: 'working', task: 'reading' },
  )
  // An unrecognised tool still reads as work, just without a specific word.
  assert.deepEqual(
    { ...activityOf({ running: true, toolName: 'quantum_flux' }) },
    { state: 'working' },
  )
  // Waiting is about the user, so it outranks everything the model is doing.
  assert.deepEqual(
    { ...activityOf({ running: true, pending: true, toolName: 'bash' }) },
    { state: 'waiting' },
  )
  // …but only while a turn is actually open.
  assert.equal(activityOf({ running: false, pending: true }).state, 'idle')
  // An error outranks even the user: it is the one fact that can still be true
  // once the turn is over, which is what lets the red mark outlive it.
  assert.deepEqual({ ...activityOf({ failed: true, running: false }) }, { state: 'error' })
  assert.deepEqual(
    { ...activityOf({ failed: true, running: true, pending: true }) },
    { state: 'error' },
  )
  // Compaction outranks the tool call, because DSH keeps one open across a
  // compaction — without this the whale waves a wrench while the context is
  // being rewritten under it.
  assert.deepEqual(
    { ...activityOf({ running: true, compacting: true, toolName: 'bash', streaming: true }) },
    { state: 'compacting' },
  )
  // …and a compaction request left behind by a finished turn pins nothing.
  assert.equal(activityOf({ running: false, compacting: true }).state, 'idle')
  // Absent facts never throw.
  assert.equal(activityOf({}).state, 'idle')
  assert.equal(activityOf({ running: true, toolName: undefined }).state, 'thinking')
  // The diagnostic tag names both halves.
  assert.equal(harness.client.activityTag({ state: 'working', task: 'reading' }), 'working:reading')
  assert.equal(harness.client.activityTag({ state: 'thinking' }), 'thinking')
  harness.close()
})

test('tool names map to a coarse task, and an unknown one stays generic', () => {
  const harness = createHarness()
  const { taskOfTool } = harness.client
  for (const [name, task] of [
    ['fs_read', 'reading'], ['fs_search', 'reading'], ['grep', 'reading'],
    ['str_replace_editor', 'editing'], ['fs_write', 'editing'],
    ['bash', 'running'], ['pwsh_persistent', 'running'],
    ['web_search', 'searching'], ['web_fetch', 'searching'],
    ['subagent', 'delegating'], ['workflow_run', 'delegating'],
  ]) {
    assert.equal(taskOfTool(name), task, `${name} classified wrongly`)
  }
  // An unknown tool must not be forced into a family — the generic word wins.
  assert.equal(taskOfTool('quantum_flux'), undefined)
  assert.equal(taskOfTool(undefined), undefined)
  harness.close()
})

test('every activity that shows a word has one in both languages', () => {
  const harness = createHarness()
  const { statusWordFor, en, zh, fallbackTranslate } = harness.client
  const activities = [
    { state: 'thinking' }, { state: 'responding' }, { state: 'working' }, { state: 'waiting' },
    { state: 'working', task: 'reading' }, { state: 'working', task: 'editing' },
    { state: 'working', task: 'running' }, { state: 'working', task: 'searching' },
    { state: 'working', task: 'delegating' },
  ]
  for (const locale of ['en', 'zh']) {
    const t = fallbackTranslate(locale)
    for (const activity of activities) {
      const word = statusWordFor(activity, t)
      assert.ok(word && word.length > 0, `${locale}: no word for ${JSON.stringify(activity)}`)
    }
  }
  // Idle shows nothing: there is no status row to label.
  assert.equal(statusWordFor({ state: 'idle' }, fallbackTranslate('en')), undefined)
  assert.equal(Object.keys(en).length, Object.keys(zh).length)
  harness.close()
})

test('every semantic state has a motion profile and they are not all the same', () => {
  const harness = createHarness()
  const peak = (state) => {
    const engine = new harness.client.WhaleEngine({
      size: 26, state, motion: 'full', random: harness.client.seededRandom(5),
    })
    let most = 0
    for (let i = 0; i < 120 * 30; i++) most = Math.max(most, Math.abs(engine.step(1 / 30).bodyY))
    return most
  }
  const reach = Object.fromEntries(
    ['idle', 'thinking', 'responding', 'working', 'waiting'].map((s) => [s, peak(s)]),
  )
  for (const [state, value] of Object.entries(reach)) {
    assert.ok(Number.isFinite(value) && value > 0, `${state} produced no motion`)
  }
  // Waiting is the one state that is about the user, and it is the stillest.
  assert.ok(reach.waiting < reach.idle, 'waiting is not calmer than idle')
  assert.ok(reach.working > reach.waiting, 'working is not livelier than waiting')
  harness.close()
})

test('the error mark is an event, not a latched field', () => {
  const harness = createHarness()
  const { stepErrorPulse, NO_ERROR_PULSE, ERROR_HOLD_MS } = harness.client
  let pulse = NO_ERROR_PULSE

  // DSH does not clear `lastAgentError`: it holds the last error that ever
  // happened. Measured on a freshly opened DSH, a never-used session already
  // carried `resume failed for session "session-02edfacd…"` from an entirely
  // different session. Read as a boolean, that put a permanent red mark on the
  // Dock for a housekeeping failure nobody had seen — a warning that is always
  // on is a warning that is never read. So whatever is there at the first look
  // is the baseline, and it never shows.
  const stale = 'resume failed for session "session-02edfacd"|null'
  let step = stepErrorPulse(pulse, { error: stale, running: false, now: 1000 })
  pulse = step.pulse
  assert.equal(step.failed, false, 'a pre-existing error marked the whale')
  step = stepErrorPulse(pulse, { error: stale, running: false, now: 60_000 })
  pulse = step.pulse
  assert.equal(step.failed, false, 'the stale error came back later')

  // A value that *changes* while we are watching is a real event.
  step = stepErrorPulse(pulse, { error: 'model refused|null', running: false, now: 61_000 })
  pulse = step.pulse
  assert.equal(step.failed, true, 'a fresh failure did not mark the whale')
  step = stepErrorPulse(pulse, { error: 'model refused|null', running: false, now: 61_000 + ERROR_HOLD_MS - 1 })
  pulse = step.pulse
  assert.equal(step.failed, true, 'the mark went out early')
  // …and it is over when the hold is over. An error happens once; it is not a
  // state the session sits in.
  step = stepErrorPulse(pulse, { error: 'model refused|null', running: false, now: 61_000 + ERROR_HOLD_MS })
  pulse = step.pulse
  assert.equal(step.failed, false, 'the mark outlasted its hold')

  // A new turn supersedes it, even mid-hold: held past that, the mark would be
  // describing the previous turn while the next one is running.
  step = stepErrorPulse(pulse, { error: 'boom|null', running: false, now: 80_000 })
  pulse = step.pulse
  assert.equal(step.failed, true)
  step = stepErrorPulse(pulse, { error: 'boom|null', running: true, now: 80_100 })
  pulse = step.pulse
  assert.equal(step.failed, false, 'a new turn did not clear the mark')

  // A second, different failure re-arms it.
  step = stepErrorPulse(pulse, { error: 'boom again|null', running: false, now: 81_000 })
  assert.equal(step.failed, true, 'a second failure was swallowed')
  harness.close()
})
