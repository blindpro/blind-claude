export type Level = 'all' | 'most' | 'some' | 'none'

// The moments a sound can mark. "start": Claude starts working.
// "attention": Claude needs permission or has a question.
export const SOUND_EVENTS = ['done', 'start', 'attention', 'error'] as const
export type SoundEvent = (typeof SOUND_EVENTS)[number]

// "random" plays a random sound for the event; otherwise the file name to play.
export type SoundChoice = { isOn: boolean; pick: string }
export type CleanMode = 'on' | 'off' | 'words'

// Who speaks. "auto": NVDA while it runs, else the Windows voices.
export type SpeechEngine = 'auto' | 'nvda' | 'windows'

// The change report: which editor opens it, as text or a web page, how
// many unchanged lines are shown around a change, whether it opens by
// itself after a turn or before an edit is approved, and whether edits in
// the transcript list their lines or only a summary.
export type ChangesView = 'text' | 'browser'
export type ChangeSettings = {
  editor: string
  view: ChangesView
  context: number
  isAuto: boolean
  isPreview: boolean
  isSummaryOnly: boolean
}

export type Settings = {
  level: Level
  engine: SpeechEngine
  voice: string | null
  rate: number
  volume: number
  clean: CleanMode
  sounds: boolean
  soundEvents: Record<SoundEvent, SoundChoice>
  changes: ChangeSettings
  // Permission prompts and Claude's questions in Blind Claude's own dialog.
  prompts: boolean
}

export const LEVELS: readonly Level[] = ['all', 'most', 'some', 'none']
export const CLEAN_MODES: readonly CleanMode[] = ['on', 'off', 'words']
export const ENGINES: readonly SpeechEngine[] = ['auto', 'nvda', 'windows']

export const DEFAULTS: Settings = {
  level: 'some',
  engine: 'auto',
  voice: null,
  rate: 0,
  volume: 100,
  clean: 'on',
  sounds: true,
  soundEvents: {
    done: { isOn: true, pick: 'random' },
    start: { isOn: true, pick: 'random' },
    attention: { isOn: true, pick: 'random' },
    error: { isOn: true, pick: 'random' },
  },
  changes: { editor: 'auto', view: 'text', context: 2, isAuto: false, isPreview: false, isSummaryOnly: false },
  prompts: true,
}

export const SETTINGS_KEY = 'settings'

// Accepts only known keys with valid values from whatever the store held.
export function sanitize(value: unknown): Partial<Settings> {
  if (typeof value !== 'object' || value === null) return {}
  const v = value as Record<string, unknown>
  const out: Partial<Settings> = {}
  if (LEVELS.includes(v.level as Level)) out.level = v.level as Level
  if (ENGINES.includes(v.engine as SpeechEngine)) out.engine = v.engine as SpeechEngine
  if (typeof v.voice === 'string' || v.voice === null) out.voice = v.voice as string | null
  if (typeof v.rate === 'number') out.rate = clamp(v.rate, -10, 10)
  if (typeof v.volume === 'number') out.volume = clamp(v.volume, 0, 100)
  if (CLEAN_MODES.includes(v.clean as CleanMode)) out.clean = v.clean as CleanMode
  if (typeof v.sounds === 'boolean') out.sounds = v.sounds
  if (typeof v.soundEvents === 'object' && v.soundEvents !== null) {
    const saved = v.soundEvents as Record<string, unknown>
    const events = { ...DEFAULTS.soundEvents }
    for (const event of SOUND_EVENTS) {
      const one = saved[event]
      if (typeof one !== 'object' || one === null) continue
      const { isOn, pick } = one as Record<string, unknown>
      events[event] = {
        isOn: typeof isOn === 'boolean' ? isOn : events[event].isOn,
        pick: typeof pick === 'string' && pick !== '' ? pick : events[event].pick,
      }
    }
    out.soundEvents = events
  }
  if (typeof v.changes === 'object' && v.changes !== null) {
    const c = v.changes as Record<string, unknown>
    const d = DEFAULTS.changes
    out.changes = {
      editor: typeof c.editor === 'string' && c.editor !== '' ? c.editor : d.editor,
      view: c.view === 'browser' || c.view === 'text' ? c.view : d.view,
      context: typeof c.context === 'number' ? clamp(c.context, 0, 5) : d.context,
      isAuto: typeof c.isAuto === 'boolean' ? c.isAuto : d.isAuto,
      isPreview: typeof c.isPreview === 'boolean' ? c.isPreview : d.isPreview,
      isSummaryOnly: typeof c.isSummaryOnly === 'boolean' ? c.isSummaryOnly : d.isSummaryOnly,
    }
  }
  if (typeof v.prompts === 'boolean') out.prompts = v.prompts

  return out
}

export function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(n)))
}

export function describeSettings(s: Settings): string {
  return [
    `Speech level: ${s.level}.`,
    `Speech engine setting: ${s.engine}.`,
    `Voice: ${s.voice ?? 'system default'}.`,
    `Rate: ${s.rate}.`,
    `Volume: ${s.volume}.`,
    `Symbol cleaning: ${s.clean}.`,
    `Sounds: ${s.sounds ? 'on' : 'off'}.`,
    `Change reports: ${editorName(s.changes.editor)}, ${s.changes.view === 'browser' ? 'as a web page' : 'as text'}, ${s.changes.isAuto ? 'opened after each turn' : 'opened with /changes'}.`,
    `Permission prompts and questions: ${s.prompts ? "Blind Claude's dialog" : "Claude Code's own"}.`,
  ].join('\n')
}

export function editorName(editor: string): string {
  if (editor === 'auto') return 'Notepad++ if installed, else Notepad'
  if (editor === 'notepad++') return 'Notepad++'
  if (editor === 'notepad') return 'Notepad'

  return editor
}
