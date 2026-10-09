// Pure helpers for sound cues: picking a file, and the text the /sounds
// command shows. register.tsx finds the files and plays them.

import { SOUND_EVENTS } from './settings'
import type { Settings, SoundChoice, SoundEvent } from './settings'

export type SoundFile = { name: string; path: string; isCustom: boolean }

export const EVENT_WORDS: Record<SoundEvent, string> = {
  done: 'when Claude finishes',
  start: 'when Claude starts working',
  attention: 'when Claude needs permission or has a question',
  error: 'when a turn stops with an error',
}

export function isSoundEvent(word: string): word is SoundEvent {
  return (SOUND_EVENTS as readonly string[]).includes(word)
}

export function isPlayable(name: string): boolean {
  return /\.wav$/i.test(name)
}

// Built in sounds first, then the person's own, each group by name.
export function sortSounds(files: readonly SoundFile[]): SoundFile[] {
  return [...files].sort((a, b) => Number(a.isCustom) - Number(b.isCustom) || a.name.localeCompare(b.name))
}

// The file to play for an event, or undefined when there is none.
// A picked file that has gone missing falls back to a random one.
export function chooseSound(files: readonly SoundFile[], pick: string, random: number): SoundFile | undefined {
  if (files.length === 0) return undefined
  if (pick !== 'random') {
    const picked = files.find(f => f.name.toLowerCase() === pick.toLowerCase())
    if (picked) return picked
  }

  return files[Math.min(files.length - 1, Math.floor(random * files.length))]
}

// Finds a sound by its number in the list (from 1) or by part of its name.
export function findSound(files: readonly SoundFile[], query: string): SoundFile[] {
  const q = query.trim().toLowerCase()
  if (/^\d+$/.test(q)) {
    const one = files[Number(q) - 1]
    return one ? [one] : []
  }
  const exact = files.filter(f => f.name.toLowerCase() === q)
  if (exact.length > 0) return exact

  return files.filter(f => f.name.toLowerCase().includes(q))
}

function choiceWords(choice: SoundChoice): string {
  const state = choice.isOn ? 'on' : 'off'
  const pick = choice.pick === 'random' ? 'random sound' : `always ${choice.pick}`

  return `${state}, ${pick}`
}

export function overviewText(settings: Settings, counts: Record<SoundEvent, number>): string {
  const lines = SOUND_EVENTS.map(event => {
    const count = counts[event]
    const files = count === 0 ? 'no sounds yet' : count === 1 ? '1 sound' : `${count} sounds`
    return `${event}, ${EVENT_WORDS[event]}: ${choiceWords(settings.soundEvents[event])}, ${files}.`
  })

  return [
    `All sounds are ${settings.sounds ? 'on' : 'off'}.`,
    ...lines,
    'Type /sounds help for the sound commands.',
  ].join('\n')
}

export function listText(event: SoundEvent, files: readonly SoundFile[], choice: SoundChoice): string {
  if (files.length === 0) {
    return `No ${event} sounds yet. Add one with /sounds add ${event} followed by the path to a sound file.`
  }
  const lines = files.map((f, i) => {
    const mine = f.isCustom ? ', added by you' : ''
    const chosen = choice.pick.toLowerCase() === f.name.toLowerCase() ? '. Chosen' : ''
    return `${i + 1}. ${f.name}${mine}${chosen}.`
  })

  return [`${event} sounds, ${choiceWords(choice)}:`, ...lines].join('\n')
}

export const SOUNDS_HELP = [
  'Sound commands. Events are done, start, attention and error.',
  '/sounds: overview of every event.',
  '/sounds on or off: all sounds on or off.',
  '/sounds done on or off: one event on or off.',
  '/sounds list done: list the sounds for an event.',
  '/sounds play done 2: play a sound. Leave out the number for the one that would play.',
  '/sounds pick done 2: always use that sound. /sounds pick done random: a random one each time.',
  '/sounds add done C:\\path\\to\\sound.ogg: add your own sound. WAV works always; other formats need ffmpeg.',
  '/sounds remove done 6: remove a sound you added.',
  '/sounds folder: where your own sounds are kept.',
].join('\n')
