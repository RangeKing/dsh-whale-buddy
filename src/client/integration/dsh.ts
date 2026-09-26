/**
 * The DSH-shaped edge of the plugin.
 *
 * Everything React and everything slot-specific lives here; the surfaces below
 * it are plain DOM. Each adapter is the same three lines of lifecycle — mount
 * on first render, push new props into the handle, destroy on unmount — so a
 * host rerender never rebuilds a whale and never leaks one.
 *
 * The host/client split and the `apply` → disposer contract are adapted from
 * dsh-thought-buddy (BSD-3-Clause); the slot registrations themselves target
 * DSH's own `ctx.slots` API. See THIRD_PARTY_NOTICES.md.
 */
import { createElement, useEffect, useRef, useSyncExternalStore, type ReactElement } from 'react'

import type { Translate } from '../locales.js'
import type { WhaleSnapshot, WhaleStateStore } from '../state/whale-state.js'
import { classicSeat } from '../surfaces/classic-status.js'
import { mountStatusWhale, type InlineStatusWhale } from '../surfaces/inline-status.js'
import { mountWhaleDock, type WhaleDock } from '../surfaces/whale-dock.js'
import type { MotionMode, WhaleActivity } from '../whale/types.js'
import type { StatusRowKind } from './status-anchor.js'

/**
 * Subscribe a slot entry to the shared store.
 *
 * The entries gate themselves on settings (`inlineEnabled`, `dockEnabled`), so
 * they have to re-render when a setting changes — a control that only takes
 * effect after the next unrelated render is a control that does not work. The
 * surfaces themselves still take live changes imperatively; this is only for
 * the decisions React owns.
 *
 * @param store - the shared store.
 * @returns the current snapshot, re-rendering the caller on every change.
 */
export function useWhaleSnapshot(store: WhaleStateStore): WhaleSnapshot {
  return useSyncExternalStore(
    (onChange) => store.subscribe(onChange),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  )
}

/** Props the inline adapter needs, independent of which slot supplies them. */
export interface InlineHostProps {
  readonly store: WhaleStateStore
  readonly activity: WhaleActivity
  /** The word that replaces DSH's own status label. */
  readonly word: string | undefined
  /** Recognises DSH's running-turn label among the page's status regions. */
  readonly match: (text: string) => boolean
  /** Which of DSH's row shapes to take; see `StatusAnchorOptions.claim`. */
  readonly claim?: (kind: StatusRowKind) => boolean
  /** Told the shape of every DSH row found. */
  readonly onFound?: (kind: StatusRowKind) => void
}

/** Props the classic-row adapter needs. */
export interface ClassicHostProps {
  readonly store: WhaleStateStore
  readonly activity: WhaleActivity
  readonly word: string | undefined
  /** The row's resting word — the plugin's "thinking". */
  readonly fallbackWord: string
  /** When the turn began, epoch ms, or null to count from mount. */
  readonly turnStart: number | null
  /** Whether the turn is still open; the clock stops when it is not. */
  readonly running: boolean
  readonly formatClock: (elapsedMs: number) => string
}

/** Props the dock adapter needs. */
export interface DockHostProps {
  readonly store: WhaleStateStore
  readonly t: Translate
}

/**
 * React shell around the inline whale.
 *
 * It renders nothing of its own: the whale lives inside DSH's status row, which
 * no slot reaches, so this component exists purely to own the attachment's
 * lifetime. Mount and unmount follow the slot entry, which follows the session,
 * which is what guarantees the row is restored when the turn ends.
 * @param props - the shared store, the activity, and the label to show.
 * @returns nothing; the surface is attached imperatively.
 */
