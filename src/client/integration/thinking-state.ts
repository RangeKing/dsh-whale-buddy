/**
 * The only module that decides what DSH is doing.
 *
 * DSH publishes exactly one status string — `chat.deepDiving`, "Deep diving…"
 * — for the whole of a running turn, no matter what the turn is actually doing.
 * It does, however, publish the underlying facts, and this is where they are
 * read and turned into the plugin's own vocabulary:
 *
 *  - `SessionSnapshot.running` / `awaitingFirstTurn` — a turn is open
 *  - `ChatSnapshot.timeline.runningCalls` — tool calls in flight, with names
 *  - `ChatSnapshot.timeline.partial` — an assistant message is streaming
 *  - the session's pending interaction — the model is waiting on the user
 *
 * Keeping every one of those reads here is the point. A DSH version that
 * renames a field breaks this file and nothing else, and the tool-name table
 * below is the single place that needs revisiting when DSH's roster changes.
 *
 * A status-text fallback is kept for hosts that predate those fields. It is
 * here, and only here. It is not used on the current host.
 */
import type { WhaleActivity, WhaleSemanticState, WhaleTask } from '../whale/types.js'

/** The subset of `SessionSnapshot` this plugin reads. */
export interface RunningFacts {
  readonly running?: boolean
  readonly awaitingFirstTurn?: boolean
}

/** The subset of `SessionListState` this plugin reads. */
export interface SessionListFacts {
  readonly current?: string | undefined
  readonly byId: Readonly<Record<string, RunningFacts | undefined>>
}

/**
 * Everything the inline surface needs to name what is happening.
 *
 * Deliberately flat primitives rather than the DSH snapshots they come from.
 * The snapshot hooks compare a selector's result by identity, and the chat
 * timeline is republished as the same object — selecting it wholesale returned
 * a stable reference, so the component never re-rendered and the whale stayed
 * on "thinking" for a turn that was plainly running tools. Selecting primitives
 * makes the comparison a value comparison, which is what it needed to be.
 */
export interface ActivityFacts {
  /** A turn is open on this session. */
  readonly running?: boolean
  /** Name of the tool call the turn is currently waiting on, if any. */
  readonly toolName?: string | undefined
  /** An assistant message is streaming. */
  readonly streaming?: boolean
  /** An approval or question is addressed to this session. */
  readonly pending?: boolean
  /**
   * A compaction provider request is in flight.
   *
   * The one fact that comes from neither the session nor the chat slice. It
   * lives on the Trajectory target as a `RequestView` with
   * `purpose: 'compaction'` and `status: 'running'`.
   */
  readonly compacting?: boolean
  /**
   * A turn has *just* failed.
   *
   * Not "the session carries an error": see {@link stepErrorPulse} for why the
   * difference is the whole of it.
   */
  readonly failed?: boolean
}

/**
 * How long the whale wears the error mark after a turn fails, milliseconds.
 *
 * It is a pulse rather than a state because DSH's error fields are *latched*,
 * not live — see {@link stepErrorPulse}.
 */
export const ERROR_HOLD_MS = 6000

/** What {@link stepErrorPulse} remembers between frames. */
export interface ErrorPulse {
  /**
   * Whether anything has been observed yet.
   *
   * Needed because "no error" and "not looked yet" are both `seen: null`, and
   * the whole point of the baseline is that the *first* look never marks the
   * whale however alarming what it finds is.
   */
  readonly primed: boolean
  /** The error value this session was last known to be carrying. */
  readonly seen: string | null
  /** When the current pulse began, or null when the whale is not marked. */
  readonly started: number | null
  /** Whether a turn was open on the previous observation. */
  readonly wasRunning: boolean
}

/** A pulse that has never seen anything. */
export const NO_ERROR_PULSE: ErrorPulse = Object.freeze({
  primed: false,
  seen: null,
  started: null,
  wasRunning: false,
})

/**
 * Turn DSH's latched error field into an event.
 *
 * **This is the correction to a real defect**, and the shape of the fix is the
 * interesting part. `SessionSnapshot.lastAgentError` is not "this session is in
 * an error state" — it is the last error that ever happened, kept indefinitely.
 * Measured on a freshly opened DSH: a brand-new, never-used session carried
 * `resume failed for session "session-02edfacd…"` from an entirely different
 * session, before the user had typed anything. Reading the field as a boolean
 * put a red mark on the Dock at rest, permanently, for a housekeeping failure
 * nobody had seen. That is worse than having no error state at all: a warning
 * that is always on is a warning that is never read.
 *
 * So the plugin reports a *change* instead of a value. Whatever the field holds
 * at the first observation is the baseline and is never shown; only a value
 * that becomes different from it while this mount is watching starts a pulse,
 * and the pulse lasts {@link ERROR_HOLD_MS} or until the next turn begins,
 * whichever comes first. An error is an event — it happens once and then it is
 * history — and the field's own semantics were the thing being mis-read.
 * @param pulse - the previous pulse state.
 * @param facts - the latched error value, whether a turn is open, and the clock.
 * @returns the next pulse state, and whether the whale should wear the mark.
 */
