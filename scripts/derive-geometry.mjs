#!/usr/bin/env node
/**
 * Re-derive `src/client/whale/geometry.ts`'s path data from an official
 * `FishLogo.tsx` and check it still matches, byte for byte.
 *
 * The source component draws one `<path>` whose `d` holds four subpaths. This
 * splits it at the `M` commands and compares each against the constant it
 * feeds, so a future artwork revision shows up as a failed check rather than a
 * silent drift between the plugin and the mark it claims to reproduce.
 *
 * The two rig cut lines in `geometry.ts` are not re-derived here: finding them
 * needed a rasteriser. They came from a search over (angle, offset) for the
 * shortest line that isolates a limb, run against a canvas rasterisation of the
 * silhouette at 60 samples per viewBox unit; `docs/geometry-derivation.md`
 * records the search and its results.
 *
 * Usage:
 *   node scripts/derive-geometry.mjs <path-to-FishLogo.tsx>
 *   node scripts/derive-geometry.mjs --print <path-to-FishLogo.tsx>
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
const print = args.includes('--print')
const source = args.find((arg) => !arg.startsWith('--'))

if (source === undefined) {
  process.stderr.write('usage: node scripts/derive-geometry.mjs [--print] <FishLogo.tsx>\n')
  process.exit(2)
}

const tsx = readFileSync(resolve(source), 'utf8')
const match = /\sd="([^"]+)"/.exec(tsx)
if (match === null) throw new Error(`no path data found in ${source}`)

/** The four subpaths, in source order: silhouette, hollow, eye, cheek. */
const subpaths = match[1].split(/(?=M)/).filter((part) => part.length > 0)
if (subpaths.length !== 4) {
  throw new Error(`expected 4 subpaths in the mark, found ${subpaths.length}`)
}

const NAMES = ['PATH_SILHOUETTE', 'PATH_HOLLOW', 'PATH_EYE', 'PATH_CHEEK']
const geometry = readFileSync(resolve(root, 'src/client/whale/geometry.ts'), 'utf8')

let failures = 0
subpaths.forEach((subpath, index) => {
  const name = NAMES[index]
  const digest = createHash('sha256').update(subpath).digest('hex').slice(0, 12)
  if (print) {
    process.stdout.write(`export const ${name} =\n  '${subpath}'\n\n`)
    return
  }
  const present = geometry.includes(`'${subpath}'`)
  if (!present) failures++
  process.stdout.write(`${present ? 'ok  ' : 'FAIL'} ${name} sha256:${digest}\n`)
})

if (!print && failures > 0) {
  process.stderr.write(`${failures} path constant(s) differ from the source mark\n`)
  process.exit(1)
}
