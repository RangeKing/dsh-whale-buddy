# Third-party notices

`dsh-whale-buddy` is an **independent community plugin**. It is not an official
DeepSeek product, it is not affiliated with or endorsed by DeepSeek, and nothing
in this file grants any trademark right.

This file records where every piece of this project came from. It distinguishes
code that was **adapted** (a real derivation, with its notice obligations) from
ideas that were **independently reimplemented** (acknowledged, but not
derivative). It is written to be true rather than generous in either direction.

---

## Summary

| Component / file | Source | Licence | Reuse type | Notice required |
| --- | --- | --- | --- | --- |
| Host/client plugin split and `apply` → disposer shape (`src/index.ts`, `src/client/index.ts`) | dsh-thought-buddy | BSD-3-Clause | adapted | yes |
| Fixed-step spring integration, `1/120 s` substeps, frame-delta clamping (`src/client/whale/spring.ts`) | dsh-thought-buddy | BSD-3-Clause | adapted | yes |
| requestAnimationFrame lifecycle and detached-host stop condition (`src/client/whale/view.ts`) | dsh-thought-buddy | BSD-3-Clause | adapted | yes |
| Blink envelope shape (fast close, slower open) (`src/client/whale/engine.ts`) | dsh-thought-buddy | BSD-3-Clause | adapted | yes |
| Waypoint-chasing swim, heading lag, amplitude budget (`src/client/whale/{engine,poses}.ts`) | — | — | independently designed | no |
| Injecting a whale into DSH's running-turn status row, as a *technique* (`src/client/integration/status-anchor.ts`) | dsh-thought-buddy | BSD-3-Clause | concept reused, implementation new | yes |
| Vertical drag of the collapsed Dock (`src/client/surfaces/dock-drag.ts`) | — | — | independently written | no |
| Breach arc and state-transition blending (`src/client/whale/{leap,engine}.ts`) | — | — | independently designed | no |
| Sea surface and splash (`src/client/whale/water.ts`) | — | — | independently designed | no |
| Props — thought cloud, speech bubble, ball, question mark, exclamation, magnifier, pencil, wrench, file stream (`src/client/whale/props-svg.ts`) | — | — | **original artwork, drawn by this project** | no, but see below |
| Compaction squeeze, per-task props, idle ball delay (`src/client/whale/{engine,props}.ts`) | — | — | independently designed | no |
| `localStorage` config pattern with silent degradation (`src/client/config.ts`) | dsh-thought-buddy | BSD-3-Clause | adapted | yes |
| Idempotent `<style data-plugin-css>` injection (`src/client/styles/plugin-css.ts`) | dsh-thought-buddy | BSD-3-Clause | adapted | yes |
| `window.__ModuleLoader__.load` bundle shell and tsdown config (`tsdown.client.config.mjs`) | dsh-thought-buddy | BSD-3-Clause | adapted | yes |
| Production-bundle verification strategy and demo static server (`test/harness.mjs`, `demo/server.mjs`) | dsh-thought-buddy | BSD-3-Clause | adapted | yes |
| GrokBot eye-ring geometry, expression tables, state cadences | nasawz/GrokBot (via dsh-thought-buddy) | BSD-3-Clause | **not used — removed** | no |
| Dock interaction concept: continuous shell, edge anchor, subtle hover, interruptible transitions (`src/client/surfaces/whale-dock.ts`) | dsh-notch | MIT | design inspiration, independently implemented for the Web | acknowledgement only |
| OpenBotMotion robot assets / resource data | OpenBotMotion (via dsh-notch) | MIT | **not used** | no |
| DeepSeek whale mark path data (`src/client/whale/geometry.ts`) | deepseek-harness `packages/client/ui-primitives/src/FishLogo.tsx` | MIT (code); trademark not licensed | artwork reference, reproduced verbatim | yes — source and unofficial-project notice |
| Slot API, session facts, `shell.overlay` layer | deepseek-harness (`@deepseek-ai/dsh-client-*`) | MIT | consumed as a dependency, not copied | no |

---

## dsh-thought-buddy — BSD-3-Clause (adapted)

Repository: https://github.com/dsh-plugins/dsh-thought-buddy
Commit inspected: `72cf83e291d369a134fb0127cffc8f1573cf7dfa`

This project is an evolution of that plugin's architecture. The rows above are
real derivations: the integration shape, the physical feel of the motion engine,
and the build and verification strategy were taken from it and rewritten around
a different subject and a different DSH API. The repository therefore stays
BSD-3-Clause, and the notice below is retained.

One row deserves an explicit note, because it is the least code and the most
idea. `src/client/integration/status-anchor.ts` puts a whale beside DSH's
running-turn label; `dsh-thought-buddy` did the same thing against the same
element. Its route there was a third-party `dsh-loader`'s anchor table, which
the DSH this plugin targets has no equivalent of, so none of its lines survive:
the matching strategy, the identity tracking, the mutation observer, the
re-entrancy guard, the label restore and the gradient-ink read are all new. It
is listed as reuse anyway — the decision to write into that element at all came
from reading that plugin, and claiming otherwise would be the kind of
convenient line-counting this file exists to prevent.

