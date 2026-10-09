// The numbered settings menu: what each screen shows, and what a typed
// number does there. register.tsx keeps which screen is open, applies the
// changes and plays or speaks what an answer asks for.

import { CLEAN_MODES, LEVELS, SOUND_EVENTS, clamp } from './settings'
import type { CleanMode, Settings, SoundEvent } from './settings'
import { EVENT_WORDS } from './sounds'
import type { SoundFile } from './sounds'
import type { Voice } from './speech'

export type Screen =
  | { kind: 'main' }
  | { kind: 'level' }
  | { kind: 'voice' }
  | { kind: 'rate' }
  | { kind: 'volume' }
  | { kind: 'clean' }
  | { kind: 'sounds' }
  | { kind: 'all-sounds' }
  | { kind: 'event'; event: SoundEvent }
  | { kind: 'reset' }

// What some screens need beyond the settings: the installed voices (null
// where the speech server cannot list them) and an event's sound files.
export type MenuContext = {
  settings: Settings
  engine: string
  voices: readonly Voice[] | null
  files: readonly SoundFile[]
}

export type MenuAnswer =
  | { kind: 'open'; screen: Screen; message?: string }
  | { kind: 'set'; change: Partial<Settings>; message: string; screen: Screen; play?: SoundFile }
  | { kind: 'reset'; screen: Screen }
  | { kind: 'close' }

const LEVEL_WORDS: Record<Settings['level'], string> = {
  all: 'replies, every tool and its result',
  most: 'replies and actions such as edits and commands',
  some: 'the final answer only',
  none: 'nothing',
}

const CLEAN_WORDS: Record<CleanMode, string> = {
  on: 'remove symbols and emoji from what is shown',
  off: 'show output unchanged',
  words: 'remove symbols, and replace emoji with their names',
}

const RATE_STEP = 1
const VOLUME_STEP = 10

// A menu choice: a whole number on its own, nothing else.
export function parseChoice(text: string): number | null {
  const trimmed = text.trim()

  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null
}

function onOff(isOn: boolean): string {
  return isOn ? 'on' : 'off'
}

function current(label: string, isCurrent: boolean): string {
  return isCurrent ? `${label}, current` : label
}

function eventSummary(settings: Settings, event: SoundEvent): string {
  const choice = settings.soundEvents[event]
  const pick = choice.pick === 'random' ? 'random sound' : choice.pick

  return `${onOff(choice.isOn)}, ${pick}`
}

// The voices offered: the installed ones, numbered as /voices numbers them,
// then the system default last.
function voiceItems(ctx: MenuContext): string[] {
  const voices = ctx.voices ?? []
  const chosen = ctx.settings.voice
  const items = voices.map(v => current(v.culture ? `${v.name}, ${v.culture}` : v.name, v.name === chosen))

  return [...items, current('System default', chosen === null)]
}

function screenParts(screen: Screen, ctx: MenuContext): { title: string; items: string[] } {
  const s = ctx.settings
  switch (screen.kind) {
    case 'main':
      return {
        title: `Blind Claude settings. Speech engine: ${ctx.engine}.`,
        items: [
          `Speech level, ${s.level}`,
          `Voice, ${s.voice ?? 'system default'}`,
          `Rate, ${s.rate}`,
          `Volume, ${s.volume}`,
          `Symbol cleaning, ${s.clean}`,
          `Sounds, ${onOff(s.sounds)}`,
          'Reset all settings to defaults',
        ],
      }
    case 'level':
      return {
        title: `Speech level, now ${s.level}. How much is spoken:`,
        items: LEVELS.map(level => current(`${level}: ${LEVEL_WORDS[level]}`, level === s.level)),
      }
    case 'voice':
      return { title: `Voice, now ${s.voice ?? 'system default'}.`, items: voiceItems(ctx) }
    case 'rate':
      return {
        title: `Rate, now ${s.rate}, from -10 to 10.`,
        items: ['Faster', 'Slower', current('Normal, 0', s.rate === 0)],
      }
    case 'volume':
      return {
        title: `Volume, now ${s.volume}, from 0 to 100.`,
        items: ['Louder', 'Quieter', current('Full, 100', s.volume === 100)],
      }
    case 'clean':
      return {
        title: `Symbol cleaning, now ${s.clean}.`,
        items: CLEAN_MODES.map(mode => current(`${mode}: ${CLEAN_WORDS[mode]}`, mode === s.clean)),
      }
    case 'sounds':
      return {
        title: 'Sounds.',
        items: [
          `All sounds, ${onOff(s.sounds)}`,
          ...SOUND_EVENTS.map(event => `${event} sound, ${EVENT_WORDS[event]}: ${eventSummary(s, event)}`),
        ],
      }
    case 'all-sounds':
      return { title: `All sounds, now ${onOff(s.sounds)}.`, items: [current('On', s.sounds), current('Off', !s.sounds)] }
    case 'event': {
      const choice = s.soundEvents[screen.event]
      const files = ctx.files.map(f => {
        const mine = f.isCustom ? ', added by you' : ''
        return current(`${f.name}${mine}`, choice.pick.toLowerCase() === f.name.toLowerCase())
      })
      return {
        title: `${screen.event} sound, ${EVENT_WORDS[screen.event]}. Now ${eventSummary(s, screen.event)}. Choosing a sound plays it.`,
        items: [current('On', choice.isOn), current('Off', !choice.isOn), current('Random sound each time', choice.pick === 'random'), ...files],
      }
    }
    case 'reset':
      return { title: 'Reset every Blind Claude setting to its default?', items: ['Yes, reset', 'No'] }
  }
}

