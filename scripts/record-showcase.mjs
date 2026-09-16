/**
 * Film demo/showcase.html.
 *
 * The showcase drives the real surfaces through their public API and signals
 * `window.__SHOWCASE__.done` when its script is finished; this opens it, lets
 * Chrome record the viewport, and hands the result to ffmpeg. Nothing here
 * knows what any animation looks like — which is the point: the film and the
 * demo cannot drift apart, because they are the same page.
 *
 * Usage: npm run film  (the demo server must be reachable, and it is started
 * for you by the npm script).
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'artifacts', 'shots')
const RAW = join(OUT, 'showcase-raw')
const WEBM = join(OUT, 'showcase.webm')
const MP4 = join(OUT, 'showcase.mp4')
const GIF = join(OUT, 'showcase.gif')

/** Chrome bundles its own playwright-core in the DSH checkout next door. */
const PLAYWRIGHT =
  process.env.WB_PLAYWRIGHT ??
  join(ROOT, '..', 'dsh-hot', 'node_modules', '.pnpm', 'playwright-core@1.62.1',
       'node_modules', 'playwright-core', 'index.js')

const URL = process.env.WB_DEMO_URL ?? 'http://localhost:4173/demo/showcase.html'
const SIZE = { width: 1280, height: 720 }

if (!existsSync(PLAYWRIGHT)) {
  console.error(`playwright-core not found at ${PLAYWRIGHT}; set WB_PLAYWRIGHT`)
  process.exit(1)
}

const { chromium } = createRequire(PLAYWRIGHT)('playwright-core')

mkdirSync(OUT, { recursive: true })
rmSync(RAW, { recursive: true, force: true })
mkdirSync(RAW, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({
  viewport: SIZE,
  recordVideo: { dir: RAW, size: SIZE },
})
const page = await context.newPage()
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 })
const total = await page.evaluate(() => window.__SHOWCASE__.total)
console.log(`recording ${(total / 1000).toFixed(1)}s …`)
await page.waitForFunction(() => window.__SHOWCASE__?.done === true, null, { timeout: total + 30000 })
await page.waitForTimeout(500)
await context.close()
await browser.close()

const captured = readdirSync(RAW).find((name) => name.endsWith('.webm'))
if (captured === undefined) {
  console.error('chrome produced no video')
  process.exit(1)
}
renameSync(join(RAW, captured), WEBM)
rmSync(RAW, { recursive: true, force: true })

/** Run ffmpeg, reporting rather than throwing so a missing binary is legible. */
function encode(label, args) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
  if (result.error !== undefined || result.status !== 0) {
    console.warn(`skipped ${label} (ffmpeg unavailable or failed)`)
    return false
  }
  return true
}

// H.264 + yuv420p + even dimensions: the combination every player accepts.
encode('mp4', ['-i', WEBM, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
               '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', MP4])
// A repo artifact, so the GIF trades fidelity for something people will
// actually load: half rate, 640 wide, 96 colours.
encode('gif', ['-i', WEBM, '-vf',
               'fps=10,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
               GIF])

for (const file of [WEBM, MP4, GIF]) {
  if (existsSync(file)) console.log('wrote', file.replace(`${ROOT}/`, ''))
}
