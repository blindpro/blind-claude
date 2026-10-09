import { expect, test } from 'claude-code/testing'

import { DEFAULTS, sanitize } from './settings'
import { chooseSound, findSound, isPlayable, listText, overviewText, sortSounds } from './sounds'
import type { SoundFile } from './sounds'

const FILES: SoundFile[] = sortSounds([
  { name: 'mine.wav', path: 'C:\\me\\mine.wav', isCustom: true },
  { name: 'done-2.wav', path: 'C:\\p\\done-2.wav', isCustom: false },
  { name: 'done-1.wav', path: 'C:\\p\\done-1.wav', isCustom: false },
])

test('built in sounds come before your own', () => {
  expect(FILES.map(f => f.name)).toEqual(['done-1.wav', 'done-2.wav', 'mine.wav'])
})

test('only WAV files are playable', () => {
  expect(isPlayable('a.WAV')).toBe(true)
  expect(isPlayable('a.ogg')).toBe(false)
})

test('chooses the picked sound, or a random one', () => {
  expect(chooseSound(FILES, 'mine.wav', 0)?.name).toBe('mine.wav')
  expect(chooseSound(FILES, 'random', 0)?.name).toBe('done-1.wav')
  expect(chooseSound(FILES, 'random', 0.99)?.name).toBe('mine.wav')
  expect(chooseSound(FILES, 'gone.wav', 0.5)?.name).toBe('done-2.wav')
  expect(chooseSound([], 'random', 0.5)).toBe(undefined)
})

test('finds sounds by number or name', () => {
  expect(findSound(FILES, '3').map(f => f.name)).toEqual(['mine.wav'])
  expect(findSound(FILES, 'done')).toHaveLength(2)
  expect(findSound(FILES, 'done-2.wav').map(f => f.name)).toEqual(['done-2.wav'])
})

test('lists sounds in plain sentences', () => {
  const text = listText('done', FILES, { isOn: true, pick: 'mine.wav' })
  expect(text).toContain('done sounds, on, always mine.wav:')
  expect(text).toContain('3. mine.wav, added by you. Chosen.')
  expect(listText('error', [], { isOn: true, pick: 'random' })).toContain('No error sounds yet.')
})

test('overview covers every event', () => {
  const text = overviewText(DEFAULTS, { done: 5, start: 0, attention: 1, error: 0 })
  expect(text).toContain('done, when Claude finishes: on, random sound, 5 sounds.')
  expect(text).toContain('start, when Claude starts working: on, random sound, no sounds yet.')
  expect(text).toContain('attention, when Claude needs permission or has a question: on, random sound, 1 sound.')
})

test('saved sound settings are checked and filled in', () => {
  const saved = sanitize({ soundEvents: { done: { isOn: false, pick: 'mine.wav' }, start: 'junk' } })
  expect(saved.soundEvents?.done).toEqual({ isOn: false, pick: 'mine.wav' })
  expect(saved.soundEvents?.start).toEqual({ isOn: true, pick: 'random' })
})
