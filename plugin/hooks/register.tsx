// Blind Claude: wires every feature to Claude Code's events.
//
// Everything that calls the engine ($) lives in this file, because the
// engine handle may not be passed into imported files. The imported files
// hold the pure logic: cleaning text, describing tools, settings.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Dialog, FileChange } from '../types'
import { cleanForDisplay, cleanForSpeech } from './clean'
import {
  applyEdit,
  changeFromResult,
  diffTexts,
  filesOf,
  firstChangedLine,
  parseGitDiff,
  relativePath,
  reportHtml,
  reportText,
  rowText,
  summary,
} from './diff'
import type { ReportOptions } from './diff'
import { ENGINE_ONLY_TOOLS, QUESTION_KEY, allowKey, answerOf, dialogSpeech, focusOrder, parseQuestions, permissionDialog, questionDialog, questionSpeech, wrapFocus } from './prompts'
import type { Question } from './prompts'
import { RESET_MESSAGE, choose, parseChoice, screenText } from './menu'
import type { MenuContext, Screen } from './menu'
import {
  CLEAN_MODES,
  SOUND_EVENTS,
  DEFAULTS,
  ENGINES,
  LEVELS,
  SETTINGS_KEY,
  clamp,
  describeSettings,
  editorName,
  sanitize,
} from './settings'
import type { CleanMode, Level, Settings, SoundEvent, SpeechEngine } from './settings'
import { SOUNDS_HELP, chooseSound, findSound, isPlayable, isSoundEvent, listText, overviewText, sortSounds } from './sounds'
import type { SoundFile } from './sounds'
import {
  MAX_SERVER_STARTS,
  SERVER_START_WINDOW_MS,
  describeExit,
  describeToolCall,
  describeToolResult,
  findVoice,
  formatDuration,
  mayStartServer,
  parseVoices,
  speaksAlerts,
  speaksFinalAnswer,
  speaksReplyBlocks,
  speaksToolCall,
  speaksToolResult,
  spoolName,
} from './speech'
import type { Voice } from './speech'
import { contextText, usageText } from './usage'

type Engine = EngineInterface


const PLAIN_WRITING = [
  'The person using this session is blind and uses a screen reader and text to speech.',
  'Write so your replies read well aloud:',
  '- Do not use emoji, arrows, check marks, box drawing or other decorative symbols.',
  '- Do not use markdown tables. Use a list, or one sentence per row, instead.',
  '- Use bold and italics rarely, and never for decoration.',
  '- Do not draw diagrams, trees or charts with characters. Describe them in words.',
  '- Use numbered lists for steps.',
  '- When pointing at code, name the file and line in words, such as "file clean.ts, line 40".',
].join('\n')

const HELP = [
  'Blind Claude commands:',
  '/speak all, most, some or none: choose how much is spoken.',
  '/speak auto, nvda or windows: who speaks. auto uses NVDA while it is running, otherwise the Windows voice.',
  '/speak stop: stop speaking now.',
  '/speak repeat: say the last reply again.',
  '/voices: list voices. /voices and a number or name: choose one. /voices test and a number or name: hear a sample.',
  '/rate and a number from -10 to 10, or faster or slower: set the speed.',
  '/volume and a number from 0 to 100: set the volume.',
  '/clean on, off or words: symbol cleaning.',
  '/sounds: sound cues for done, start, attention and error. /sounds help for details.',
  '/blind: open the settings menu. Type a number and press Enter to choose; 0 goes back.',
  '/speak, /voices, /rate, /volume, /clean or /sounds on their own open that part of the menu.',
  '/blind status: current settings in one list. /blind reset: back to defaults.',
  '/blind restart: start the speech server again if speech has stopped.',
  '/usage and /context are answered in plain sentences while symbol cleaning is on.',
  '/changes: open what Claude changed in the last turn in Notepad++ or Notepad. /changes help for more.',
  "/blind prompts on or off: permission prompts and Claude's questions in Blind Claude's dialog, or Claude Code's own.",
].join('\n')

const CHANGES_HELP = [
  'Change report commands:',
  '/changes: open what Claude changed in the last turn that changed files.',
  '/changes session: every change in this session.',
  '/changes and a number: one file from the last turn, such as /changes 2.',
  '/changes open and a number: open that file itself, at its first change.',
  '/changes git: every change since the last commit, from git.',
  '/changes preview: the change waiting for your permission.',
  '/changes auto on or off: open the report by itself after each turn that changes files.',
  '/changes before on or off: open the change before you approve an edit.',
  '/changes editor and auto, notepad++, notepad or the path of a program: which editor opens it.',
  '/changes view text or browser: a text file, or a web page with a heading for each file and change.',
  '/changes context and a number from 0 to 5: unchanged lines shown around each change.',
  '/changes rows full or summary: what edits show in the transcript.',
  '/changes settings: the changes menu.',
].join('\n')

// The pane the accessible dialog is drawn in.
const DIALOG_PANE = 'blind-dialog'

// Session state the engine keeps across a reload of the mod: every change
// made this session, the turn count, and what the dialog pane shows.
const changesState = atom({ plugin: 'blind-claude', key: 'changes' } as const, [] as FileChange[], { shape: 'changes-1' })
const turnState = atom({ plugin: 'blind-claude', key: 'turn' } as const, 0)
const dialogState = atom({ plugin: 'blind-claude', key: 'dialog' } as const, null as Dialog | null, { shape: 'dialog-1' })

type Command = Record<string, unknown>

// The Windows speech server. While it starts, commands wait in `queue` and
// are sent the moment it is ready, so nothing said during startup is lost.
type Server = {
  spool: string
  state: 'starting' | 'ready' | 'stopped'
  seq: number
  queue: Command[]
  ready: Promise<boolean>
  settle: (isReady: boolean) => void
}

// Module state. The engine may load the module afresh in the middle of a
// session (a reload, or its hooks worker replaced), which starts all of
// these over: settings are then read back from the store, and the speech
// server is started again the next time something is spoken.
let current: Settings = { ...DEFAULTS }
let hasSettings = false
let lastReply = ''
let bridge: Server | null = null
let isWindows: boolean | null = null
// When the speech server was started, to stop a server that cannot run
// from being started over and over.
let serverStarts: number[] = []
let voicesWaiter: ((json: string) => void) | null = null
// The engine the speech server last said it speaks with: nvda, windows or none.
let engineNow = ''
let engineWaiter: (() => void) | null = null
// The settings menu screen open now, or null when the menu is closed.
let menu: Screen | null = null
// The session's working folder, so reports can show paths inside it short.
let cwd = ''
// The change each pending Edit or Write would make, by its call, worked out
// before it runs, and the latest one, for /changes preview.
const previews = new Map<string, FileChange>()
let lastPreview: FileChange | null = null
// What "allow for the rest of this session" allowed (see allowKey).
const allowedThisSession = new Set<string>()
// The file the open dialog's answer is written into, and whether its pane is open.
let answerPath: string | null = null
let isDialogOpen = false
// The stop the dialog's focus is on, and whether the pane has a text box,
// so the focus can wrap past Claude Code's own stops (see wrapFocus).
let dialogFocus: string | null = null
let dialogHasInput = false
// One dialog at a time: the next waits for the one before to be answered.
let dialogQueue: Promise<unknown> = Promise.resolve()

async function loadSettings($: Engine): Promise<void> {
  if (hasSettings) return
  current = { ...DEFAULTS, ...sanitize(await $.store.get(SETTINGS_KEY)) }
  hasSettings = true
}

