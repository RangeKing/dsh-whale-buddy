/**
 * dsh-whale-buddy — browser half.
 *
 * Three slot registrations and one shared store:
 *
 *  - `conversation.input.overlay` (session-scoped list) is the lifecycle host
 *    of the inline thinking whale. DSH has no seat beside its running-turn
 *    label in either 0.1.5 or 0.1.7, so this entry renders nothing of its own:
 *    it owns the per-session mount of `integration/status-anchor`, which puts
 *    the whale into DSH's label wherever this DSH build draws it. The overlay
 *    anchor is `height: 0; position: absolute`, so the entry costs nothing in
 *    flow. The whale keys off `SessionSnapshot.running`: a real signal, not
 *    the text.
 *  - `conversation.input.dock` (session-scoped list) holds the classic row,
 *    only when the user has asked for it: DSH 0.1.5's blue "深度求索中..." with
 *    the whale in it, re-drawn above the composer because DSH 0.1.7 no longer
 *    draws it. This slot is *not* free — it sits inside the composer seat,
 *    whose height DSH turns into the transcript's bottom padding, so the row
 *    appearing and leaving moves the conversation by one row per turn. That is
 *    exactly what DSH's own row did in 0.1.5, which is the thing being asked
 *    for; it is why the row is opt-in rather than the default.
 *  - `shell.overlay` (root-scoped list) holds the Whale Dock. It is DSH's
 *    documented frame-wide floating layer: additive, click-through except where
 *    an entry opts in, and outside every column's scroll container. That is
 *    exactly the contract a right-edge dock needs, so the plugin owns no
 *    body-level root and installs no MutationObserver.
 *
 * The plugin/host split and the `apply` → disposer shape are adapted from
 * dsh-thought-buddy (BSD-3-Clause). See THIRD_PARTY_NOTICES.md.
 */
import { createElement, useCallback, useEffect, useMemo, type ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

import {
  ClassicWhaleHost,
  InlineWhaleHost,
  useWhaleSnapshot,
  WhaleDockHost,
} from './integration/dsh.js'
import { probeStatusShape } from './integration/status-anchor.js'
import { useSessionActivity } from './integration/session-activity.js'
import type { StatusRowKind } from './integration/status-anchor.js'
import { formatClassicClock } from './surfaces/classic-status.js'
import {
  en,
  fallbackTranslate,
  statusWordFor,
  zh,
  type Translate,
  type WhaleBuddyDict,
} from './locales.js'
import { WhaleStateStore } from './state/whale-state.js'
import { injectPluginCss } from './styles/plugin-css.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This plugin's own copy. */
    'whale-buddy': keyof WhaleBuddyDict
  }
}

/** Locale namespace owned by this plugin. */
export const NS = 'whale-buddy'

/** Cordis services this plugin's UI needs. */
export const inject = ['slots', 'locale']

/** Props of the `conversation.input.overlay` entry. */
type InlineEntryProps = PropsRuntime<'conversation.input.overlay'> & {
  store: WhaleStateStore
  t: Translate
}

/** Props of the `conversation.input.dock` entry. */
type ClassicEntryProps = PropsRuntime<'conversation.input.dock'> & {
  store: WhaleStateStore
  t: Translate
}

/**
 * Recognises DSH's own running-turn label.
 *
 * Exported because the demo mounts the same surface against a stand-in status
 * row, and a matcher written twice is a matcher that drifts.
 *
 * DSH ships exactly one — `chat.deepDiving`, "Deep diving..." in English and
 * "深度求索中..." (0.1.5) or "深度求索中" (0.1.7) in Chinese — and it is the
 * anchor the whale attaches to. Once attached to a 0.1.5 row, the label is
 * replaced by one of this plugin's own words, so the matcher also accepts
 * those: without that, the row would stop being recognisable the moment it
 * was relabelled.
 */
export function makeStatusMatcher(t: Translate): (text: string) => boolean {
  const ours = new Set(
    (
      [
        'status.thinking',
        'status.responding',
        'status.working',
        'status.waiting',
        'status.reading',
        'status.editing',
        'status.running',
        'status.searching',
        'status.delegating',
        'status.compacting',
        'status.error',
      ] as const
    ).map((key) => t(key).trim()),
  )
  return (text) => {
    const value = text.trim()
    if (value === '') return false
    // Anchored: DSH's label *starts* with these words ("深度求索中，用时12秒"),
    // while an error row that merely mentions the company does not.
    if (/^(?:deep diving|深度求索)/i.test(value)) return true
    for (const word of ours) {
      if (word !== '' && value.startsWith(word)) return true
    }
    return false
  }
}

