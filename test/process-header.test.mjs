/**
 * DSH 0.1.7's running label, and the anchor's handling of it.
 *
 * 0.1.7 dropped the blue "深度求索中..." row. The running state now lives in
 * the turn's fold header — `<button data-turn-process>` holding a grey label
 * that carries its own clock, "深度求索中，用时12秒" — and the `role="status"`
 * element that still exists is a visually hidden announcement right before it.
 * The stand-in below is that markup, as ui-chat 0.1.7-rc.1's
 * `TurnProcessNodeView` renders it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createHarness } from './harness.mjs'

const ANNOUNCEMENT = '深度求索中'
const match = (text) => /diving|深度求索/i.test(text)
const settle = () => new Promise((done) => setTimeout(done, 0))

/** A running turn's fold header, as DSH 0.1.7 draws it. */
function withProcessHeader(harness, label = `${ANNOUNCEMENT}，用时3秒`) {
  const doc = harness.document
  const flow = doc.createElement('div')
  const announcer = doc.createElement('span')
  announcer.setAttribute('role', 'status')
  announcer.setAttribute('aria-live', 'polite')
  announcer.className = 'visuallyHidden'
  announcer.textContent = ANNOUNCEMENT
  const button = doc.createElement('button')
  button.type = 'button'
  button.setAttribute('data-turn-process', '4')
  const words = doc.createElement('span')
  words.className = 'l_V-RG_label'
  words.textContent = label
  button.appendChild(words)
  flow.appendChild(announcer)
  flow.appendChild(button)
  doc.body.appendChild(flow)
  return { flow, announcer, button, words }
}

test('0.1.7: the whale goes into the fold header, not the hidden announcement', () => {
  const harness = createHarness()
  const { announcer, button } = withProcessHeader(harness)
  const found = []
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document,
    match,
    render: () => {},
    onFound: (kind) => found.push(kind),
  })
  const attr = harness.client.STATUS_HOST_ATTR
  assert.equal(anchor.isAttached(), true)
  assert.equal(announcer.querySelector(`[${attr}]`), null, 'the whale landed in a 1px clipped span')
  const host = button.querySelector(`[${attr}]`)
  assert.ok(host, 'the fold header has no whale')
  assert.equal(button.firstChild, host, 'the whale is not on the left of the words')
  assert.equal(host.getAttribute(harness.client.STATUS_KIND_ATTR), 'process')
  assert.deepEqual(found, ['process'])
  anchor.destroy()
  harness.close()
})

test('0.1.7: only the leading words are swapped, and DSH keeps its clock', () => {
  const harness = createHarness()
  const { words, announcer } = withProcessHeader(harness)
  const anchor = harness.client.attachStatusAnchor({ document: harness.document, match, render: () => {} })

  anchor.setWord('读取文件中...')
  assert.equal(words.textContent, '读取文件中，用时3秒')
  assert.equal(announcer.textContent, ANNOUNCEMENT, 'the announcement is DSH’s and must not be touched')

  // The plugin's own "thinking" word is DSH's words: the label reads as DSH's.
  anchor.setWord('深度求索中...')
  assert.equal(words.textContent, `${ANNOUNCEMENT}，用时3秒`)

  anchor.setWord(undefined)
  assert.equal(words.textContent, `${ANNOUNCEMENT}，用时3秒`)
  anchor.destroy()
  harness.close()
})

test('0.1.7: a clock React advances is followed, not overwritten with a stale one', async () => {
  const harness = createHarness()
  const { words } = withProcessHeader(harness)
  const anchor = harness.client.attachStatusAnchor({ document: harness.document, match, render: () => {} })
  anchor.setWord('执行命令中...')
  assert.equal(words.textContent, '执行命令中，用时3秒')

  // React updates a single-string child by writing the text node in place.
  words.firstChild.nodeValue = `${ANNOUNCEMENT}，用时4秒`
  await settle()
  assert.equal(words.textContent, '执行命令中，用时4秒')

  // And sometimes by replacing it.
  words.textContent = `${ANNOUNCEMENT}，用时5秒`
  await settle()
  assert.equal(words.textContent, '执行命令中，用时5秒')

  anchor.destroy()
  assert.equal(words.textContent, `${ANNOUNCEMENT}，用时5秒`, 'DSH did not get its current label back')
  harness.close()
})