export function screenText(screen: Screen, ctx: MenuContext): string {
  const { title, items } = screenParts(screen, ctx)
  const isMain = screen.kind === 'main'
  const zero = isMain ? '0. Close the menu.' : '0. Back.'
  const footer = isMain
    ? 'Type a number and press Enter. Anything else you type goes to Claude as usual.'
    : 'Type a number and press Enter.'

  return [title, ...items.map((item, i) => `${i + 1}. ${item}.`), zero, footer].join('\n')
}

// Where 0 leads from each screen.
function parent(screen: Screen): Screen | null {
  if (screen.kind === 'main') return null
  if (screen.kind === 'all-sounds' || screen.kind === 'event') return { kind: 'sounds' }

  return { kind: 'main' }
}

const MAIN_SCREENS: readonly Screen[] = [
  { kind: 'level' },
  { kind: 'voice' },
  { kind: 'rate' },
  { kind: 'volume' },
  { kind: 'clean' },
  { kind: 'sounds' },
  { kind: 'reset' },
]

// What typing `choice` on `screen` does. An option that is not there leaves
// the screen open and says so.
export function choose(screen: Screen, choice: number, ctx: MenuContext): MenuAnswer {
  const s = ctx.settings
  const main: Screen = { kind: 'main' }
  const sounds: Screen = { kind: 'sounds' }
  if (choice === 0) {
    const back = parent(screen)
    return back === null ? { kind: 'close' } : { kind: 'open', screen: back }
  }
  const count = screenParts(screen, ctx).items.length
  if (choice > count) return { kind: 'open', screen, message: `There is no option ${choice}.` }
  const index = choice - 1

  switch (screen.kind) {
    case 'main': {
      const next = MAIN_SCREENS[index]!
      if (next.kind === 'voice' && ctx.voices === null) {
        return {
          kind: 'open',
          screen,
          message: 'The voice list is only available on Windows while the speech server is running. Try again in a moment.',
        }
      }
      return { kind: 'open', screen: next }
    }
    case 'level': {
      const level = LEVELS[index]!
      return { kind: 'set', change: { level }, message: `Speech level set to ${level}.`, screen: main }
    }
    case 'voice': {
      const voice = (ctx.voices ?? [])[index]
      if (voice === undefined) return { kind: 'set', change: { voice: null }, message: 'Using the system default voice.', screen: main }
      return { kind: 'set', change: { voice: voice.name }, message: `Voice changed to ${voice.name}.`, screen: main }
    }
    case 'rate': {
      const rate = index === 0 ? clamp(s.rate + RATE_STEP, -10, 10) : index === 1 ? clamp(s.rate - RATE_STEP, -10, 10) : 0
      return { kind: 'set', change: { rate }, message: `Rate ${rate}.`, screen }
    }
    case 'volume': {
      const volume = index === 0 ? clamp(s.volume + VOLUME_STEP, 0, 100) : index === 1 ? clamp(s.volume - VOLUME_STEP, 0, 100) : 100
      return { kind: 'set', change: { volume }, message: `Volume ${volume}.`, screen }
    }
    case 'clean': {
      const clean = CLEAN_MODES[index]!
      return { kind: 'set', change: { clean }, message: `Symbol cleaning set to ${clean}.`, screen: main }
    }
    case 'sounds':
      return index === 0 ? { kind: 'open', screen: { kind: 'all-sounds' } } : { kind: 'open', screen: { kind: 'event', event: SOUND_EVENTS[index - 1]! } }
    case 'all-sounds': {
      const isOn = index === 0
      return { kind: 'set', change: { sounds: isOn }, message: `All sounds turned ${onOff(isOn)}.`, screen: sounds }
    }
    case 'event': {
      const event = screen.event
      const was = s.soundEvents[event]
      const setEvent = (change: Partial<typeof was>) => ({ soundEvents: { ...s.soundEvents, [event]: { ...was, ...change } } })
      if (index < 2) {
        const isOn = index === 0
        return { kind: 'set', change: setEvent({ isOn }), message: `${event} sound turned ${onOff(isOn)}.`, screen: sounds }
      }
      if (index === 2) {
        return { kind: 'set', change: setEvent({ pick: 'random' }), message: `${event} will play a random sound each time.`, screen: sounds }
      }
      const file = ctx.files[index - 3]!
      return { kind: 'set', change: setEvent({ pick: file.name }), message: `${event} will always play ${file.name}.`, screen: sounds, play: file }
    }
    case 'reset':
      return index === 0 ? { kind: 'reset', screen: main } : { kind: 'open', screen: main }
  }
}

export const RESET_MESSAGE = 'All Blind Claude settings are back to their defaults.'
