/**
 * The classic row: DSH 0.1.5's blue "深度求索中..." with the whale in it,
 * drawn by the plugin above the composer when the user asks for it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

/** Mount a whale into a classic row inside a stand-in composer dock. */
function mountClassic(harness, overrides = {}) {
  const { client, document: doc } = harness
  const container = doc.createElement('div')
  doc.body.appendChild(container)
  const t = client.fallbackTranslate('zh')
  const whale = client.mountStatusWhale({
    document: doc,
    seat: client.classicSeat({
      document: doc,
      container,
      fallbackWord: t('status.thinking'),
      startTime: harness.time(),
      formatClock: (ms) => client.formatClassicClock(ms, t),
      now: () => harness.time(),
      ...overrides,
    }),
    size: 26,
    motion: overrides.motion ?? 'full',
    activity: { state: 'thinking' },
    word: t('status.thinking'),
    random: client.seededRandom(11),
  })
  const row = container.querySelector(`[${client.CLASSIC_ROW_ATTR}]`)
  return { container, whale, row, t }
}

test('the classic row is the old label: whale first, then the blue words', () => {
  const harness = createHarness()
  const { whale, row } = mountClassic(harness)
  assert.ok(row, 'no row was built')
  assert.equal(whale.isAttached(), true)
  assert.equal(row.getAttribute('aria-hidden'), 'true', 'DSH’s own announcement is the accessible signal')
  const host = row.firstElementChild
  assert.ok(host.hasAttribute(harness.client.STATUS_HOST_ATTR), 'the whale is not first in the row')
  assert.equal(host.getAttribute(harness.client.STATUS_KIND_ATTR), 'classic')
  assert.ok(host.querySelector('svg'), 'the whale was not drawn')
  assert.equal(row.querySelector('.wb-classic__word').textContent, '深度求索中...')
  whale.destroy()
  harness.close()
})

test('the classic row names what the turn is doing', () => {
  const harness = createHarness()
  const { whale, row } = mountClassic(harness)
  whale.setActivity({ state: 'working', task: 'searching' }, '联网检索中...')
  assert.equal(row.querySelector('.wb-classic__word').textContent, '联网检索中...')
  harness.advance(900)
  whale.setActivity({ state: 'thinking' }, undefined)
  assert.equal(row.querySelector('.wb-classic__word').textContent, '深度求索中...')
  whale.destroy()
  harness.close()
})

test('the clock waits fifteen seconds, then counts like DSH 0.1.5 did', () => {
  const harness = createHarness()
  const { whale, row } = mountClassic(harness)
  const clock = row.querySelector('.wb-classic__clock')
  assert.equal(clock.hidden, true)
  harness.advance(14_000, 250)
  assert.equal(clock.hidden, true, 'the clock appeared early')
  harness.advance(2_000, 250)
  assert.equal(clock.hidden, false, 'the clock never appeared')
  assert.equal(clock.textContent, '16秒')
  harness.advance(50_000, 500)
  assert.equal(clock.textContent, '1分06秒')
  whale.destroy()
  harness.close()
})

test('a turn that began before the row counts from the turn, not the row', () => {
  const harness = createHarness()
  harness.advance(40_000, 1000)
  const { whale, row } = mountClassic(harness, { startTime: 0 })
  const clock = row.querySelector('.wb-classic__clock')
  assert.equal(clock.hidden, false)
  assert.equal(clock.textContent, '40秒')
  whale.destroy()
  harness.close()
})

test('the clock formats both languages', () => {
  const harness = createHarness()
  const { formatClassicClock, fallbackTranslate } = harness.client
  const zh = fallbackTranslate('zh')
  const en = fallbackTranslate('en')
  assert.equal(formatClassicClock(9_400, zh), '9秒')
  assert.equal(formatClassicClock(65_000, zh), '1分05秒')
  assert.equal(formatClassicClock(9_400, en), '9s')
  assert.equal(formatClassicClock(125_000, en), '2m 05s')
  assert.equal(formatClassicClock(-5, en), '0s')
  harness.close()
})

test('destroy removes the row, stops the clock and the frame loop', () => {
  const harness = createHarness()
  const { whale, container } = mountClassic(harness)
  harness.advance(500)
  whale.destroy()
  harness.advance(600)
  assert.equal(container.children.length, 0, 'the row survived')
  assert.equal(harness.pendingFrames(), 0, 'a frame survived')
  assert.equal(harness.pendingTimers(), 0, 'the clock survived')
  harness.close()
})

