import { expect, test } from 'claude-code/testing'

import { contextText, formatTokens, resetsIn, usageText } from './usage'

const NOW = Date.parse('2026-10-24T12:00:00Z')

test('reset times are said in hours and minutes', () => {
  expect(resetsIn('2026-10-24T14:05:00Z', NOW)).toBe('resets in 2 hours 5 minutes')
  expect(resetsIn('2026-10-24T12:30:00Z', NOW)).toBe('resets in 30 minutes')
  expect(resetsIn('2026-10-29T12:00:00Z', NOW)).toBe('resets in 5 days')
  expect(resetsIn(undefined, NOW)).toBe('')
})

test('token counts are rounded into words', () => {
  expect(formatTokens(1_000_000)).toBe('1 million')
  expect(formatTokens(45_300)).toBe('45.3 thousand')
  expect(formatTokens(812)).toBe('812')
})

test('usage reads every limit as a sentence, with no bars or symbols', () => {
  const text = usageText(
    {
      startedAt: NOW,
      context: { tokens: 50_000, window: 200_000, percent: 25 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-24T14:00:00Z' },
        { kind: 'seven_day', percentUsed: 7 },
      ],
      cost: { usd: 1.5 },
    },
    NOW,
  )
  expect(text).toContain('Current session, the 5 hour limit: 23.5 percent used, resets in 2 hours.')
  expect(text).toContain('Current week, all models: 7 percent used.')
  expect(text).toContain('This session has cost 1.50 US dollars.')
  expect(text).toContain('Context: 25 percent used, 50 thousand of 200 thousand tokens.')
  expect(text).not.toMatch(/[─-▟]/u)
})

test('context lists each category that holds tokens', () => {
  const text = contextText({
    startedAt: NOW,
    rateLimits: [],
    context: {
      window: 200_000,
      breakdown: {
        categories: [
          { name: 'System prompt', tokens: 4_000, color: 'x', isDeferred: false, kind: 'used' },
          { name: 'Messages', tokens: 0, color: 'x', isDeferred: false, kind: 'used' },
          { name: 'Free space', tokens: 196_000, color: 'x', isDeferred: false, kind: 'free' },
        ],
        totalTokens: 4_000,
        maxTokens: 200_000,
        rawMaxTokens: 200_000,
        autocompactSource: 'model',
        percentage: 2,
        gridRows: [],
        model: 'claude-opus-5-5',
        memoryFiles: [],
        mcpTools: [],
        agents: [],
        isAutoCompactEnabled: false,
        apiUsage: null,
      },
    },
  } as never)
  expect(text).toContain('Context for claude-opus-5-5: 2 percent used, 4 thousand of 200 thousand tokens.')
  expect(text).toContain('System prompt: 4 thousand tokens, 2 percent.')
  expect(text).not.toContain('Messages')
})
