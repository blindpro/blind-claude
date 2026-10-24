// The accessible dialog for permission prompts and Claude's questions:
// the question at the top in plain words, then one choice per line.
// Pure functions: register.tsx opens the pane, waits for the answer and
// speaks the choice the focus is on.

import type { Dialog, DialogOption } from '../types'

import { fileName } from './speech'

// Tools whose own dialog must be answered by the person in Claude Code:
// a hook's allow does not dismiss it, so these are left alone.
export const ENGINE_ONLY_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode'])

const RESERVED = new Set(['tool', 'tool_use_id', 'consent', 'agentId', 'description'])

// What can be typed in the box under the choices.
export const INPUT_PERMISSION = 'Or type what Claude should do instead, and press Enter:'
export const INPUT_QUESTION = 'Or type your own answer, and press Enter:'

function field(input: unknown, key: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[key]

  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function short(text: string, max = 200): string {
  const one = text.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max)}...` : one
}

function valueText(value: unknown): string {
  if (typeof value === 'string') return short(value, 120)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return short(JSON.stringify(value), 120)
  } catch {
    return 'a value'
  }
}

// A command of several lines, one line each, so none is hidden.
function commandLines(command: string): string[] {
  const lines = command.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '')
  if (lines.length <= 1) return [`Command: ${command.trim()}`]
  const shown = lines.slice(0, 8).map((l, i) => `Command line ${i + 1}: ${l}`)

  return lines.length > 8 ? [...shown, `And ${lines.length - 8} more lines.`] : shown
}

function inputLines(input: unknown): string[] {
  if (typeof input !== 'object' || input === null) return []
  const entries = Object.entries(input as Record<string, unknown>).filter(([k, v]) => !RESERVED.has(k) && v !== undefined)
  const lines = entries.slice(0, 6).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${valueText(v)}`)

  return entries.length > 6 ? [...lines, `And ${entries.length - 6} more settings.`] : lines
}

// The question at the top of a permission dialog, in plain sentences.
export function describeCall(tool: string, input: unknown, change?: string): string[] {
  const description = field(input, 'description')
  const what = description ? [`What it does: ${short(description)}`] : []
  switch (tool) {
    case 'Bash':
    case 'PowerShell': {
      const shell = tool === 'PowerShell' ? 'PowerShell command' : 'command'
      return [`Claude wants to run a ${shell}.`, ...what, ...commandLines(field(input, 'command') ?? '')]
    }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit': {
      const path = field(input, 'file_path') ?? field(input, 'notebook_path') ?? ''
      const verb = tool === 'Write' ? 'write' : 'edit'
      return [`Claude wants to ${verb} ${fileName(path)}.`, `File: ${path}`, ...(change ? [change] : [])]
    }
    case 'WebFetch':
      return ['Claude wants to fetch a web page.', `Address: ${field(input, 'url') ?? 'unknown'}`]
    case 'WebSearch':
      return ['Claude wants to search the web.', `Search: ${field(input, 'query') ?? 'unknown'}`]
    case 'Agent':
    case 'Task':
      return [`Claude wants to start a helper agent: ${short(description ?? field(input, 'prompt') ?? 'a task', 120)}.`]
    default: {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
      const head = mcp
        ? `Claude wants to use ${mcp[2]!.replace(/_/g, ' ')} from ${mcp[1]!.replace(/_/g, ' ')}.`
        : `Claude wants to use the ${tool} tool.`
      return [head, ...what, ...inputLines(input)]
    }
  }
}

// What "don't ask again" remembers for the rest of the session.
export function allowKey(tool: string, input: unknown): string {
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'edits'
  if (tool === 'Bash' || tool === 'PowerShell') return `${tool}:${(field(input, 'command') ?? '').trim()}`

  return tool
}

function allowAgainLabel(tool: string): string {
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'Yes, and allow all file edits for the rest of this session'
  if (tool === 'Bash' || tool === 'PowerShell') return 'Yes, and allow this exact command for the rest of this session'
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)

  return `Yes, and allow ${mcp ? mcp[2]!.replace(/_/g, ' ') : tool} for the rest of this session`
}

function numbered(options: readonly { key: string; label: string }[]): DialogOption[] {
  return options.map((o, i) => ({ ...o, spoken: `${o.label}. ${i + 1} of ${options.length}.` }))
}

