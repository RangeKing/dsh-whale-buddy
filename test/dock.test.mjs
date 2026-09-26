/** Surface B: the Whale Dock — one continuous, edge-anchored, accessible surface. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

/** Mount a dock into a stand-in for the DSH shell overlay layer. */
function mount(options = {}) {
  const harness = createHarness(options.harness)
  const overlay = harness.document.getElementById('root')
  const dock = harness.client.mountWhaleDock({
    host: overlay,
    state: options.state ?? 'idle',
    motion: options.motion ?? 'full',
    inlineEnabled: true,
    random: harness.client.seededRandom(11),
    ...options.dock,
  })
  return { harness, overlay, dock }
}

test('exactly one dock root exists, and a second mount refuses', () => {
  const { harness, overlay, dock } = mount()
  assert.ok(dock)
  assert.equal(overlay.querySelectorAll('[data-whale-buddy-dock]').length, 1)
  const again = harness.client.mountWhaleDock({
    host: overlay,
    state: 'idle',
    motion: 'full',
    inlineEnabled: true,
  })
  assert.equal(again, null, 'a second mount into the same host must refuse')
  assert.equal(overlay.querySelectorAll('[data-whale-buddy-dock]').length, 1)
  harness.close()
})

test('mount and unmount are idempotent across repeated cycles', () => {
  const { harness, overlay } = mount()
  for (let i = 0; i < 5; i++) {
    const existing = overlay.querySelector('[data-whale-buddy-dock]')
    assert.ok(existing)
    // Simulate a host rerender: tear down, mount again, never stack.
    const dock = harness.client.mountWhaleDock({ host: overlay, state: 'idle', motion: 'full', inlineEnabled: true })
    assert.equal(dock, null)
    assert.equal(overlay.querySelectorAll('[data-whale-buddy-dock]').length, 1)
  }
  harness.close()
})

test('the collapsed control is a real, labelled, keyboard-reachable button', () => {
  const { harness, dock } = mount()
  assert.equal(dock.button.tagName, 'BUTTON')
  assert.equal(dock.button.type, 'button')
  assert.ok(dock.button.getAttribute('aria-label').length > 0)
  assert.equal(dock.button.getAttribute('aria-expanded'), 'false')
  // No tabindex override: the button keeps its natural place in the tab order.
  assert.equal(dock.button.getAttribute('tabindex'), null)
  assert.equal(dock.element.querySelector('svg').getAttribute('aria-hidden'), 'true')
  harness.close()
})

test('clicking toggles the panel and keeps aria in step', () => {
  const { harness, dock } = mount()
  dock.button.click()
  assert.equal(dock.isExpanded(), true)
  assert.equal(dock.button.getAttribute('aria-expanded'), 'true')
  assert.ok(dock.element.querySelector('.wb-dock__panel'))

  dock.button.click()
  assert.equal(dock.isExpanded(), false)
  assert.equal(dock.button.getAttribute('aria-expanded'), 'false')
  harness.advance(400)
  assert.equal(dock.element.querySelector('.wb-dock__panel'), null, 'the panel outlived its close')
  harness.close()
})

test('keyboard activation opens the panel', () => {
  const { harness, dock } = mount()
  dock.button.focus()
  assert.equal(harness.document.activeElement, dock.button)
  // Enter on a button fires a click in a real browser; assert the handler path.
  dock.button.click()
  assert.equal(dock.isExpanded(), true)
  harness.close()
})

test('Escape closes the panel and returns focus to the button', () => {
  const { harness, dock } = mount()
  dock.button.click()
  const event = new harness.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  harness.document.dispatchEvent(event)
  assert.equal(dock.isExpanded(), false)
  assert.equal(harness.document.activeElement, dock.button)
  harness.close()
})

test('the close control closes the panel', () => {
  const { harness, dock } = mount()
  dock.button.click()
  dock.element.querySelector('.wb-dock__close').click()
  assert.equal(dock.isExpanded(), false)
  harness.close()
})

test('a pointer press outside closes, a press inside does not', () => {
  const { harness, dock } = mount()
  const outside = harness.document.createElement('button')
  harness.document.body.appendChild(outside)

  dock.button.click()
  dock.element.querySelector('.wb-dock__panel').dispatchEvent(
    new harness.window.Event('pointerdown', { bubbles: true }),
  )
  assert.equal(dock.isExpanded(), true, 'a press inside the panel must not dismiss it')

  outside.dispatchEvent(new harness.window.Event('pointerdown', { bubbles: true }))
  assert.equal(dock.isExpanded(), false)
  harness.close()
})