async function saveSettings($: Engine, change: Partial<Settings>): Promise<void> {
  await loadSettings($)
  current = { ...current, ...change }
  await $.store.set(SETTINGS_KEY, current)
}

function voiceConfig(): Command[] {
  const config = { op: 'config', engine: current.engine, voice: current.voice ?? '', rate: current.rate, volume: current.volume }

  return current.voice === null ? [{ op: 'default-voice' }, config] : [config]
}

async function writeCommand($: Engine, server: Server, command: Command): Promise<boolean> {
  const name = spoolName(await $.clock.now(), server.seq++)
  try {
    await $.fs.write(`${server.spool}\\${name}`, JSON.stringify(command))
    return true
  } catch (error) {
    $.ui.log(`Blind Claude could not reach the speech server: ${String(error)}`, { to: 'debug' })
    return false
  }
}

// The running or starting speech server, started now if it is not running.
// Null where there is none: not Windows, or it keeps stopping.
async function ensureServer($: Engine): Promise<Server | null> {
  if (isWindows === null) isWindows = (await $.env.get('OS')) === 'Windows_NT'
  if (!isWindows) return null
  if (bridge !== null && bridge.state !== 'stopped') return bridge
  if (!mayStartServer(serverStarts, await $.clock.now())) return null

  return startSpeechServer($)
}

// Sends one command to the Windows speech server, starting it if need be.
// False when there is no server to send it to.
async function sendToServer($: Engine, command: Command): Promise<boolean> {
  const server = await ensureServer($)
  if (server === null) return false
  if (server.state === 'ready') return writeCommand($, server, command)
  server.queue.push(command)
  if (server.queue.length > 50) server.queue.shift()

  return true
}

async function sendVoiceConfig($: Engine): Promise<void> {
  for (const command of voiceConfig()) await sendToServer($, command)
}

// Speaks text through the speech server, or Claude Code's own speech where
// the server is not running. Never waits for the speech to finish.
async function speak($: Engine, text: string, options: { interrupt?: boolean; isRaw?: boolean } = {}): Promise<void> {
  const spoken = options.isRaw ? text : cleanForSpeech(text)
  if (spoken.trim() === '') return
  const isSent = await sendToServer($, { op: 'speak', text: spoken, interrupt: options.interrupt === true })
  if (isSent) return
  void $.audio.speak(spoken, current.voice ? { voice: current.voice } : undefined).catch(() => undefined)
}

async function stopSpeech($: Engine): Promise<void> {
  await sendToServer($, { op: 'stop' })
}

async function resetSettings($: Engine): Promise<void> {
  current = { ...DEFAULTS }
  await $.store.set(SETTINGS_KEY, current)
  await sendVoiceConfig($)
  $.ui.invalidate('ui.render')
}

// Where the person's own sounds live, outside the plugin folder so they
// survive updates and reinstalls.
async function customSoundRoot($: Engine): Promise<string | null> {
  const base = (await $.env.get('LOCALAPPDATA')) ?? (await $.env.get('APPDATA'))

  return base ? `${base}\\BlindClaude\\sounds` : null
}

async function listFolder($: Engine, folder: string, isCustom: boolean): Promise<SoundFile[]> {
  try {
    const entries = await $.fs.list(folder)
    return entries
      .filter(entry => entry.kind === 'file' && isPlayable(entry.name))
      .map(entry => ({ name: entry.name, path: `${folder}\\${entry.name}`, isCustom }))
  } catch {
    return []
  }
}

async function soundFiles($: Engine, event: SoundEvent): Promise<SoundFile[]> {
  const builtIn = await listFolder($, `${$.plugin.root}\\sounds\\${event}`, false)
  const root = await customSoundRoot($)
  const custom = root === null ? [] : await listFolder($, `${root}\\${event}`, true)

  return sortSounds([...builtIn, ...custom])
}

async function playFile($: Engine, file: SoundFile): Promise<void> {
  const isSent = await sendToServer($, { op: 'play', path: file.path })
  if (isSent || file.isCustom) return
  const relative = file.path.slice($.plugin.root.length + 1).replace(/\\/g, '/')
  void $.audio.play({ asset: relative }).catch(() => undefined)
}

async function playSound($: Engine, event: SoundEvent): Promise<void> {
  const choice = current.soundEvents[event]
  if (!current.sounds || !choice.isOn) return
  const file = chooseSound(await soundFiles($, event), choice.pick, Math.random())
  if (file) await playFile($, file)
}

async function runSoundScript($: Engine, args: string[]): Promise<string> {
  const script = `${$.plugin.root}\\scripts\\sound-files.ps1`
  const ran = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { timeoutMs: 60_000 })

  return ran.stdout.trim().split('\n').pop()?.trim() ?? ''
}

async function requestVoices($: Engine): Promise<Voice[] | null> {
  const server = await ensureServer($)
  if (server === null) return null
  // A server that is still starting gets a few seconds to finish.
  if (server.state === 'starting') {
    const isReady = await Promise.race([server.ready, $.clock.sleep(4000).then(() => false)])
    if (!isReady) return null
  }
  const answer = new Promise<string>(resolve => {
    voicesWaiter = resolve
  })
  if (!(await sendToServer($, { op: 'voices' }))) return null
  const timeout = $.clock.sleep(4000).then(() => null)
  const json = await Promise.race([answer, timeout])
  voicesWaiter = null

  return json === null ? null : parseVoices(json)
}

// Starts the speech server. It runs until the session ends or the module is
// unloaded. If it stops on its own it is started again straight away, up to
// MAX_SERVER_STARTS times in a few minutes; past that the person is told,
// and /blind restart tries again.
async function startSpeechServer($: Engine): Promise<Server | null> {
  const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMP'))
  if (!temp) return null
  const now = await $.clock.now()
  serverStarts = [...serverStarts.filter(at => now - at < SERVER_START_WINDOW_MS), now]
  let settle: (isReady: boolean) => void = () => undefined
  const ready = new Promise<boolean>(resolve => {
    settle = resolve
  })
  engineNow = ''
  const spool = `${temp}\\blind-claude\\${Math.floor(now)}`
  const server: Server = { spool, state: 'starting', seq: 0, queue: voiceConfig(), ready, settle }
  bridge = server
  const script = `${$.plugin.root}\\scripts\\speech-server.ps1`

  void (async () => {
    let pending = ''
    let errors = ''
    let stopReason = ''
    let code: number | null = null
    try {
      const child = $.process.spawn({
        argv: ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Spool', spool],
      })
      for await (const chunk of child) {
        if (chunk.stream === 'stderr') errors = (errors + chunk.text).slice(-2000)
        if (chunk.stream !== 'stdout') continue
        pending += chunk.text
        let end = pending.indexOf('\n')
        while (end >= 0) {
          const line = pending.slice(0, end).trim()
          pending = pending.slice(end + 1)
          end = pending.indexOf('\n')
          if (line === 'READY') {
            server.state = 'ready'
            const queued = server.queue
            server.queue = []
            for (const command of queued) await writeCommand($, server, command)
            server.settle(true)
          } else if (line.startsWith('ENGINE ')) {
            engineNow = line.slice('ENGINE '.length)
            engineWaiter?.()
          } else if (line.startsWith('VOICES ')) {
            voicesWaiter?.(line.slice('VOICES '.length))
          } else if (line.startsWith('STOP ')) {
            stopReason = line.slice('STOP '.length)
          } else if (line.startsWith('ERROR ')) {
            $.ui.log(`Blind Claude speech: ${line.slice('ERROR '.length)}`)
          }
        }
      }
      code = (await child.result).code
    } catch (error) {
      errors = `${errors}\n${String(error)}`
    }
    server.state = 'stopped'
    server.settle(false)
    // A newer server replaced this one, so its end is expected.
    if (bridge !== server) return
    const reason = describeExit(code, stopReason, errors)
    if (mayStartServer(serverStarts, await $.clock.now())) {
      $.ui.log(`Blind Claude speech server stopped (${reason}). Starting it again.`, { to: 'debug' })
      await startSpeechServer($)
    } else {
      $.ui.log(`Blind Claude speech server stopped (${reason}). It stopped ${MAX_SERVER_STARTS} times in a few minutes, so speech is off for now. Type /blind restart to try again.`)
    }
  })()

  return server
}

