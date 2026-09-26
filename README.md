<h1 align="center">🐋 dsh-whale-buddy</h1>

<p align="center">
  <strong>A physics-driven, state-aware companion that brings the DeepSeek whale to life in DeepSeek Harness Web.</strong>
</p>

<p align="center">
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/English-0b1020?style=for-the-badge"></a>
  <a href="README_CN.md"><img alt="简体中文" src="https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-94a3b8?style=for-the-badge"></a>
</p>

<p align="center">
  <img alt="licence: BSD-3-Clause" src="https://img.shields.io/badge/licence-BSD--3--Clause-2563eb?style=flat-square">
  <img alt="DSH: 0.1.5 – 0.1.7-rc.1" src="https://img.shields.io/badge/DSH-0.1.5%20%E2%80%93%200.1.7--rc.1-0ea5e9?style=flat-square">
  <img alt="tests: 138 passing" src="https://img.shields.io/badge/tests-138%20passing-16a34a?style=flat-square">
  <img alt="runtime dependencies: 0" src="https://img.shields.io/badge/runtime%20deps-0-8b5cf6?style=flat-square">
</p>

---

> [!NOTE]
> **Independent Community Project**: `dsh-whale-buddy` is an independent open-source plugin. It is not an official DeepSeek product and is not affiliated with, sponsored by, or endorsed by DeepSeek. The whale mark belongs to DeepSeek; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## 🌟 Overview

`dsh-whale-buddy` enriches DeepSeek Harness Web (DSH) with a lively, responsive companion that visually mirrors the AI's real-time reasoning, tool calls, and execution states. 

Built on a deterministic spring physics engine, the whale breaches through simulated water when a turn begins, swims calmly alongside the active status label, and wears dynamic contextual props representing current tasks—all while preserving the exact vector geometry of the official DeepSeek mark.

<p align="center">
  <img src="artifacts/shots/showcase.gif" alt="dsh-whale-buddy in action" width="100%">
</p>

---

## ✨ Key Features

- 🌊 **Procedural Breach & Water Simulation**  
  Breaches out of simulated water at the start of every turn, creating lively ripples, splash dynamics, and an engaging sense of presence.

- 🐋 **Living Breathing Companion**  
  Not just a static mark—the whale breathes steadily, blinks stochastically, and tilts its heading organically according to swimming velocity.

- 🎯 **Full-Lifecycle Task & State Awareness**  
  Instantly mirrors thinking, streaming responses, tool execution, file reading/editing, context compaction, and user interaction states with clear status labels and bespoke monochrome vector props.

- 🧷 **Dual Seamless Surfaces**  
  - **Inline Status Whale**: Nestled directly inside the conversation status row with zero layout shift or visual jitter — or, with the classic option on, in DSH 0.1.5's blue "Deep diving..." row above the composer.  
  - **Whale Dock**: A sleek, edge-anchored floating pill button on the right edge, draggable vertically, expanding smoothly into a comprehensive companion panel.

- 🎨 **Native Visual Integration**  
  Automatically samples typography gradient color stops from the DSH interface, adapting flawlessly to dark and light themes without modifying official logo paths.

- ♿ **First-Class Accessibility**  
  Fully respects `prefers-reduced-motion: reduce`. Immediately presents stable static poses, offers instant panel toggling, and eliminates background frame loop overhead.

---

## 🖥️ Product Surfaces

### 1. Inline Status Whale

When a conversation turn begins, the inline whale executes an authored breach out of a procedural sea, settling into an effortless swim beside the status label. It updates DSH's status text with clear, descriptive task names (`深度求索中…`, `正在作答…`, `读取文件中…`, `执行命令中…`, etc.) and carries an appropriate task prop.

- **Zero Layout Shift**: Employs calculated negative bleeds (`fitToMark()`) so the breach arc overflows cleanly without shifting surrounding chat layout.
- **Native Ink Sampling**: Dynamically extracts DSH's gradient stops on mount, harmonizing with both dark and light modes.
- **Both DSH Label Shapes**:
  - **DSH 0.1.7** removed the blue "Deep diving..." row; the running label now lives in the turn's grey fold header ("深度求索中，用时12秒"). The whale goes into that header and wears its grey, and only the leading words are swapped (`读取文件中，用时12秒`), so DSH's own clock keeps ticking.
  - **DSH 0.1.5** still draws the blue row, and the whale goes into it as before.
- **Classic "Deep diving" option** (Dock panel → *Classic "Deep diving"*, off by default): on DSH 0.1.7, draws the old blue row back — same type, same gradient sweep, clock after 15 s — directly above the composer with the whale in it, and leaves DSH's grey header untouched. Unlike the default, this row takes space: it appears and leaves once per turn, as DSH 0.1.5's own row did. On DSH 0.1.5 it does nothing, because the row is already there.

### 2. Whale Dock & Companion Panel

Attached to the right edge of the viewport, the Whale Dock provides a persistent, low-profile companion presence.

