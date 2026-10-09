import { expect, test } from 'claude-code/testing'

import {
  describeToolCall,
  findVoice,
  formatDuration,
  listVoicesText,
  parseVoices,
  speaksToolCall,
  spoolName,
} from './speech'

test('describes tool calls in plain words', () => {
  expect(describeToolCall('Read', { file_path: 'C:\\proj\\src\\clean.ts' })).toBe('Reading clean.ts')
  expect(describeToolCall('Edit', { file_path: '/home/me/app.ts' })).toBe('Editing app.ts')
  expect(describeToolCall('Bash', { command: 'npm test', description: 'Run the tests' })).toBe('Running command: Run the tests')
  expect(describeToolCall('PowerShell', { command: 'Get-ChildItem' })).toBe('Running command: Get-ChildItem')
  expect(describeToolCall('WebFetch', { url: 'https://www.example.com/a/b' })).toBe('Fetching example.com')
  expect(describeToolCall('mcp__github__create_issue', {})).toBe('Using create issue from github')
})

test('most level only announces tools that do something', () => {
  expect(speaksToolCall('most', 'Edit')).toBe(true)
  expect(speaksToolCall('most', 'Read')).toBe(false)
  expect(speaksToolCall('all', 'Read')).toBe(true)
  expect(speaksToolCall('some', 'Edit')).toBe(false)
})

test('spool names sort in send order', () => {
  const names = [spoolName(1000, 2), spoolName(1000, 10), spoolName(999, 50)]
  expect([...names].sort()).toEqual([spoolName(999, 50), spoolName(1000, 2), spoolName(1000, 10)])
})

const VOICES = parseVoices(
  '[{"name":"NVDA Sapi","culture":"English","gender":"Male","current":true},' +
    '{"name":"Microsoft David Desktop","culture":"English (United States)","gender":"Male","current":false},' +
    '{"name":"Microsoft Zira Desktop","culture":"English (United States)","gender":"Female","current":false}]',
)

test('parses the voice list, including a single voice', () => {
  expect(VOICES).toHaveLength(3)
  expect(parseVoices('{"name":"Solo","culture":"","gender":"","current":true}')).toHaveLength(1)
  expect(parseVoices('not json')).toEqual([])
})

test('finds voices by number or name', () => {
  expect(findVoice(VOICES, '3').map(v => v.name)).toEqual(['Microsoft Zira Desktop'])
  expect(findVoice(VOICES, 'zira').map(v => v.name)).toEqual(['Microsoft Zira Desktop'])
  expect(findVoice(VOICES, 'microsoft')).toHaveLength(2)
  expect(findVoice(VOICES, '9')).toEqual([])
})

test('lists voices with the one in use marked', () => {
  const text = listVoicesText(VOICES, 'Microsoft Zira Desktop')
  expect(text).toContain('3. Microsoft Zira Desktop, English (United States). In use.')
  expect(text).toContain('1. NVDA Sapi, English.')
})

test('formats durations in words', () => {
  expect(formatDuration(1000)).toBe('1 second')
  expect(formatDuration(45_000)).toBe('45 seconds')
  expect(formatDuration(60_000)).toBe('1 minute')
  expect(formatDuration(125_000)).toBe('2 minutes 5 seconds')
})