// NVDA may have started or closed since the server last spoke, so ask it
// which engine it would use now, waiting a moment for the answer.
async function refreshEngine($: Engine): Promise<void> {
  if (bridge?.state !== 'ready') return
  const answer = new Promise<void>(resolve => {
    engineWaiter = resolve
  })
  if (await writeCommand($, bridge, { op: 'engine' })) await Promise.race([answer, $.clock.sleep(1500)])
  engineWaiter = null
}

function engineName(): string {
  if (isWindows === false) return 'Claude Code built in speech'
  if (bridge?.state === 'ready') {
    if (engineNow === 'nvda') return 'NVDA'
    if (engineNow === 'windows') return 'Windows voice'
    if (engineNow === 'none') return current.engine === 'nvda' ? 'NVDA, not running, so nothing is spoken' : 'none available'
    return 'speech server'
  }
  if (bridge?.state === 'starting') return 'speech server, starting'

  return 'speech server stopped. Type /blind restart to start it'
}

// Fetches only what the screen needs: voices for the voice list (and for
// opening it from the main screen), sound files for one event.
async function menuContext($: Engine, screen: Screen, needsVoices = false): Promise<MenuContext> {
  const voices = screen.kind === 'voice' || needsVoices ? await requestVoices($) : null
  const files = screen.kind === 'event' ? await soundFiles($, screen.event) : []
  if (screen.kind === 'main') await refreshEngine($)

  return { settings: current, engine: engineName(), voices, files }
}

// Opens a menu screen: its text, after an optional message, shown and spoken.
async function showScreen($: Engine, screen: Screen, message?: string): Promise<string> {
  menu = screen
  const body = screenText(screen, await menuContext($, screen))
  const text = message ? `${message}\n${body}` : body
  if (current.level !== 'none') await speak($, text, { interrupt: true, isRaw: true })

  return text
}

async function applyChange($: Engine, change: Partial<Settings>): Promise<void> {
  await saveSettings($, change)
  if ('engine' in change || 'voice' in change || 'rate' in change || 'volume' in change) await sendVoiceConfig($)
  if ('clean' in change) $.ui.invalidate('ui.render')
  if (change.level === 'none') await stopSpeech($)
}

// Answers a number typed while the menu is open.
async function answerMenu($: Engine, screen: Screen, choice: number): Promise<string> {
  const answer = choose(screen, choice, await menuContext($, screen, screen.kind === 'main' && choice === 3))
  if (answer.kind === 'close') {
    menu = null
    if (current.level !== 'none') await speak($, 'Menu closed.', { interrupt: true, isRaw: true })
    return 'Settings menu closed.'
  }
  if (answer.kind === 'open') return showScreen($, answer.screen, answer.message)
  if (answer.kind === 'changes-report') {
    const changes = await lastTurnChanges($)
    const message = changes.length === 0 ? 'Claude has not changed any files in this session yet.' : await openReport($, changes, 'Blind Claude change report for the last turn that changed files.')
    return showScreen($, screen, message)
  }
  if (answer.kind === 'reset') {
    await resetSettings($)
    return showScreen($, answer.screen, RESET_MESSAGE)
  }
  await applyChange($, answer.change)
  if (answer.play) await playFile($, answer.play)

  return showScreen($, answer.screen, answer.message)
}

// Runs open-changes.ps1. Answers the editor's name and the path opened,
// or the error in words.
async function openInEditor($: Engine, path: string, options: { editor: string; line?: number; isReport?: boolean }): Promise<{ editor: string; path: string } | { error: string }> {
  const script = `${$.plugin.root}\\scripts\\open-changes.ps1`
  const args = ['-Path', path, '-Editor', options.editor, ...(options.line ? ['-Line', String(options.line)] : []), ...(options.isReport ? ['-Report'] : [])]
  try {
    const ran = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { timeoutMs: 30_000 })
    const line = ran.stdout.trim().split('\n').pop()?.trim() ?? ''
    if (line.startsWith('OK ')) {
      const [editor = 'the editor', opened = path] = line.slice(3).split('|')
      return { editor, path: opened }
    }
    return { error: line.replace(/^ERROR /, '') || ran.stderr.trim() || 'unknown error' }
  } catch (error) {
    return { error: String(error) }
  }
}

// Writes a change report and opens it. Answers what to tell the person.
async function openReport($: Engine, changes: readonly FileChange[], title: string, footer?: string[]): Promise<string> {
  const base = (await $.env.get('LOCALAPPDATA')) ?? (await $.env.get('APPDATA'))
  if (!base) return 'Could not find your local app data folder to save the change report in.'
  const isPage = current.changes.view === 'browser'
  const options: ReportOptions = { title, cwd, context: current.changes.context, ...(footer ? { footer } : {}) }
  const path = `${base}\\BlindClaude\\changes\\report-${Math.floor(await $.clock.now())}.${isPage ? 'html' : 'txt'}`
  await $.fs.write(path, isPage ? reportHtml(changes, options) : reportText(changes, options))
  const opened = await openInEditor($, path, { editor: isPage ? 'browser' : current.changes.editor, isReport: true })
  if ('error' in opened) return `Could not open the change report: ${opened.error}. It is saved at ${path}.`
  const files = filesOf(changes).length

  return `The change report opened in ${opened.editor}. It covers ${files === 1 ? '1 file' : `${files} files`}. If you do not hear it, press Alt Tab to reach it.`
}

async function sessionChanges($: Engine): Promise<FileChange[]> {
  return (await read($, changesState)) ?? []
}

// The changes of the last turn that changed files.
async function lastTurnChanges($: Engine): Promise<FileChange[]> {
  const all = await sessionChanges($)
  const last = all[all.length - 1]

  return last === undefined ? [] : all.filter(c => c.turn === last.turn)
}

function inputField(input: unknown, key: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[key]

  return typeof value === 'string' ? value : undefined
}

// Works out the change an Edit or Write will make, before it runs, so the
// permission dialog can say it and /changes preview can show it.
async function preparePreview($: Engine, tool: string, input: unknown, id: string | undefined): Promise<FileChange | null> {
  const path = inputField(input, 'file_path')
  if (!path) return null
  let before: string | null = null
  try {
    before = await $.fs.read(path)
  } catch {
    before = null
  }
  const turn = (await read($, turnState)) ?? 0
  let preview: FileChange | null = null
  if (tool === 'Edit') {
    if (before === null) return null
    const after = applyEdit(before, inputField(input, 'old_string') ?? '', inputField(input, 'new_string') ?? '', (input as { replace_all?: unknown }).replace_all === true)
    preview = after === null ? null : diffTexts(path, before, after, turn)
  } else if (tool === 'Write') {
    preview = diffTexts(path, before, inputField(input, 'content') ?? '', turn)
  }
  if (preview === null) return null
  lastPreview = preview
  if (id !== undefined) previews.set(id, preview)

  return preview
}