- **Vertical Track Dragging**: Drag the collapsed button vertically with a pointer, or focus it and use `Arrow Up` / `Arrow Down` / `Home` / `End`. Position persists proportionally across window resizes.
- **Continuous Surface Expansion**: Opens inward into a compact companion panel featuring a live preview, state inspector, and quick toggles.
- **Fluid Dismissal**: Closes gracefully via the close button, `Escape`, or outside clicks.

---

## 🎭 State & Gesture Matrix

| State | Status Label (zh) | Contextual Prop | Posture & Behavior |
| :--- | :--- | :--- | :--- |
| `idle` | — | Tossable ball (after 9s dwell) | Relaxed swim, subtle drift, unhurried gestures |
| `thinking` | 深度求索中… | Pulsing dots | Attentive posture, faster chase spring, slight nose dip |
| `responding` | 正在作答… | Breathing speech bubble | Steady forward cruise |
| `working` | 执行命令中… | Articulated wrench | Brisk, purposeful movement |
| `working · reading` | 读取文件中… | Flowing file stream | Files stream horizontally beneath the hull |
| `working · editing` | 编辑文件中… | Sketching pencil | Dynamic stroke cadence with steady drift |
| `working · searching`| 搜索中… | Sweeping magnifier | Inquisitive scanning motions |
| `compacting` | 压缩上下文中… | None (Body deformation) | Elastic vertical compression and rebound |
| `waiting` | 等待你的确认… | Tilted question mark | Nose-up hover, near stillness |
| `error` | 出错了 | Red alert exclamation | Urgent micro-shake with instant red accent |

> [!TIP]
> All props are plugin-authored vector elements drawn **outside** the logo silhouette, ensuring DeepSeek's official geometry remains 100% pristine.

---

## 📦 Installation

`dsh-whale-buddy` installs as a standard DeepSeek Harness Web plugin.

### 1. Register in Web Profile

Add the plugin to your DSH web profile configuration:

```jsonc
// ~/.dsh/profiles/web/package.json
{
  "dependencies": {
    "dsh-whale-buddy": "^0.2.1"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-whale-buddy"
      ]
    }
  }
}
```

### 2. Install the Package

```bash
cd ~/.dsh/profiles/web
npm install dsh-whale-buddy@0.2.1
```

**Environment Requirement:** DeepSeek Harness `0.1.5-rc.2` through `0.1.7-rc.1` (requires the `shell.overlay` and `conversation.input.overlay` extension slots; the classic row also uses `conversation.input.dock`).

---

## ⚙️ Configuration

The Dock shows the current state and three settings: inline whale, classic status row, and motion. It follows DSH’s light and dark themes. Turning off the inline whale disables the classic-row control while preserving its preference.

Additional preferences are available through `localStorage`:

| `localStorage` Key | Accepted Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `dsh-whale-buddy.enabled` | `1` / `0` | `1` | Global master toggle |
| `dsh-whale-buddy.inlineEnabled` | `1` / `0` | `1` | Enable/disable inline status whale |
| `dsh-whale-buddy.classicStatus` | `1` / `0` | `0` | Draw DSH 0.1.5's blue "Deep diving..." row above the composer (DSH 0.1.7+) |
| `dsh-whale-buddy.dockEnabled` | `1` / `0` | `1` | Enable/disable Whale Dock |
| `dsh-whale-buddy.size` | `18` – `36` | `26` | Inline whale display size (px) |
| `dsh-whale-buddy.motion` | `full` / `subtle` / `static` | `full` | Motion profile intensity |
| `dsh-whale-buddy.dockTop` | `0.0` – `1.0` | `0.5` | Normalized vertical track position |

---

## 🔬 Technical Implementation & Deep Dive

### 1. Physics-Driven Motion Core
- **120 Hz Fixed-Step Integration**: Uses fixed-step substeps combined with critically damped harmonic springs to compute kinematic equations, ensuring identical motion cadence across varying display refresh rates.
- **33-Node Coupled Wave Simulation**: Models the sea surface using 33 interconnected discrete harmonic springs, realistically simulating surface depression, fluid rebound, and bidirectional ripple propagation.
- **Sub-Pixel Precision**: All trajectory scales and travel amplitudes are computed in CSS pixel dimensions rather than relative vector coordinates, guaranteeing razor-sharp visuals at any display scaling factor.

### 2. Non-Destructive DOM Anchoring & Zero Reflow
- **Reference Identity Tracking**: Hooks into the DSH status element once via `role="status"`, then tracks the DOM node by reference identity to eliminate recursive re-matching loops during text changes. On DSH 0.1.7 the `role="status"` element is a hidden announcement; the anchor follows it to the `[data-turn-process]` header right after it, and never writes into the announcement itself.
- **Negative-Bleed Headroom (`fitToMark()`)**: Offsets visual headroom through negative margins, keeping the host layout box clamped at a stable 26 px without triggering document reflows.
- **Clean Lifecycle Teardown**: Automatically detaches all MutationObservers, animation frame loops, and restores DSH's original DOM state upon unmounting or session switching.

