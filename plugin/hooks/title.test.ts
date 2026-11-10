import { expect, test } from 'claude-code/testing'

import { isEnvOn, windowTitle } from './title'

test('the title says working only while Claude works', () => {
  const cwd = 'C:\\Users\\me\\projects\\blind_claude'
  expect(windowTitle('idle', cwd)).toBe('Claude Code, blind_claude')
  expect(windowTitle('working', cwd)).toBe('Working, Claude Code, blind_claude')
  expect(windowTitle('waiting', cwd)).toBe('Waiting for you, Claude Code, blind_claude')
  expect(windowTitle('working', '/home/me/app/')).toBe('Working, Claude Code, app')
  expect(windowTitle('idle', '')).toBe('Claude Code')
})

test('the title setting is read the way environment switches are', () => {
  expect(isEnvOn('1')).toBe(true)
  expect(isEnvOn('true')).toBe(true)
  expect(isEnvOn(undefined)).toBe(false)
  expect(isEnvOn('')).toBe(false)
  expect(isEnvOn('0')).toBe(false)
  expect(isEnvOn('false')).toBe(false)
})
