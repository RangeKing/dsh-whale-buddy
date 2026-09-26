/** Real React slot entries consuming the production bundle, as DSH does. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createHarness } from './harness.mjs'

async function mounted({ classic = false, legacy = false } = {}) {
  const h = createHarness({ react: React })
  const saved = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.window = h.window
  globalThis.document = h.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const entries = new Map()
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => () => {}, bind: () => h.client.fallbackTranslate('zh') },
    slots: {
      inject: (_name, fn) => fn(),
      register: (options, component) => {
        entries.set(options.name, { component, ...options.inject() })
        return () => {}
      },
    },
  }
  const dispose = h.client.apply(ctx)
  const store = entries.get('shell.overlay').store
  store.setConfig('classicStatus', classic)
  const status = h.document.createElement('div')
  status.innerHTML = legacy ? '<div role="status">深度求索中...</div>'
    : '<span role="status">深度求索中</span><button data-turn-process="1"><span>深度求索中，用时1秒</span></button>'
  h.document.body.appendChild(status)
  let facts = { running: true, tool: undefined, partial: null, sessionId: 's1' }
  const t = h.client.fallbackTranslate('zh')
  const root = createRoot(h.document.getElementById('root'))
  const render = () => {
    const props = {
      sessionId: facts.sessionId,
      useSession: (select) => select({ running: facts.running }),
      useChat: (select) => select({ legacy: { runningCalls: facts.tool ? [{ name: facts.tool }] : [], partial: facts.partial, turnTimings: new Map() } }),
      useSessions: (select) => select(legacy ? { current: facts.sessionId, byId: { [facts.sessionId]: { running: facts.running } } } : { byId: {} }),
      useSessionStatus: (select) => select(new Map()),
    }
    root.render(React.createElement(React.Fragment, null, ...Array.from(entries, ([key, entry]) =>
      React.createElement(entry.component, { key, store, t, ...props }))))
  }
  await React.act(async () => render())
  const advance = async (ms) => { await React.act(async () => h.advance(ms)) }
  await advance(2200)
  return {
    ...h, store, advance,
    async update(next) { facts = { ...facts, ...next }; await React.act(async () => render()) },
    async open() { await React.act(async () => h.document.querySelector('.wb-dock__button').click()); await advance(800) },
    async close() {
      await React.act(async () => root.unmount())
      dispose()
      h.close()
      globalThis.window = saved.window
      globalThis.document = saved.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
    },
  }
}

function prop(scope) {
  return Array.from(scope.querySelectorAll('[data-wb-prop]')).find(el => el.style.display !== 'none' && Number(el.getAttribute('opacity')) > 0)?.getAttribute('data-wb-prop')
}

for (const legacy of [false, true]) test(`session task reaches collapsed and expanded Dock (${legacy ? '0.1.5' : '0.1.7'})`, async () => {
  const h = await mounted({ legacy })
  try {
    for (const [tool, expected] of [['fs_read', 'files'], ['fs_write', 'pencil'], ['web_search', 'glass']]) {
      await h.update({ tool })
      await h.advance(1800)
      assert.equal(prop(h.document.querySelector('.wb-status')), expected)
      assert.equal(prop(h.document.querySelector('.wb-dock__mark')), expected, 'Dock lost the session tool task')
    }
    await h.open()
    assert.equal(prop(h.document.querySelector('.wb-dock__preview')), 'glass', 'opening the panel lost the task')
  } finally { await h.close() }
})

test('classic row keeps Deep diving while task props continue to change', async () => {
  const h = await mounted({ classic: true })
  try {
    for (const next of [{ tool: 'web_search' }, { tool: undefined, partial: 'answer' }]) {
      await h.update(next)
      await h.advance(1800)
      assert.equal(h.document.querySelector('.wb-classic__word')?.textContent, 'Deep diving...')
    }
    await h.open()
    assert.match(h.document.querySelector('.wb-dock__controls').textContent, /Deep diving/)
  } finally { await h.close() }
})

test('rapid task updates share one hold and a new session cancels the queued task', async () => {
  const h = await mounted()
  try {
    const inline = () => h.document.querySelector('.wb-status')?.getAttribute('data-whale-buddy-status')
    const dock = () => h.document.querySelector('.wb-dock__shell').dataset.activity
    await h.update({ tool: 'fs_read' })
    assert.equal(inline(), 'working:reading')
    assert.equal(dock(), inline())
    await h.advance(100)
    await h.update({ tool: 'web_search' })
    assert.equal(inline(), 'working:reading')
    assert.equal(dock(), inline(), 'Dock bypassed the session activity hold')
    await h.advance(700)
    assert.equal(inline(), 'working:searching')
    assert.equal(dock(), inline())
    await h.update({ tool: 'fs_write' })
    await h.update({ sessionId: 's2', tool: undefined, running: false })
    await h.advance(1000)
    assert.equal(dock(), 'idle', 'old session task survived navigation')
    assert.equal(h.document.querySelector('.wb-status'), null)
  } finally { await h.close() }
})

test('turn completion clears the fixed classic label and inline-disabled Dock still follows tasks', async () => {
  const h = await mounted({ classic: true })
  try {
    await React.act(async () => h.store.setConfig('inlineEnabled', false))
    await h.update({ tool: 'fs_read' })
    await h.advance(1800)
    assert.equal(prop(h.document.querySelector('.wb-dock__mark')), 'files')
    assert.equal(h.document.querySelector('.wb-classic'), null)
    await React.act(async () => h.store.setConfig('inlineEnabled', true))
    assert.equal(h.document.querySelector('.wb-classic__word').textContent, 'Deep diving...')
    await h.update({ running: false, tool: undefined })
    assert.equal(h.document.querySelector('.wb-classic'), null)
    assert.equal(h.document.querySelector('.wb-dock__shell').dataset.activity, 'idle')
  } finally { await h.close() }
})

test('classic option keeps Deep diving in DSH’s native old row too', async () => {
  const h = await mounted({ classic: true, legacy: true })
  try {
    await h.update({ tool: 'web_search' })
    await h.advance(1800)
    assert.equal(h.document.querySelector('.wb-classic'), null, 'duplicated the native row')
    assert.match(h.document.querySelector('[role="status"]').textContent, /^Deep diving\.\.\./)
  } finally { await h.close() }
})
