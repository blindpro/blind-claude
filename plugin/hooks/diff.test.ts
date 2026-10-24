import { expect, test } from 'claude-code/testing'

import {
  applyEdit,
  changeFromResult,
  diffTexts,
  findScope,
  hunkEntries,
  parseGitDiff,
  reportHtml,
  reportText,
  rowText,
  summary,
  trimContext,
  wordsChanged,
} from './diff'

const ORIGINAL = ['function speak(text) {', '  const spoken = clean(text)', '  if (spoken === "") return', '  send(spoken)', '}'].join('\n')

const EDIT = {
  filePath: 'C:\\repo\\src\\speech.ts',
  oldString: 'x',
  newString: 'y',
  originalFile: ORIGINAL,
  structuredPatch: [
    {
      oldStart: 1,
      oldLines: 5,
      newStart: 1,
      newLines: 6,
      lines: [' function speak(text) {', '   const spoken = clean(text)', '-  if (spoken === "") return', '+  if (spoken.trim() === "") return', '+  // Never wait.', '   send(spoken)', ' }'],
    },
  ],
  userModified: false,
  replaceAll: false,
}

test('removed and added lines of the same count are paired as changed lines', () => {
  const entries = hunkEntries({ oldStart: 3, oldLines: 2, newStart: 3, newLines: 2, lines: ['-a', '-b', '+A', '+B'] })
  expect(entries).toEqual([
    { kind: 'changed', line: 3, before: 'a', after: 'A' },
    { kind: 'changed', line: 4, before: 'b', after: 'B' },
  ])
})

test('unequal runs are listed as removed then added, with old and new line numbers', () => {
  const entries = hunkEntries({ oldStart: 10, oldLines: 2, newStart: 12, newLines: 1, lines: [' x', '-a', '-b', '+c', '\\ No newline at end of file'] })
  expect(entries).toEqual([
    { kind: 'context', line: 12, text: 'x' },
    { kind: 'removed', line: 11, text: 'a' },
    { kind: 'removed', line: 12, text: 'b' },
    { kind: 'added', line: 13, text: 'c' },
  ])
})

test('context is trimmed to the lines near a change', () => {
  const entries = hunkEntries({ oldStart: 1, oldLines: 5, newStart: 1, newLines: 5, lines: [' 1', ' 2', ' 3', '-4', '+four', ' 5'] })
  expect(trimContext(entries, 1).map(e => e.line)).toEqual([3, 4, 5])
  expect(trimContext(entries, 0).map(e => e.kind)).toEqual(['changed'])
})

test('an edit result becomes a change with the function it is in', () => {
  const change = changeFromResult('Edit', EDIT, 2, false)!
  expect(change.kind).toBe('edit')
  expect(change.turn).toBe(2)
  expect(change.hunks[0]!.scope).toBe('function speak')
  expect(summary(change)).toBe('Edited speech.ts, lines 3 to 4: 1 line added, 1 changed.')
  expect(summary(change, true)).toBe('Edited speech.ts: 1 line added, 1 changed.')
})

test('the transcript row lists a small change in words', () => {
  const row = rowText(changeFromResult('Edit', EDIT, 1, false)!)
  expect(row).toBe(
    [
      'Edited speech.ts, lines 3 to 4: 1 line added, 1 changed.',
      'Changed line 3.',
      'Before:   if (spoken === "") return',
      'After:   if (spoken.trim() === "") return',
      'Words added: ".trim()".',
      'Added line 4:   // Never wait.',
    ].join('\n'),
  )
  expect(rowText(changeFromResult('Edit', EDIT, 1, false)!, true)).toBe('Edited speech.ts, lines 3 to 4: 1 line added, 1 changed.')
})

test('the words that changed are named', () => {
  expect(wordsChanged('const isOn = false', 'const isOn = true')).toBe('Words changed: "false" became "true".')
  expect(wordsChanged('a b', 'x y')).toBe(null)
})

