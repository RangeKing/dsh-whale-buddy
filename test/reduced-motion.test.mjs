/** Reduced motion: still whale, still usable. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

const DEEP_DIVING = '深度求索中...'

/** Mount the status whale into a stand-in for DSH's running-turn row. */
function mountStatus(harness) {
  const status = harness.document.createElement('div')
  status.setAttribute('role', 'status')
  status.textContent = DEEP_DIVING
  harness.document.body.appendChild(status)
  const whale = harness.client.mountStatusWhale({
    document: harness.document,
    match: (text) => text.includes('深度求索'),
    size: 20,
    motion: 'full',
    activity: { state: 'thinking' },
    word: DEEP_DIVING,
  })
  return { status, whale, host: () => status.querySelector('[data-whale-buddy-status]') }
}

test('a reduced-motion whale runs no frame loop and holds the source mark', () => {
  const harness = createHarness({ reducedMotion: true })
  const { whale, host } = mountStatus(harness)
  assert.equal(whale.view().isAnimating(), false)
  const body = host().querySelector('rect[mask]').parentNode
  const before = body.getAttribute('transform')
  harness.advance(5000)
  assert.equal(harness.pendingFrames(), 0, 'frames were scheduled under reduced motion')
  assert.equal(body.getAttribute('transform'), before, 'the mark moved under reduced motion')
  assert.match(before, /rotate\(0 /)
  harness.close()
})

test('the system preference outranks the plugin motion setting', () => {
  const harness = createHarness({ reducedMotion: true })
  const { whale } = mountStatus(harness)
  whale.setMotion('full')
  harness.advance(2000)
  assert.equal(whale.view().isAnimating(), false, 'a plugin setting overrode the system preference')
  harness.close()
})

test('turning reduced motion on stops a running whale, and off restarts it', () => {
  const harness = createHarness()
  const { whale, host } = mountStatus(harness)
  harness.advance(1000)
  assert.equal(whale.view().isAnimating(), true)

  harness.setReducedMotion(true)
  harness.advance(1000)
  assert.equal(harness.pendingFrames(), 0)
  const body = host().querySelector('rect[mask]').parentNode
  const still = body.getAttribute('transform')
  harness.advance(3000)
  assert.equal(body.getAttribute('transform'), still)

  harness.setReducedMotion(false)
  harness.advance(1000)
  assert.equal(whale.view().isAnimating(), true, 'motion did not resume')
  harness.close()
})

test('the dock opens and closes immediately under reduced motion, with no timers left', () => {
  const harness = createHarness({ reducedMotion: true })
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle',
    motion: 'full',
    inlineEnabled: true,
  })
  dock.button.click()
  assert.equal(dock.isExpanded(), true)
  assert.ok(dock.element.querySelector('.wb-dock__panel'))

  dock.button.click()
  assert.equal(dock.isExpanded(), false)
  assert.equal(dock.element.querySelector('.wb-dock__panel'), null, 'the panel waited on a transition')
  assert.equal(harness.pendingTimers(), 0, 'a transition timer was scheduled under reduced motion')
  harness.close()
})

test('every interaction still works under reduced motion', () => {
  const harness = createHarness({ reducedMotion: true })
  const changes = []
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle',
    motion: 'full',
    inlineEnabled: true,
    onMotion: (value) => changes.push(value),
  })
  dock.button.click()
  const select = dock.element.querySelector('#wb-dock-motion')
  select.value = 'static'
  select.dispatchEvent(new harness.window.Event('change'))
  assert.deepEqual(changes, ['static'])

  harness.document.dispatchEvent(new harness.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(dock.isExpanded(), false)
  harness.close()
})

test('the stylesheet parses and every rule survives', () => {
  const harness = createHarness()
  harness.client.injectPluginCss(harness.document)
  const tag = harness.document.querySelector('style[data-plugin-css]')
  assert.ok(tag, 'the stylesheet was not injected')
  assert.equal(tag.getAttribute('data-plugin'), 'dsh-whale-buddy')
  const selectors = [...tag.sheet.cssRules].map((rule) => rule.selectorText ?? rule.conditionText ?? '')
  for (const expected of [
    ':root',
    '.wb-dock',
    '.wb-dock__shell',
    '.wb-dock__button:focus-visible',
    'body[data-ds-dark-theme]',
    '[data-rightbar-fullscreen] .wb-dock',
    '(prefers-reduced-motion: reduce)',
  ]) {
    assert.ok(selectors.includes(expected), `rule dropped by the parser: ${expected}`)
  }
  // Injection is idempotent: a second call adds no second tag.
  harness.client.injectPluginCss(harness.document)
  assert.equal(harness.document.querySelectorAll('style[data-plugin-css]').length, 1)
  harness.close()
})

test('the theme fallbacks track both the system preference and DSH own signal', () => {
  const harness = createHarness()
  const css = harness.client.PLUGIN_CSS
  // The tokens DSH actually writes, not invented names.
  for (const token of [
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-border-l3',
    '--dsw-alias-button-floating-fill',
  ]) {
    assert.ok(css.includes(token), `stylesheet does not consume ${token}`)
  }
  assert.match(css, /@media \(prefers-color-scheme: dark\)/)
  assert.match(css, /body\[data-ds-dark-theme\]/)
  harness.close()
})

test('the stylesheet disables shell transitions under reduced motion', () => {
  const harness = createHarness()
  const css = harness.client.PLUGIN_CSS
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(block, /\.wb-dock__shell/)
  assert.match(block, /transition: none !important/)
  assert.match(block, /transform: none/)
  harness.close()
})

test('reduced motion has no breach, and none is left hanging in the air', () => {
  const harness = createHarness({ reducedMotion: true })
  const { whale, host } = mountStatus(harness)
  assert.equal(whale.view().engine.isLeaping, false, 'a breach played under reduced motion')
  whale.view().leap()
  assert.equal(whale.view().engine.isLeaping, false, 'an explicit breach was honoured anyway')
  harness.advance(2000)
  assert.equal(harness.pendingFrames(), 0, 'the breach started a frame loop')
  const body = host().querySelector('rect[mask]').parentNode
  assert.equal(body.getAttribute('opacity'), '1', 'the whale was left partly faded')
  harness.close()
})

test('turning reduced motion on mid-breach puts the whale back on the water', () => {
  const harness = createHarness()
  const { whale, host } = mountStatus(harness)
  whale.view().leap()
  // Half a second in: airborne, tilted, and fully drawn.
  harness.advance(500)
  const body = host().querySelector('rect[mask]').parentNode
  assert.match(body.getAttribute('transform'), /translate\(-?[\d.]+ -[\d.]+\)/, 'the whale is not airborne')

  harness.setReducedMotion(true)
  assert.equal(whale.view().engine.isLeaping, false)
  assert.equal(body.getAttribute('opacity'), '1')
  assert.match(body.getAttribute('transform'), /^translate\(0 0\)/, 'the whale was stranded mid-arc')
  harness.close()
})