test('opening hands focus on, because the trigger leaves the layout', () => {
  const { harness, dock } = mount()
  // Expanded, the collapsed whale is removed so the panel holds the only whale
  // on screen. Focus cannot stay on an element that is no longer rendered.
  dock.button.focus()
  dock.button.click()
  assert.equal(
    harness.document.activeElement,
    dock.element.querySelector('.wb-dock__close'),
    'focus was stranded on the hidden trigger',
  )
  assert.match(harness.client.PLUGIN_CSS, /\[data-expanded='true'\] \.wb-dock__button \{\s*display: none;/)
  harness.close()
})

test('a pointer open does not steal focus from wherever the user was', () => {
  const { harness, dock } = mount()
  const elsewhere = harness.document.createElement('input')
  harness.document.body.appendChild(elsewhere)
  elsewhere.focus()
  dock.button.click()
  assert.equal(dock.isExpanded(), true)
  assert.equal(harness.document.activeElement, elsewhere, 'opening stole focus from the page')
  harness.close()
})

test('the panel does not trap focus', () => {
  const { harness, dock } = mount()
  dock.button.click()
  const outside = harness.document.createElement('input')
  harness.document.body.appendChild(outside)
  outside.focus()
  assert.equal(harness.document.activeElement, outside, 'focus could not leave the panel')
  harness.close()
})

test('rapid open/close/open settles on the state the last call asked for', () => {
  const { harness, dock } = mount()
  for (const want of [true, false, true, false, true]) {
    dock.setExpanded(want)
    harness.advance(20)
  }
  harness.advance(1200)
  assert.equal(dock.isExpanded(), true)
  assert.ok(dock.element.querySelector('.wb-dock__panel'), 'a stale close destroyed the live panel')
  assert.equal(dock.button.getAttribute('aria-expanded'), 'true')

  // And the other way round.
  for (const want of [false, true, false]) {
    dock.setExpanded(want)
    harness.advance(20)
  }
  harness.advance(1200)
  assert.equal(dock.isExpanded(), false)
  assert.equal(dock.element.querySelector('.wb-dock__panel'), null)
  harness.close()
})

test('the shell stays anchored to the right edge in both states', () => {
  const { harness, dock } = mount()
  const css = harness.client.PLUGIN_CSS
  assert.match(css, /\.wb-dock\s*\{[^}]*right:\s*0/)
  assert.match(css, /\.wb-dock__shell\s*\{[^}]*transform-origin:\s*100% 50%/)
  // Collapsed and expanded are the same element, so the anchor cannot move.
  const shell = dock.element.querySelector('.wb-dock__shell')
  dock.button.click()
  assert.equal(dock.element.querySelector('.wb-dock__shell'), shell)
  assert.equal(shell.dataset.expanded, 'true')
  harness.close()
})

test('the panel controls are reachable and report changes', () => {
  const harness = createHarness()
  const changes = []
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle',
    motion: 'full',
    inlineEnabled: true,
    onInlineEnabled: (value) => changes.push(['inline', value]),
    onMotion: (value) => changes.push(['motion', value]),
  })
  dock.button.click()
  const toggle = dock.element.querySelector('#wb-dock-inline')
  const select = dock.element.querySelector('#wb-dock-motion')
  assert.ok(toggle && select)
  assert.equal(dock.element.querySelector(`label[for="${toggle.id}"]`).textContent.length > 0, true)

  toggle.checked = false
  toggle.dispatchEvent(new harness.window.Event('change'))
  select.value = 'subtle'
  select.dispatchEvent(new harness.window.Event('change'))
  assert.deepEqual(changes.map((c) => `${c[0]}:${c[1]}`), ['inline:false', 'motion:subtle'])
  harness.close()
})

test('the shell carries the semantic state so the collapsed whale can react', () => {
  const { harness, dock } = mount({ state: 'idle' })
  const shell = dock.element.querySelector('.wb-dock__shell')
  assert.equal(shell.dataset.state, 'idle')
  dock.setState('thinking')
  assert.equal(shell.dataset.state, 'thinking')
  assert.match(harness.client.PLUGIN_CSS, /\[data-state='thinking'\] \.wb-dock__mark \{ opacity: 1; \}/)
  harness.close()
})

test('classic status is unavailable without inline whale and keeps its preference', () => {
  const { harness, dock } = mount({ dock: { classicStatus: true } })
  dock.setExpanded(true)
  const inline = dock.element.querySelector('#wb-dock-inline')
  const classic = dock.element.querySelector('#wb-dock-classic')
  assert.equal(inline.getAttribute('role'), 'switch')
  assert.equal(classic.getAttribute('role'), 'switch')
  inline.click()
  assert.equal(classic.disabled, true)
  classic.click()
  assert.equal(classic.checked, true, 'a disabled click changed the saved choice')
  dock.setInlineEnabled(true)
  assert.equal(classic.disabled, false)
  assert.equal(classic.checked, true)
  dock.setInlineEnabled(false)
  dock.setExpanded(false)
  harness.advance(500)
  dock.setExpanded(true)
  assert.equal(dock.element.querySelector('#wb-dock-classic').disabled, true)
  dock.destroy()
  harness.close()
})

