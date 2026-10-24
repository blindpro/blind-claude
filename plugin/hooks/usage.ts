// Plain text for /usage and /context. Claude Code draws both as panels of
// bars, grids and symbols; these say the same figures in sentences.
// Pure functions: register.tsx fetches the figures and passes them in.

import type { SessionContextBreakdown, SessionUsage } from 'claude-code'

import { formatDuration } from './speech'

const WINDOW_NAMES: Record<string, string> = {
  five_hour: 'Current session, the 5 hour limit',
  seven_day: 'Current week, all models',
  seven_day_opus: 'Current week, Opus',
  seven_day_sonnet: 'Current week, Sonnet',
  spend_limit: 'Spending limit',
}

function windowName(kind: string): string {
  return WINDOW_NAMES[kind] ?? kind.replace(/_/g, ' ')
}

// "in 2 hours 5 minutes", to the minute, from an ISO time.
export function resetsIn(iso: string | undefined, now: number): string {
  if (iso === undefined) return ''
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const minutes = Math.max(1, Math.round((at - now) / 60_000))
  if (minutes < 60) return `resets in ${formatDuration(minutes * 60_000)}`
  const hours = Math.floor(minutes / 60)
  if (hours >= 48) return `resets in ${Math.round(hours / 24)} days`
  const rest = minutes % 60
  const h = hours === 1 ? '1 hour' : `${hours} hours`

  return rest === 0 ? `resets in ${h}` : `resets in ${h} ${formatDuration(rest * 60_000)}`
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))} million`
  if (tokens >= 1_000) return `${Number((tokens / 1_000).toFixed(1))} thousand`

  return String(Math.round(tokens))
}

function contextLine(usage: SessionUsage): string {
  const { tokens, window, percent } = usage.context
  if (tokens === undefined) return `Context: nothing used yet, of ${formatTokens(window)} tokens.`

  return `Context: ${percent ?? Math.round((tokens / window) * 100)} percent used, ${formatTokens(tokens)} of ${formatTokens(window)} tokens.`
}

export function usageText(usage: SessionUsage, now: number): string {
  const lines = ['Usage.']
  if (usage.rateLimits.length === 0) lines.push('No plan limits have been reported yet. They show after the first reply on a subscription.')
  for (const limit of usage.rateLimits) {
    const reset = resetsIn(limit.resetsAt, now)
    lines.push(`${windowName(limit.kind)}: ${limit.percentUsed} percent used${reset ? `, ${reset}` : ''}.`)
  }
  if (usage.cost !== undefined) lines.push(`This session has cost ${usage.cost.usd.toFixed(2)} US dollars.`)
  lines.push(contextLine(usage))

  return lines.join('\n')
}

export function contextText(usage: SessionUsage): string {
  const breakdown: SessionContextBreakdown | undefined = usage.context.breakdown
  if (breakdown === undefined) return contextLine(usage)
  const lines = [
    `Context for ${breakdown.model}: ${breakdown.percentage} percent used, ${formatTokens(breakdown.totalTokens)} of ${formatTokens(breakdown.rawMaxTokens)} tokens.`,
  ]
  for (const category of breakdown.categories) {
    if (category.tokens <= 0) continue
    const share = Math.round((category.tokens / breakdown.rawMaxTokens) * 100)
    const note = category.isDeferred ? ', loaded only when needed' : ''
    lines.push(`${category.name}: ${formatTokens(category.tokens)} tokens, ${share} percent${note}.`)
  }
  const memory = breakdown.memoryFiles.length
  if (memory > 0) lines.push(`${memory === 1 ? '1 memory file' : `${memory} memory files`} loaded.`)
  if (breakdown.isAutoCompactEnabled && breakdown.autoCompactThreshold !== undefined) {
    lines.push(`Claude Code compacts the conversation at ${formatTokens(breakdown.autoCompactThreshold)} tokens.`)
  }

  return lines.join('\n')
}
