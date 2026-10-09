// Text cleaning for the screen and for speech.
// Pure functions: text in, text out, no engine calls, so they are easy to test.

import type { CleanMode } from './settings'

// Symbols that carry meaning become words. Order matters: longer first.
const WORDS: readonly [RegExp, string][] = [
  [/[\u2705\u2714\u2713\u2611]\uFE0F?/gu, ' done '],
  [/[\u274C\u274E\u2716\u2717\u2718]\uFE0F?/gu, ' failed '],
  [/\u26A0\uFE0F?/gu, ' warning '],
  [/\u2139\uFE0F?/gu, ' note '],
  [/\u23BF/gu, 'Result:'],
  [/\s*(?:\u2192|\u21D2|\u27F6|\u27F9|\u279C|\u2794|\u27A1\uFE0F?|\u21AA)\s*/gu, ' to '],
  [/\s*(?:\u2190|\u21D0|\u27F5|\u2B05\uFE0F?)\s*/gu, ' from '],
  [/\s*(?:\u2194|\u21D4|\u27F7)\s*/gu, ' and '],
  [/\u2026/gu, '...'],
  [/\s*\u2265\s*/gu, ' greater than or equal to '],
  [/\s*\u2264\s*/gu, ' less than or equal to '],
  [/\s*\u2260\s*/gu, ' not equal to '],
  [/\u00D7/gu, ' times '],
  [/(?<=\d)\s*\u2013\s*(?=\d)/gu, ' to '],
  [/\s*[\u2014\u2013]\s*/gu, ', '],
  [/[\u201C\u201D]/gu, '"'],
  [/[\u2018\u2019]/gu, "'"],
]

// A few common emoji, named for the "words" clean mode. Anything not
// listed here is removed like in the "on" mode.
const EMOJI_NAMES: Record<string, string> = {
  '\u{1F680}': 'rocket',
  '\u{1F389}': 'party',
  '\u{1F525}': 'fire',
  '\u{1F4A1}': 'idea',
  '\u{1F41B}': 'bug',
  '\u{1F4DD}': 'note',
  '\u{1F527}': 'wrench',
  '\u{1F528}': 'hammer',
  '\u{1F44D}': 'thumbs up',
  '\u{1F44E}': 'thumbs down',
  '\u{1F600}': 'smiling face',
  '\u{1F642}': 'smiling face',
  '\u{1F60A}': 'smiling face',
  '\u{1F622}': 'sad face',
  '\u{1F914}': 'thinking face',
  '\u2728': 'sparkles',
  '\u{1F4E6}': 'package',
  '\u{1F50D}': 'search',
  '\u{1F512}': 'locked',
  '\u{1F513}': 'unlocked',
  '\u{1F6A7}': 'under construction',
  '\u{1F6A8}': 'alert',
  '\u{1F4C1}': 'folder',
  '\u{1F4C4}': 'file',
  '\u2B50': 'star',
  '\u2764': 'heart',
}

// Removed outright, after the word swaps above.
const EMOJI = /(?:\p{Regional_Indicator}|\p{Extended_Pictographic})(?:[\u{1F3FB}-\u{1F3FF}]|\uFE0F|\u20E3)*(?:\u200D(?:\p{Extended_Pictographic})(?:[\u{1F3FB}-\u{1F3FF}]|\uFE0F)*)*/gu
const LEFTOVER_JOINERS = /[\uFE0E\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]/gu
const BOX_AND_BLOCKS = /[\u2500-\u259F]/gu
const BRAILLE = /[\u2800-\u28FF]/gu
const DINGBATS = /[\u2700-\u27BF\u2190-\u21FF\u2B00-\u2BFF]/gu
const SHAPES = /[\u25A0-\u25FF\u2022\u2023\u2043\u2219\u00B7]/gu

// Decorative bullets at the start of a line become a plain dash.
const BULLET = /^(\s*)(?:[*+\u2022\u25CF\u25CB\u25E6\u25AA\u25AB\u25A0\u25A1\u25B6\u25BA\u2023\u2043\u2219\u23FA]|-(?=\s))\s+/gmu

type Segment = { kind: 'text' | 'code'; text: string; lang: string }