/**
 * With the classic row on, the anchor takes only a row DSH draws in the old
 * shape. Module-level so its identity is stable across renders.
 */
const LEGACY_ONLY = (kind: StatusRowKind): boolean => kind === 'legacy'

/** Props of the `shell.overlay` entry. */
type DockEntryProps = PropsRuntime<'shell.overlay'> & { store: WhaleStateStore; t: Translate }

/**
 * Inline entry: renders the whale only while this session's turn is running
 * and the user has the inline surface switched on.
 *
 * With the classic row switched on it still runs, but asks the anchor for a
 * DSH-drawn classic row only. On DSH 0.1.5 that row exists, the whale goes
 * into it exactly as before, and the plugin's own copy stands down; on 0.1.7
 * it does not, and the anchor goes to sleep at the first grey header it sees.
 * @param props - the slot's owner share plus the shared store.
 * @returns the inline whale, or nothing.
 */
function InlineEntry(props: InlineEntryProps): ReactElement | null {
  const { store, t, sessionId } = props
  const observed = useSessionActivity(props)
  const { config, activity, session } = useWhaleSnapshot(store)
  const turn = `${session.sessionId}:${session.turn}`
  const match = useMemo(() => makeStatusMatcher(t), [t])
  const onFound = useCallback(
    (kind: StatusRowKind) => {
      store.markClassicRowHost(kind === 'legacy' ? 'native' : 'absent')
    },
    [store],
  )
  useEffect(() => {
    store.publishSession(sessionId, observed)
  }, [store, sessionId, observed.activity, observed.running, observed.turn, observed.turnStart])
  useEffect(() => () => store.clearSession(sessionId), [store, sessionId])

  // `error` is allowed through even though DSH removes its status row when the
  // turn stops: the anchor fails quiet with nothing to attach to, and the Dock
  // — which is always there — is where a failed turn actually gets seen.
  if (!config.inlineEnabled || session.sessionId !== sessionId || activity.state === 'idle') return null
  return createElement(InlineWhaleHost, {
    // One host per turn: a retry that starts inside an error pulse never
    // passes through idle, and would otherwise skip its breach.
    key: turn,
    store,
    activity,
    word: config.classicStatus ? t('classic.word') : statusWordFor(activity, t),
    match,
    ...(config.classicStatus ? { claim: LEGACY_ONLY } : {}),
    onFound,
  })
}

/**
 * Classic entry: the plugin's own blue running-turn row above the composer,
 * only when asked for, and only on a DSH that no longer draws one itself.
 *
 * Its fixed Deep diving label is only true while a turn is running; the
 * Dock carries any error pulse after the turn ends.
 * @param props - the slot's owner share plus the shared store.
 * @returns the classic row, or nothing.
 */
function ClassicEntry(props: ClassicEntryProps): ReactElement | null {
  const { store, t } = props
  const { config, classicRowHost, activity, session } = useWhaleSnapshot(store)
  const { running, turnStart } = session
  const turn = `${session.sessionId}:${session.turn}`
  const formatClock = useCallback((ms: number) => formatClassicClock(ms, t), [t])
  const wanted = config.inlineEnabled && config.classicStatus
  // A page with history already shows which DSH this is; a fresh one waits for
  // the inline anchor's verdict on the first turn. Drawing on a guess would
  // put a second blue row under DSH 0.1.5's own for the length of a turn.
  useEffect(() => {
    if (!wanted || classicRowHost !== 'unknown') return
    if (probeStatusShape(document) === 'process') store.markClassicRowHost('absent')
  }, [store, wanted, classicRowHost, activity.state])
  if (!wanted || !running || classicRowHost !== 'absent' || session.sessionId !== props.sessionId) return null
  return createElement(ClassicWhaleHost, {
    key: turn,
    store,
    activity,
    word: t('classic.word'),
    fallbackWord: t('classic.word'),
    turnStart,
    running,
    formatClock,
  })
}