```
BSD 3-Clause License

Copyright (c) 2026, dsh-thought-buddy contributors

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### The props, and what they do to the artwork question

`src/client/whale/props-svg.ts` draws nine shapes this project authored: a
three-dot thought cloud, a speech bubble, a ball, a question mark, an
exclamation mark, a magnifier, a pencil, a wrench, and a stream of file cards.
They are not derived from anything — they are the generic comic-strip and
toolbar vocabulary, drawn as circles, rounded rectangles, polygons and strokes —
so no third-party notice attaches to them. In particular none of them is traced
from, or measured against, any icon set: each is a handful of coordinates
written to clear a one-pixel floor at the size the plugin ships at, which is a
constraint tight enough that the shapes are more or less determined by it.

They do change the *trademark* picture, and that is worth stating plainly rather
than burying. A logo that breathes reads as a logo. A logo tossing a ball and
waving a wrench reads as a mascot, and a mascot invites the assumption that
whoever owns the mark made it. So:

- **No coordinate of the DeepSeek mark is edited, and nothing is drawn over it.**
  Eight props hang above the silhouette and one — the file stream — runs below
  it; none intersects it. The official paths are drawn once each inside the
  renderer's luminance mask, and `test/geometry.test.mjs` fails if any authored
  path ends up in that mask.
- **One prop is drawn in a colour of its own**, the red error mark. It is
  plugin-authored artwork like the rest and carries no third-party colour, brand
  or palette: the value was picked to stay legible on both themes and to sit
  clear of DSH's own label blue, not to match anything.
- **The mark is never recoloured.** The whale itself still takes DSH's ink; the
  red belongs to a shape drawn beside it.
- The independent-project notice is carried in the README's first screenful and
  in this file, not hidden in an About panel.
- If DeepSeek ever asks for the props to go, they are one module and one prop
  field; the whale underneath is untouched official geometry and keeps working.
  The same is true of the compaction squeeze, which is a scale on the rig — the
  drawing is the official one, transformed, exactly as the breach is.

### GrokBot lineage — removed

`dsh-thought-buddy`'s licence additionally records that its eye-ring geometry,
body shapes and state cadences derive from
[nasawz/GrokBot](https://github.com/nasawz/GrokBot) (BSD-3-Clause).

**None of that material is present here.** The robot avatar, its 25-expression
48-point eye-ring tables, its expression pool and its body-shape data were not
carried over; the whale rig is built from the DeepSeek mark instead, and
`test/bundle.test.mjs` fails the build if any GrokBot identifier reappears in
the shipped code. The GrokBot notice is recorded in this section for history and
is not claimed as a live dependency.

---

## dsh-notch — MIT (design inspiration, independently implemented)

Repository: https://github.com/aa2246740/dsh-notch
Commit inspected: `2aeab0330674a703dbf3a157c5a2eaadbb90d6a5`
Files read: `DESIGN.md`, `macos/Sources/Panel.swift`, `macos/Sources/RootView.swift`, `LICENSE`

`dsh-notch` is a native macOS AppKit/SwiftUI application. The Whale Dock borrows
its **interaction contract** — a compact control and its expanded panel being one
continuous surface, an anchored edge that stays put while the geometry changes,
a restrained hover response, reduced motion presenting final states directly,
and transitions that survive being interrupted — and implements it from scratch
for the Web.

No Swift source was copied, translated line by line, or mechanically ported.
Concretely, what is *not* shared: `NotchPanel.resizeAnchored` animates an
`NSRect` by holding `maxX`; `whale-dock.ts` lets the document lay the shell out
against a right edge and transitions CSS `width`/`height` with a measured target.
`dsh-notch` invalidates a stale resize with a `resizeGeneration` counter; the
Dock uses a generation ticket for the same reason, which is the ordinary way to
solve that problem in either language and is not a derivation of its code. Its
native `1.08` hover scale and `0.4 s / 0.08 bounce` spring were deliberately not
adopted; the Web values were tuned against DSH's own layout.

Because nothing was copied, MIT's notice-retention condition is not triggered,
and no `dsh-notch` source file is reproduced here. The project is acknowledged
in `README.md` and in this table. Its MIT notice is reproduced below anyway, so
that a reader comparing the two projects has it to hand.

```
MIT License

Copyright (c) 2026 DSH Notch contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### OpenBotMotion lineage — not imported

`dsh-notch` documents that its robot assets derive from OpenBotMotion and keeps
an MIT notice for them. No robot asset or robot resource data was imported into
this project, so that transitive obligation does not attach here. The Dock's
side-button interaction needs none of those assets.

---

## DeepSeek whale artwork

Source file:
`packages/client/ui-primitives/src/FishLogo.tsx` in
https://github.com/deepseek-ai/deepseek-harness
(the same component DSH renders for its own brand mark; verified against the
installed `@deepseek-ai/dsh-client-ui-brand-official@0.1.5-rc.2`, which renders
`FishLogo`).

The component's `d` attribute holds one path with four subpaths inside a
`0 0 23.16 17.04` viewBox. `src/client/whale/geometry.ts` reproduces those four
subpaths **verbatim**, split at the `M` boundaries so the renderer can rig them.
No coordinate is edited, and the neutral pose reproduces the mark exactly;
`scripts/derive-geometry.mjs` re-checks that against a `FishLogo.tsx` on disk.

The surrounding deepseek-harness repository is MIT-licensed, which covers the
source code. **A code licence is not a trademark licence.** The DeepSeek name
and whale mark belong to DeepSeek. This plugin reproduces the mark to animate
DeepSeek's own product in DeepSeek's own interface, presents itself everywhere
as an independent community project, and claims no endorsement, sponsorship or
affiliation. If DeepSeek would prefer the mark not be used this way, the
artwork will be replaced on request.

---

## DSH platform packages

`@deepseek-ai/cordis` and the `@deepseek-ai/dsh-client-*` packages (MIT) are
consumed as declared dependencies and as the host's own runtime. No source from
them is copied into this repository; the build treats `react` as the only
external module and bundles nothing from them.
