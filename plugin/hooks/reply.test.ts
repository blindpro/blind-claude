import { expect, test } from 'claude-code/testing'

import { copyText, lastReplyOf, wordCount } from './reply'

test('the last reply is the newest assistant message with text', () => {
  const messages = [
    { role: 'user' as const, text: 'Hi' },
    { role: 'assistant' as const, text: 'First answer.' },
    { role: 'user' as const, text: 'More' },
    { role: 'assistant' as const, text: '  Second answer.  ' },
    { role: 'assistant' as const, text: '' },
    { role: 'user' as const, text: '' },
  ]
  expect(lastReplyOf(messages)).toBe('Second answer.')
  expect(lastReplyOf([{ role: 'user', text: 'Hi' }])).toBe('')
})

test('the copy is cleaned unless raw is asked for or cleaning is off', () => {
  expect(copyText('**Done** ✅', 'on', false)).toBe('Done done')
  expect(copyText('**Done**', 'on', true)).toBe('**Done**')
  expect(copyText('**Done**', 'off', false)).toBe('**Done**')
})

test('words are counted in words', () => {
  expect(wordCount('one')).toBe('1 word')
  expect(wordCount(' two  words\nhere ')).toBe('3 words')
})