test('the panel reflects semantic state in words', () => {
  const { harness, dock } = mount({ state: 'idle' })
  dock.button.click()
  const label = dock.element.querySelector('.wb-dock__state strong')
  assert.equal(label.textContent, harness.client.en['state.idle'])
  dock.setState('thinking')
  assert.equal(label.textContent, harness.client.en['state.thinking'])
  harness.close()
})

test('destroy removes the dock, its listeners and its pending work', () => {
  const { harness, overlay, dock } = mount()
  dock.button.click()
  harness.advance(100)
  dock.destroy()
  harness.advance(1000)

  assert.equal(overlay.querySelectorAll('[data-whale-buddy-dock]').length, 0)
  assert.equal(harness.pendingFrames(), 0, 'a frame survived destroy')
  assert.equal(harness.pendingTimers(), 0, 'a timer survived destroy')

  // The document-level listeners are gone: these must be inert now.
  harness.document.dispatchEvent(new harness.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  harness.document.body.dispatchEvent(new harness.window.Event('pointerdown', { bubbles: true }))
  harness.close()
})

test('the Dock can be dragged along its edge, and a drag is not a click', () => {
  const harness = createHarness()
  const moves = []
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle', motion: 'full', inlineEnabled: true, dockTop: 0.5,
    onDockTop: (top) => moves.push(top),
  })
  const root = dock.element
  const press = (type, y, id = 1) =>
    dock.button.dispatchEvent(
      Object.assign(new harness.window.Event(type, { bubbles: true, cancelable: true }), {
        pointerId: id, button: 0, clientY: y,
      }),
    )

  // A press that barely moves is a click: the panel toggles, nothing moves.
  press('pointerdown', 400)
  press('pointermove', 402)
  press('pointerup', 402)
  dock.button.click()
  assert.equal(dock.isExpanded(), true, 'a two-pixel wobble swallowed the click')
  assert.deepEqual(moves, [])
  dock.setExpanded(false)
  harness.advance(500)

  // A real drag moves it and suppresses exactly one click.
  press('pointerdown', 400, 2)
  press('pointermove', 450, 2)
  press('pointerup', 450, 2)
  assert.equal(moves.length, 1, 'the drag did not report a position')
  assert.ok(moves[0] > 0.5, `dragging down did not move down: ${moves[0]}`)
  assert.ok(root.style.getPropertyValue('--wb-dock-top').length > 0)

  dock.button.click()
  assert.equal(dock.isExpanded(), false, 'the drag-ending click toggled the panel')
  // …and only one click is eaten.
  dock.button.click()
  assert.equal(dock.isExpanded(), true, 'the click suppression outlived its drag')
  harness.close()
})

test('the Dock position is clamped and keyboard reachable', () => {
  const harness = createHarness()
  const moves = []
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle', motion: 'full', inlineEnabled: true, dockTop: 0.5,
    onDockTop: (top) => moves.push(top),
  })
  const key = (k) =>
    dock.button.dispatchEvent(
      new harness.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
    )
  key('ArrowUp')
  key('ArrowUp')
  assert.ok(moves.at(-1) < 0.5, 'arrow up did not move the Dock up')
  key('Home')
  assert.equal(moves.at(-1), 0)
  key('ArrowUp')
  assert.equal(moves.at(-1), 0, 'the Dock ran off the top of its track')
  key('End')
  assert.equal(moves.at(-1), 1)
  key('ArrowDown')
  assert.equal(moves.at(-1), 1, 'the Dock ran off the bottom of its track')
  harness.close()
})

test('dragging suspends the shell transition and cleans up after itself', () => {
  const harness = createHarness()
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle', motion: 'full', inlineEnabled: true,
  })
  const press = (type, y) =>
    dock.button.dispatchEvent(
      Object.assign(new harness.window.Event(type, { bubbles: true, cancelable: true }), {
        pointerId: 9, button: 0, clientY: y,
      }),
    )
  press('pointerdown', 300)
  press('pointermove', 380)
  assert.equal(dock.element.dataset.dragging, '', 'the drag state was not flagged')
  assert.match(harness.client.PLUGIN_CSS, /\[data-dragging\] \.wb-dock__shell \{ transition: none; \}/)
  press('pointerup', 380)
  assert.equal(dock.element.dataset.dragging, undefined, 'the drag flag outlived the drag')

  dock.destroy()
  // Listeners are gone: these must be inert rather than throwing or moving.
  press('pointerdown', 100)
  press('pointermove', 500)
  harness.close()
})