test('still motion stops the sweep; the system preference stops it in CSS', () => {
  const harness = createHarness()
  const { whale, row } = mountClassic(harness, { motion: 'static' })
  assert.equal(row.hasAttribute('data-still'), true)
  whale.setMotion('full')
  assert.equal(row.hasAttribute('data-still'), false)
  whale.setMotion('static')
  assert.equal(row.hasAttribute('data-still'), true)

  harness.client.injectPluginCss(harness.document)
  const css = harness.document.querySelector('style[data-plugin-css]').textContent
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(reduced, /\.wb-classic__word\s*\{[^}]*animation:\s*none/)
  assert.match(css, /\.wb-classic\[data-still\] \.wb-classic__word\s*\{[^}]*animation:\s*none/)
  whale.destroy()
  harness.close()
})

test('the classic row paints the blue DSH painted, with DSH’s own tokens', () => {
  const harness = createHarness()
  harness.client.injectPluginCss(harness.document)
  const css = harness.document.querySelector('style[data-plugin-css]').textContent
  assert.match(css, /--dsw-static-deepseek-500, #4176e6/)
  assert.match(css, /--dsw-static-deepseek-200, #d3e2ff/)
  assert.match(css, /\.wb-classic__word\s*\{[^}]*background-clip:\s*text/)
  harness.close()
})

test('the classic option is off by default and read like every other setting', () => {
  const harness = createHarness()
  const { loadConfig, DEFAULT_CONFIG } = harness.client
  assert.equal(DEFAULT_CONFIG.classicStatus, false)
  const read = (value) =>
    loadConfig({ getItem: (key) => (key === 'dsh-whale-buddy.classicStatus' ? value : null), setItem: () => {} })
  assert.equal(read(null).classicStatus, false)
  assert.equal(read('1').classicStatus, true)
  assert.equal(read('0').classicStatus, false)
  harness.close()
})

test('whether DSH draws the row itself is decided once, and never guessed', () => {
  const harness = createHarness()
  const storage = { getItem: () => null, setItem: () => {} }
  const store = new harness.client.WhaleStateStore(harness.client.loadConfig(storage))
  let calls = 0
  store.subscribe(() => calls++)
  assert.equal(store.getSnapshot().classicRowHost, 'unknown')
  store.markClassicRowHost('native')
  store.markClassicRowHost('absent')
  store.markClassicRowHost('native')
  assert.equal(store.getSnapshot().classicRowHost, 'native', 'a later verdict overturned the first')
  assert.equal(calls, 1, 'the latch notified more than once')
  harness.close()
})

test('the clock reads a start DSH publishes late, and stops when the turn does', () => {
  const harness = createHarness()
  let start = null
  let live = true
  const { whale, row } = mountClassic(harness, { startTime: () => start, live: () => live })
  const clock = row.querySelector('.wb-classic__clock')
  harness.advance(20_000, 500)
  assert.equal(clock.textContent, '20秒', 'with no start yet, the row counts from when it was built')
  start = -10_000
  harness.advance(1_000, 500)
  assert.equal(clock.textContent, '31秒', 'the published start was ignored')
  live = false
  harness.advance(5_000, 500)
  assert.equal(clock.textContent, '31秒', 'the clock kept running after the turn ended')
  whale.destroy()
  harness.close()
})

test('the Dock panel carries the classic toggle and reports it', () => {
  const harness = createHarness()
  const changes = []
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle',
    motion: 'full',
    inlineEnabled: true,
    classicStatus: false,
    t: harness.client.fallbackTranslate('zh'),
    onClassicStatus: (value) => changes.push(value),
  })
  dock.button.click()
  const toggle = dock.element.querySelector('#wb-dock-classic')
  assert.ok(toggle, 'no classic toggle in the panel')
  assert.equal(toggle.checked, false)
  assert.match(dock.element.querySelector(`label[for="${toggle.id}"]`).textContent, /深度求索中/)
  toggle.checked = true
  toggle.dispatchEvent(new harness.window.Event('change'))
  assert.deepEqual(changes, [true])
  dock.setClassicStatus(false)
  assert.equal(toggle.checked, false)
  dock.destroy()
  harness.close()
})
