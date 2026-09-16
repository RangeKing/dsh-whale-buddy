/**
 * dsh-whale-buddy — browser half.
 *
 * Two slot registrations and one shared store:
 *
 *  - `conversation.input.overlay` (session-scoped list) holds the inline
 *    thinking whale. DSH 0.1.5 has no seat beside the "Deep diving…" status
 *    line, and of the documented alternatives this is the only one that is
 *    free: its anchor is `height: 0; position: absolute` at the top edge of the
 *    composer card, inside a card that does not clip overflow, so an entry
 *    costs nothing in flow and can float into the seam above the composer.
 *
 *    The obvious-looking neighbour, `conversation.input.dock`, is not free.
 *    It sits inside the composer seat, and DSH observes that seat's height to
 *    drive the transcript's bottom padding — so a whale that appears for the
 *    duration of a turn would reflow the whole conversation twice per turn.
 *    The whale keys off `SessionSnapshot.running`: a real signal, not the text.
 *  - `shell.overlay` (root-scoped list) holds the Whale Dock. It is DSH's
 *    documented frame-wide floating layer: additive, click-through except where
 *    an entry opts in, and outside every column's scroll container. That is
 *    exactly the contract a right-edge dock needs, so the plugin owns no
 *    body-level root and installs no MutationObserver.
 *
 * The plugin/host split and the `apply` → disposer shape are adapted from
 * dsh-thought-buddy (BSD-3-Clause). See THIRD_PARTY_NOTICES.md.
 */
