// The window title Blind Claude sets in place of Claude Code's own, which
// flips a spinning symbol every second while Claude works.

export type TitleState = 'idle' | 'working' | 'waiting'

// Blind Claude sets the title only while CLAUDE_CODE_DISABLE_TERMINAL_TITLE
// stops Claude Code from writing it, or the two would fight. The installer
// turns that setting on.

// "Claude Code, my-project", led by "Working," while Claude works and by
// "Waiting for you," while it waits for a permission or an answer.
export function windowTitle(state: TitleState, cwd: string): string {
  const folder = cwd.split(/[\\/]/).filter(part => part !== '').pop() ?? ''
  const base = folder === '' ? 'Claude Code' : `Claude Code, ${folder}`
  if (state === 'working') return `Working, ${base}`
  if (state === 'waiting') return `Waiting for you, ${base}`

  return base
}

// Whether an environment variable is set to something that means on.
export function isEnvOn(value: string | undefined): boolean {
  return value !== undefined && !/^\s*(0|false|no|off)?\s*$/i.test(value)
}