export function InlineWhaleHost({ store, activity, word, match, claim, onFound }: InlineHostProps): null {
  const handle = useRef<InlineStatusWhale | null>(null)
  const live = useRef({ activity, word, onFound })
  live.current = { activity, word, onFound }

  useEffect(() => {
    const snapshot = store.getSnapshot()
    const whale = mountStatusWhale({
      document,
      match,
      ...(claim === undefined ? {} : { claim }),
      onFound: (kind) => live.current.onFound?.(kind),
      size: snapshot.config.size,
      motion: snapshot.config.motion,
      holdActivity: false,
      activity: live.current.activity,
      word: live.current.word,
    })
    handle.current = whale
    const stop = store.subscribe((next) => {
      whale.setMotion(next.config.motion)
      whale.setSize(next.config.size)
    })
    return () => {
      stop()
      handle.current = null
      whale.destroy()
    }
    // Config changes arrive through the subscription; activity through the
    // effect below. Re-running this one would restart the swim every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, match, claim])

  useEffect(() => {
    handle.current?.setActivity(activity, word)
  }, [activity, word])

  return null
}

/**
 * React shell around the classic row.
 *
 * Unlike the inline host this one owns real layout: the row is plugin DOM
 * inside a slot entry, so the element it renders is where the row goes.
 * @param props - the store, the activity and the row's copy.
 * @returns the element the row is built into.
 */
export function ClassicWhaleHost({
  store,
  activity,
  word,
  fallbackWord,
  turnStart,
  running,
  formatClock,
}: ClassicHostProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null)
  const handle = useRef<InlineStatusWhale | null>(null)
  const live = useRef({ activity, word, turnStart, running, formatClock })
  live.current = { activity, word, turnStart, running, formatClock }

  useEffect(() => {
    const container = ref.current
    if (container === null) return undefined
    const snapshot = store.getSnapshot()
    const whale = mountStatusWhale({
      document,
      seat: classicSeat({
        document,
        container,
        fallbackWord,
        // Getters, not values: the row is built once per turn, and DSH can
        // publish the turn's start after the row already exists.
        startTime: () => live.current.turnStart,
        live: () => live.current.running,
        formatClock: (ms) => live.current.formatClock(ms),
        motion: snapshot.config.motion,
      }),
      size: snapshot.config.size,
      motion: snapshot.config.motion,
      holdActivity: false,
      activity: live.current.activity,
      word: live.current.word,
    })
    handle.current = whale
    const stop = store.subscribe((next) => {
      whale.setMotion(next.config.motion)
      whale.setSize(next.config.size)
    })
    return () => {
      stop()
      handle.current = null
      whale.destroy()
    }
    // The row lives for one turn — the entry keys it by turn — so a copy
    // change mid-turn is not worth a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  useEffect(() => {
    handle.current?.setActivity(activity, word)
  }, [activity, word])

  return createElement('div', { ref, 'data-whale-buddy-classic-host': '' })
}

/**
 * React shell around the Whale Dock.
 * @param props - the shared store and the bound translate function.
 * @returns the mount point element.
 */
export function WhaleDockHost({ store, t }: DockHostProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null)
  const handle = useRef<WhaleDock | null>(null)

  useEffect(() => {
    const host = ref.current
    if (host === null) return
    const snapshot = store.getSnapshot()
    const dock = mountWhaleDock({
      host,
      state: snapshot.state,
      motion: snapshot.config.motion,
      inlineEnabled: snapshot.config.inlineEnabled,
      classicStatus: snapshot.config.classicStatus,
      dockTop: snapshot.config.dockTop,
      t,
      onInlineEnabled: (enabled) => store.setConfig('inlineEnabled', enabled),
      onClassicStatus: (enabled) => store.setConfig('classicStatus', enabled),
      onMotion: (motion: MotionMode) => store.setConfig('motion', motion),
      onDockTop: (top) => store.setConfig('dockTop', top),
    })
    if (dock === null) return
    dock.setActivity(snapshot.activity, snapshot.session.running ? `${snapshot.session.sessionId}:${snapshot.session.turn}` : undefined)
    handle.current = dock
    const stop = store.subscribe((next) => {
      dock.setActivity(next.activity, next.session.running ? `${next.session.sessionId}:${next.session.turn}` : undefined)
      dock.setMotion(next.config.motion)
      dock.setInlineEnabled(next.config.inlineEnabled)
      dock.setClassicStatus(next.config.classicStatus)
      dock.setDockTop(next.config.dockTop)
    })
    return () => {
      stop()
      handle.current = null
      dock.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  useEffect(() => {
    handle.current?.retranslate(t)
  }, [t])

  return createElement('div', { ref, 'data-whale-buddy-dock-host': '' })
}