test('a stored Dock position is validated like every other setting', () => {
  const harness = createHarness()
  const read = (value) =>
    harness.client.loadConfig({
      getItem: (key) => (key === 'dsh-whale-buddy.dockTop' ? value : null),
      setItem: () => {},
    }).dockTop
  assert.equal(read('0.25'), 0.25)
  assert.equal(read('7'), harness.client.DEFAULT_CONFIG.dockTop)
  assert.equal(read('-1'), harness.client.DEFAULT_CONFIG.dockTop)
  assert.equal(read('banana'), harness.client.DEFAULT_CONFIG.dockTop)
  assert.equal(read(null), harness.client.DEFAULT_CONFIG.dockTop)
  harness.close()
})

test('the panel names every semantic state, not just thinking', () => {
  const harness = createHarness()
  const t = harness.client.fallbackTranslate('en')
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle', motion: 'full', inlineEnabled: true, t,
  })
  dock.button.click()
  const name = () => dock.element.querySelector('.wb-dock__state strong').textContent
  for (const state of ['idle', 'thinking', 'responding', 'working', 'waiting']) {
    dock.setState(state)
    assert.equal(name(), t(`state.${state}`), `${state} is not named in the panel`)
  }
  // The version this replaces tested `=== 'thinking'`, so everything else read
  // as "Idle" — a panel confidently reporting the wrong thing.
  dock.setState('working')
  assert.notEqual(name(), t('state.idle'))
  harness.close()
})

test('the Dock breaches when a turn begins, and only then', () => {
  const harness = createHarness()
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle', motion: 'full', inlineEnabled: true,
  })
  assert.equal(dock.view.engine.isLeaping, false, 'the Dock breached while nothing was running')

  dock.setState('thinking')
  assert.equal(dock.view.engine.isLeaping, true, 'a turn started without a breach')
  harness.advance(2000)
  assert.equal(dock.view.engine.isLeaping, false)

  // Moving between running states is not a new turn.
  for (const state of ['working', 'responding', 'waiting']) {
    dock.setState(state)
    assert.equal(dock.view.engine.isLeaping, false, `${state} was treated as a new turn`)
  }
  dock.setState('idle')
  dock.setState('thinking')
  assert.equal(dock.view.engine.isLeaping, true, 'the next turn did not breach')
  harness.close()
})

test('the collapsed shell stops clipping so the breach is not sliced', () => {
  const harness = createHarness()
  harness.client.injectPluginCss(harness.document)
  const css = harness.client.PLUGIN_CSS
  // The clip exists for the expand animation and must come back for it. While
  // collapsed and settled there is nothing to clip, and the Dock whale's arc
  // draws an element taller than the 42 px pill it lives in.
  assert.match(css, /\.wb-dock__shell\[data-expanded='false'\]:not\(\[data-transitioning\]\):not\(\[data-measuring\]\)\s*\{\s*overflow: visible/)

  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle', motion: 'full', inlineEnabled: true,
  })
  const shell = dock.element.querySelector('.wb-dock__shell')
  // jsdom does no layout, so offsetHeight is 0 and the shell would skip its
  // animation entirely. Stand in for the browser: collapsed is the button,
  // open is whatever the panel measures to.
  Object.defineProperty(shell, 'offsetHeight', {
    configurable: true,
    get: () => (shell.style.height === 'auto' ? 210 : 42),
  })
  assert.equal(shell.dataset.transitioning, undefined, 'the shell starts mid-transition')
  dock.setExpanded(true)
  assert.equal(dock.element.style.getPropertyValue('--wb-dock-size'), '210px',
    'the open panel still uses the collapsed travel track')
  assert.equal(shell.dataset.transitioning, '', 'the clip was not restored for the open')
  harness.advance(harness.client.DOCK_TRANSITION_MS + 80)
  // A stuck flag is the failure that matters: it would leave the clip on
  // forever and silently slice every breach from then on.
  assert.equal(shell.dataset.transitioning, undefined, 'the clip was never released again')
  dock.setExpanded(false)
  assert.equal(dock.element.style.getPropertyValue('--wb-dock-size'), '42px')
  harness.close()
})

test('the Dock whale gives its layout box back, so the pill stays 42px', () => {
  const harness = createHarness()
  const dock = harness.client.mountWhaleDock({
    host: harness.document.getElementById('root'),
    state: 'idle', motion: 'full', inlineEnabled: true,
  })
  const mark = dock.element.querySelector('.wb-dock__mark')
  const bleed = dock.view.renderer.bleedPx
  assert.ok(bleed.y > 8, 'the Dock drawing carries no room for an arc')
  assert.equal(mark.style.marginTop, `${-bleed.y}px`)
  assert.equal(mark.style.marginLeft, `${-bleed.x}px`)
  harness.close()
})
