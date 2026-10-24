// Accessible diffs: what changed in a file, and where, in words.
// Pure functions: tool results and diff text in, sentences out, no engine
// calls. register.tsx collects the changes, writes the reports and opens them.

import type { DiffHunk, FileChange } from '../types'

// A new file longer than this is not listed line by line.
export const MAX_NEW_FILE_LINES = 200
// A transcript row lists the lines themselves up to this many changes.
export const ROW_LINES = 6

export type Entry =
  | { kind: 'context'; line: number; text: string }
  | { kind: 'added'; line: number; text: string }
  | { kind: 'removed'; line: number; text: string }
  | { kind: 'changed'; line: number; before: string; after: string }

export type Counts = { added: number; removed: number; changed: number }

function baseName(path: string): string {
  const parts = path.split(/[\\/]/)

  return parts[parts.length - 1] || path
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`
}

function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  return lines
}

function words(text: string): string[] {
  return text.match(/\w+/g) ?? []
}

// Two lines look alike when at least half the words of the shorter one are
// in the other.
function isAlike(a: string, b: string): boolean {
  const left = words(a)
  const right = new Set(words(b))
  if (left.length === 0 || right.size === 0) return a.trim() === b.trim()
  const shared = left.filter(w => right.has(w)).length

  return shared * 2 >= Math.min(left.length, right.size)
}

// Walks a hunk's lines. A run of removed lines followed by the same number
// of added lines is a set of changed lines, which is how most edits look.
export function hunkEntries(hunk: DiffHunk): Entry[] {
  const out: Entry[] = []
  let oldLine = hunk.oldStart
  let newLine = hunk.newStart
  let removed: { line: number; text: string }[] = []
  let added: { line: number; text: string }[] = []

  // Runs of the same length are paired line by line. Otherwise lines are
  // paired from the top while they look alike, and the rest are listed.
  const flush = () => {
    const isEven = removed.length === added.length
    let paired = 0
    while (paired < removed.length && paired < added.length && (isEven || isAlike(removed[paired]!.text, added[paired]!.text))) paired++
    for (let i = 0; i < paired; i++) out.push({ kind: 'changed', line: added[i]!.line, before: removed[i]!.text, after: added[i]!.text })
    for (const r of removed.slice(paired)) out.push({ kind: 'removed', ...r })
    for (const a of added.slice(paired)) out.push({ kind: 'added', ...a })
    removed = []
    added = []
  }

  for (const raw of hunk.lines) {
    const mark = raw[0]
    const text = raw.slice(1).replace(/\r$/, '')
    if (mark === '\\') continue
    if (mark === '-') {
      if (added.length > 0) flush()
      removed.push({ line: oldLine++, text })
    } else if (mark === '+') {
      added.push({ line: newLine++, text })
    } else {
      flush()
      out.push({ kind: 'context', line: newLine, text })
      oldLine++
      newLine++
    }
  }
  flush()

  return out
}

// Keeps only the unchanged lines within `around` lines of a change.
export function trimContext(entries: readonly Entry[], around: number): Entry[] {
  const changes = entries.map((e, i) => (e.kind === 'context' ? -1 : i)).filter(i => i >= 0)

  return entries.filter((e, i) => e.kind !== 'context' || changes.some(c => Math.abs(c - i) <= around))
}

export function countEntries(entries: readonly Entry[]): Counts {
  const counts = { added: 0, removed: 0, changed: 0 }
  for (const e of entries) if (e.kind !== 'context') counts[e.kind]++

  return counts
}

export function countChanges(changes: readonly FileChange[]): Counts {
  const total = { added: 0, removed: 0, changed: 0 }
  for (const change of changes) {
    for (const hunk of change.hunks) {
      const c = countEntries(hunkEntries(hunk))
      total.added += c.added
      total.removed += c.removed
      total.changed += c.changed
    }
  }

  return total
}

export function countText(c: Counts): string {
  const parts: string[] = []
  if (c.added > 0) parts.push(`${plural(c.added, 'line')} added`)
  if (c.removed > 0) parts.push(parts.length === 0 ? `${plural(c.removed, 'line')} removed` : `${c.removed} removed`)
  if (c.changed > 0) parts.push(parts.length === 0 ? `${plural(c.changed, 'line')} changed` : `${c.changed} changed`)

  return parts.length === 0 ? 'no lines changed' : parts.join(', ')
}

// The lines of the new file the change covers, such as "lines 40 to 52".
function lineRange(hunks: readonly DiffHunk[]): string {
  const lines = hunks.flatMap(h => hunkEntries(h).filter(e => e.kind !== 'context').map(e => e.line))
  if (lines.length === 0) return ''
  const low = Math.min(...lines)
  const high = Math.max(...lines)

  return low === high ? `line ${low}` : `lines ${low} to ${high}`
}

function newFileLines(change: FileChange): number {
  return change.hunks.reduce((n, h) => n + h.newLines, 0)
}

// One sentence for a change. `isSpoken` leaves out the line numbers.
export function summary(change: FileChange, isSpoken = false): string {
  const name = baseName(change.path)
  const by = change.isAgent ? ' by a helper agent' : ''
  switch (change.kind) {
    case 'create':
      return `Created ${name}${by}, ${plural(newFileLines(change), 'line')}.`
    case 'emptied':
      return `Emptied ${name}${by}.`
    case 'deleted':
      return `Deleted ${name}${by}.`
    case 'rewrite':
      return `Rewrote ${name}${by}. The old version was too large to compare.`
    case 'edit': {
      const range = isSpoken ? '' : lineRange(change.hunks)
      const counts = countText(countChanges([change]))
      return `Edited ${name}${by}${range ? `, ${range}` : ''}: ${counts}.`
    }
  }
}

function indentWords(line: string): string {
  const indent = /^[ \t]*/.exec(line)![0]
  const tabs = indent.split('').filter(c => c === '\t').length
  const spaces = indent.length - tabs
  if (tabs === 0 && spaces === 0) return 'no indent'
  const parts = [tabs > 0 ? plural(tabs, 'tab') : '', spaces > 0 ? plural(spaces, 'space') : ''].filter(p => p !== '')

  return parts.join(' and ')
}

// Names the words that differ between two short lines, or null when the
// lines share too little for that to help.
export function wordsChanged(before: string, after: string): string | null {
  if (before.length > 160 || after.length > 160) return null
  const split = (s: string) => s.match(/\w+|\s+|[^\w\s]+/g) ?? []
  const a = split(before)
  const b = split(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  const shared = [...a.slice(0, start), ...a.slice(a.length - end)].join('').trim()
  if (shared === '') return null
  const gone = a.slice(start, a.length - end).join('').trim()
  const came = b.slice(start, b.length - end).join('').trim()
  if (gone.length > 60 || came.length > 60) return null
  if (gone === '' && came === '') return null
  if (gone === '') return `Words added: "${came}".`
  if (came === '') return `Words removed: "${gone}".`

  return `Words changed: "${gone}" became "${came}".`
}

// The lines that say one entry. The code is kept exactly as written.
export function describeEntry(entry: Entry): string[] {
  switch (entry.kind) {
    case 'context':
      return [entry.text.trim() === '' ? `Unchanged line ${entry.line}, empty.` : `Unchanged line ${entry.line}: ${entry.text}`]
    case 'added':
      return [entry.text.trim() === '' ? `Added line ${entry.line}, empty.` : `Added line ${entry.line}: ${entry.text}`]
    case 'removed':
      return [entry.text.trim() === '' ? `Removed, was line ${entry.line}, empty.` : `Removed, was line ${entry.line}: ${entry.text}`]
    case 'changed': {
      const { line, before, after } = entry
      if (before.trimEnd() === after.trimEnd()) return [`Changed line ${line}, spaces at the end of the line only.`]
      if (before.trim() === after.trim() && before.trim() !== '') {
        return [`Changed line ${line}, indent only, ${indentWords(before)} became ${indentWords(after)}: ${after.trim()}`]
      }
      const words = wordsChanged(before, after)
      return [`Changed line ${line}.`, `Before: ${before}`, `After: ${after}`, ...(words ? [words] : [])]
    }
  }
}

const SCOPES: readonly [RegExp, string][] = [
  [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$-]*)/i, 'function'],
  [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/, 'function'],
  [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, 'function'],
  [/^\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)/, 'function'],
  [/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, 'function'],
  [/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class'],
]

// The function, class or heading a line sits in, read from the lines of
// the file before it: the nearest one indented less than the line.
export function findScope(lines: readonly string[], index: number): string | undefined {
  const target = lines[index] ?? ''
  const indent = /^[ \t]*/.exec(target)![0].length
  for (let i = Math.min(index, lines.length - 1); i >= 0 && i > index - 400; i--) {
    const line = lines[i]!
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) return `section ${heading[1]}`
    const own = /^[ \t]*/.exec(line)![0].length
    if (i !== index && own >= indent) continue
    for (const [pattern, word] of SCOPES) {
      const match = pattern.exec(line)
      if (match) return `${word} ${match[1]}`
    }
  }

  return undefined
}

// The scope from the text git prints after a hunk's @@ marks.
export function scopeFromHeader(text: string): string | undefined {
  for (const [pattern, word] of SCOPES) {
    const match = pattern.exec(text)
    if (match) return `${word} ${match[1]}`
  }
  const heading = /^#{1,6}\s+(.+)$/.exec(text.trim())

  return heading ? `section ${heading[1]}` : undefined
}

function isHunk(value: unknown): value is DiffHunk {
  if (typeof value !== 'object' || value === null) return false
  const h = value as Record<string, unknown>

  return ['oldStart', 'oldLines', 'newStart', 'newLines'].every(k => typeof h[k] === 'number') && Array.isArray(h.lines) && h.lines.every(l => typeof l === 'string')
}

function withScopes(hunks: DiffHunk[], original: string | null): DiffHunk[] {
  if (original === null) return hunks
  const lines = splitLines(original)

  return hunks.map(h => {
    const entries = hunkEntries(h)
    const first = h.lines.findIndex(l => l[0] === '-' || l[0] === '+')
    const contextBefore = first < 0 ? 0 : first
    const index = h.oldStart - 1 + contextBefore
    const scope = entries.length > 0 ? findScope(lines, Math.max(0, Math.min(index, lines.length - 1))) : undefined
    return scope ? { ...h, scope } : h
  })
}

function createHunks(content: string): { hunks: DiffHunk[]; note?: string } {
  const lines = splitLines(content)
  const shown = lines.slice(0, MAX_NEW_FILE_LINES)
  const hunk: DiffHunk = { oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: shown.map(l => `+${l}`) }
  const note = lines.length > shown.length ? `Only the first ${MAX_NEW_FILE_LINES} of its ${lines.length} lines are listed. Open the file to read the rest.` : undefined

  return note ? { hunks: [hunk], note } : { hunks: [hunk] }
}

// A change from the Edit or Write tool's result record, or null when the
// record is not one or nothing changed.
export function changeFromResult(tool: string, result: unknown, turn: number, isAgent: boolean): FileChange | null {
  if (tool !== 'Edit' && tool !== 'Write') return null
  if (typeof result !== 'object' || result === null) return null
  const r = result as Record<string, unknown>
  if (typeof r.filePath !== 'string') return null
  const path = r.filePath
  const patch = Array.isArray(r.structuredPatch) ? r.structuredPatch.filter(isHunk) : []
  const original = typeof r.originalFile === 'string' ? r.originalFile : null
  const base = { path, turn, isAgent }

  if (tool === 'Write') {
    const content = typeof r.content === 'string' ? r.content : ''
    if (r.type === 'create') return { ...base, kind: 'create', ...createHunks(content) }
    if (content === '' && original !== '') return { ...base, kind: 'emptied', hunks: [] }
    if (patch.length === 0) return original === null ? { ...base, kind: 'rewrite', hunks: [] } : null
  }
  if (patch.length === 0) return null

  return { ...base, kind: 'edit', hunks: withScopes(patch, original) }
}

// The change an edit would make, worked out before it runs, for a preview.
// One hunk from the first to the last line that differs.
export function diffTexts(path: string, before: string | null, after: string, turn = 0): FileChange | null {
  if (before === null) return { path, turn, isAgent: false, kind: 'create', ...createHunks(after) }
  if (after === '' && before !== '') return { path, turn, isAgent: false, kind: 'emptied', hunks: [] }
  const a = splitLines(before)
  const b = splitLines(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  if (start === a.length && start === b.length) return null
  const around = 3
  const from = Math.max(0, start - around)
  const tail = Math.min(end, around)
  const lines = [
    ...a.slice(from, start).map(l => ` ${l}`),
    ...a.slice(start, a.length - end).map(l => `-${l}`),
    ...b.slice(start, b.length - end).map(l => `+${l}`),
    ...a.slice(a.length - end, a.length - end + tail).map(l => ` ${l}`),
  ]
  const oldLines = a.length - end + tail - from
  const newLines = b.length - end + tail - from
  const hunk: DiffHunk = { oldStart: from + 1, oldLines, newStart: from + 1, newLines, lines }

  return { path, turn, isAgent: false, kind: 'edit', hunks: withScopes([hunk], before) }
}

// What an Edit call would leave in the file, or null when its text is not there.
export function applyEdit(content: string, oldString: string, newString: string, replaceAll: boolean): string | null {
  if (oldString === '') return null
  const index = content.indexOf(oldString)
  if (index < 0) return null
  if (replaceAll) return content.split(oldString).join(newString)

  return content.slice(0, index) + newString + content.slice(index + oldString.length)
}

// Reads `git diff` output into changes.
export function parseGitDiff(text: string): FileChange[] {
  const out: FileChange[] = []
  let file: FileChange | null = null
  let hunk: DiffHunk | null = null
  let oldPath = ''
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(raw)
      file = { path: match?.[2] ?? raw.slice(11), kind: 'edit', hunks: [], turn: 0, isAgent: false }
      out.push(file)
      hunk = null
      oldPath = match?.[1] ?? ''
      continue
    }
    if (file === null) continue
    if (hunk === null) {
      if (raw.startsWith('new file mode')) file.kind = 'create'
      else if (raw.startsWith('deleted file mode')) file.kind = 'deleted'
      else if (raw.startsWith('Binary files')) file.note = 'A binary file. Its contents are not shown.'
      else if (raw.startsWith('rename from ')) file.note = `Renamed from ${raw.slice(12)}.`
      else if (raw.startsWith('+++ ') && raw !== '+++ /dev/null') file.path = raw.slice(4).replace(/^b\//, '')
      else if (raw === '+++ /dev/null') file.path = oldPath
    }
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(raw)
    if (header) {
      const scope = scopeFromHeader(header[5] ?? '')
      hunk = {
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
        ...(scope ? { scope } : {}),
      }
      file.hunks.push(hunk)
      continue
    }
    if (hunk !== null && /^[ +\-\\]/.test(raw)) hunk.lines.push(raw)
  }

  // A deleted file is said in one line, not listed.
  return out.map(f => (f.kind === 'deleted' ? { ...f, hunks: [] } : f))
}

// The worded lines of one change, for the transcript or a report.
export function changeLines(change: FileChange, around: number): string[] {
  return change.hunks.flatMap(h => trimContext(hunkEntries(h), around).flatMap(describeEntry))
}

// The text drawn in the transcript under an edit.
export function rowText(change: FileChange, isSummaryOnly = false): string {
  const head = summary(change)
  if (isSummaryOnly || change.kind === 'emptied' || change.kind === 'rewrite' || change.kind === 'deleted') return head
  const lines = changeLines(change, 0)
  const changed = change.hunks.reduce((n, h) => n + hunkEntries(h).filter(e => e.kind !== 'context').length, 0)
  if (changed > ROW_LINES || change.note) return `${head}\nType /changes to read all of it.`

  return [head, ...lines].join('\n')
}

type FileGroup = { path: string; changes: FileChange[] }

function groupByFile(changes: readonly FileChange[]): FileGroup[] {
  const groups: FileGroup[] = []
  for (const change of changes) {
    const key = change.path.toLowerCase()
    const group = groups.find(g => g.path.toLowerCase() === key)
    if (group) group.changes.push(change)
    else groups.push({ path: change.path, changes: [change] })
  }

  return groups
}

export function relativePath(path: string, cwd: string): string {
  if (cwd === '') return path
  const root = cwd.replace(/[\\/]+$/, '')
  const isInside = path.toLowerCase().startsWith(`${root.toLowerCase()}\\`) || path.toLowerCase().startsWith(`${root.toLowerCase()}/`)

  return isInside ? path.slice(root.length + 1) : path
}

function fileSummary(group: FileGroup): string {
  const only = group.changes[0]!
  if (group.changes.length === 1 && only.kind !== 'edit') return summary(only)
  const counts = countText(countChanges(group.changes))
  const created = group.changes.some(c => c.kind === 'create') ? 'New file. ' : ''
  const how = group.changes.length > 1 ? `Changed in ${plural(group.changes.length, 'edit')}` : 'Edited'

  return `${created}${how}: ${counts}.`
}

export type ReportOptions = { title: string; cwd: string; context: number; footer?: string[] }

function changeCount(groups: readonly FileGroup[]): string {
  return groups.map((g, i) => `${i + 1}, ${baseName(g.path)}, ${plural(g.changes.reduce((n, c) => n + Math.max(1, c.hunks.length), 0), 'change')}`).join('. ')
}

// The change report, as plain text: one line per thing said.
export function reportText(changes: readonly FileChange[], options: ReportOptions): string {
  const groups = groupByFile(changes)
  const lines = [options.title]
  lines.push(`${plural(groups.length, 'file')} changed: ${countText(countChanges(changes))}.`)
  lines.push(`Files: ${changeCount(groups)}.`)
  if (groups.some(g => g.changes.length > 1)) {
    lines.push('Changes are listed in the order they were made. Line numbers are as they were at the time of each change.')
  }
  lines.push('Each file starts with a line beginning "File", and each change with a line beginning "Change".')

  groups.forEach((group, fileIndex) => {
    lines.push('')
    const agent = group.changes.some(c => c.isAgent) ? ' Some of it was changed by a helper agent.' : ''
    lines.push(`File ${fileIndex + 1} of ${groups.length}: ${relativePath(group.path, options.cwd)}. ${fileSummary(group)}${agent}`)
    const hunks = group.changes.flatMap(c => c.hunks.map(h => ({ change: c, hunk: h })))
    for (const change of group.changes) {
      if (change.kind === 'emptied' || change.kind === 'rewrite' || change.kind === 'deleted') lines.push(summary(change))
    }
    hunks.forEach(({ change, hunk }, i) => {
      const first = hunkEntries(hunk).find(e => e.kind !== 'context')
      const near = first ? `, near line ${first.line}` : ''
      const scope = hunk.scope ? `, in ${hunk.scope}` : ''
      const what = change.kind === 'create' ? ' New file' : ''
      lines.push(`Change ${i + 1} of ${hunks.length} in ${baseName(group.path)}${near}${scope}.${what ? `${what}, ${plural(hunk.newLines, 'line')}.` : ''}`)
      const entries = trimContext(hunkEntries(hunk), options.context)
      lines.push(...entries.flatMap(describeEntry))
      lines.push(`End of change ${i + 1}.`)
    })
    for (const change of group.changes) if (change.note) lines.push(change.note)
  })
  if (options.footer) lines.push('', ...options.footer)

  return lines.join('\n') + '\n'
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function entryHtml(entry: Entry): string {
  const code = (text: string) => `<code>${escapeHtml(text)}</code>`
  switch (entry.kind) {
    case 'context':
      return `<li class="same">Unchanged line ${entry.line}: ${code(entry.text)}</li>`
    case 'added':
      return `<li>Added line ${entry.line}: <ins>${code(entry.text)}</ins></li>`
    case 'removed':
      return `<li>Removed, was line ${entry.line}: <del>${code(entry.text)}</del></li>`
    case 'changed': {
      const [head, ...rest] = describeEntry(entry)
      if (rest.length === 0) return `<li>${escapeHtml(head!)}</li>`
      const words = rest[2] ? `<br>${escapeHtml(rest[2])}` : ''
      return `<li>${escapeHtml(head!)}<br>Before: <del>${code(entry.before)}</del><br>After: <ins>${code(entry.after)}</ins>${words}</li>`
    }
  }
}

// The same report as a web page: each file a heading level 2 and each
// change a heading level 3, so a screen reader can jump between them.
export function reportHtml(changes: readonly FileChange[], options: ReportOptions): string {
  const groups = groupByFile(changes)
  const body: string[] = [
    `<h1>${escapeHtml(options.title)}</h1>`,
    `<p>${escapeHtml(`${plural(groups.length, 'file')} changed: ${countText(countChanges(changes))}.`)}</p>`,
    '<nav aria-label="Files"><ol>',
    ...groups.map((g, i) => `<li><a href="#file-${i + 1}">${escapeHtml(relativePath(g.path, options.cwd))}</a></li>`),
    '</ol></nav>',
  ]
  groups.forEach((group, fileIndex) => {
    body.push(`<section><h2 id="file-${fileIndex + 1}">File ${fileIndex + 1} of ${groups.length}: ${escapeHtml(relativePath(group.path, options.cwd))}</h2>`)
    body.push(`<p>${escapeHtml(fileSummary(group))}</p>`)
    for (const change of group.changes) {
      if (change.kind === 'emptied' || change.kind === 'rewrite' || change.kind === 'deleted') body.push(`<p>${escapeHtml(summary(change))}</p>`)
    }
    const hunks = group.changes.flatMap(c => c.hunks)
    hunks.forEach((hunk, i) => {
      const first = hunkEntries(hunk).find(e => e.kind !== 'context')
      const near = first ? `, near line ${first.line}` : ''
      const scope = hunk.scope ? `, in ${hunk.scope}` : ''
      body.push(`<h3>Change ${i + 1} of ${hunks.length}${near}${escapeHtml(scope)}</h3><ul>`)
      body.push(...trimContext(hunkEntries(hunk), options.context).map(entryHtml))
      body.push('</ul>')
    })
    for (const change of group.changes) if (change.note) body.push(`<p>${escapeHtml(change.note)}</p>`)
    body.push('</section>')
  })
  if (options.footer) body.push(...options.footer.map(line => `<p>${escapeHtml(line)}</p>`))

  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(options.title)}</title>`,
    '<style>',
    ':root { --bg: #ffffff; --fg: #1a1a1a; --ins: #dff5e1; --del: #fbe3e3; color-scheme: light dark; }',
    '@media (prefers-color-scheme: dark) { :root { --bg: #161616; --fg: #ececec; --ins: #173a1e; --del: #451a1a; } }',
    'body { background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; max-width: 70rem; margin: 0 auto; padding: 1rem; }',
    'code { white-space: pre-wrap; font-family: Consolas, monospace; }',
    'ins { background: var(--ins); text-decoration: none; } del { background: var(--del); }',
    'li { margin: 0.25rem 0; } .same { opacity: 0.8; }',
    '</style></head><body><main>',
    ...body,
    '</main></body></html>',
    '',
  ].join('\n')
}

// The files changed, in the order first changed, each with its last change.
export function filesOf(changes: readonly FileChange[]): FileChange[] {
  return groupByFile(changes).map(g => g.changes[g.changes.length - 1]!)
}

// The first line a change touches in the new file, or 1.
export function firstChangedLine(change: FileChange): number {
  for (const hunk of change.hunks) {
    const first = hunkEntries(hunk).find(e => e.kind !== 'context')
    if (first) return Math.max(1, first.line)
  }

  return 1
}