import { createElement, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionPendingInteractionSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'

import { InlineWhaleHost, useWhaleSnapshot, WhaleDockHost } from './integration/dsh.js'
import {
  activityOf,
  ERROR_HOLD_MS,
  NO_ERROR_PULSE,
  stateOfSessionList,
  stepErrorPulse,
} from './integration/thinking-state.js'
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

/**
 * Recognises DSH's own running-turn label.
 *
 * Exported because the demo mounts the same surface against a stand-in status
 * row, and a matcher written twice is a matcher that drifts.
 *
 * DSH ships exactly one — `chat.deepDiving`, "Deep diving..." in English and
 * "深度求索中..." in Chinese — and it is the anchor the whale attaches to. Once
 * attached, the label is replaced by one of this plugin's own words, so the
 * matcher also accepts those: without that, the row would stop being
 * recognisable the moment it was relabelled.
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
    if (/diving|深度求索/i.test(value)) return true
    for (const word of ours) {
      if (word !== '' && value.startsWith(word)) return true
    }
    return false
  }
}

/** Stand-in for a host that carries no Trajectory target: nothing is compacting. */
const NO_TRAJECTORY = (): boolean => false

/** Props of the `shell.overlay` entry. */
type DockEntryProps = PropsRuntime<'shell.overlay'> & { store: WhaleStateStore; t: Translate }

/**
 * Inline entry: renders the whale only while this session's turn is running
 * and the user has the inline surface switched on.
 * @param props - the slot's owner share plus the shared store.
 * @returns the inline whale, or nothing.
 */
function InlineEntry({
  useSession,
  useChat,
  useTrajectory,
  useSessionPendingInteraction,
  sessionId,
  store,
  t,
}: InlineEntryProps): ReactElement | null {
  // This slot declares no owner share, so every fact comes from the
  // framework's selector hooks rather than from props.
  // Every one of these selects a primitive on purpose: the snapshot hooks
  // compare a selector's result by identity, and the chat timeline is
  // republished as the same object, so selecting it wholesale never re-renders.
  const running = useSession(
    (snapshot: SessionSnapshot) => snapshot.running === true || snapshot.awaitingFirstTurn === true,
  )
  // `legacy` is DSH's own name for this slice, and it is the only place the
  // client publishes in-flight tool calls — DSH drives its stats pills from the
  // same field. Read defensively: if a future version drops it, the whale falls
  // back to "thinking" instead of throwing inside a slot entry.
  const toolName = useChat(
    (snapshot: ChatSnapshot) => snapshot.legacy?.runningCalls?.at(-1)?.name,
  )
  const streaming = useChat(
    (snapshot: ChatSnapshot) => (snapshot.legacy?.partial ?? null) !== null,
  )
  const pending = useSessionPendingInteraction(
    (map: SessionPendingInteractionSnapshot) => map.get(sessionId) !== undefined,
  )
  // Compaction is the one fact that is not in the session or the chat slice.
  // It lives on the Trajectory target as a provider request with
  // `purpose: 'compaction'`, and `useTrajectory` is declared on
  // SessionStandardProps, so a session-scoped entry like this one is handed it.
  //
  // The trajectory package is not in this plugin's `inject` list, deliberately:
  // injecting a package a given DSH build does not carry fails activation
  // outright, and losing every surface to gain one state is the wrong trade.
  // The rule for anything read out of DSH here is fail quiet, so a host without
  // it simply never reports a compaction. `NO_TRAJECTORY` is a plain function
  // rather than a conditional call, so the hook count cannot change under React.
  const compacting = (useTrajectory ?? NO_TRAJECTORY)((snapshot: TrajectorySnapshot) =>
    (snapshot.requests ?? []).some(
      (request: { purpose?: string; status?: string }) =>
        request.purpose === 'compaction' && request.status === 'running',
    ),
  )
  // A *string*, not a boolean, because DSH latches this field: it holds the
  // last error that ever happened on the session and never clears it. Measured
  // on a freshly opened DSH, a never-used session already carried a resume
  // failure from a different session — read as a boolean that is a permanent
  // red mark for something nobody saw. `stepErrorPulse` turns the value into an
  // event; only a change while this mount is watching counts.
  const errorText = useSession((snapshot: SessionSnapshot) => {
    const agent = snapshot.lastAgentError ?? null
    const prompt = snapshot.promptError ?? null
    return agent === null && prompt === null ? null : `${String(agent)}|${String(prompt)}`
  })
  const pulse = useRef(NO_ERROR_PULSE)
  const step = stepErrorPulse(pulse.current, { error: errorText, running, now: Date.now() })
  pulse.current = step.pulse
  const failed = step.failed
  // Nothing in DSH changes when a pulse expires, so nothing would re-render and
  // the mark would sit there until the next unrelated update. One timer, armed
  // only while the mark is up, closes it.
  const [, retick] = useState(0)
  useEffect(() => {
    if (!failed) return undefined
    const left = ERROR_HOLD_MS - (Date.now() - (pulse.current.started ?? 0))
    const timer = setTimeout(() => retick((n) => n + 1), Math.max(50, left))
    return () => {
      clearTimeout(timer)
    }
  }, [failed, errorText])
  const activity = useMemo(
    () => activityOf({ running, toolName, streaming, pending, compacting, failed }),
    [running, toolName, streaming, pending, compacting, failed],
  )
  const { config } = useWhaleSnapshot(store)
  const match = useMemo(() => makeStatusMatcher(t), [t])

  useEffect(() => {
    store.setState(activity.state)
  }, [store, activity])

  // `error` is allowed through even though DSH removes its status row when the
  // turn stops: the anchor fails quiet with nothing to attach to, and the Dock
  // — which is always there — is where a failed turn actually gets seen.
  if (!config.inlineEnabled || activity.state === 'idle') return null
  return createElement(InlineWhaleHost, {
    store,
    activity,
    word: statusWordFor(activity, t),
    match,
  })
}

/**
 * Dock entry: always present, and the root-scoped publisher of semantic state
 * (the inline entry only exists while a session does).
 * @param props - the framework's global share plus the store and copy.
 * @returns the dock, or nothing when the user switched it off.
 */
function DockEntry({ useSessions, store, t }: DockEntryProps): ReactElement | null {
  const state = useSessions(stateOfSessionList)
  const { config } = useWhaleSnapshot(store)
  useEffect(() => {
    store.setState(state)
  }, [store, state])
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
export { attachStatusAnchor, STATUS_HOST_ATTR } from './integration/status-anchor.js'
export { mountStatusWhale } from './surfaces/inline-status.js'
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
