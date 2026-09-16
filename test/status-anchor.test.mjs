/**
 * The one module that writes into DSH's own DOM.
 *
 * Everything here is about the two properties that make that survivable: it
 * re-applies itself when React re-renders the row underneath it, and it puts
 * back exactly what it found when it lets go.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

const DEEP_DIVING = '深度求索中...'
const match = (text) => /diving|深度求索|Working|Reading/i.test(text)

/** Build a stand-in for DSH's transcript with its running-turn status row. */
function withStatus(harness, label = DEEP_DIVING) {
  const column = harness.document.createElement('div')
  const status = harness.document.createElement('div')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = label
  column.appendChild(status)
  harness.document.body.appendChild(column)
  return { column, status }
}

/** Let jsdom's MutationObserver callbacks run. */
const settle = () => new Promise((done) => setTimeout(done, 0))

test('the whale lands to the left of the label, inside the status row', () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document,
    match,
    render: (host) => host.appendChild(harness.document.createElement('svg')),
  })
  assert.equal(anchor.isAttached(), true)
  const host = status.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`)
  assert.ok(host, 'nothing was attached')
  assert.equal(status.firstChild, host, 'the whale is not the first child, so not on the left')
  assert.equal(host.getAttribute('aria-hidden'), 'true')
  anchor.destroy()
  harness.close()
})

test('the label is replaced, and DSH gets its own words back on destroy', () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match, render: () => {},
  })
  anchor.setWord('调用工具中...')
  assert.match(status.textContent, /调用工具中/)
  assert.ok(!status.textContent.includes(DEEP_DIVING), 'the original label is still showing')

  anchor.setWord('读取文件中...')
  assert.match(status.textContent, /读取文件中/)

  anchor.destroy()
  assert.equal(status.textContent, DEEP_DIVING, 'DSH did not get its label back')
  assert.equal(status.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`), null)
  harness.close()
})

test('restoring to the original survives having never set a word', () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match, render: () => {},
  })
  assert.equal(status.textContent, DEEP_DIVING)
  anchor.destroy()
  assert.equal(status.textContent, DEEP_DIVING)
  harness.close()
})

test('a re-render that wipes the row is re-attached', async () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match, render: () => {},
  })
  anchor.setWord('执行命令中...')
  assert.match(status.textContent, /执行命令中/)

  // React owning this node re-renders it about once a second once the elapsed
  // clock appears: it rewrites the text and drops anything it did not create.
  status.textContent = DEEP_DIVING
  await settle()

  assert.equal(anchor.isAttached(), true, 'the whale did not come back')
  assert.match(status.textContent, /执行命令中/, 'the word did not come back')
  anchor.destroy()
  harness.close()
})

test('a row replaced by a brand new element is picked up', async () => {
  const harness = createHarness()
  const { column, status } = withStatus(harness)
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match, render: () => {},
  })
  anchor.setWord('Working...')
  status.remove()

  const fresh = harness.document.createElement('div')
  fresh.setAttribute('role', 'status')
  fresh.textContent = DEEP_DIVING
  column.appendChild(fresh)
  await settle()

  assert.equal(anchor.isAttached(), true)
  assert.equal(fresh.firstChild, fresh.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`))
  assert.match(fresh.textContent, /Working/)
  anchor.destroy()
  assert.equal(fresh.textContent, DEEP_DIVING)
  harness.close()
})

test('a relabelled row is followed by identity, not re-matched by text', async () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  // A matcher that does NOT recognise the plugin's own word. The first version
  // of this module re-matched on every mutation, so relabelling made the row
  // stop matching, which made it restore DSH's label, which made it match
  // again — a livelock that pinned a core until the tab was closed.
  const strict = (text) => text.includes(DEEP_DIVING)
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match: strict, render: () => {},
  })
  anchor.setWord('执行命令中...')
  await settle()
  await settle()
  assert.match(status.textContent, /执行命令中/, 'the anchor let go of a row it had relabelled')
  assert.equal(anchor.isAttached(), true)
  anchor.destroy()
  assert.equal(status.textContent, DEEP_DIVING)
  harness.close()
})

test('a host with no status row attaches nothing and throws nothing', () => {
  const harness = createHarness()
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match, render: () => {},
  })
  assert.equal(anchor.isAttached(), false)
  anchor.setWord('Working...')
  anchor.destroy()
  harness.close()
})

test('an unrelated live region is left alone', () => {
  const harness = createHarness()
  const other = harness.document.createElement('div')
  other.setAttribute('role', 'status')
  other.textContent = 'Saved'
  harness.document.body.appendChild(other)
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match, render: () => {},
  })
  assert.equal(anchor.isAttached(), false)
  assert.equal(other.textContent, 'Saved')
  anchor.destroy()
  harness.close()
})

test('destroy stops observing: later re-renders are not re-attached', async () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match, render: () => {},
  })
  anchor.destroy()
  status.textContent = DEEP_DIVING
  await settle()
  assert.equal(status.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`), null,
    'the anchor kept observing after destroy')
  harness.close()
})