// Undoes the escaping wait-answer.ps1 puts on a typed answer's newlines.
function decodeAnswer(text: string): string {
  return text.replace(/\\(\\|n)/g, (_, c: string) => (c === 'n' ? '\n' : '\\'))
}

function sendAnswer($: Engine, answer: string): void {
  if (answerPath === null) return
  void $.fs.write(answerPath, `${answer}\nEND`).catch(() => undefined)
}

async function closeDialog($: Engine): Promise<void> {
  answerPath = null
  if (!isDialogOpen) return
  isDialogOpen = false
  await update($, dialogState, () => null)
  await $.ui.close({ id: DIALOG_PANE })
}

// Shows `dialog` in the dialog pane, opening the pane if it is not open,
// and waits for one answer: a choice's key, "text:" and what was typed, or
// "cancel". Null when the pane cannot be shown, such as on a narrow terminal.
async function askDialog($: Engine, dialog: Dialog, signal: AbortSignal, isNew: boolean): Promise<string | null> {
  const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMP'))
  if (!temp) return null
  const path = `${temp}\\blind-claude\\answers\\${dialog.id.replace(/[^\w-]/g, '_')}.txt`
  answerPath = path
  await update($, dialogState, () => dialog)
  if (!isDialogOpen) {
    const rows = dialog.lines.length + dialog.options.length + (dialog.input ? 2 : 0) + 2
    const opened = await $.ui.open({ id: DIALOG_PANE, title: 'Blind Claude', focus: true, closeOnEscape: true, holdToasts: true, rows })
    isDialogOpen = true
    if (!opened.isPlaced) {
      $.ui.log(`Blind Claude could not show its dialog (${opened.reason}), so Claude Code's own is shown.`, { to: 'debug' })
      await closeDialog($)
      return null
    }
  }
  if (isNew) {
    dialogFocus = QUESTION_KEY
    await playSound($, 'attention')
    if (current.level !== 'none') await speak($, dialogSpeech(dialog), { interrupt: true, isRaw: true })
  }
  const script = `${$.plugin.root}\\scripts\\wait-answer.ps1`
  const onAbort = () => sendAnswer($, 'cancel')
  signal.addEventListener('abort', onAbort)
  try {
    while (true) {
      const ran = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Path', path], { timeoutMs: 600_000 })
      const line = ran.stdout.split('\n').map(l => l.trim()).find(l => l.startsWith('ANSWER '))
      if (line !== undefined) return decodeAnswer(line.slice('ANSWER '.length))
      if (signal.aborted) return 'cancel'
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

// Runs `work` once every dialog before it has been answered.
function oneDialogAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = dialogQueue.then(work, work)
  dialogQueue = run.catch(() => undefined)

  return run
}

type PermissionAnswer = { decision: 'allow' } | { decision: 'deny'; reason: string } | null

// Asks for permission in the dialog. Null leaves it to Claude Code's own prompt.
async function askPermission($: Engine, id: string, tool: string, input: unknown, reason: string | undefined, preview: FileChange | undefined, signal: AbortSignal): Promise<PermissionAnswer> {
  const dialog = permissionDialog(`permission-${id}`, tool, cleanInput(input), reason, preview ? summary(preview) : undefined)
  let isNew = true
  try {
    while (true) {
      const answer = await askDialog($, dialog, signal, isNew)
      isNew = false
      if (answer === null || answer === 'engine') return null
      if (answer === 'read' && preview) {
        await openReport($, [preview], 'Blind Claude: the change Claude wants to make. It has not been made yet.')
        continue
      }
      if (answer === 'yes') return { decision: 'allow' }
      if (answer === 'always') {
        allowedThisSession.add(allowKey(tool, input))
        return { decision: 'allow' }
      }
      if (answer.startsWith('text:')) return { decision: 'deny', reason: `The user declined this tool call, and said: ${answer.slice(5)}` }
      return { decision: 'deny', reason: "The user declined this tool call in Blind Claude's permission dialog." }
    }
  } finally {
    await closeDialog($)
  }
}

// Claude's questions, one at a time. Answers the AskUserQuestion result's
// answers, "engine" for Claude Code's own dialog, or "cancel".
async function askQuestions($: Engine, id: string, questions: readonly Question[], shown: readonly Question[], signal: AbortSignal): Promise<Record<string, string> | 'engine' | 'cancel'> {
  const answers: Record<string, string> = {}
  try {
    for (let index = 0; index < questions.length; index++) {
      const question = questions[index]!
      const chosen = new Set<number>()
      let isNew = true
      while (true) {
        const answer = await askDialog($, questionDialog(`question-${id}-${index}`, shown, index, chosen), signal, isNew)
        isNew = false
        if (answer === null || answer === 'engine') return 'engine'
        if (answer === 'cancel') return 'cancel'
        if (answer.startsWith('text:')) {
          answers[question.question] = answer.slice(5)
          break
        }
        if (answer === 'done') {
          answers[question.question] = answerOf(question, [...chosen].sort((a, b) => a - b))
          break
        }
        const pick = /^opt-(\d+)$/.exec(answer)
        if (!pick) continue
        const n = Number(pick[1])
        if (!question.multiSelect) {
          answers[question.question] = answerOf(question, [n])
          break
        }
        if (chosen.has(n)) chosen.delete(n)
        else chosen.add(n)
        const label = shown[index]?.options[n]?.label ?? ''
        await speak($, `${chosen.has(n) ? 'Chosen' : 'Not chosen'}, ${label}.`, { interrupt: true, isRaw: true })
      }
    }
  } finally {
    await closeDialog($)
  }

  return answers
}

// Cleans the symbols out of every string a dialog will show.
function cleanInput(input: unknown): unknown {
  if (typeof input === 'string') return cleanForDisplay(input, 'on')
  if (Array.isArray(input)) return input.map(cleanInput)
  if (typeof input === 'object' && input !== null) {
    return Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([k, v]) => [k, k === 'command' || k.endsWith('_string') || k === 'content' ? v : cleanInput(v)]))
  }

  return input
}

function word(args: string): [string, string] {
  const trimmed = args.trim()
  const space = trimmed.search(/\s/)

  return space < 0 ? [trimmed.toLowerCase(), ''] : [trimmed.slice(0, space).toLowerCase(), trimmed.slice(space + 1).trim()]
}