test('indent only changes say so', () => {
  const change = diffTexts('a.py', 'if x:\n  go()\n', 'if x:\n    go()\n')!
  expect(rowText(change)).toContain('Changed line 2, indent only, 2 spaces became 4 spaces: go()')
})

test('new, emptied and too large files are each said in a sentence', () => {
  expect(summary(changeFromResult('Write', { type: 'create', filePath: 'C:\\r\\new.md', content: 'a\nb\n', structuredPatch: [], originalFile: null }, 1, true)!)).toBe(
    'Created new.md by a helper agent, 2 lines.',
  )
  expect(summary(changeFromResult('Write', { type: 'update', filePath: 'x.txt', content: '', structuredPatch: [], originalFile: 'old' }, 1, false)!)).toBe('Emptied x.txt.')
  expect(changeFromResult('Write', { type: 'update', filePath: 'x.txt', content: 'same', structuredPatch: [], originalFile: 'same' }, 1, false)).toBe(null)
  expect(summary(changeFromResult('Write', { type: 'update', filePath: 'x.txt', content: 'big', structuredPatch: [], originalFile: null }, 1, false)!)).toContain('too large to compare')
})

test('scopes are found from the nearest less indented definition or heading', () => {
  const lines = ['# Setup', '', 'export async function load() {', '  const a = 1', '}', 'const b = 2']
  expect(findScope(lines, 3)).toBe('function load')
  expect(findScope(lines, 5)).toBe('section Setup')
})

test('a preview of an edit is worked out from the file text', () => {
  const after = applyEdit(ORIGINAL, 'send(spoken)', 'say(spoken)', false)!
  const change = diffTexts('speech.ts', ORIGINAL, after)!
  expect(summary(change)).toBe('Edited speech.ts, line 4: 1 line changed.')
  expect(applyEdit(ORIGINAL, 'missing', 'x', false)).toBe(null)
  expect(diffTexts('speech.ts', ORIGINAL, ORIGINAL)).toBe(null)
})

test('git diff output is read into changes', () => {
  const text = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1..2 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -10,2 +10,2 @@ export function run() {',
    ' keep',
    '-old',
    '+new',
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
  ].join('\n')
  const changes = parseGitDiff(text)
  expect(changes.map(c => [c.path, c.kind])).toEqual([
    ['src/a.ts', 'edit'],
    ['gone.txt', 'deleted'],
  ])
  expect(changes[0]!.hunks[0]!.scope).toBe('function run')
})

test('the report labels every line and never starts one with a bare plus or minus', () => {
  const changes = [changeFromResult('Edit', EDIT, 1, false)!, diffTexts('C:\\repo\\README.md', null, '# Hi\n')!]
  const text = reportText(changes, { title: 'Blind Claude change report for the last turn.', cwd: 'C:\\repo', context: 2 })
  expect(text).toContain('2 files changed: 2 lines added, 1 changed.')
  expect(text).toContain('Files: 1, speech.ts, 1 change. 2, README.md, 1 change.')
  expect(text).toContain('File 1 of 2: src\\speech.ts. Edited: 1 line added, 1 changed.')
  expect(text).toContain('Change 1 of 1 in speech.ts, near line 3, in function speak.')
  expect(text).toContain('Unchanged line 2:   const spoken = clean(text)')
  expect(text).toContain('File 2 of 2: README.md. Created README.md, 1 line.')
  for (const line of text.split('\n')) expect(line).not.toMatch(/^[+-]/)
})

test('the web page puts files and changes under headings', () => {
  const html = reportHtml([changeFromResult('Edit', EDIT, 1, false)!], { title: 'Changes', cwd: 'C:\\repo', context: 1 })
  expect(html).toContain('<h2 id="file-1">File 1 of 1: src\\speech.ts</h2>')
  expect(html).toContain('<h3>Change 1 of 1, near line 3, in function speak</h3>')
  expect(html).toContain('<ins><code>  // Never wait.</code></ins>')
  expect(html).toContain('spoken === &quot;&quot;')
})
