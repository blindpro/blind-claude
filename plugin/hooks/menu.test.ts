import { expect, test } from 'claude-code/testing'

import { choose, parseChoice, screenText } from './menu'
import type { MenuContext } from './menu'
import { DEFAULTS } from './settings'
import type { SoundFile } from './sounds'
import type { Voice } from './speech'

const VOICES: Voice[] = [
  { name: 'NVDA Sapi', culture: 'English', gender: '', current: false },
  { name: 'Microsoft Zira Desktop', culture: '', gender: 'Female', current: true },
]
const FILES: SoundFile[] = [
  { name: 'done-1.wav', path: 'C:\\p\\done-1.wav', isCustom: false },
  { name: 'mine.wav', path: 'C:\\me\\mine.wav', isCustom: true },
]
const CTX: MenuContext = { settings: DEFAULTS, engine: 'Windows speech server', voices: VOICES, files: FILES }

test('reads only a number on its own as a choice', () => {
  expect(parseChoice(' 2 ')).toBe(2)
  expect(parseChoice('0')).toBe(0)
  expect(parseChoice('2 please')).toBe(null)
  expect(parseChoice('')).toBe(null)
})

test('the main menu numbers every setting with its value', () => {
  const text = screenText({ kind: 'main' }, CTX)
  expect(text).toContain('1. Speech level, some.')
  expect(text).toContain('2. Speech engine, auto.')
  expect(text).toContain('4. Rate, 0.')
  expect(text).toContain('0. Close the menu.')
})

test('choosing from the main menu opens that setting', () => {
  expect(choose({ kind: 'main' }, 2, CTX)).toEqual({ kind: 'open', screen: { kind: 'engine' } })
  expect(choose({ kind: 'main' }, 3, CTX)).toEqual({ kind: 'open', screen: { kind: 'voice' } })
  expect(choose({ kind: 'main' }, 0, CTX)).toEqual({ kind: 'close' })
  expect(choose({ kind: 'main' }, 11, CTX)).toEqual({ kind: 'open', screen: { kind: 'main' }, message: 'There is no option 11.' })
})

test('a choice sets the value and goes back to the main menu', () => {
  const answer = choose({ kind: 'level' }, 2, CTX)
  expect(answer).toEqual({ kind: 'set', change: { level: 'most' }, message: 'Speech level set to most.', screen: { kind: 'main' } })
  expect(screenText({ kind: 'level' }, CTX)).toContain('3. some: the final answer only, current.')
})

test('voices are numbered as /voices numbers them, the default last', () => {
  expect(screenText({ kind: 'voice' }, CTX)).toContain('3. System default, current.')
  expect(choose({ kind: 'voice' }, 2, CTX)).toMatchObject({ change: { voice: 'Microsoft Zira Desktop' } })
  expect(choose({ kind: 'voice' }, 3, CTX)).toMatchObject({ change: { voice: null } })
})

test('rate and volume stay open so they can be stepped', () => {
  expect(choose({ kind: 'rate' }, 1, CTX)).toMatchObject({ change: { rate: 1 }, screen: { kind: 'rate' } })
  expect(choose({ kind: 'volume' }, 1, CTX)).toMatchObject({ change: { volume: 100 } })
  expect(choose({ kind: 'volume' }, 2, CTX)).toMatchObject({ change: { volume: 90 } })
})

test('an event can be turned off, or given one sound that plays', () => {
  const screen = { kind: 'event', event: 'done' } as const
  expect(screenText(screen, CTX)).toContain('5. mine.wav, added by you.')
  expect(choose(screen, 2, CTX)).toMatchObject({ change: { soundEvents: { done: { isOn: false } } }, screen: { kind: 'sounds' } })
  expect(choose(screen, 5, CTX)).toMatchObject({ change: { soundEvents: { done: { pick: 'mine.wav' } } }, play: FILES[1] })
  expect(choose(screen, 0, CTX)).toEqual({ kind: 'open', screen: { kind: 'sounds' } })
})

test('reset asks first', () => {
  expect(choose({ kind: 'main' }, 10, CTX)).toEqual({ kind: 'open', screen: { kind: 'reset' } })
  expect(choose({ kind: 'reset' }, 1, CTX)).toEqual({ kind: 'reset', screen: { kind: 'main' } })
  expect(choose({ kind: 'reset' }, 2, CTX)).toEqual({ kind: 'open', screen: { kind: 'main' } })
})

test('the speech engine can be NVDA, the Windows voice, or whichever is there', () => {
  expect(screenText({ kind: 'engine' }, CTX)).toContain('1. auto: NVDA while it is running, otherwise the Windows voice, current.')
  expect(choose({ kind: 'engine' }, 2, CTX)).toEqual({ kind: 'set', change: { engine: 'nvda' }, message: 'Speech engine set to nvda.', screen: { kind: 'main' } })
})

test('the changes screen opens the report and steps through its settings', () => {
  expect(choose({ kind: 'main' }, 8, CTX)).toEqual({ kind: 'open', screen: { kind: 'changes' } })
  expect(choose({ kind: 'changes' }, 1, CTX)).toEqual({ kind: 'changes-report' })
  expect(choose({ kind: 'changes' }, 4, CTX)).toMatchObject({ change: { changes: { editor: 'notepad++' } }, screen: { kind: 'changes' } })
  expect(choose({ kind: 'changes' }, 6, CTX)).toMatchObject({ change: { changes: { context: 3 } } })
})

test('permission prompts can go back to Claude Code', () => {
  expect(screenText({ kind: 'prompts' }, CTX)).toContain("1. Blind Claude's dialog")
  expect(choose({ kind: 'prompts' }, 2, CTX)).toMatchObject({ change: { prompts: false }, screen: { kind: 'main' } })
})
