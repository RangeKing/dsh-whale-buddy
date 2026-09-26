/**
 * Plugin copy, English and Chinese.
 *
 * The surfaces take a plain `(key) => string`, so they work in the demo with
 * `fallbackTranslate` and in DSH with the host's locale binding. Both
 * dictionaries carry the same key set — DSH's locale registry requires that,
 * and it is the right rule anyway.
 */

/** Every string this plugin shows. */
export interface WhaleBuddyDict {
  'dock.open': string
  'dock.close': string
  'dock.title': string
  'dock.move': string
  'state.label': string
  'state.idle': string
  'state.thinking': string
  'state.responding': string
  'state.working': string
  'state.waiting': string
  'state.compacting': string
  'state.error': string
  'state.idle.hint': string
  'state.thinking.hint': string
  'state.responding.hint': string
  'state.working.hint': string
  'state.waiting.hint': string
  'state.compacting.hint': string
  'state.error.hint': string
  /** The words that replace DSH's single "Deep diving…" label, per activity. */
  'status.thinking': string
  'status.responding': string
  'status.working': string
  'status.waiting': string
  'status.reading': string
  'status.editing': string
  'status.running': string
  'status.searching': string
  'status.delegating': string
  'status.compacting': string
  'status.error': string
  /** Elapsed-time templates for the classic row, as DSH 0.1.5 wrote them. */
  'clock.seconds': string
  'clock.minutes': string
  'control.inline': string
  'control.classic': string
  'control.motion': string
  'motion.full': string
  'motion.subtle': string
  'motion.static': string
}

/** A translate function over this plugin's keys. */
export type Translate = (key: keyof WhaleBuddyDict) => string

export const en: WhaleBuddyDict = {
  'dock.open': 'Open the whale companion',
  'dock.close': 'Close the whale companion',
  'dock.title': 'Whale Buddy',
  'dock.move': 'Drag to move, or use the arrow keys',
  'state.label': 'State',
  'state.idle': 'Idle',
  'state.thinking': 'Thinking',
  'state.responding': 'Answering',
  'state.working': 'Working',
  'state.waiting': 'Waiting',
  'state.compacting': 'Compacting',
  'state.error': 'Error',
  'state.idle.hint': 'Waiting for a prompt',
  'state.thinking.hint': 'A model turn is running',
  'state.responding.hint': 'Writing the answer',
  'state.working.hint': 'A tool is running',
  'state.waiting.hint': 'Needs your answer',
  'state.compacting.hint': 'Shrinking the context',
  'state.error.hint': 'The last turn failed',
  'status.thinking': 'Deep diving...',
  'status.responding': 'Writing...',
  'status.working': 'Working...',
  'status.waiting': 'Waiting on you...',
  'status.reading': 'Reading...',
  'status.editing': 'Editing...',
  'status.running': 'Running...',
  'status.searching': 'Searching...',
  'status.delegating': 'Delegating...',
  'status.compacting': 'Compacting context...',
  'status.error': 'Something went wrong',
  'clock.seconds': '{seconds}s',
  'clock.minutes': '{minutes}m {seconds}s',
  'control.inline': 'Inline whale',
  'control.classic': 'Classic status row',
  'control.motion': 'Motion',
  'motion.full': 'Full',
  'motion.subtle': 'Subtle',
  'motion.static': 'Still',
}

export const zh: WhaleBuddyDict = {
  'dock.open': '打开鲸鱼伙伴',
  'dock.close': '关闭鲸鱼伙伴',
  'dock.title': '鲸鱼伙伴',
  'dock.move': '拖动可移动位置，也可用方向键',
  'state.label': '状态',
  'state.idle': '空闲',
  'state.thinking': '思考中',
  'state.responding': '作答中',
  'state.working': '执行中',
  'state.waiting': '等待中',
  'state.compacting': '压缩中',
  'state.error': '出错了',
  'state.idle.hint': '等待输入',
  'state.thinking.hint': '模型正在运行',
  'state.responding.hint': '正在写回答',
  'state.working.hint': '正在调用工具',
  'state.waiting.hint': '需要你的确认',
  'state.compacting.hint': '正在压缩上下文',
  'state.error.hint': '上一轮失败了',
  'status.thinking': '深度求索中...',
  'status.responding': '正在作答...',
  'status.working': '调用工具中...',
  'status.waiting': '等待你的确认...',
  'status.reading': '读取文件中...',
  'status.editing': '编辑文件中...',
  'status.running': '执行命令中...',
  'status.searching': '联网检索中...',
  'status.delegating': '调度子代理中...',
  'status.compacting': '压缩上下文中...',
  'status.error': '出错了',
  'clock.seconds': '{seconds}秒',
  'clock.minutes': '{minutes}分{seconds}秒',
  'control.inline': '对话鲸鱼',
  'control.classic': '经典状态栏',
  'control.motion': '动效',
  'motion.full': '完整',
  'motion.subtle': '轻微',
  'motion.static': '静止',
}

/**
 * The word that replaces DSH's single status label for one activity.
 * @param activity - what the session is doing.
 * @param t - the active translate function.
 * @returns the label, or undefined when the activity has no status word.
 */
export function statusWordFor(
  activity: { readonly state: string; readonly task?: string },
  t: Translate,
): string | undefined {
  if (activity.task !== undefined) {
    return t(`status.${activity.task}` as keyof WhaleBuddyDict)
  }
  switch (activity.state) {
    case 'thinking':
    case 'responding':
    case 'working':
    case 'waiting':
    case 'compacting':
    case 'error':
      return t(`status.${activity.state}` as keyof WhaleBuddyDict)
    default:
      return undefined
  }
}

/**
 * A translate function backed by the built-in dictionaries, for the demo and
 * for a host with no locale service.
 * @param locale - `'zh'` selects Chinese; anything else selects English.
 * @returns a translate function.
 */
export function fallbackTranslate(locale = 'en'): Translate {
  const dict = locale.toLowerCase().startsWith('zh') ? zh : en
  return (key) => dict[key]
}
