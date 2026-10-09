// Pure helpers for speech: what to say about tools, and which events each
// speech level speaks. No engine calls here; register.tsx does the talking.

import type { Level } from './settings'

// Tools that change something or reach outside. At the "most" level only
// these are announced; reads and searches are left out to keep it short.
const ACTION_TOOLS = new Set([
  'Bash',
  'PowerShell',
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
  'Agent',
  'Task',
  'WebFetch',
  'WebSearch',
])

export function fileName(path: unknown): string {
  if (typeof path !== 'string' || path === '') return 'a file'
  const parts = path.split(/[\\/]/)

  return parts[parts.length - 1] || path
}

function field(input: unknown, key: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[key]

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function short(text: string, max = 80): string {
  const one = text.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max)}...` : one
}

function host(url: string | undefined): string {
  if (!url) return 'a web page'
  const match = /^[a-z]+:\/\/(?:www\.)?([^/:?#]+)/i.exec(url)

  return match?.[1] ?? 'a web page'
}

// A plain sentence for a tool call, such as "Editing register.ts".
export function describeToolCall(tool: string, input: unknown): string {
  switch (tool) {
    case 'Bash':
    case 'PowerShell': {
      const description = field(input, 'description')
      const command = field(input, 'command')
      return description ? `Running command: ${short(description)}` : `Running command: ${short(command ?? 'unknown')}`
    }
    case 'Read':
      return `Reading ${fileName(field(input, 'file_path'))}`
    case 'Edit':
    case 'MultiEdit':
      return `Editing ${fileName(field(input, 'file_path'))}`
    case 'Write':
      return `Writing ${fileName(field(input, 'file_path'))}`
    case 'NotebookEdit':
      return `Editing notebook ${fileName(field(input, 'notebook_path'))}`
    case 'Glob':
      return `Finding files matching ${short(field(input, 'pattern') ?? 'a pattern', 40)}`
    case 'Grep':
      return `Searching for ${short(field(input, 'pattern') ?? 'text', 40)}`
    case 'WebFetch':
      return `Fetching ${host(field(input, 'url'))}`
    case 'WebSearch':
      return `Searching the web for ${short(field(input, 'query') ?? 'something', 60)}`
    case 'Agent':
    case 'Task':
      return `Starting a helper agent: ${short(field(input, 'description') ?? 'task', 60)}`
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'Updating the task list'
    case 'Skill':
      return `Using skill ${field(input, 'skill') ?? ''}`.trim()
    case 'AskUserQuestion':
      return 'Claude has a question for you'
    default: {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
      if (mcp) return `Using ${mcp[2]!.replace(/_/g, ' ')} from ${mcp[1]!.replace(/_/g, ' ')}`
      return `Using tool ${tool}`
    }
  }
}

// What to say once a tool call has finished, at the "all" level.
export function describeToolResult(tool: string, isError: boolean): string {
  const name = tool.startsWith('mcp__') ? 'Tool' : tool

  return isError ? `${name} failed.` : `${name} finished.`
}

export function speaksToolCall(level: Level, tool: string): boolean {
  if (level === 'all') return true
  if (level === 'most') return ACTION_TOOLS.has(tool)

  return false
}

export function speaksToolResult(level: Level): boolean {
  return level === 'all'
}

// "all" and "most" speak reply text as each block arrives.
export function speaksReplyBlocks(level: Level): boolean {
  return level === 'all' || level === 'most'
}

// "some" speaks the final answer once the turn ends.
export function speaksFinalAnswer(level: Level): boolean {
  return level === 'some'
}

// Errors and permission requests are spoken at every level but "none".
export function speaksAlerts(level: Level): boolean {
  return level !== 'none'
}

// File name for one command in the speech server's spool folder.
// Sorting by name must give the order the commands were sent in.
export function spoolName(now: number, seq: number): string {
  return `${String(Math.floor(now)).padStart(15, '0')}-${String(seq).padStart(6, '0')}.json`
}

export type Voice = { name: string; culture: string; gender: string; current: boolean }

export function parseVoices(json: string): Voice[] {
  try {
    const value: unknown = JSON.parse(json)
    const list = Array.isArray(value) ? value : [value]
    return list
      .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && typeof (v as { name?: unknown }).name === 'string')
      .map(v => ({
        name: String(v.name),
        culture: typeof v.culture === 'string' ? v.culture : '',
        gender: typeof v.gender === 'string' ? v.gender : '',
        current: v.current === true,
      }))
  } catch {
    return []
  }
}

// Finds a voice by its number in the list (from 1) or by part of its name.
export function findVoice(voices: readonly Voice[], query: string): Voice[] {
  const q = query.trim().toLowerCase()
  if (/^\d+$/.test(q)) {
    const one = voices[Number(q) - 1]
    return one ? [one] : []
  }
  const exact = voices.filter(v => v.name.toLowerCase() === q)
  if (exact.length > 0) return exact

  return voices.filter(v => v.name.toLowerCase().includes(q))
}

export function listVoicesText(voices: readonly Voice[], chosen: string | null): string {
  if (voices.length === 0) return 'No voices were found.'
  const lines = voices.map((v, i) => {
    const inUse = chosen ? v.name === chosen : v.current
    const culture = v.culture ? `, ${v.culture}` : ''
    return `${i + 1}. ${v.name}${culture}.${inUse ? ' In use.' : ''}`
  })

  return [`${voices.length} voices installed.`, ...lines, 'Type /voices and a number or name to choose one.'].join('\n')
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return seconds === 1 ? '1 second' : `${seconds} seconds`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  const m = minutes === 1 ? '1 minute' : `${minutes} minutes`

  return rest === 0 ? m : `${m} ${rest === 1 ? '1 second' : `${rest} seconds`}`
}
