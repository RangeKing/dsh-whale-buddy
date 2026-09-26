/**
 * Plugin stylesheet, injected once per document.
 *
 * Colour rides DSH's own alias tokens — the ones its theme presenter actually
 * writes onto `document.body`, verified against `@deepseek-ai/dsh-client-ui-theme`
 * rather than guessed — so the Dock re-themes with the app and needs no theme
 * subscription of its own. Behind each token sits a `--wb-*` fallback for the
 * demo and for a host that renames one; those fallbacks follow
 * `prefers-color-scheme`, and also DSH's own `data-ds-dark-theme` body
 * attribute when it is present. The whale itself is `currentColor`, so it
 * inherits whatever ink its surface sets.
 *
 * The idempotent `<style data-plugin-css>` tag pattern is adapted from
 * dsh-thought-buddy (BSD-3-Clause); see THIRD_PARTY_NOTICES.md.
 *
 * NOTE: the stylesheet below is one template literal. Do not use backticks
 * inside its comments — they close the literal, and the resulting syntax error
 * points at a line far from the one you edited.
 */

/** Attribute value identifying this plugin's stylesheet. */
export const STYLE_TAG_ID = 'dsh-whale-buddy/styles.css'

/** Collapsed dock button size, CSS pixels — a comfortable pointer target. */
export const DOCK_BUTTON = 42

/** Expanded panel width, CSS pixels. */
export const DOCK_PANEL_WIDTH = 272

/** Shell transition, milliseconds. Long enough to read, short enough to spam. */
export const DOCK_TRANSITION_MS = 260