export function stepErrorPulse(
  pulse: ErrorPulse,
  facts: { readonly error: string | null; readonly running: boolean; readonly now: number },
): { readonly pulse: ErrorPulse; readonly failed: boolean } {
  const { error, running, now } = facts
  // A turn beginning supersedes whatever went wrong last time. Held past that,
  // the mark would describe the previous turn while the next one is running.
  const startedTurn = running && !pulse.wasRunning
  let started = startedTurn ? null : pulse.started
  if (pulse.primed && error !== pulse.seen && error !== null) started = now
  const next: ErrorPulse = { primed: true, seen: error, started, wasRunning: running }
  return { pulse: next, failed: started !== null && now - started < ERROR_HOLD_MS }
}

/**
 * Tool-name prefixes to task families, longest match first.
 *
 * Matched on a lowercased prefix rather than an exact name because DSH ships
 * tools as `fs_read`, `str_replace_editor`, `pwsh`, `web_search`, and plugins
 * add their own. A prefix table degrades to the generic word instead of
 * claiming the wrong one.
 */
const TASK_PREFIXES: ReadonlyArray<readonly [string, WhaleTask]> = [
  ['str_replace', 'editing'],
  ['fs_search', 'reading'],
  ['fs_write', 'editing'],
  ['fs_read', 'reading'],
  ['web_search', 'searching'],
  ['web_fetch', 'searching'],
  ['subagent', 'delegating'],
  ['workflow', 'delegating'],
  ['search', 'reading'],
  ['write', 'editing'],
  ['edit', 'editing'],
  ['read', 'reading'],
  ['grep', 'reading'],
  ['glob', 'reading'],
  ['view', 'reading'],
  ['bash', 'running'],
  ['pwsh', 'running'],
  ['shell', 'running'],
  ['exec', 'running'],
  ['task', 'delegating'],
  ['web', 'searching'],
  ['fetch', 'searching'],
]

/**
 * Classify one tool name into a task family.
 * @param name - the tool name DSH reported.
 * @returns the family, or undefined when nothing matches (a generic word wins).
 */
export function taskOfTool(name: string | undefined): WhaleTask | undefined {
  if (name === undefined) return undefined
  const key = name.toLowerCase()
  for (const [prefix, task] of TASK_PREFIXES) {
    if (key.startsWith(prefix) || key.includes(prefix)) return task
  }
  return undefined
}

/**
 * Name what the session is doing right now.
 *
 * The order below is a priority list, and it is the whole of the decision:
 *
 * 1. `failed` first, because an error is the only fact that outranks the user.
 *    It is also the only one that can be true while the turn is over, which is
 *    what lets the red mark survive past the end of the turn that earned it.
 * 2. `waiting` next: it is about the user, so it outranks anything the model is
 *    doing, and it can be true while the turn is technically still running.
 * 3. `idle` when nothing is running — checked before compaction so that a
 *    compaction request left behind by a finished turn cannot pin the whale.
 * 4. `compacting` above the tool and streaming branches, because DSH keeps a
 *    tool call open across a compaction: without this the whale would go on
 *    waving a wrench while the context is being rewritten under it.
 *
 * @param facts - the DSH values this plugin reads.
 * @returns the activity both surfaces animate and the inline label names.
 */
export function activityOf(facts: ActivityFacts): WhaleActivity {
  if (facts.failed === true) return { state: 'error' }
  if (facts.pending === true && facts.running === true) return { state: 'waiting' }
  if (facts.running !== true) return { state: 'idle' }
  if (facts.compacting === true) return { state: 'compacting' }
  if (facts.toolName !== undefined) {
    const task = taskOfTool(facts.toolName)
    return task === undefined ? { state: 'working' } : { state: 'working', task }
  }
  if (facts.streaming === true) return { state: 'responding' }
  return { state: 'thinking' }
}

/**
 * A short, stable label for one activity, for diagnostics and tests.
 * @param activity - what the session is doing.
 * @returns e.g. `working:reading`, or just the state when there is no task.
 */
export function activityTag(activity: WhaleActivity): string {
  return activity.task === undefined ? activity.state : `${activity.state}:${activity.task}`
}

/**
 * Semantic state for a root-scoped surface, from the session list. The Dock
 * has no per-session chat binding, so it sees the coarse states only.
 * @param list - the session list snapshot.
 * @returns `'thinking'` while the selected session is running.
 */
export function stateOfSessionList(list: SessionListFacts | undefined | null): WhaleSemanticState {
  if (list === undefined || list === null) return 'idle'
  const current = list.current
  if (current === undefined) return 'idle'
  const session = list.byId[current]
  return session?.running === true || session?.awaitingFirstTurn === true ? 'thinking' : 'idle'
}

/**
 * Semantic state for a session-scoped surface with no chat binding.
 * @param session - the session snapshot.
 * @returns `'thinking'` while a turn is running or starting.
 */
export function stateOfSession(session: RunningFacts | undefined | null): WhaleSemanticState {
  if (session === undefined || session === null) return 'idle'
  return session.running === true || session.awaitingFirstTurn === true ? 'thinking' : 'idle'
}

/**
 * Compatibility fallback for a host that exposes no running flag: DSH labels
 * its live turn `chat.deepDiving`, which is "Deep diving..." in English and
 * "深度求索中..." in Chinese.
 *
 * Kept deliberately narrow and unused by the current integration — it exists so
 * that reviving it is a one-line change in one file.
 * @param statusText - the visible status text, if any.
 * @returns `'thinking'` when the text names a live turn.
 */
export function stateOfStatusText(statusText: string | null | undefined): WhaleSemanticState {
  if (statusText === undefined || statusText === null) return 'idle'
  return /diving|深度求索/i.test(statusText) ? 'thinking' : 'idle'
}
