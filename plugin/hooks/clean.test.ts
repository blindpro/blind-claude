import { expect, test } from 'claude-code/testing'

import { cleanForDisplay, cleanForSpeech, linearizeTables } from './clean'

test('removes emoji and decorative symbols', () => {
  expect(cleanForDisplay('\u{1F680} Deployed! \u2728\u{1F389}')).toBe('Deployed!')
  expect(cleanForDisplay('\u{1F468}\u200D\u{1F4BB} Coder')).toBe('Coder')
  expect(cleanForDisplay('Flag \u{1F1FA}\u{1F1F8} here')).toBe('Flag here')
})

test('turns meaningful symbols into words', () => {
  expect(cleanForDisplay('\u2705 Tests pass')).toBe('done Tests pass')
  expect(cleanForDisplay('\u274C Build')).toBe('failed Build')
  expect(cleanForDisplay('\u26A0\uFE0F Careful')).toBe('warning Careful')
  expect(cleanForDisplay('a.ts \u2192 b.ts')).toBe('a.ts to b.ts')
  expect(cleanForDisplay('pages 3\u20135')).toBe('pages 3 to 5')
  expect(cleanForDisplay('x \u2265 2')).toBe('x greater than or equal to 2')
})

test('strips markdown markers but keeps the words', () => {
  const input = '## Summary\n\n**Bold** and *italic* and __under__.\n\n---\n\n> quoted'
  expect(cleanForDisplay(input)).toBe('Summary\n\nBold and italic and under.\n\nquoted')
})

test('keeps snake_case and math stars alone', () => {
  expect(cleanForDisplay('call my_func_name now')).toBe('call my_func_name now')
  expect(cleanForDisplay('2 * 3 * 4')).toBe('2 * 3 * 4')
})

test('decorative bullets become dashes', () => {
  expect(cleanForDisplay('\u25CF one\n\u2022 two\n* three')).toBe('- one\n- two\n- three')
})

test('removes box drawing and spinner characters', () => {
  expect(cleanForDisplay('\u256D\u2500\u2500\u256E\n\u2502 hi \u2502\n\u2570\u2500\u2500\u256F')).toBe('hi')
  expect(cleanForDisplay('\u280B Working')).toBe('Working')
})

test('never touches code blocks or inline code', () => {
  const code = '```ts\nconst a = **b** // \u2192 \u{1F680}\n```'
  expect(cleanForDisplay(`Look:\n${code}`)).toBe(`Look:\n${code}`)
  expect(cleanForDisplay('run `**x** \u2192 y` now')).toBe('run `**x** \u2192 y` now')
})

test('linearizes tables', () => {
  const table = '| Name | Size |\n|---|---:|\n| app.ts | 4 KB |\n| util.ts | 1 KB |'
  expect(linearizeTables(table)).toBe(
    'Table with 2 rows and 2 columns: Name, Size.\n' +
      'Row 1. Name: app.ts. Size: 4 KB.\n' +
      'Row 2. Name: util.ts. Size: 1 KB.',
  )
})

test('off mode changes nothing', () => {
  expect(cleanForDisplay('**hi** \u{1F680}', 'off')).toBe('**hi** \u{1F680}')
})

test('words mode names common emoji', () => {
  expect(cleanForDisplay('Shipped \u{1F680}', 'words')).toBe('Shipped rocket')
})

test('speech describes code blocks instead of reading them', () => {
  expect(cleanForSpeech('Here:\n```python\na = 1\nb = 2\n```\nDone.')).toBe('Here:\nCode block, python, 2 lines.\nDone.')
})

test('speech shortens paths and links', () => {
  expect(cleanForSpeech('Edited C:\\Users\\me\\proj\\src\\clean.ts today')).toBe('Edited clean.ts today')
  expect(cleanForSpeech('See https://github.com/anthropics/claude-code/issues for more')).toBe('See link to github.com for more')
  expect(cleanForSpeech('Read [the docs](https://example.com/docs).')).toBe('Read the docs.')
})

test('speech drops list dashes and reads abbreviations', () => {
  expect(cleanForSpeech('- one, e.g. this\n- two')).toBe('one, for example, this\ntwo')
})
