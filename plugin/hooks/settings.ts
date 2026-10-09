export type Level = 'all' | 'most' | 'some' | 'none'
export type CleanMode = 'on' | 'off' | 'words'

export type Settings = {
  level: Level
  voice: string | null
  rate: number
  volume: number
  clean: CleanMode
  sounds: boolean
}

export const LEVELS: readonly Level[] = ['all', 'most', 'some', 'none']
export const CLEAN_MODES: readonly CleanMode[] = ['on', 'off', 'words']

export const DEFAULTS: Settings = {
  level: 'some',
  voice: null,
  rate: 0,
  volume: 100,
  clean: 'on',
  sounds: true,
}

export const SETTINGS_KEY = 'settings'

// Accepts only known keys with valid values from whatever the store held.
export function sanitize(value: unknown): Partial<Settings> {
  if (typeof value !== 'object' || value === null) return {}
  const v = value as Record<string, unknown>
  const out: Partial<Settings> = {}
  if (LEVELS.includes(v.level as Level)) out.level = v.level as Level
  if (typeof v.voice === 'string' || v.voice === null) out.voice = v.voice as string | null
  if (typeof v.rate === 'number') out.rate = clamp(v.rate, -10, 10)
  if (typeof v.volume === 'number') out.volume = clamp(v.volume, 0, 100)
  if (CLEAN_MODES.includes(v.clean as CleanMode)) out.clean = v.clean as CleanMode
  if (typeof v.sounds === 'boolean') out.sounds = v.sounds

  return out
}

export function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(n)))
}

export function describeSettings(s: Settings): string {
  return [
    `Speech level: ${s.level}.`,
    `Voice: ${s.voice ?? 'system default'}.`,
    `Rate: ${s.rate}.`,
    `Volume: ${s.volume}.`,
    `Symbol cleaning: ${s.clean}.`,
    `Sounds: ${s.sounds ? 'on' : 'off'}.`,
  ].join('\n')
}