export const PLUGIN_CSS = `
:root {
  --wb-bg: #f6f7f9;
  --wb-bg-plain: #ffffff;
  --wb-text-1: #1f2733;
  --wb-text-2: #4a5563;
  --wb-text-3: #7c8794;
  --wb-text-4: #98a2ad;
  --wb-border: rgba(127, 140, 155, 0.32);
  --wb-border-strong: rgba(90, 104, 120, 0.28);
  --wb-fill: rgba(127, 140, 155, 0.12);
  --wb-fill-solid: #ebeef2;
  --wb-focus: #3b7ddd;
  --wb-shadow: rgba(15, 22, 36, 0.1);
  --wb-shadow-strong: rgba(15, 22, 36, 0.16);
}
@media (prefers-color-scheme: dark) {
  :root {
    --wb-bg: #222831;
    --wb-bg-plain: #1a1f27;
    --wb-text-1: #e8ecf1;
    --wb-text-2: #c2cad4;
    --wb-text-3: #909aa6;
    --wb-text-4: #737d89;
    --wb-border: rgba(180, 190, 205, 0.22);
    --wb-border-strong: rgba(200, 210, 225, 0.28);
    --wb-fill: rgba(190, 200, 215, 0.14);
    --wb-fill-solid: #43454a;
    --wb-focus: #6fa8ff;
    --wb-shadow: rgba(0, 0, 0, 0.42);
    --wb-shadow-strong: rgba(0, 0, 0, 0.55);
  }
}
/* DSH states its own theme on the body; that beats the system preference. */
body[data-ds-dark-theme] {
  --wb-bg: #222831;
  --wb-bg-plain: #1a1f27;
  --wb-text-1: #e8ecf1;
  --wb-text-2: #c2cad4;
  --wb-text-3: #909aa6;
  --wb-text-4: #737d89;
  --wb-border: rgba(180, 190, 205, 0.22);
  --wb-border-strong: rgba(200, 210, 225, 0.28);
  --wb-fill: rgba(190, 200, 215, 0.14);
  --wb-fill-solid: #43454a;
  --wb-focus: #6fa8ff;
  --wb-shadow: rgba(0, 0, 0, 0.42);
  --wb-shadow-strong: rgba(0, 0, 0, 0.55);
}
/*
 * The whale inside DSH's status row. That row paints its label with a
 * transparent colour over a clipped gradient, so currentColor there is
 * transparent — the whale has to state its own ink or it renders as nothing.
 * The colour below is only the fallback: attachStatusAnchor reads the row's
 * actual gradient and writes the real ink inline, so the whale is the same
 * blue as the word beside it rather than a black sticker next to it.
 *
 * The margins are written inline by the surface, not here, because they are
 * the negative of the drawing's bleed and the bleed depends on the configured
 * size. Most of that bleed is the leap's headroom: the element is about twice
 * the mark's height so a breach is never clipped, and the negative margin puts
 * the mark's own box back into the layout so DSH's status row stays the height
 * it was. The whale overflows the row; measured in the running app, every
 * ancestor up to the view area is overflow: visible with 16 px of clear space
 * above, so there is nothing there to clip it and nothing there to cover.
 *
 * pointer-events is off because that overflow reaches over neighbouring rows,
 * and a decorative mark must not be the thing that swallows a click on them.
 */
.wb-status {
  display: inline-flex;
  align-items: center;
  flex: none;
  vertical-align: middle;
  pointer-events: none;
  color: var(--dsw-alias-label-primary, var(--wb-text-1));
  opacity: 0.9;
  -webkit-text-fill-color: currentColor;
}
.wb-status svg { display: block; }
/*
 * DSH 0.1.7 moved the running label into the turn's fold header, which paints
 * ordinary grey text and brightens it on hover. There the whale simply wears
 * the header's own ink, hover included.
 */
.wb-status[data-whale-buddy-kind="process"] {
  color: inherit;
  -webkit-text-fill-color: currentColor;
}
/*
 * The classic row: DSH 0.1.5's running-turn label, re-drawn by the plugin in
 * the composer's dock when the classic option is on. Same type, same blue,
 * same sweep, same late clock; the tokens are DSH's, the hex behind each is
 * the value DSH ships for it, for a host that renames one.
 */
.wb-classic {
  --wb-deep-500: var(--dsw-static-deepseek-500, #4176e6);
  --wb-deep-200: var(--dsw-static-deepseek-200, #d3e2ff);
  display: flex;
  align-items: center;
  height: calc(26px + var(--dsh-content-font-delta, 0px));
  min-width: 0;
  pointer-events: none;
}
.wb-classic .wb-status {
  color: var(--wb-deep-500);
  opacity: 1;
}
.wb-classic__word {
  font: var(--dsw-font-s-strong-14, 600 14px/22px system-ui, sans-serif);
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(22px + var(--dsh-content-font-delta, 0px));
  white-space: nowrap;
  background: linear-gradient(90deg, var(--wb-deep-500) 0%, var(--wb-deep-500) 40%, var(--wb-deep-200) 50%, var(--wb-deep-500) 60%, var(--wb-deep-500) 100%);
  background-position: 100% 0;
  background-size: 250% 100%;
  color: transparent;
  -webkit-text-fill-color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
  animation: wb-classic-sweep 1.8s linear infinite;
}
.wb-classic__clock {
  font: var(--dsw-font-xs-13, 400 13px/20px system-ui, sans-serif);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  color: var(--dsw-alias-label-caption, var(--wb-text-4));
  margin-left: 8px;
  white-space: nowrap;
}
.wb-classic__clock[hidden] { display: none; }
.wb-classic[data-still] .wb-classic__word {
  background-position: 0 0;
  background-size: 100% 100%;
  animation: none;
}
@keyframes wb-classic-sweep { to { background-position: 0 0; } }
/*
 * --wb-dock-top is the drag position, a fraction of the usable track. The
 * element is placed by top alone — no translate — so that dragging changes
 * exactly one property and never fights the shell's own width/height
 * transition.
 */
.wb-dock {
  position: absolute;
  top: calc(var(--wb-dock-top, 0.5) * (100% - var(--wb-dock-size, 42px)));
  right: 0;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
  padding-right: max(0px, env(safe-area-inset-right, 0px));
  z-index: 1;
  transition: top ${DOCK_TRANSITION_MS}ms cubic-bezier(0.22, 0.78, 0.3, 1);
}
.wb-dock[data-dragging] { cursor: grabbing; transition: none; }
.wb-dock[data-dragging] .wb-dock__shell { transition: none; }
.wb-dock__button { touch-action: none; }
/* A right panel taking the whole frame owns the edge; stand down. */
[data-rightbar-fullscreen] .wb-dock { display: none; }

.wb-dock__shell {
  pointer-events: auto;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  overflow: hidden;
  width: ${DOCK_BUTTON}px;
  height: ${DOCK_BUTTON}px;
  border: 1px solid var(--dsw-alias-border-l4, var(--wb-border-strong));
  border-right: none;
  border-radius: 16px 0 0 16px;
  background: var(--dsw-alias-button-floating-fill, var(--dsw-alias-bg-layer-2, var(--wb-bg)));
  color: var(--dsw-alias-label-secondary, var(--wb-text-2));
  box-shadow: 0 1px 10px var(--wb-shadow);
  transform-origin: 100% 50%;
  transition:
    width ${DOCK_TRANSITION_MS}ms cubic-bezier(0.22, 0.78, 0.3, 1),
    height ${DOCK_TRANSITION_MS}ms cubic-bezier(0.22, 0.78, 0.3, 1),
    box-shadow 160ms ease-out;
}
/*
 * While the shell is being measured for its open height it must not animate,
 * or the measurement itself becomes a visible frame. See measureExpanded() in
 * whale-dock.ts: this is the one moment the transition is suppressed.
 */
.wb-dock__shell[data-measuring] { transition: none !important; }
/*
 * The one window in which the shell may spill.
 *
 * The clip exists for the expand animation: a panel growing inside a box that
 * is still the size of a button has to be cut off, or the open reads as content
 * appearing before its container. Collapsed and settled, there is nothing to
 * cut off — and the breach needs the room, because a 24 px whale's leap draws a
 * ~48 px element inside a 42 px pill and would otherwise be sliced across at
 * the top of its arc, which is the one frame of the animation that matters.
 *
 * whale-dock.ts stamps data-transitioning for the duration of a shell
 * animation, so the clip is back before anything can need it.
 */
.wb-dock__shell[data-expanded='false']:not([data-transitioning]):not([data-measuring]) {
  overflow: visible;
}
/* Spilling, the invisible collapsed panel must not catch a pointer either. */
.wb-dock__shell[data-expanded='false'] .wb-dock__panel { pointer-events: none; }
/*
 * Collapsed, the shell is a small white tab flush against a white app on a
 * white background: in DSH it read as something half-scrolled-off rather than
 * as a control. A tinted fill is what tells the eye it is a button.
 */
.wb-dock__shell[data-expanded='false'] {
  background: var(--dsw-alias-button-ghost-active-fill, var(--wb-fill-solid));
}
.wb-dock__shell[data-expanded='true'] {
  width: ${DOCK_PANEL_WIDTH}px;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2, var(--wb-bg-plain)));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  box-shadow: var(--dsw-elevation-prominent, 0 6px 26px var(--wb-shadow-strong));
}
.wb-dock__shell[data-expanded='false']:hover { box-shadow: 0 3px 16px var(--wb-shadow-strong); }

/*
 * Expanded, the panel owns the whole shell: the 24 px whale in the corner is
 * removed so the only whale on screen is the large live one. The button is
 * what would normally return focus on close, so opening moves focus to the
 * panel's close control — you cannot leave focus on an element you are about
 * to take out of the layout.
 */
.wb-dock__shell[data-expanded='true'] .wb-dock__button {
  display: none;
}
.wb-dock__button {
  appearance: none;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${DOCK_BUTTON}px;
  height: ${DOCK_BUTTON}px;
  padding: 0;
  border: none;
  background: transparent;
  /* Full label ink. At secondary the whale read as a disabled control beside
     DSH's own near-black brand mark; the state cue is carried by opacity. */
  color: var(--dsw-alias-label-primary, var(--wb-text-1));
  cursor: pointer;
  border-radius: 16px 0 0 16px;
  transition: transform 140ms ease-out, background-color 140ms ease-out;
}
.wb-dock__button:hover { background: var(--dsw-alias-button-ghost-active-fill, var(--wb-fill)); }
.wb-dock__button:hover .wb-dock__mark { transform: scale(1.06); }
.wb-dock__button:active .wb-dock__mark { transform: scale(0.97); }
.wb-dock__button:focus-visible {
  outline: 2px solid var(--wb-focus);
  outline-offset: -2px;
}
.wb-dock__mark {
  display: block;
  opacity: 0.72;
  transition: transform 140ms ease-out, opacity 200ms ease-out;
}
/* State-aware, quietly: the resting whale is slightly held back so a permanent
   control does not shout, and comes fully forward while a turn runs. */
.wb-dock__shell[data-state='thinking'] .wb-dock__mark { opacity: 1; }
.wb-dock__button:hover .wb-dock__mark { opacity: 1; }

.wb-dock__panel {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 10px;
  font: var(--dsw-font-xs-13, 400 13px/20px system-ui, sans-serif);
  opacity: 1;
  transition: opacity 160ms ease-out ${Math.round(DOCK_TRANSITION_MS * 0.35)}ms;
}
.wb-dock__shell[data-expanded='false'] .wb-dock__panel {
  opacity: 0;
  transition-delay: 0ms;
}

.wb-dock__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
/* Uses the host's menu, field and brand tokens. Native form elements keep
 * keyboard and checked-state behavior without a second component runtime. */
.wb-dock__title {
  min-width: 0;
  font: var(--dsw-font-s-strong-14, 500 14px/22px system-ui, sans-serif);
  color: var(--dsw-alias-label-primary, var(--wb-text-1));
}
.wb-dock__close {
  appearance: none;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, var(--wb-text-3));
  font: 20px/1 system-ui, sans-serif;
  cursor: pointer;
}
.wb-dock__close:hover {
  background: var(--dsw-alias-interactive-bg-hover, var(--wb-fill));
  color: var(--dsw-alias-label-primary, var(--wb-text-1));
}
.wb-dock__close:focus-visible,
.wb-dock__switch:focus-visible,
.wb-dock__select select:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, var(--wb-focus));
  outline-offset: 2px;
}
.wb-dock__stage {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  min-height: 68px;
  padding: 0 4px;
  color: var(--dsw-alias-label-primary, var(--wb-text-1));
}
.wb-dock__preview { flex: none; display: flex; }
.wb-dock__state {
  min-width: 0;
  font: var(--dsw-font-xxs-12, 400 12px/18px system-ui, sans-serif);
  color: var(--dsw-alias-label-tertiary, var(--wb-text-3));
  overflow-wrap: anywhere;
}
.wb-dock__state strong {
  display: block;
  margin-bottom: 2px;
  font: var(--dsw-font-xs-strong-13, 500 13px/20px system-ui, sans-serif);
  color: var(--dsw-alias-label-primary, var(--wb-text-1));
}
.wb-dock__controls {
  display: flex;
  flex-direction: column;
  border-top: 0.5px solid var(--dsw-alias-border-l2, var(--wb-border));
  padding-top: 4px;
}
.wb-dock__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  color: var(--dsw-alias-label-primary, var(--wb-text-1));
}
.wb-dock__row label {
  flex: 1;
  padding: 10px 0;
  cursor: pointer;
}
.wb-dock__row:has(input:disabled) label {
  color: var(--dsw-alias-label-tertiary, var(--wb-text-3));
  cursor: default;
}
.wb-dock__switch {
  appearance: none;
  box-sizing: border-box;
  flex: none;
  width: 36px;
  height: 20px;
  margin: 0;
  padding: 2px;
  border: 0;
  border-radius: 99px;
  corner-shape: round;
  background: var(--dsw-alias-border-l3, var(--wb-border));
  cursor: pointer;
}
.wb-dock__switch::before {
  content: '';
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-label-primary-foreground, #fff);
  transition: transform 120ms ease;
}
.wb-dock__switch:checked { background: var(--dsw-alias-brand-primary, var(--wb-focus)); }
.wb-dock__switch:checked::before { transform: translateX(16px); }
.wb-dock__switch:disabled { opacity: 0.5; cursor: default; }
.wb-dock__select { position: relative; flex: none; }
.wb-dock__select::after {
  content: '';
  position: absolute;
  right: 11px;
  top: 11px;
  width: 5px;
  height: 5px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(45deg);
  pointer-events: none;
  color: var(--dsw-alias-label-tertiary, var(--wb-text-3));
}
.wb-dock__select select {
  appearance: none;
  box-sizing: border-box;
  min-width: 86px;
  height: 30px;
  padding: 0 28px 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4, var(--wb-border));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base, var(--wb-bg)));
  color: var(--dsw-alias-label-primary, var(--wb-text-1));
  font: inherit;
  cursor: pointer;
}
.wb-dock__select select:hover {
  background: var(--dsw-alias-interactive-bg-hover, var(--wb-fill-solid));
}
@media (prefers-reduced-motion: reduce) {
  .wb-classic__word {
    background-position: 0 0;
    background-size: 100% 100%;
    animation: none;
  }
  .wb-dock,
  .wb-dock__shell,
  .wb-dock__button,
  .wb-dock__mark,
  .wb-dock__panel,
  .wb-dock__switch::before {
    transition: none !important;
  }
  .wb-dock__button:hover .wb-dock__mark,
  .wb-dock__button:active .wb-dock__mark { transform: none; }
}
`

/**
 * Add the stylesheet to a document once.
 * @param doc - the document to style.
 * @returns a disposer that removes the tag if this call created it.
 */
export function injectPluginCss(doc: Document): () => void {
  const existing = doc.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`)
  if (existing !== null) return () => {}
  const style = doc.createElement('style')
  style.setAttribute('data-plugin', 'dsh-whale-buddy')
  style.setAttribute('data-plugin-css', STYLE_TAG_ID)
  style.textContent = PLUGIN_CSS
  doc.head.appendChild(style)
  return () => {
    style.remove()
  }
}