// Splits markdown into prose and fenced code blocks.
export function splitFences(text: string): Segment[] {
  const out: Segment[] = []
  const lines = text.split('\n')
  let buffer: string[] = []
  let fence: { marker: string; lang: string } | null = null

  const flush = (kind: 'text' | 'code', lang = '') => {
    if (buffer.length > 0 || kind === 'code') out.push({ kind, text: buffer.join('\n'), lang })
    buffer = []
  }

  for (const line of lines) {
    const open = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line)
    if (fence === null && open) {
      flush('text')
      fence = { marker: open[1]!, lang: open[2] ?? '' }
      continue
    }
    if (fence !== null && line.trim().startsWith(fence.marker[0]!.repeat(fence.marker.length)) && line.trim().replace(/[`~]/g, '') === '') {
      flush('code', fence.lang)
      fence = null
      continue
    }
    buffer.push(line)
  }
  if (fence !== null) flush('code', fence.lang)
  else flush('text')

  return out
}

// Hides inline code from the prose rules, then puts it back.
function protectInline(text: string, fn: (prose: string) => string, restore: (code: string) => string): string {
  const saved: string[] = []
  const hidden = text.replace(/`[^`\n]+`/g, code => {
    saved.push(code)
    return `\u0000${saved.length - 1}\u0000`
  })

  return fn(hidden).replace(/\u0000(\d+)\u0000/g, (_, i: string) => restore(saved[Number(i)] ?? ''))
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line)
}

function isTableRule(line: string): boolean {
  return /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/.test(line)
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

function endSentence(text: string): string {
  return /[.!?:]$/.test(text) ? text : `${text}.`
}

// Markdown tables become one line per row, read with their column names.
export function linearizeTables(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const next = lines[i + 1]
    if (isTableRow(line) && next !== undefined && isTableRule(next)) {
      const header = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && isTableRow(lines[i]!)) {
        rows.push(cells(lines[i]!))
        i++
      }
      const rowWord = rows.length === 1 ? 'row' : 'rows'
      const colWord = header.length === 1 ? 'column' : 'columns'
      out.push(`Table with ${rows.length} ${rowWord} and ${header.length} ${colWord}: ${header.join(', ')}.`)
      rows.forEach((row, n) => {
        const parts = row.map((value, c) => {
          const name = header[c] ?? `Column ${c + 1}`
          return endSentence(`${name}: ${value === '' ? 'empty' : value}`)
        })
        out.push(`Row ${n + 1}. ${parts.join(' ')}`)
      })
      continue
    }
    out.push(line)
    i++
  }

  return out.join('\n')
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/gm, '$1')
    .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, '')
    .replace(/^([ \t]*)>[ \t]?/gm, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?![\w])/g, '$1$2')
}

function swapSymbols(text: string, mode: CleanMode): string {
  let out = text
  for (const [pattern, word] of WORDS) out = out.replace(pattern, word)
  if (mode === 'words') {
    out = out.replace(EMOJI, emoji => {
      const name = EMOJI_NAMES[emoji.replace(/[\uFE0F\u200D]/g, '')]
      return name ? ` ${name} ` : ' '
    })
  }

  return out
    .replace(EMOJI, ' ')
    .replace(LEFTOVER_JOINERS, '')
    .replace(BOX_AND_BLOCKS, ' ')
    .replace(BRAILLE, '')
    .replace(DINGBATS, ' ')
    .replace(SHAPES, ' ')
}

// Swaps symbols line by line, keeping each line's own indent, so a removed
// symbol at the start of a line does not leave a fake indent behind.
function swapAndTidy(text: string, mode: CleanMode): string {
  return text
    .replace(BULLET, '$1- ')
    .split('\n')
    .map(line => {
      const indent = /^[ \t]*/.exec(line)![0]
      const body = swapSymbols(line.slice(indent.length), mode)
        .trim()
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ +([,.;:!?])/g, '$1')
        .replace(/^,\s*/, '')
        .replace(/,(\s*,)+/g, ',')
        .trimEnd()
      return body === '' ? '' : indent + body
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

function cleanProse(text: string, mode: CleanMode): string {
  return protectInline(
    text,
    prose => swapAndTidy(stripMarkdown(linearizeTables(prose)), mode),
    code => code,
  )
}

// Cleans text for the screen. Code blocks and inline code are left exactly as written.
export function cleanForDisplay(text: string, mode: CleanMode = 'on'): string {
  if (mode === 'off') return text

  return splitFences(text)
    .map(seg => (seg.kind === 'code' ? fenceBack(seg) : cleanProse(seg.text, mode)))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

function fenceBack(seg: Segment): string {
  return '```' + seg.lang + '\n' + seg.text + '\n```'
}

function describeCode(seg: Segment): string {
  const count = seg.text === '' ? 0 : seg.text.split('\n').length
  const lines = count === 1 ? '1 line' : `${count} lines`
  const lang = seg.lang ? `${seg.lang}, ` : ''

  return `Code block, ${lang}${lines}.`
}

const ABBREVIATIONS: readonly [RegExp, string][] = [
  [/\be\.g\.,?/gi, 'for example,'],
  [/\bi\.e\.,?/gi, 'that is,'],
  [/\betc\./gi, 'and so on.'],
  [/\bvs\.?(?=\s)/gi, 'versus'],
]

function speakPaths(text: string): string {
  return text
    .replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/g, '$1')
    .replace(/\bhttps?:\/\/(?:www\.)?([^\s/)>\]]+)[^\s)>\]]*/g, 'link to $1')
    .replace(/(?:[A-Za-z]:[\\/])?(?:[\w.@~-]+[\\/])+([\w@-][\w.@-]*\.\w+)/g, '$1')
}

// Cleans text for the voice. Goes further than display: code blocks are
// described instead of read, paths become file names, links become site names.
export function cleanForSpeech(text: string): string {
  const spoken = splitFences(text)
    .map(seg => {
      if (seg.kind === 'code') return describeCode(seg)
      let prose = cleanProse(seg.text, 'words')
      prose = prose.replace(/`([^`\n]+)`/g, '$1')
      prose = speakPaths(prose)
      for (const [pattern, word] of ABBREVIATIONS) prose = prose.replace(pattern, word)
      return prose.replace(/^(\s*)- /gm, '$1')
    })
    .join('\n')

  return spoken
    .replace(/([!?.,;:])\1+/g, '$1')
    .replace(/[*_#|`~<>{}[\]\\^]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}