test('the anchored whale animates and tears the row down cleanly', async () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const whale = harness.client.mountStatusWhale({
    document: harness.document,
    match,
    size: 26,
    motion: 'full',
    activity: { state: 'thinking' },
    word: DEEP_DIVING,
    random: harness.client.seededRandom(3),
  })
  assert.equal(whale.isAttached(), true)
  const body = status.querySelector('rect[mask]').parentNode
  const before = body.getAttribute('transform')
  harness.advance(1500)
  assert.notEqual(body.getAttribute('transform'), before, 'the anchored whale is static')

  whale.setActivity({ state: 'working', task: 'reading' }, '读取文件中...')
  assert.match(status.textContent, /读取文件中/)

  whale.destroy()
  harness.advance(600)
  assert.equal(harness.pendingFrames(), 0, 'a frame survived the teardown')
  assert.equal(status.textContent, DEEP_DIVING)
  harness.close()
})

test('a status word stays readable: short-lived states do not strobe', () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const whale = harness.client.mountStatusWhale({
    document: harness.document,
    match: (t) => /深度求索|执行命令|正在作答|等待/.test(t),
    size: 26, motion: 'full',
    activity: { state: 'thinking' }, word: DEEP_DIVING,
    random: harness.client.seededRandom(4),
  })
  const word = () => status.textContent.replace(/\s+/g, '')

  // Measured in a real session: a `ls` held the working state for 18 ms.
  whale.setActivity({ state: 'working', task: 'running' }, '执行命令中...')
  assert.match(word(), /执行命令中/, 'entering a state should be immediate')
  harness.advance(18)
  whale.setActivity({ state: 'thinking' }, DEEP_DIVING)
  assert.match(word(), /执行命令中/, 'the word was replaced before anyone could read it')

  // The queued change lands once the word has had its time.
  harness.advance(900)
  assert.match(word(), /深度求索/, 'the queued state never arrived')
  harness.close()
})

test('a burst of states collapses to the one the session ended on', () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const whale = harness.client.mountStatusWhale({
    document: harness.document,
    match: (t) => /深度求索|执行命令|读取文件|正在作答/.test(t),
    size: 26, motion: 'full', activity: { state: 'thinking' }, word: DEEP_DIVING,
  })
  whale.setActivity({ state: 'working', task: 'running' }, '执行命令中...')
  for (const [activity, w] of [
    [{ state: 'thinking' }, DEEP_DIVING],
    [{ state: 'working', task: 'reading' }, '读取文件中...'],
    [{ state: 'responding' }, '正在作答...'],
  ]) {
    harness.advance(20)
    whale.setActivity(activity, w)
  }
  harness.advance(1200)
  assert.match(status.textContent, /正在作答/, 'the burst did not settle on the final state')
  harness.close()
})

test('waiting for the user never queues behind the model', () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const whale = harness.client.mountStatusWhale({
    document: harness.document,
    match: (t) => /深度求索|执行命令|等待/.test(t),
    size: 26, motion: 'full', activity: { state: 'thinking' }, word: DEEP_DIVING,
  })
  whale.setActivity({ state: 'working', task: 'running' }, '执行命令中...')
  harness.advance(20)
  // An approval is about the user; making them wait 700 ms to be told so is
  // exactly backwards.
  whale.setActivity({ state: 'waiting' }, '等待你的确认...')
  assert.match(status.textContent, /等待你的确认/)
  harness.close()
})

test('teardown cancels a queued word', () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  const whale = harness.client.mountStatusWhale({
    document: harness.document,
    match: (t) => /深度求索|执行命令/.test(t),
    size: 26, motion: 'full', activity: { state: 'thinking' }, word: DEEP_DIVING,
  })
  whale.setActivity({ state: 'working', task: 'running' }, '执行命令中...')
  harness.advance(20)
  whale.setActivity({ state: 'thinking' }, DEEP_DIVING)
  whale.destroy()
  harness.advance(2000)
  assert.equal(harness.pendingTimers(), 0, 'a queued word outlived the surface')
  assert.equal(status.textContent, DEEP_DIVING, 'DSH did not get its label back')
  harness.close()
})

test('the whale takes its ink from the gradient DSH paints the label with', () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  // DSH's real rule: a clipped blue gradient, both colour channels transparent.
  status.style.color = 'transparent'
  status.style.webkitTextFillColor = 'transparent'
  status.style.backgroundImage =
    'linear-gradient(90deg, rgb(65, 118, 230) 0%, rgb(211, 226, 255) 50%, rgb(65, 118, 230) 100%)'
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match, render: () => {},
  })
  const host = status.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`)
  assert.equal(host.style.color, 'rgb(65, 118, 230)', 'the whale is not the colour of the word beside it')
  anchor.destroy()
  harness.close()
})

test('a row that paints its own text normally is left alone', () => {
  const harness = createHarness()
  const { status } = withStatus(harness)
  status.style.color = 'rgb(15, 17, 21)'
  status.style.backgroundImage = 'linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 255, 0))'
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document, match, render: () => {},
  })
  const host = status.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`)
  assert.equal(host.style.color, '', 'a decorative background was mistaken for the label ink')
  anchor.destroy()
  harness.close()
})
