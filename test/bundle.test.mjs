/** Plugin contract: the shipped artefacts are loadable and export what DSH expects. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { BUNDLE, createHarness } from './harness.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('the client bundle is wrapped in the DSH module-loader shell', () => {
  assert.ok(
    BUNDLE.startsWith('window.__ModuleLoader__.load({'),
    'lib/client.js must open with the __ModuleLoader__.load shell',
  )
  assert.match(BUNDLE, /id: "dsh-whale-buddy"/)
})

test('the bundle declares its identity and yields the client exports', () => {
  const harness = createHarness()
  assert.equal(harness.declaration.id, 'dsh-whale-buddy')
  assert.equal(typeof harness.client.apply, 'function')
  assert.ok(Array.isArray(harness.client.inject))
  // Spread across the realm boundary: jsdom arrays have a different prototype.
  assert.deepEqual([...harness.client.inject], ['slots', 'locale'])
  harness.close()
})

test('the bundle externalises react and nothing else', () => {
  const externals = new Set([...BUNDLE.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]))
  assert.deepEqual([...externals], ['react'])
})

test('the host half exports a cordis plugin', async () => {
  const host = await import(resolve(root, 'lib', 'index.js'))
  assert.equal(host.name, 'whale-buddy')
  assert.equal(typeof host.apply, 'function')
  const seen = []
  host.apply({ logger: { debug: (...args) => seen.push(args) } })
  assert.equal(seen.length, 1)
  // A host with no logger must not throw.
  host.apply({})
})

test('the package manifest declares the DSH web client entry', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.license, 'BSD-3-Clause')
})

test('no inherited product identifiers survive in the shipped code', () => {
  // GrokBot is gone outright: none of its geometry, expression tables or state
  // cadences were carried over, so nothing may reference it.
  for (const stale of ['GrokBot', 'grokbot', 'TB_', 'tbConfig', 'data-thought-buddy']) {
    assert.ok(!BUNDLE.includes(stale), `bundle still mentions ${stale}`)
  }
  // The ancestor may only be named in attribution comments, never in code.
  const codeLines = BUNDLE.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
  for (const line of codeLines) {
    assert.ok(!line.includes('thought-buddy'), `non-comment line names the ancestor: ${line.trim()}`)
  }
})

test('the BSD attribution the inherited code requires is present in the bundle', () => {
  assert.match(BUNDLE, /dsh-thought-buddy/)
  assert.match(BUNDLE, /BSD-3-Clause/)
})

test('the built stylesheet and locales carry both languages', () => {
  const harness = createHarness()
  assert.ok(harness.client.PLUGIN_CSS.includes('.wb-dock__shell'))
  assert.equal(Object.keys(harness.client.en).length, Object.keys(harness.client.zh).length)
  for (const key of Object.keys(harness.client.en)) {
    assert.ok(harness.client.zh[key], `missing zh copy for ${key}`)
  }
  harness.close()
})