/**
 * Dock entry: always present, following the session-scoped publisher.
 * @param props - the framework's global share plus the store and copy.
 * @returns the dock, or nothing when the user switched it off.
 */
function DockEntry({ store, t }: DockEntryProps): ReactElement | null {
  // The session-scoped entry publishes the full activity on every supported
  // DSH version, even when its visual whale is disabled. A root-level running
  // boolean would overwrite tool details and disagree with that session.
  const { config } = useWhaleSnapshot(store)
  if (!config.dockEnabled) return null
  return createElement(WhaleDockHost, { store, t })
}

/**
 * Client plugin body.
 * @param ctx - client root context.
 * @returns a disposer that removes both surfaces, the stylesheet and the store.
 */
export function apply(ctx: Context): () => void {
  const store = new WhaleStateStore()
  if (!store.getSnapshot().config.enabled) return () => {}

  const removeCss = injectPluginCss(document)
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-whale-buddy.client.locale')
  const bound = ctx.locale.bind(NS)
  const t: Translate = (key) => bound(key) ?? fallbackTranslate()(key)

  const stopInline = ctx.slots.inject('conversation.input.overlay', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.overlay',
        id: 'whale-buddy',
        order: 40,
        locale: NS,
        inject: () => ({ store, t }),
      },
      InlineEntry,
    ),
  )

  const stopClassic = ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'whale-buddy-classic',
        // Last in the dock, so the row sits directly on top of the composer
        // card, where DSH's own row used to end up.
        order: 100,
        locale: NS,
        inject: () => ({ store, t }),
      },
      ClassicEntry,
    ),
  )

  const stopDock = ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'whale-buddy',
        order: 60,
        locale: NS,
        inject: () => ({ store, t }),
      },
      DockEntry,
    ),
  )

  return () => {
    stopDock()
    stopClassic()
    stopInline()
    store.dispose()
    removeCss()
  }
}

export { WhaleStateStore } from './state/whale-state.js'
export { mountWhaleDock } from './surfaces/whale-dock.js'
export { mountWhale } from './whale/view.js'
export { WhaleEngine } from './whale/engine.js'
export { createWhaleRenderer } from './whale/renderer-svg.js'
export { seededRandom } from './whale/scheduler.js'
export { PLUGIN_CSS, injectPluginCss, DOCK_TRANSITION_MS } from './styles/plugin-css.js'
export { loadConfig, saveConfig, DEFAULT_CONFIG } from './config.js'
export {
  activityOf,
  activityTag,
  stepErrorPulse,
  NO_ERROR_PULSE,
  ERROR_HOLD_MS,
  taskOfTool,
  stateOfSession,
  stateOfSessionList,
  stateOfStatusText,
} from './integration/thinking-state.js'
export {
  attachStatusAnchor,
  probeStatusShape,
  STATUS_HOST_ATTR,
  STATUS_KIND_ATTR,
} from './integration/status-anchor.js'
export { mountStatusWhale } from './surfaces/inline-status.js'
export { useSessionActivity } from './integration/session-activity.js'
export {
  classicSeat,
  formatClassicClock,
  CLASSIC_ROW_ATTR,
  CLASSIC_CLOCK_AFTER_MS,
} from './surfaces/classic-status.js'
export { statusWordFor } from './locales.js'
export { rigTransforms, isPoseSane, limitsFor, bleedFor, unitsPerPixel } from './whale/rig.js'
export {
  NEUTRAL_POSE,
  budgetFor,
  MIN_TRAVEL_PX,
  MAX_TRAVEL_PX,
  MIN_LEAP_PX,
  MAX_LEAP_PX,
} from './whale/types.js'
export { leapAt, heightAt, crossingBetween, LEAP_SECONDS } from './whale/leap.js'
export { WATER_REST_Y } from './whale/water.js'
export { createSpring, integrate } from './whale/spring.js'
export { anchorFor, propFor, NO_EFFECTS, PROP_TOSS_RATIO } from './whale/types.js'
export { IDLE_PROP_DELAY } from './whale/props.js'
export { ERROR_INK, FILE_SPAN } from './whale/props-svg.js'
export { profileFor, swimReach } from './whale/poses.js'
export { en, zh, fallbackTranslate } from './locales.js'