### 3. Reactive State Derivation & Debouncing
- **Reactive Snapshot Observation**: Evaluates DSH snapshot signals directly to identify streaming states, tool queues, and blocking user interaction events.
- **700 ms Minimum Dwell Window**: Implements an intentional hold threshold to prevent microsecond tool calls from causing visual flickering.
- **Pulsed Error Tracking**: Identifies error occurrences by detecting state delta events rather than reading latched error strings, preventing stale warnings from lingering permanently.

### 4. Zero Dependencies & Absolute Vector Fidelity
- Zero external runtime dependencies; engine mathematics and rendering routines are fully decoupled from UI frameworks.
- DeepSeek's official vector paths are rendered as an unmodified rigid body inside an SVG luminance mask, with 0 coordinate deformation.

---

## 🏗️ Architecture & Project Layout

```
src/
├── index.ts                     # Plugin entry point
├── client/
│   ├── index.ts                 # DSH slot registrations
│   ├── config.ts                # Schema-validated configuration
│   ├── locales.ts               # Bilingual copy definitions
│   ├── integration/
│   │   ├── dsh.ts               # React bridge for DSH slots
│   │   ├── thinking-state.ts    # Semantic state evaluator
│   │   └── status-anchor.ts     # Safe, non-destructive DOM status-line injector
│   ├── state/
│   │   └── whale-state.ts       # Shared reactive state store
│   ├── whale/                   # Standalone physics & motion core
│   │   ├── geometry.ts          # Unmodified DeepSeek vector mark paths
│   │   ├── types.ts             # Pose and kinematic interfaces
│   │   ├── spring.ts            # Fixed-step spring integrator
│   │   ├── leap.ts              # Analytical breach trajectory model
│   │   ├── water.ts             # 33-node coupled harmonic spring wave model
│   │   ├── props.ts             # Contextual prop definitions & scheduler
│   │   ├── renderer-svg.ts      # Hardware-accelerated SVG renderer
│   │   └── view.ts              # RAF lifecycle controller
│   └── surfaces/
│       ├── inline-status.ts     # Inline status surface controller
│       ├── whale-dock.ts        # Dock trigger surface
│       ├── dock-panel.ts        # Companion panel surface
│       └── dock-drag.ts         # Physics-based drag-and-drop controller
└── styles/
    └── plugin-css.ts            # Scoped component styles & CSS variables
```

---

## 🛠️ Development & Verification

The project includes an extensive automated test suite verifying physical convergence, DOM safety, and bundle integrity:

```bash
# Type check TypeScript sources
npm run typecheck

# Build production bundle
npm run build

# Run complete test suite (138 tests against production bundle)
npm run verify

# Launch visual interactive demo sandbox
npm run demo        # Open http://localhost:4173/demo/index.html

# Capture visual artifacts and showcase recordings
npm run shots       # Headless screenshot generation
npm run film        # Record showcase animation video
```

---

## 🧩 Compatibility & Graceful Fallbacks

- **Verified Hosts**: `@deepseek-ai/dsh@0.1.5-rc.1` with client packages at `0.1.5-rc.2` (measured in the running app); client packages at `0.1.7-rc.1` (types, and markup read from the published `ui-chat` / `ui-conversation` bundles — not yet run against a live 0.1.7 app).
- **DSH 0.1.7 signal changes**: `useSessionPendingInteraction` is gone (the waiting state now reads `useSessionStatus`), and the session list no longer names the current session, so the Dock takes its state from the session-scoped entry instead. Both are handled per host, so 0.1.5 keeps working.
- **Graceful Degradation**: If future DSH updates change internal slot names or alter status row markup, the plugin fails silently without interrupting conversation flow.
- **Dynamic Theme Adaptation**: Adapts automatically to DSH `--dsw-alias-*` CSS variables, backed by high-contrast standalone fallback themes.

---

## 🙏 Acknowledgements

- **Implementation Heritage**: [dsh-thought-buddy](https://github.com/dsh-plugins/dsh-thought-buddy) (BSD-3-Clause) for the host/client bundle architecture, fixed-step spring timing model, and bundle verification strategy.
- **Interaction Inspiration**: [dsh-notch](https://github.com/aa2246740/dsh-notch) (MIT) for the edge-anchored continuous surface concept.
- **Classic Row Styling**: an independent re-creation of DSH 0.1.5's running-turn label style (`@deepseek-ai/dsh-client-ui-chat`, MIT, © DeepSeek), using DSH's own design tokens.
- **Trademark Notice**: The whale mark is the intellectual property of DeepSeek, incorporated from [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (`FishLogo.tsx`) with zero coordinate alterations.

---

## 📄 License

[BSD-3-Clause](LICENSE) © 2026 dsh-whale-buddy contributors.