export function permissionDialog(id: string, tool: string, input: unknown, reason: string | undefined, change: string | undefined): Dialog {
  const why = reason && reason.trim() !== '' ? [`Why it asks: ${short(reason)}`] : []
  const options = [
    { key: 'yes', label: 'Yes' },
    { key: 'always', label: allowAgainLabel(tool) },
    ...(change ? [{ key: 'read', label: 'Read the change in your editor first' }] : []),
    { key: 'no', label: 'No' },
    { key: 'engine', label: "Show Claude Code's own prompt instead" },
  ]

  return {
    id,
    title: 'Permission needed.',
    lines: [...describeCall(tool, input, change), ...why, 'Allow it?'],
    options: numbered(options),
    input: { label: INPUT_PERMISSION },
  }
}

export type Question = {
  question: string
  header: string
  options: { label: string; description?: string }[]
  multiSelect: boolean
}

// The questions of an AskUserQuestion call, or null when they are not in
// the shape the dialog can show.
export function parseQuestions(input: unknown): Question[] | null {
  if (typeof input !== 'object' || input === null) return null
  const list = (input as Record<string, unknown>).questions
  if (!Array.isArray(list) || list.length === 0) return null
  const out: Question[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) return null
    const q = item as Record<string, unknown>
    if (typeof q.question !== 'string' || !Array.isArray(q.options) || q.options.length === 0) return null
    const options = q.options.map(o => (typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : {}))
    if (options.some(o => typeof o.label !== 'string')) return null
    out.push({
      question: q.question,
      header: typeof q.header === 'string' ? q.header : '',
      options: options.map(o => ({ label: String(o.label), ...(typeof o.description === 'string' && o.description !== '' ? { description: o.description } : {}) })),
      multiSelect: q.multiSelect === true,
    })
  }

  return out
}

export function questionDialog(id: string, questions: readonly Question[], index: number, selected: ReadonlySet<number>): Dialog {
  const q = questions[index]!
  const header = q.header ? `, ${q.header}` : ''
  // The question is in the title, so the stop at the top shows and says it.
  const title = `${questions.length > 1 ? `Question ${index + 1} of ${questions.length}${header}.` : `Claude has a question${header}.`} ${q.question}`
  const label = (o: Question['options'][number]) => (o.description ? `${o.label}: ${o.description}` : o.label)
  const options = q.multiSelect
    ? [
        ...q.options.map((o, i) => ({ key: `opt-${i}`, label: `${selected.has(i) ? 'Chosen' : 'Not chosen'}, ${label(o)}` })),
        { key: 'done', label: selected.size === 0 ? 'Done, with nothing chosen' : `Done, send ${selected.size === 1 ? 'this choice' : `these ${selected.size} choices`}` },
      ]
    : q.options.map((o, i) => ({ key: `opt-${i}`, label: label(o) }))
  options.push({ key: 'engine', label: "Show Claude Code's own question instead" })
  const hint = q.multiSelect ? 'Choose as many as apply. Pressing a choice turns it on or off.' : ''

  return { id, title, lines: hint ? [hint] : [], options: numbered(options), input: { label: INPUT_QUESTION } }
}

// What is spoken when a dialog opens: the question and every choice.
export function dialogSpeech(dialog: Dialog): string {
  const choices = dialog.options.map((o, i) => `${i + 1}, ${o.label}.`).join(' ')

  return `${dialog.title} ${dialog.lines.join(' ')} ${dialog.options.length} choices: ${choices} Use up and down arrow and Enter, or press a number. Up arrow from the first choice reads the question again.`
}

// The answer to one question, as AskUserQuestion's result keeps it.
export function answerOf(question: Question, chosen: readonly number[]): string {
  return chosen.map(i => question.options[i]?.label ?? '').filter(l => l !== '').join(', ')
}

// The key of the line at the top of the dialog that holds the question, so
// the arrows can reach it and Enter on it says the whole dialog again.
export const QUESTION_KEY = 'question'

// What is spoken when the focus is on the question.
export function questionSpeech(dialog: Dialog): string {
  return `${dialog.title} ${dialog.lines.join(' ')} Press Enter to hear the choices again.`
}

// The dialog's stops in the order the arrows move through them.
export function focusOrder(dialog: Dialog, hasInput: boolean): string[] {
  return [QUESTION_KEY, ...dialog.options.map(o => o.key), ...(dialog.input && hasInput ? ['typed'] : [])]
}

// Where the focus goes instead of one of Claude Code's own stops in the pane,
// such as its close mark: off the last stop it wraps to the top, off any
// other it wraps to the bottom.
export function wrapFocus(order: readonly string[], last: string | null): string {
  return last === order[order.length - 1] ? order[0]! : order[order.length - 1]!
}