test('0.1.7: English labels keep their clock too', () => {
  const harness = createHarness()
  const doc = harness.document
  const { announcer, words } = withProcessHeader(harness, 'Deep diving for 12s')
  announcer.textContent = 'Deep diving...'
  const anchor = harness.client.attachStatusAnchor({ document: doc, match, render: () => {} })
  anchor.setWord('Reading...')
  assert.equal(words.textContent, 'Reading for 12s')
  anchor.destroy()
  assert.equal(words.textContent, 'Deep diving for 12s')
  harness.close()
})

test('0.1.7: a header that closes lets go and leaves DSH’s wording alone', async () => {
  const harness = createHarness()
  const { announcer, button, words } = withProcessHeader(harness)
  const anchor = harness.client.attachStatusAnchor({ document: harness.document, match, render: () => {} })
  anchor.setWord('正在作答...')
  assert.equal(words.textContent, '正在作答，用时3秒')

  // The turn ends: DSH rewrites both, in one commit.
  announcer.textContent = '已完成'
  words.textContent = '用时9秒'
  await settle()
  assert.equal(words.textContent, '用时9秒', 'the closed header was relabelled')
  assert.equal(button.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`), null)
  assert.equal(anchor.isAttached(), false)
  anchor.destroy()
  assert.equal(words.textContent, '用时9秒')
  harness.close()
})

test('0.1.7: the header whale takes the header’s own ink', () => {
  const harness = createHarness()
  harness.client.injectPluginCss(harness.document)
  const css = harness.document.querySelector('style[data-plugin-css]').textContent
  assert.match(css, /\.wb-status\[data-whale-buddy-kind="process"\]\s*\{\s*color:\s*inherit/)
  harness.close()
})

test('claiming legacy rows only: a 0.1.7 header is reported and left untouched', async () => {
  const harness = createHarness()
  const { button, words } = withProcessHeader(harness)
  const found = []
  const anchor = harness.client.attachStatusAnchor({
    document: harness.document,
    match,
    render: () => {},
    claim: (kind) => kind === 'legacy',
    onFound: (kind) => found.push(kind),
  })
  anchor.setWord('读取文件中...')
  assert.equal(anchor.isAttached(), false)
  assert.equal(button.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`), null)
  assert.equal(words.textContent, `${ANNOUNCEMENT}，用时3秒`)

  // Dormant for good: later mutations are not re-examined.
  words.textContent = `${ANNOUNCEMENT}，用时4秒`
  await settle()
  assert.deepEqual(found, ['process'])
  anchor.destroy()
  harness.close()
})

test('claiming legacy rows only: a 0.1.5 row is still taken', () => {
  const harness = createHarness()
  const doc = harness.document
  const status = doc.createElement('div')
  status.setAttribute('role', 'status')
  status.textContent = '深度求索中...'
  doc.body.appendChild(status)
  const found = []
  const anchor = harness.client.attachStatusAnchor({
    document: doc,
    match,
    render: () => {},
    claim: (kind) => kind === 'legacy',
    onFound: (kind) => found.push(kind),
  })
  assert.equal(anchor.isAttached(), true)
  assert.equal(status.firstChild.getAttribute(harness.client.STATUS_KIND_ATTR), 'legacy')
  assert.deepEqual(found, ['legacy'])
  anchor.destroy()
  harness.close()
})

test('0.1.7: the mounted whale animates in the header and tears down cleanly', () => {
  const harness = createHarness()
  const { button, words } = withProcessHeader(harness)
  const whale = harness.client.mountStatusWhale({
    document: harness.document,
    match,
    size: 26,
    motion: 'full',
    activity: { state: 'working', task: 'editing' },
    word: '编辑文件中...',
    random: harness.client.seededRandom(7),
  })
  assert.equal(whale.isAttached(), true)
  assert.equal(words.textContent, '编辑文件中，用时3秒')
  const body = button.querySelector('rect[mask]').parentNode
  const before = body.getAttribute('transform')
  harness.advance(1500)
  assert.notEqual(body.getAttribute('transform'), before, 'the header whale is static')
  whale.destroy()
  harness.advance(600)
  assert.equal(harness.pendingFrames(), 0)
  assert.equal(words.textContent, `${ANNOUNCEMENT}，用时3秒`)
  assert.equal(button.querySelector('svg'), null)
  harness.close()
})

