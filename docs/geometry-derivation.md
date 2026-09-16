# How the whale rig was derived

The goal was a rig that animates the DeepSeek mark without editing it. Warping
the logo's own path data would have been easy and would have looked wrong: at
20 px the thing a reader recognises is the silhouette, and a morph that is
invisible at 400 px is a smear at 20.

So the mark is reproduced exactly, and every moving part is a transform.

## The source

`packages/client/ui-primitives/src/FishLogo.tsx` in deepseek-harness draws one
`<path>` in a `0 0 23.16 17.04` viewBox. Splitting its `d` at the `M` commands
gives four subpaths:

| # | Constant | Bounding box (viewBox units) | Role |
| --- | --- | --- | --- |
| 0 | `PATH_SILHOUETTE` | `0 – 23.16`, `0 – 17.04` | outer body, flukes, flipper |
| 1 | `PATH_HOLLOW` | `1.51 – 14.12`, `6.06 – 15.17` | the underside negative space |
| 2 | `PATH_EYE` | `12.14 – 12.73`, `7.96 – 8.56` | the eye |
| 3 | `PATH_CHEEK` | `11.95 – 15.45`, `6.70 – 9.97` | highlight beside the eye |

Under the default non-zero fill rule, 1, 2 and 3 are holes cut from 0.

`node scripts/derive-geometry.mjs <FishLogo.tsx>` re-splits the source and
checks each constant still matches.

## Why a mask rather than a path

The eye has to move (gaze) and close (blink) while remaining a *hole*, so it
reads on a light background and a dark one alike. A hole cannot be moved
independently inside a single `<path>`, so the renderer paints a `currentColor`
rectangle through a luminance mask:

```
mask = white(silhouette) - black(hollow) - black(cheek)
     - black(eye, scaled vertically by the blink)
```

Four paths, two mask layers, one copy of each piece of official geometry. The
body transform is applied outside the mask, to the plate the mask paints.

## The limb rig that was retired

An earlier version also split the silhouette along two straight cuts, so the
flukes and the flipper could rotate on their own: each limb and the body drew
the same untouched silhouette, clipped to opposite sides of a line, overlapping
by a margin so a rotation could not open a seam.

The cuts were found by rasterising the silhouette at 60 samples per viewBox
unit and searching `(angle, offset)` for the shortest crossing that isolates a
limb — flukes at −40°/9.50 (2.92 units across, pivot `(18.197, 6.907)`),
flipper at +35°/21.75 (1.95 units, pivot `(16.218, 14.759)`).

**It was deleted, and the reason is worth keeping.** A follow-up search looked
for a cut where the silhouette is locally *prism-like* — where sliding the line
perpendicular to itself does not change what it crosses — because such a cut
could hide an arbitrary rotation. There isn't one: the best candidate still
drifted 0.93 units across a ±0.6-unit band, because a notch between the whale's
back and the leading edge of its tail sits immediately past the peduncle.

That capped the rotation at four degrees before a seam became visible, and four
degrees moves the fluke tip **0.6 px on a 26 px whale**. Three clip paths and
two extra copies of the silhouette, for motion nobody could see at any size the
plugin draws. What moves now is the whole mark, rigidly — which is also why the
mask is down to two layers and the renderer to four paths.

## viewBox headroom

A posed mark is larger than the artwork, so the viewBox is padded — but the
padding cannot be a constant, because travel is budgeted in **pixels**. A whale
drawn at 18 px spends 2.5 px of travel, which is 3.2 viewBox units; the same
2.5 px on a 56 px whale is 1.0 units. The bleed therefore shrinks as the whale
grows.

`bleedFor` composes the extreme pose exactly — scale, then rotation, then
translation — rather than adding each channel's growth separately, because the
first two multiply, and the difference is precisely the kind of gap that lets a
legal pose fall outside its own viewport. A small rounding guard covers the
four-decimal rounding in the emitted transform.

The clamps in `rig.ts` and the bleed here read the **same** `AmplitudeBudget`.
That is not tidiness: the version where they were written independently allowed
a pose the viewBox could not contain, which sheared the tail off at the
extremes. `test/geometry.test.mjs` now asserts the agreement directly, and it
failed on its first run.

## Rig limits, in one place

`src/client/whale/rig.ts` clamps every channel before it reaches an attribute,
and every bound is derived from the amplitude budget rather than written down:

| Channel | Bound | Set by |
| --- | --- | --- |
| `bodyY` | ±(travel / 2) × 1.35, in px | `AmplitudeBudget.travel` |
| `bodyX` | the same × `lateralRatio` (0.45) | the swim path is upright |
| `bodyRotation` | ±5° × 1.35 | what the bleed can contain |
| `bodyScaleX/Y` | 1 ± 0.018 × 1.35 | breathing depth |
| `eyeOpen` | 0.02 – 1 | closed to open |

`travel` itself is `clamp(0.11 × size, 2.5 px, 4.5 px)`: a pixel floor so a
small whale still moves perceptibly, proportional growth so a large one does
not look under-animated, and a ceiling so the 56 px panel preview stays the
same creature as the 24 px one beside it.

Two properties of the clamp matter beyond the numbers. A finite-but-absurd
value is pulled to the bound; a **non-finite** one falls back to neutral,
because there is no sensible bound to pick for NaN — and a NaN reaching an SVG
attribute makes the browser drop the whole transform, which looks like the
whale teleporting.
