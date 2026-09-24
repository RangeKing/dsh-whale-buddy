/**
 * What the current session's turn is doing, read out of DSH's selector hooks.
 *
 * Shared by the two session-scoped entries — the inline anchor on
 * `conversation.input.overlay` and the classic row on `conversation.input.dock`
 * — so the two can never disagree about the state they are drawing.
 *
 * Every selector returns a primitive on purpose: the snapshot hooks compare a
 * selector's result by identity, and the chat timeline is republished as the
 * same object, so selecting it wholesale never re-renders.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TrajectorySnapshot } from '@deepseek-ai/dsh-client-ui-trajectory/client'
import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'

import type { WhaleActivity } from '../whale/types.js'
import { activityOf, ERROR_HOLD_MS, NO_ERROR_PULSE, stepErrorPulse } from './thinking-state.js'

/** The hooks and identity every session-scoped slot hands its entries. */
export type SessionEntryProps = PropsRuntime<'conversation.input.overlay'>

/** A selector hook, as loosely as this module needs one. */
type Selector<S> = <R>(select: (snapshot: S) => R) => R

/**
 * DSH 0.1.5's pending-interaction hook: a map keyed by session. DSH 0.1.7
 * dropped it in favour of `useSessionStatus`, so it is typed here rather than
 * imported, and only called on a host that still hands it over.
 */
type LegacyPendingHook = Selector<ReadonlyMap<string, unknown>>

/** What {@link useSessionActivity} reports. */
export interface SessionActivity {
  readonly activity: WhaleActivity
  /** A turn is open (or its first prompt is on the way). */
  readonly running: boolean
  /**
   * Counts turns seen by this mount, stepping on every not-running → running
   * edge. A surface keyed by it is rebuilt per turn even when the state never
   * passes through `idle` — a retry during an error pulse goes straight from
   * `error` to `thinking`, and without a key it would keep the last turn's
   * clock and skip the breach.
   */
  readonly turn: number
  /**
   * When the running turn began, epoch ms, or null when DSH does not say.
   * Read from the same slice DSH's own turn timings come from.
   */
  readonly turnStart: number | null
}

/** Stand-in for a host that carries no Trajectory target: nothing is compacting. */
const NO_TRAJECTORY = (): boolean => false

/** Stand-in for a host with neither pending-interaction hook. */
const NO_PENDING = (): boolean => false

/**
 * Latest start among turns that have not ended.
 * @param snapshot - DSH's chat snapshot.
 * @returns epoch ms, or null.
 */
function openTurnStart(snapshot: ChatSnapshot): number | null {
  const timings = snapshot.legacy?.turnTimings
  if (timings === undefined || typeof timings.values !== 'function') return null
  let latest: number | null = null
  for (const timing of timings.values()) {
    if (timing.endTime !== undefined) continue
    if (latest === null || timing.startTime > latest) latest = timing.startTime
  }
  return latest
}

/**
 * Read the session's activity from DSH.
 * @param props - the slot entry's runtime share.
 * @returns the activity and when the turn began.
 */
export function useSessionActivity(props: SessionEntryProps): SessionActivity {
  const { useSession, useChat, useTrajectory, sessionId } = props
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
  const turnStart = useChat(openTurnStart)

  // Pending interactions moved between DSH versions: 0.1.5 handed session
  // entries `useSessionPendingInteraction` (a map of session → request),
  // 0.1.7 folds the same fact into `useSessionStatus`. Which one exists is a
  // property of the host, fixed for the page's lifetime, so choosing between
  // them cannot change the hook count between renders.
  const loose = props as unknown as {
    useSessionStatus?: Selector<SessionStatusSnapshot>
    useSessionPendingInteraction?: LegacyPendingHook
  }
  const status = loose.useSessionStatus
  const legacyPending = loose.useSessionPendingInteraction
  const pending =
    status !== undefined
      ? status((map) => map.get(sessionId)?.pendingInteraction !== undefined)
      : legacyPending !== undefined
        ? legacyPending((map) => map.get(sessionId) !== undefined)
        : NO_PENDING()

  // Compaction lives on the Trajectory target as a provider request with
  // `purpose: 'compaction'`. The trajectory package is not in this plugin's
  // `inject` list, deliberately: injecting a package a given DSH build does not
  // carry fails activation outright, and losing every surface to gain one state
  // is the wrong trade. `NO_TRAJECTORY` is a plain function rather than a
  // conditional call, so the hook count cannot change under React.
  const compacting = (useTrajectory ?? NO_TRAJECTORY)((snapshot: TrajectorySnapshot) =>
    (snapshot.requests ?? []).some(
      (request: { purpose?: string; status?: string }) =>
        request.purpose === 'compaction' && request.status === 'running',
    ),
  )
  // A *string*, not a boolean, because DSH latches this field: it holds the
  // last error that ever happened on the session and never clears it.
  // `stepErrorPulse` turns the value into an event; only a change while this
  // mount is watching counts.
  const errorText = useSession((snapshot: SessionSnapshot) => {
    const agent = snapshot.lastAgentError ?? null
    const prompt = snapshot.promptError ?? null
    return agent === null && prompt === null ? null : `${String(agent)}|${String(prompt)}`
  })
  const turns = useRef({ was: false, n: 0 })
  // Idempotent under a repeated render: the edge is only seen once.
  if (running && !turns.current.was) turns.current.n += 1
  turns.current.was = running
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
  return { activity, running, turn: turns.current.n, turnStart }
}
