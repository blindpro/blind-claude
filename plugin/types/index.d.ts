// Blind Claude's session state: the values the engine keeps for the
// session, so a reload of the mod in the middle of a session loses nothing.

// One hunk of a diff, as Claude Code's structuredPatch gives it: each line
// starts with a space, a plus or a minus. `scope` names the function or
// section the change is in, when one was found.
export type DiffHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
  scope?: string
}

// One change to one file: an edit, a new file, a file emptied, a file
// rewritten too large to compare, or a file deleted.
export type FileChange = {
  path: string
  kind: 'edit' | 'create' | 'emptied' | 'rewrite' | 'deleted'
  hunks: DiffHunk[]
  // The turn it was made in, counted from 1 in this session.
  turn: number
  // Made by a helper agent rather than Claude itself.
  isAgent: boolean
  // Something the report should say about it, such as lines left out.
  note?: string
}

// What the accessible dialog shows: the question, the choices, and an
// optional box to type an answer of one's own.
export type DialogOption = { key: string; label: string; spoken: string }
export type Dialog = {
  id: string
  title: string
  lines: string[]
  options: DialogOption[]
  input?: { label: string }
}

declare module 'claude-code' {
  interface PluginState {
    'blind-claude': {
      changes: Shaped<FileChange[]>
      turn: number
      dialog: Shaped<Dialog | null>
    }
  }
}
