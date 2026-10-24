import { expect, test } from 'claude-code/testing'

import { allowKey, answerOf, describeCall, dialogSpeech, parseQuestions, permissionDialog, questionDialog } from './prompts'

test('a command permission says what will run, line by line, then asks', () => {
  const dialog = permissionDialog('p1', 'Bash', { command: 'git add .\ngit push', description: 'Push the branch' }, undefined, undefined)
  expect(dialog.title).toBe('Permission needed.')
  expect(dialog.lines).toEqual(['Claude wants to run a command.', 'What it does: Push the branch', 'Command line 1: git add .', 'Command line 2: git push', 'Allow it?'])
  expect(dialog.options.map(o => o.label)).toEqual([
    'Yes',
    'Yes, and allow this exact command for the rest of this session',
    'No',
    "Show Claude Code's own prompt instead",
  ])
  expect(dialog.options[2]!.spoken).toBe('No. 3 of 4.')
})

test('an edit permission says what will change and offers to read it first', () => {
  const dialog = permissionDialog('p2', 'Edit', { file_path: 'C:\\r\\a.ts' }, 'Edits need approval', 'Edited a.ts, line 4: 1 line changed.')
  expect(dialog.lines).toEqual(['Claude wants to edit a.ts.', 'File: C:\\r\\a.ts', 'Edited a.ts, line 4: 1 line changed.', 'Why it asks: Edits need approval', 'Allow it?'])
  expect(dialog.options.map(o => o.key)).toEqual(['yes', 'always', 'read', 'no', 'engine'])
})

test('tools from a connector are named with their server', () => {
  expect(describeCall('mcp__github__create_issue', { title: 'Bug' })).toEqual(['Claude wants to use create issue from github.', 'title: Bug'])
})

test('allowing for the session covers edits, one command, or one tool', () => {
  expect(allowKey('Write', {})).toBe('edits')
  expect(allowKey('Bash', { command: ' ls ' })).toBe('Bash:ls')
  expect(allowKey('WebFetch', {})).toBe('WebFetch')
})

const QUESTIONS = parseQuestions({
  questions: [
    { question: 'Which database?', header: 'Database', multiSelect: false, options: [{ label: 'SQLite', description: 'One file, no server' }, { label: 'Postgres', description: '' }] },
    { question: 'Which features?', header: 'Features', multiSelect: true, options: [{ label: 'Login' }, { label: 'Search' }] },
  ],
})!

test('a question lists each choice with its description', () => {
  const dialog = questionDialog('q', QUESTIONS, 0, new Set())
  expect(dialog.title).toBe('Question 1 of 2, Database.')
  expect(dialog.lines).toEqual(['Which database?'])
  expect(dialog.options.map(o => o.label)).toEqual(['SQLite: One file, no server', 'Postgres', "Show Claude Code's own question instead"])
  expect(dialogSpeech(dialog)).toContain('3 choices: 1, SQLite: One file, no server. 2, Postgres.')
})

test('a question with several answers marks what is chosen and ends with done', () => {
  const dialog = questionDialog('q', QUESTIONS, 1, new Set([1]))
  expect(dialog.options.map(o => o.label)).toEqual(['Not chosen, Login', 'Chosen, Search', 'Done, send this choice', "Show Claude Code's own question instead"])
  expect(answerOf(QUESTIONS[1]!, [0, 1])).toBe('Login, Search')
})

test('questions in another shape are left to Claude Code', () => {
  expect(parseQuestions({ questions: [] })).toBe(null)
  expect(parseQuestions({ questions: [{ question: 'x', options: [{ nolabel: true }] }] })).toBe(null)
})