const commandFailed = () => ({ text: 'That Blind Claude command failed. Type /blind help for the list of commands.' })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = started.cwd
    hasSettings = false
    await loadSettings($)

    const commands = [
      { name: 'speak', description: 'Blind Claude: set how much is spoken and who speaks, or stop and repeat speech', argumentHint: '[all|most|some|none|stop|repeat|auto|nvda|windows]' },
      { name: 'voices', description: 'Blind Claude: list, test and choose a speech voice', argumentHint: '[number|name|test <voice>|default]' },
      { name: 'rate', description: 'Blind Claude: set the speech speed', argumentHint: '[-10 to 10|faster|slower]' },
      { name: 'volume', description: 'Blind Claude: set the speech volume', argumentHint: '[0 to 100]' },
      { name: 'clean', description: 'Blind Claude: turn symbol cleaning on, off, or words', argumentHint: '[on|off|words]' },
      { name: 'sounds', description: 'Blind Claude: list, play, pick, add and remove sound cues', argumentHint: '[help|status|on|off|list|play|pick|add|remove|folder]' },
      { name: 'blind', description: 'Blind Claude: open the settings menu, show status or help, reset, or restart speech', argumentHint: '[help|status|reset|restart|prompts on|prompts off]' },
      { name: 'changes', description: 'Blind Claude: read what Claude changed, in Notepad++ or Notepad', argumentHint: '[help|session|<number>|open <number>|git|preview|auto|before|editor|view|context|rows]' },
    ]
    // Claude Code refuses a name one of its own commands uses, and some exist
    // only in interactive sessions. One refusal must not stop the others.
    for (const command of commands) {
      try {
        await $.command.register({ ...command, immediate: true })
      } catch (error) {
        $.ui.log(`Blind Claude could not add /${command.name}: ${String(error)}`)
      }
    }

    // Started now so the first reply is not kept waiting for it.
    await ensureServer($)

    return started
  })

  // Clean output, layer one: ask Claude to write plainly.
  on('prompt.compose', async ($, e, next) => {
    await loadSettings($)
    const composed = await next(e)
    if (current.clean === 'off') return composed

    return { sections: [...composed.sections, { id: 'blind-claude:plain-writing', text: PLAIN_WRITING, scope: 'session' as const }] }
  })

  // Clean output, layer two: clean each reply before it is drawn.
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (current.clean === 'off') return next(e)

    return next({ ...e, props: { ...e.props, text: cleanForDisplay(e.props.text, current.clean) } })
  })

  // The same cleaning for what slash commands print, built in ones such as
  // /cost and /context included, and for the notices under the logo.
  on('ui.render', { component: 'CommandOutput' }, ($, e, next) => {
    if (current.clean === 'off') return next(e)

    return next({ ...e, props: { ...e.props, text: cleanForDisplay(e.props.text, current.clean) } })
  })

  on('ui.render', { component: 'InfoNotice' }, ($, e, next) => {
    if (current.clean === 'off') return next(e)

    return next({ ...e, props: { ...e.props, text: cleanForDisplay(e.props.text, current.clean) } })
  })

  // /usage and /context open panels of bars and grids that the cleaning
  // above never sees, so while cleaning is on they answer in sentences.
  on('command.run', { command: 'usage' }, async ($, e, next) => {
    await loadSettings($)
    if (current.clean === 'off') return next(e)

    return { text: usageText(await $.session.usage(), await $.clock.now()) }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'context' }, async ($, e, next) => {
    await loadSettings($)
    if (current.clean === 'off') return next(e)

    return { text: contextText(await $.session.usage({ breakdown: 'summary' })) }
  }).catch(($, e, next) => next(e))

  // A still status line instead of the animated spinner.
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    if (current.clean === 'off') return next(e)
    const { Text } = $.ui.resolve(e)

    return <Text>Working.</Text>
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => {
    if (current.clean === 'off') return next(e)
    const { Text } = $.ui.resolve(e)

    return <Text dimColor>Done, took {formatDuration(e.props.durationMs)}.</Text>
  })

  // A new message stops any speech still playing. While the settings menu
  // is open, a number typed at the prompt answers the menu and never reaches
  // Claude; anything else closes the menu and goes to Claude as usual.
  on('prompt.submit', async ($, e, next) => {
    await loadSettings($)
    await stopSpeech($)
    if (menu !== null) {
      const isPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
      const choice = isPerson && e.attachments === undefined ? parseChoice(e.text) : null
      if (choice !== null) {
        try {
          return { drop: await answerMenu($, menu, choice) }
        } catch (error) {
          $.ui.log(`Blind Claude menu failed: ${String(error)}`, { to: 'debug' })
          return { drop: 'That menu choice failed. Type /blind to open the menu again.' }
        }
      }
      if (isPerson) menu = null
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Reply text as it arrives, at the "all" and "most" levels.
  on('session.append', async ($, e, next) => {
    await loadSettings($)
    const appended = await next(e)
    const isMainReply = e.door === 'response' && e.agentId === undefined && e.message.type === 'assistant'
    if (isMainReply && speaksReplyBlocks(current.level)) {
      const text = e.message.content
        .map(block => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
        .join('\n')
        .trim()
      if (text !== '') await speak($, text)
    }

    return appended
  }).catch(($, e, next) => next(e))

  // Claude's questions in the accessible dialog. The answer is given in
  // place of the tool, so Claude Code's own dialog never opens; choosing
  // "Show Claude Code's own question instead" lets it open.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    await loadSettings($)
    if (!current.prompts) return next(e)
    const questions = parseQuestions(e)
    const shown = parseQuestions(cleanInput(e))
    if (questions === null || shown === null) return next(e)
    const answer = await oneDialogAtATime(() => askQuestions($, e.tool_use_id ?? 'question', questions, shown, next.signal))
    if (answer === 'engine') return next(e)
    if (answer === 'cancel') return { deny: 'The user dismissed the question without answering.' }

    return { result: { questions: e.questions, answers: answer } }
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    await loadSettings($)
    const isMain = e.agentId === undefined
    const isFileTool = e.tool === 'Edit' || e.tool === 'Write'
    if (isFileTool) {
      const preview = await preparePreview($, e.tool, e, e.tool_use_id)
      if (preview && e.tool_use_id !== undefined) {
        try {
          $.ui.notice(e.tool_use_id, `Blind Claude: ${summary(preview)} Type /changes preview to read it.`)
        } catch {
          // No dialog is open for this call.
        }
      }
    }
    if (isMain && speaksToolCall(current.level, e.tool)) await speak($, describeToolCall(e.tool, e), { isRaw: true })
    const ran = await next(e)
    if (e.tool_use_id !== undefined) previews.delete(e.tool_use_id)
    const turn = (await read($, turnState)) ?? 0
    const change = isFileTool && ran.deny === undefined && ran.isError !== true ? changeFromResult(e.tool, ran.result, turn, !isMain) : null
    if (change) await update($, changesState, list => [...(list ?? []), change].slice(-500))
    if (isMain && ran.deny === undefined) {
      if (change && (current.level === 'all' || current.level === 'most')) await speak($, summary(change, true), { isRaw: true })
      else if (speaksToolResult(current.level)) await speak($, describeToolResult(e.tool, ran.isError === true), { isRaw: true })
    }

    return ran
  }).catch(($, e, next) => next(e))

  // Permission prompts in the accessible dialog. Claude Code decides first
  // whether to ask; only a question meant for the person is taken over.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    await loadSettings($)
    const id = e.tool_use_id
    if (verdict.decision !== 'ask' || e.approver !== 'person' || id === undefined || ENGINE_ONLY_TOOLS.has(e.tool)) return verdict
    if (allowedThisSession.has(allowKey(e.tool, e.input))) return { decision: 'allow', reason: 'Allowed for the rest of this session in Blind Claude.' }
    const preview = previews.get(id)
    if (preview && current.changes.isPreview) await openReport($, [preview], 'Blind Claude: the change Claude wants to make. It has not been made yet.')
    if (!current.prompts) return verdict
    const answer = await oneDialogAtATime(() => askPermission($, id, e.tool, e.input, verdict.reason, preview, next.signal))

    return answer === null ? verdict : answer
  }).catch(($, e, next) => next(e))

  // The dialog: its question at the top, then one choice per line. Up and
  // down arrow move between them, Enter or the number chooses.
  on('ui.render', { component: 'Pane', requestId: DIALOG_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    // Mobile has no text box, so there the choices are all there is.
    const Input = 'Input' in elements ? elements.Input : null
    const dialog = await read($, dialogState)
    if (!dialog) return <Text>Nothing to answer.</Text>
    dialogHasInput = Input !== null

    return (
      <Box flexDirection="column">
        <Button key={QUESTION_KEY} label={dialog.title} plain autoFocus onPress={() => speak($, dialogSpeech(dialog), { interrupt: true, isRaw: true })} />
        {dialog.lines.map(line => (
          <Text>{line}</Text>
        ))}
        {dialog.options.map((option, i) =>
          i < 9 ? (
            <Button key={option.key} label={option.label} hotkey={String(i + 1)} plain onPress={() => sendAnswer($, option.key)} />
          ) : (
            <Button key={option.key} label={option.label} plain onPress={() => sendAnswer($, option.key)} />
          ),
        )}
        {dialog.input && Input ? (
          <Input key="typed" label={dialog.input.label} submitLabel="send" onSubmit={(value: string) => (value.trim() === '' ? undefined : sendAnswer($, `text:${value}`))} />
        ) : null}
      </Box>
    )
  })

  // Says the stop the person moves to, so the arrows can be followed by ear.
  // Claude Code's own stops in the pane, such as its close mark, are passed
  // over: the focus wraps around the dialog instead, and Escape still closes.
  on('ui.focus', async ($, e, next) => {
    if (e.requestId !== DIALOG_PANE) return next(e)
    const dialog = await read($, dialogState)
    const element = e.element === undefined && e.origin.kind === 'person' && dialog ? wrapFocus(focusOrder(dialog, dialogHasInput), dialogFocus) : e.element
    const moved = await next(element === e.element ? e : { ...e, element })
    if (moved.deny !== undefined || element === undefined) return moved
    dialogFocus = element
    if (e.origin.kind !== 'person' && e.element !== undefined) return moved
    const option = dialog?.options.find(o => o.key === element)
    if (option) await speak($, option.spoken, { interrupt: true, isRaw: true })
    else if (element === QUESTION_KEY && dialog) await speak($, questionSpeech(dialog), { interrupt: true, isRaw: true })
    else if (element === 'typed' && dialog?.input) await speak($, dialog.input.label, { interrupt: true, isRaw: true })

    return moved
  }).catch(($, e, next) => next(e))

  // Escape closes the dialog: a permission is then refused and a question
  // left unanswered, as in Claude Code's own.
  on('ui.close', async ($, e, next) => {
    if (e.id === DIALOG_PANE && e.origin.kind === 'person') {
      isDialogOpen = false
      sendAnswer($, 'cancel')
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Edits in the transcript: a summary and the changed lines in words, in
  // place of the colored diff. Control O still shows Claude Code's own.
  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    const { tool, output, isErrored, isExpanded } = e.props
    if (current.clean === 'off' || isErrored || isExpanded === true || (tool !== 'Edit' && tool !== 'Write')) return next(e)
    const change = changeFromResult(tool, output, 0, false)
    if (change === null) return next(e)
    const { Text } = $.ui.resolve(e)

    return <Text>{rowText(change, current.changes.isSummaryOnly)}</Text>
  })

  on('turn.start', async ($, e, next) => {
    await loadSettings($)
    const started = await next(e)
    if (e.agentId === undefined) await update($, turnState, n => (n ?? 0) + 1)
    await playSound($, 'start')

    return started
  }).catch(($, e, next) => next(e))

  // Permission requests and questions from Claude Code.
  on('classic.Notification', async ($, e, next) => {
    await loadSettings($)
    if (!/idle/i.test(e.notification_type)) {
      await playSound($, 'attention')
      if (speaksAlerts(current.level)) await speak($, e.message, { interrupt: false })
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await loadSettings($)
    const result = await next(e)
    if (e.agentId !== undefined) return result

    if (e.reason === 'answer') {
      if (e.answer.trim() !== '') lastReply = e.answer
      await playSound($, 'done')
      const turn = (await read($, turnState)) ?? 0
      const changed = filesOf((await sessionChanges($)).filter(c => c.turn === turn)).length
      if (changed > 0 && speaksFinalAnswer(current.level)) {
        await speak($, `Changed ${changed === 1 ? '1 file' : `${changed} files`}. Type /changes to read ${changed === 1 ? 'it' : 'them'}.`, { isRaw: true })
      }
      if (speaksFinalAnswer(current.level)) await speak($, e.answer)
      if (changed > 0 && current.changes.isAuto) await openReport($, await lastTurnChanges($), 'Blind Claude change report for the last turn.')
    } else if (e.reason === 'error') {
      await playSound($, 'error')
      if (speaksAlerts(current.level)) await speak($, 'Claude stopped because of an error.', { isRaw: true })
    } else if (e.reason === 'refusal' && speaksAlerts(current.level)) {
      await speak($, 'Claude declined to continue.', { isRaw: true })
    }

    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'speak' }, async ($, e) => {
    await loadSettings($)
    const [choice] = word(e.args)
    if (choice === '') return { text: await showScreen($, { kind: 'level' }) }
    if (choice === 'stop') {
      await stopSpeech($)
      return { text: 'Speech stopped.' }
    }
    if (choice === 'repeat') {
      if (lastReply === '') return { text: 'Nothing to repeat yet.' }
      await speak($, lastReply, { interrupt: true })
      return { text: 'Repeating the last reply.' }
    }
    if (ENGINES.includes(choice as SpeechEngine)) {
      await saveSettings($, { engine: choice as SpeechEngine })
      await sendVoiceConfig($)
      await refreshEngine($)
      await speak($, `Speech engine ${choice}.`, { interrupt: true, isRaw: true })
      return { text: `Speech engine set to ${choice}. Speaking with: ${engineName()}.` }
    }
    if (LEVELS.includes(choice as Level)) {
      await saveSettings($, { level: choice as Level })
      if (choice === 'none') await stopSpeech($)
      else await speak($, `Speech level ${choice}.`, { interrupt: true, isRaw: true })
      return { text: `Speech level set to ${choice}.` }
    }

    return { text: `Unknown option "${choice}". Use all, most, some, none, stop, repeat, auto, nvda or windows.` }
  }).catch(commandFailed)

  on('command.run', { command: 'voices' }, async ($, e) => {
    await loadSettings($)
    const [first, rest] = word(e.args)
    if (first === 'default') {
      await saveSettings($, { voice: null })
      await sendVoiceConfig($)
      await speak($, 'Using the default voice.', { interrupt: true, isRaw: true })
      return { text: 'Using the system default voice.' }
    }

    const voices = await requestVoices($)
    if (voices === null) {
      return { text: 'The voice list is only available on Windows while the speech server is running. Try again in a moment.' }
    }
    if (first === '') return { text: await showScreen($, { kind: 'voice' }) }

    const isTest = first === 'test'
    const query = isTest ? rest : e.args.trim()
    if (query === '') return { text: 'Say which voice to test, by number or name.' }
    const matches = findVoice(voices, query)
    if (matches.length === 0) return { text: `No voice matches "${query}". Type /voices to list them.` }
    if (matches.length > 1) return { text: `More than one voice matches: ${matches.map(v => v.name).join(', ')}. Be more specific.` }
    const voice = matches[0]!

    if (isTest) {
      await sendToServer($, { op: 'config', voice: voice.name })
      await speak($, `This is ${voice.name}.`, { interrupt: true, isRaw: true })
      await sendVoiceConfig($)
      return { text: `Played a sample of ${voice.name}.` }
    }
    await saveSettings($, { voice: voice.name })
    await sendVoiceConfig($)
    await speak($, `Voice changed to ${voice.name}.`, { interrupt: true, isRaw: true })

    return { text: `Voice changed to ${voice.name}.` }
  }).catch(commandFailed)

  on('command.run', { command: 'rate' }, async ($, e) => {
    await loadSettings($)
    const [choice] = word(e.args)
    if (choice === '') return { text: await showScreen($, { kind: 'rate' }) }
    let rate = current.rate
    if (choice === 'faster') rate += 1
    else if (choice === 'slower') rate -= 1
    else if (/^-?\d+$/.test(choice)) rate = Number(choice)
    else return { text: 'Use a number from -10 to 10, or faster, or slower.' }
    await saveSettings($, { rate: clamp(rate, -10, 10) })
    await sendVoiceConfig($)
    await speak($, `Rate ${current.rate}.`, { interrupt: true, isRaw: true })

    return { text: `Speech rate set to ${current.rate}.` }
  }).catch(commandFailed)

  on('command.run', { command: 'volume' }, async ($, e) => {
    await loadSettings($)
    const [choice] = word(e.args)
    if (choice === '') return { text: await showScreen($, { kind: 'volume' }) }
    if (!/^\d+$/.test(choice)) return { text: 'Use a number from 0 to 100.' }
    await saveSettings($, { volume: clamp(Number(choice), 0, 100) })
    await sendVoiceConfig($)
    await speak($, `Volume ${current.volume}.`, { interrupt: true, isRaw: true })

    return { text: `Speech volume set to ${current.volume}.` }
  }).catch(commandFailed)

  on('command.run', { command: 'clean' }, async ($, e) => {
    await loadSettings($)
    const [choice] = word(e.args)
    if (choice === '') return { text: await showScreen($, { kind: 'clean' }) }
    if (!CLEAN_MODES.includes(choice as CleanMode)) return { text: 'Use on, off or words.' }
    await saveSettings($, { clean: choice as CleanMode })
    $.ui.invalidate('ui.render')

    return { text: `Symbol cleaning set to ${choice}.` }
  }).catch(commandFailed)

  on('command.run', { command: 'sounds' }, async ($, e) => {
    await loadSettings($)
    const parts = e.args.trim().split(/\s+/).filter(part => part !== '')
    const [first = '', second = '', ...rest] = parts
    const action = first.toLowerCase()
    const eventWord = second.toLowerCase()

    const saveEvent = async (event: SoundEvent, change: Partial<Settings['soundEvents'][SoundEvent]>) => {
      await saveSettings($, { soundEvents: { ...current.soundEvents, [event]: { ...current.soundEvents[event], ...change } } })
    }
    const ambiguous = (files: readonly SoundFile[]) => `More than one sound matches: ${files.map(f => f.name).join(', ')}. Be more specific.`

    if (action === '') return { text: await showScreen($, { kind: 'sounds' }) }
    if (action === 'status') {
      const counts = { done: 0, start: 0, attention: 0, error: 0 }
      for (const event of SOUND_EVENTS) counts[event] = (await soundFiles($, event)).length
      return { text: overviewText(current, counts) }
    }
    if (action === 'help') return { text: SOUNDS_HELP }
    if (action === 'on' || action === 'off') {
      await saveSettings($, { sounds: action === 'on' })
      return { text: `All sounds turned ${action}.` }
    }
    if (action === 'test') {
      const file = chooseSound(await soundFiles($, 'done'), current.soundEvents.done.pick, Math.random())
      if (!file) return { text: 'There are no done sounds.' }
      await playFile($, file)
      return { text: `Played ${file.name}.` }
    }
    if (action === 'folder') {
      const root = await customSoundRoot($)
      return { text: root ? `Your own sounds are kept in ${root}, one folder per event. WAV files placed there are used right away.` : 'Could not find your local app data folder.' }
    }

    // "/sounds done on" turns one event on or off.
    if (isSoundEvent(action) && (eventWord === 'on' || eventWord === 'off')) {
      await saveEvent(action, { isOn: eventWord === 'on' })
      return { text: `${action} sound turned ${eventWord}.` }
    }

    if (!isSoundEvent(eventWord)) {
      return { text: `Name an event: done, start, attention or error. For example, /sounds ${action} done. Type /sounds help for all sound commands.` }
    }
    const event = eventWord
    const files = await soundFiles($, event)
    const query = rest.join(' ')

    if (action === 'list') return { text: listText(event, files, current.soundEvents[event]) }

    if (action === 'play') {
      const chosen = query === '' ? chooseSound(files, current.soundEvents[event].pick, Math.random()) : undefined
      const matches = query === '' ? (chosen ? [chosen] : []) : findSound(files, query)
      if (matches.length === 0) return { text: files.length === 0 ? `No ${event} sounds yet.` : `No ${event} sound matches "${query}".` }
      if (matches.length > 1) return { text: ambiguous(matches) }
      await playFile($, matches[0]!)
      return { text: `Played ${matches[0]!.name}.` }
    }

    if (action === 'pick') {
      if (query === '' || query.toLowerCase() === 'random') {
        await saveEvent(event, { pick: 'random' })
        return { text: `${event} will play a random sound each time.` }
      }
      const matches = findSound(files, query)
      if (matches.length === 0) return { text: `No ${event} sound matches "${query}". Type /sounds list ${event}.` }
      if (matches.length > 1) return { text: ambiguous(matches) }
      await saveEvent(event, { pick: matches[0]!.name })
      await playFile($, matches[0]!)
      return { text: `${event} will always play ${matches[0]!.name}.` }
    }

    if (action === 'add') {
      const source = query.replace(/^"(.*)"$/, '$1')
      if (source === '') return { text: `Give the path to a sound file, such as /sounds add ${event} C:\\sounds\\ding.wav.` }
      const root = await customSoundRoot($)
      if (root === null) return { text: 'Could not find your local app data folder.' }
      const answer = await runSoundScript($, ['-Action', 'add', '-Source', source, '-Dest', `${root}\\${event}`])
      if (!answer.startsWith('OK ')) return { text: `Could not add the sound: ${answer.replace(/^ERROR /, '') || 'unknown error'}.` }
      const name = answer.slice(3)
      await playFile($, { name, path: `${root}\\${event}\\${name}`, isCustom: true })
      return { text: `Added ${name} to the ${event} sounds.` }
    }

    if (action === 'remove') {
      const matches = findSound(files, query)
      if (query === '' || matches.length === 0) return { text: `No ${event} sound matches "${query}". Type /sounds list ${event}.` }
      if (matches.length > 1) return { text: ambiguous(matches) }
      const file = matches[0]!
      if (!file.isCustom) return { text: `${file.name} comes with Blind Claude and cannot be removed. Turn the event off, or pick another sound, instead.` }
      const answer = await runSoundScript($, ['-Action', 'remove', '-Source', file.path])
      if (!answer.startsWith('OK ')) return { text: `Could not remove the sound: ${answer.replace(/^ERROR /, '') || 'unknown error'}.` }
      if (current.soundEvents[event].pick.toLowerCase() === file.name.toLowerCase()) await saveEvent(event, { pick: 'random' })
      return { text: `Removed ${file.name}.` }
    }

    return { text: `Unknown sound command "${action}". Type /sounds help for the list.` }
  }).catch(commandFailed)

  on('command.run', { command: 'changes' }, async ($, e) => {
    await loadSettings($)
    const [first, rest] = word(e.args)
    const [second] = word(rest)
    const setChanges = async (change: Partial<Settings['changes']>, text: string) => {
      await saveSettings($, { changes: { ...current.changes, ...change } })
      return { text }
    }
    const onOff = async (key: 'isAuto' | 'isPreview', what: string) => {
      if (second !== 'on' && second !== 'off') return { text: `Use /changes ${first} on or /changes ${first} off.` }
      return setChanges({ [key]: second === 'on' }, `${what} turned ${second}.`)
    }

    if (first === 'help') return { text: CHANGES_HELP }
    if (first === 'settings') return { text: await showScreen($, { kind: 'changes' }) }
    if (first === 'auto') return onOff('isAuto', 'Opening the report after each turn that changes files')
    if (first === 'before' || (first === 'preview' && second !== '')) return onOff('isPreview', 'Opening the change before you approve an edit')
    if (first === 'editor') {
      const editor = rest.replace(/^"(.*)"$/, '$1').trim()
      if (editor === '') return { text: `The editor is ${editorName(current.changes.editor)}. Use /changes editor and auto, notepad++, notepad or the path of a program.` }
      const named = ['auto', 'notepad++', 'notepad'].includes(editor.toLowerCase()) ? editor.toLowerCase() : editor
      return setChanges({ editor: named }, `Change reports will open in ${editorName(named)}.`)
    }
    if (first === 'view') {
      if (second !== 'text' && second !== 'browser') return { text: 'Use /changes view text or /changes view browser.' }
      return setChanges({ view: second }, second === 'browser' ? 'Change reports will open as a web page.' : 'Change reports will open as text.')
    }
    if (first === 'context') {
      if (!/^\d+$/.test(second)) return { text: 'Use /changes context and a number from 0 to 5.' }
      const context = clamp(Number(second), 0, 5)
      return setChanges({ context }, `${context} unchanged lines will be shown around each change.`)
    }
    if (first === 'rows') {
      if (second !== 'full' && second !== 'summary') return { text: 'Use /changes rows full or /changes rows summary.' }
      await saveSettings($, { changes: { ...current.changes, isSummaryOnly: second === 'summary' } })
      $.ui.invalidate('ui.render')
      return { text: second === 'summary' ? 'Edits in the transcript show a summary only.' : 'Edits in the transcript show a summary and the changed lines.' }
    }
    if (first === 'preview') {
      if (lastPreview === null) return { text: 'No edit is waiting for your permission.' }
      return { text: await openReport($, [lastPreview], 'Blind Claude: the change Claude wants to make. It has not been made yet.') }
    }
    if (first === 'git') {
      const diff = async (args: string[]) => {
        try {
          return await $.process.run(['git', ...args], { timeoutMs: 60_000 })
        } catch {
          return null
        }
      }
      let ran = await diff(['diff', 'HEAD', '--no-color', '--no-ext-diff'])
      if (ran === null || ran.exitCode !== 0) ran = await diff(['diff', '--no-color', '--no-ext-diff'])
      if (ran === null || ran.exitCode !== 0) return { text: 'This folder is not a git repository, or git is not installed.' }
      const changes = parseGitDiff(ran.stdout)
      const untracked = await diff(['ls-files', '--others', '--exclude-standard'])
      const newFiles = (untracked?.stdout ?? '').split('\n').map(l => l.trim()).filter(l => l !== '')
      const footer = newFiles.length > 0 ? [`New files git does not track yet, not shown above: ${newFiles.slice(0, 50).join(', ')}${newFiles.length > 50 ? `, and ${newFiles.length - 50} more` : ''}.`] : undefined
      if (changes.length === 0) return { text: newFiles.length > 0 ? `No changes to tracked files since the last commit. ${footer![0]}` : 'No changes since the last commit.' }
      return { text: await openReport($, changes, 'Blind Claude change report: every change since the last commit, from git.', footer) }
    }
    if (first === 'session') {
      const changes = await sessionChanges($)
      if (changes.length === 0) return { text: 'Claude has not changed any files in this session yet.' }
      return { text: await openReport($, changes, 'Blind Claude change report for this whole session.') }
    }

    const changes = await lastTurnChanges($)
    if (changes.length === 0) return { text: 'Claude has not changed any files in this session yet. /changes git shows changes since the last commit.' }
    const files = filesOf(changes)
    const pickFile = (text: string) => {
      const n = Number(text)
      return /^\d+$/.test(text) && n >= 1 && n <= files.length ? files[n - 1]! : null
    }
    const noFile = (text: string) => ({ text: `There is no file ${text}. The last turn changed ${files.length === 1 ? '1 file' : `${files.length} files`}: ${files.map((f, i) => `${i + 1}, ${relativePath(f.path, cwd)}`).join('. ')}.` })

    if (first === 'open') {
      const file = pickFile(second)
      if (file === null) return noFile(second)
      const line = firstChangedLine(file)
      const opened = await openInEditor($, file.path, { editor: current.changes.editor, line })
      if ('error' in opened) return { text: `Could not open ${relativePath(file.path, cwd)}: ${opened.error}.` }
      const goTo = opened.editor === 'Notepad++' ? `at line ${line}` : `. Press Control G and type ${line} to go to the first change`
      return { text: `Opened ${relativePath(file.path, cwd)} in ${opened.editor} ${goTo}.`.replace(' .', '.') }
    }
    if (first !== '') {
      const file = pickFile(first)
      if (file === null) return /^\d+$/.test(first) ? noFile(first) : { text: `Unknown option "${first}". Type /changes help for the list.` }
      const forFile = changes.filter(c => c.path.toLowerCase() === file.path.toLowerCase())
      return { text: await openReport($, forFile, `Blind Claude change report for ${relativePath(file.path, cwd)}, from the last turn that changed files.`) }
    }

    return { text: await openReport($, changes, 'Blind Claude change report for the last turn that changed files.') }
  }).catch(commandFailed)

  on('command.run', { command: 'blind' }, async ($, e) => {
    await loadSettings($)
    const [choice] = word(e.args)
    if (choice === 'help') return { text: HELP }
    if (choice === 'reset') {
      await resetSettings($)
      return { text: RESET_MESSAGE }
    }
    if (choice === 'prompts') {
      const [state] = word(e.args.trim().slice('prompts'.length))
      if (state === '') return { text: await showScreen($, { kind: 'prompts' }) }
      if (state !== 'on' && state !== 'off') return { text: 'Use /blind prompts on or /blind prompts off.' }
      await saveSettings($, { prompts: state === 'on' })
      return { text: state === 'on' ? "Permission prompts and Claude's questions now use Blind Claude's dialog." : "Permission prompts and Claude's questions now use Claude Code's own." }
    }
    if (choice === 'restart') {
      const old = bridge
      serverStarts = []
      bridge = null
      if (old?.state === 'ready') await writeCommand($, old, { op: 'quit' })
      else old?.queue.push({ op: 'quit' })
      const server = await ensureServer($)
      if (server === null) return { text: 'The speech server only runs on Windows.' }
      const isReady = await Promise.race([server.ready, $.clock.sleep(8000).then(() => false)])
      if (!isReady) return { text: 'The speech server is still starting, or could not start. Type /blind status to check.' }
      await speak($, 'Speech restarted.', { interrupt: true, isRaw: true })
      return { text: 'Speech server restarted.' }
    }
    if (choice === 'status') {
      await refreshEngine($)
      const summary = `${describeSettings(current)}\nSpeech engine: ${engineName()}.\nType /blind help for all commands.`
      await speak($, summary, { interrupt: true, isRaw: true })
      return { text: summary }
    }

    return { text: await showScreen($, { kind: 'main' }) }
  }).catch(commandFailed)
}