test('a header with its words directly inside settles instead of rebuilding forever', async () => {
  const harness = createHarness()
  const doc = harness.document
  const flow = doc.createElement('div')
  const announcer = doc.createElement('span')
  announcer.setAttribute('role', 'status')
  announcer.textContent = ANNOUNCEMENT
  const button = doc.createElement('button')
  button.setAttribute('data-turn-process', '1')
  button.textContent = `${ANNOUNCEMENT}，用时3秒`
  flow.append(announcer, button)
  doc.body.appendChild(flow)
  let renders = 0
  const anchor = harness.client.attachStatusAnchor({
    document: doc, match, render: () => { renders++ },
  })
  anchor.setWord('执行命令中...')
  for (let i = 0; i < 5; i++) await settle()
  assert.equal(renders, 1, `the whale was rebuilt ${renders} times`)
  assert.equal(anchor.isAttached(), true)
  assert.match(button.textContent, /^执行命令中，用时3秒$/)
  anchor.destroy()
  assert.equal(button.textContent, `${ANNOUNCEMENT}，用时3秒`)
  harness.close()
})

test('a row the anchor cannot keep is given up, not rebuilt on every mutation', async () => {
  const harness = createHarness()
  const doc = harness.document
  const status = doc.createElement('div')
  status.setAttribute('role', 'status')
  status.textContent = '深度求索中...'
  doc.body.appendChild(status)
  let renders = 0
  // A hostile host: every whale the anchor inserts is thrown out again.
  const evict = new harness.window.MutationObserver(() => {
    for (const host of status.querySelectorAll(`[${harness.client.STATUS_HOST_ATTR}]`)) host.remove()
  })
  evict.observe(status, { childList: true })
  const anchor = harness.client.attachStatusAnchor({
    document: doc, match, render: () => { renders++ },
  })
  for (let i = 0; i < 60; i++) await settle()
  assert.ok(renders <= 25, `the anchor rebuilt ${renders} times instead of standing down`)
  evict.disconnect()
  anchor.destroy()
  harness.close()
})

test('an older live region that mentions DeepSeek is not taken for the label', () => {
  const harness = createHarness()
  const doc = harness.document
  // A 0.1.7 turn-error row: its words live in child spans, not its own text.
  const error = doc.createElement('div')
  error.setAttribute('role', 'status')
  const title = doc.createElement('span')
  title.textContent = '本轮运行失败'
  const message = doc.createElement('span')
  message.textContent = '深度求索 API 返回 401'
  error.append(title, message)
  doc.body.appendChild(error)
  const { button } = withProcessHeader(harness)
  const found = []
  const anchor = harness.client.attachStatusAnchor({
    document: doc,
    match: harness.client.makeStatusMatcher(harness.client.fallbackTranslate('zh')),
    render: () => {},
    onFound: (kind) => found.push(kind),
  })
  assert.deepEqual(found, ['process'])
  assert.equal(error.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`), null)
  assert.ok(button.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`))
  anchor.destroy()
  harness.close()
})

test('the running header wins over a legacy-shaped match earlier in the page', () => {
  const harness = createHarness()
  const doc = harness.document
  const stale = doc.createElement('div')
  stale.setAttribute('role', 'status')
  stale.textContent = '深度求索中...'
  doc.body.appendChild(stale)
  const { button } = withProcessHeader(harness)
  const anchor = harness.client.attachStatusAnchor({ document: doc, match, render: () => {} })
  assert.ok(button.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`), 'the header lost to the stale row')
  assert.equal(stale.querySelector(`[${harness.client.STATUS_HOST_ATTR}]`), null)
  anchor.destroy()
  harness.close()
})

test('a page with 0.1.7 history is recognised before any turn runs', () => {
  const harness = createHarness()
  assert.equal(harness.client.probeStatusShape(harness.document), null)
  const { announcer } = withProcessHeader(harness)
  announcer.textContent = '已完成'
  assert.equal(harness.client.probeStatusShape(harness.document), 'process')
  harness.close()
})

test('the matcher takes DSH’s label by its first words only', () => {
  const harness = createHarness()
  const match = harness.client.makeStatusMatcher(harness.client.fallbackTranslate('zh'))
  assert.equal(match('深度求索中'), true)
  assert.equal(match('深度求索中...'), true)
  assert.equal(match('Deep diving...'), true)
  assert.equal(match('读取文件中...'), true, 'the plugin’s own word must stay recognisable')
  assert.equal(match('本轮运行失败 深度求索 API 返回 401'), false)
  assert.equal(match(''), false)
  harness.close()
})
