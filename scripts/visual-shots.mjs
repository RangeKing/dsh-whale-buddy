#!/usr/bin/env node
/**
 * Headless screenshots of the demo, for visual review of the surfaces at the
 * sizes that matter. Writes PNGs into `artifacts/shots/`.
 *
 * Usage: node scripts/visual-shots.mjs [chrome-binary]
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const out = resolve(root, 'artifacts', 'shots')
mkdirSync(out, { recursive: true })

const chrome =
  process.argv[2] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** One review scenario: which demo controls to flip before the screenshot. */
const SCENES = [
  { name: 'idle-light', script: 'open=1' },
  { name: 'thinking-light', script: 'state=thinking&open=1' },
  { name: 'thinking-dark', script: 'state=thinking&dark=1&open=1' },
  // The three states the status row can show beyond "thinking", because the
  // word is half of this surface and a screenshot of only one word reviews half.
  { name: 'responding-light', script: 'state=responding&open=1' },
  { name: 'working-running-light', script: 'state=working:running&open=1' },
  { name: 'waiting-dark', script: 'state=waiting&dark=1&open=1' },
  { name: 'idle-collapsed', script: '' },
  // ?leap replays the breach on a loop, so a still can catch the arc.
  { name: 'breach-light', script: 'state=thinking&leap=1&open=1' },
  { name: 'prop-working', script: 'state=working:running&open=1' },
  { name: 'prop-waiting-dark', script: 'state=waiting&dark=1&open=1' },
  // The per-task props and the two newer states. Each is a different drawing,
  // which is the point of reviewing them as stills rather than only in the film.
  { name: 'prop-reading-light', script: 'state=working:reading&open=1' },
  { name: 'prop-searching-light', script: 'state=working:searching&open=1' },
  { name: 'prop-editing-dark', script: 'state=working:editing&dark=1&open=1' },
  { name: 'compacting-light', script: 'state=compacting&open=1' },
  { name: 'error-light', script: 'state=error&open=1' },
  { name: 'error-dark', script: 'state=error&dark=1&open=1' },
  { name: 'reduced-motion', script: 'state=thinking&reduced=1&open=1' },
  { name: 'motion-subtle', script: 'state=thinking&motion=subtle&open=1' },
]

/**
 * Render one scene.
 * @param scene - name and query string.
 * @returns completion of the screenshot process.
 */
function shoot(scene) {
  const url = `file://${root}/demo/index.html?${scene.script}`
  return new Promise((done, fail) => {
    const child = spawn(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--virtual-time-budget=2500',
        '--window-size=1180,980',
        '--default-background-color=ffffffff',
        `--screenshot=${out}/${scene.name}.png`,
        url,
      ],
      { stdio: 'ignore' },
    )
    child.on('exit', (code) => (code === 0 ? done(undefined) : fail(new Error(`${scene.name}: exit ${code}`))))
    child.on('error', fail)
  })
}

for (const scene of SCENES) {
  await shoot(scene)
  process.stdout.write(`shot: ${scene.name}\n`)
}
