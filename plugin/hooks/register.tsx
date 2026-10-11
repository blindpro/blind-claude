// Blind Claude: wires every feature to Claude Code's events.
//
// Everything that calls the engine ($) lives in this file, because the
// engine handle may not be passed into imported files. The imported files
// hold the pure logic: cleaning text, describing tools, settings.

import type { EngineInterface, Register } from 'claude-code'

import { cleanForDisplay, cleanForSpeech } from './clean'
import { RESET_MESSAGE, choose, parseChoice, screenText } from './menu'
import type { MenuContext, Screen } from './menu'
import {
  CLEAN_MODES,
  SOUND_EVENTS,
  DEFAULTS,
  LEVELS,
  SETTINGS_KEY,
  clamp,
  describeSettings,
  sanitize,
} from './settings'
import type { CleanMode, Level, Settings, SoundEvent } from './settings'
import { SOUNDS_HELP, chooseSound, findSound, isPlayable, isSoundEvent, listText, overviewText, sortSounds } from './sounds'
import type { SoundFile } from './sounds'
import {
  describeToolCall,
  describeToolResult,
  findVoice,
  formatDuration,
  parseVoices,
  speaksAlerts,
  speaksFinalAnswer,
  speaksReplyBlocks,
  speaksToolCall,
  speaksToolResult,
  spoolName,
} from './speech'
import type { Voice } from './speech'

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
].join('\n')

// Module state. A hot reload starts these over; settings are read back from the store.
let current: Settings = { ...DEFAULTS }
let lastReply = ''
let bridge: { spool: string; isReady: boolean; seq: number } | null = null
let voicesWaiter: ((json: string) => void) | null = null
// The settings menu screen open now, or null when the menu is closed.
let menu: Screen | null = null

async function saveSettings($: Engine, change: Partial<Settings>): Promise<void> {
  current = { ...current, ...change }
  await $.store.set(SETTINGS_KEY, current)
}

// Sends one command to the Windows speech server. False when it is not running.
async function sendToServer($: Engine, command: Record<string, unknown>): Promise<boolean> {
  if (bridge === null || !bridge.isReady) return false
  const name = spoolName(await $.clock.now(), bridge.seq++)
  try {
    await $.fs.write(`${bridge.spool}\\${name}`, JSON.stringify(command))
    return true
  } catch (error) {
    $.ui.log(`Blind Claude could not reach the speech server: ${String(error)}`, { to: 'debug' })
    return false
  }
}

async function sendVoiceConfig($: Engine): Promise<void> {
  if (current.voice === null) await sendToServer($, { op: 'default-voice' })
  await sendToServer($, { op: 'config', voice: current.voice ?? '', rate: current.rate, volume: current.volume })
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
  if (bridge === null || !bridge.isReady) return null
  const answer = new Promise<string>(resolve => {
    voicesWaiter = resolve
  })
  if (!(await sendToServer($, { op: 'voices' }))) return null
  const timeout = $.clock.sleep(5000).then(() => null)
  const json = await Promise.race([answer, timeout])
  voicesWaiter = null

  return json === null ? null : parseVoices(json)
}

// Starts the speech server for this session. It runs until the session ends
// or the mod reloads, and is restarted by the next session.start. If it dies
// on its own, the person is told why and it is started again, once.
async function startSpeechServer($: Engine, isRetry = false): Promise<void> {
  const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMP'))
  if (!temp) return
  const spool = `${temp}\\blind-claude\\${Math.floor(await $.clock.now())}`
  const server = { spool, isReady: false, seq: 0 }
  bridge = server
  const script = `${$.plugin.root}\\scripts\\speech-server.ps1`

  void (async () => {
    let pending = ''
    let errors = ''
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
            server.isReady = true
            await sendVoiceConfig($)
          } else if (line.startsWith('VOICES ')) {
            voicesWaiter?.(line.slice('VOICES '.length))
          } else if (line.startsWith('ERROR ')) {
            $.ui.log(`Blind Claude speech: ${line.slice('ERROR '.length)}`)
          }
        }
      }
    } catch (error) {
      errors = `${errors}\n${String(error)}`
    }
    server.isReady = false
    // A newer server replaced this one (a reload), so its end is expected.
    if (bridge !== server) return
    const reason = errors.trim().split('\n').pop()?.trim() || 'no reason given'
    $.ui.log(`Blind Claude speech server stopped: ${reason}${isRetry ? '' : ' Starting it again.'}`)
    if (!isRetry) await startSpeechServer($, true)
  })()
}

function engineName(): string {
  return bridge?.isReady ? 'Windows speech server' : 'Claude Code built in speech'
}

// Fetches only what the screen needs: voices for the voice list (and for
// opening it from the main screen), sound files for one event.
async function menuContext($: Engine, screen: Screen, needsVoices = false): Promise<MenuContext> {
  const voices = screen.kind === 'voice' || needsVoices ? await requestVoices($) : null
  const files = screen.kind === 'event' ? await soundFiles($, screen.event) : []

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
  if ('voice' in change || 'rate' in change || 'volume' in change) await sendVoiceConfig($)
  if ('clean' in change) $.ui.invalidate('ui.render')
  if (change.level === 'none') await stopSpeech($)
}

// Answers a number typed while the menu is open.
async function answerMenu($: Engine, screen: Screen, choice: number): Promise<string> {
  const answer = choose(screen, choice, await menuContext($, screen, screen.kind === 'main' && choice === 2))
  if (answer.kind === 'close') {
    menu = null
    if (current.level !== 'none') await speak($, 'Menu closed.', { interrupt: true, isRaw: true })
    return 'Settings menu closed.'
  }
  if (answer.kind === 'open') return showScreen($, answer.screen, answer.message)
  if (answer.kind === 'reset') {
    await resetSettings($)
    return showScreen($, answer.screen, RESET_MESSAGE)
  }
  await applyChange($, answer.change)
  if (answer.play) await playFile($, answer.play)

  return showScreen($, answer.screen, answer.message)
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
    current = { ...DEFAULTS, ...sanitize(await $.store.get(SETTINGS_KEY)) }

    const commands = [
      { name: 'speak', description: 'Blind Claude: set how much is spoken, or stop and repeat speech', argumentHint: '[all|most|some|none|stop|repeat]' },
      { name: 'voices', description: 'Blind Claude: list, test and choose a speech voice', argumentHint: '[number|name|test <voice>|default]' },
      { name: 'rate', description: 'Blind Claude: set the speech speed', argumentHint: '[-10 to 10|faster|slower]' },
      { name: 'volume', description: 'Blind Claude: set the speech volume', argumentHint: '[0 to 100]' },
      { name: 'clean', description: 'Blind Claude: turn symbol cleaning on, off, or words', argumentHint: '[on|off|words]' },
      { name: 'sounds', description: 'Blind Claude: list, play, pick, add and remove sound cues', argumentHint: '[help|status|on|off|list|play|pick|add|remove|folder]' },
      { name: 'blind', description: 'Blind Claude: open the settings menu, show status or help, or reset', argumentHint: '[help|status|reset]' },
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

    if ((await $.env.get('OS')) === 'Windows_NT') await startSpeechServer($)

    return started
  })

  // Clean output, layer one: ask Claude to write plainly.
  on('prompt.compose', async ($, e, next) => {
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

  on('tool.call', async ($, e, next) => {
    const isMain = e.agentId === undefined
    if (isMain && speaksToolCall(current.level, e.tool)) await speak($, describeToolCall(e.tool, e), { isRaw: true })
    const ran = await next(e)
    if (isMain && speaksToolResult(current.level) && ran.deny === undefined) {
      await speak($, describeToolResult(e.tool, ran.isError === true), { isRaw: true })
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    await playSound($, 'start')

    return started
  }).catch(($, e, next) => next(e))

  // Permission requests and questions from Claude Code.
  on('classic.Notification', async ($, e, next) => {
    if (!/idle/i.test(e.notification_type)) {
      await playSound($, 'attention')
      if (speaksAlerts(current.level)) await speak($, e.message, { interrupt: false })
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result

    if (e.reason === 'answer') {
      if (e.answer.trim() !== '') lastReply = e.answer
      await playSound($, 'done')
      if (speaksFinalAnswer(current.level)) await speak($, e.answer)
    } else if (e.reason === 'error') {
      await playSound($, 'error')
      if (speaksAlerts(current.level)) await speak($, 'Claude stopped because of an error.', { isRaw: true })
    } else if (e.reason === 'refusal' && speaksAlerts(current.level)) {
      await speak($, 'Claude declined to continue.', { isRaw: true })
    }

    return result
  })

  on('command.run', { command: 'speak' }, async ($, e) => {
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
    if (LEVELS.includes(choice as Level)) {
      await saveSettings($, { level: choice as Level })
      if (choice === 'none') await stopSpeech($)
      else await speak($, `Speech level ${choice}.`, { interrupt: true, isRaw: true })
      return { text: `Speech level set to ${choice}.` }
    }

    return { text: `Unknown option "${choice}". Use all, most, some, none, stop or repeat.` }
  }).catch(commandFailed)

  on('command.run', { command: 'voices' }, async ($, e) => {
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
    const [choice] = word(e.args)
    if (choice === '') return { text: await showScreen($, { kind: 'volume' }) }
    if (!/^\d+$/.test(choice)) return { text: 'Use a number from 0 to 100.' }
    await saveSettings($, { volume: clamp(Number(choice), 0, 100) })
    await sendVoiceConfig($)
    await speak($, `Volume ${current.volume}.`, { interrupt: true, isRaw: true })

    return { text: `Speech volume set to ${current.volume}.` }
  }).catch(commandFailed)

  on('command.run', { command: 'clean' }, async ($, e) => {
    const [choice] = word(e.args)
    if (choice === '') return { text: await showScreen($, { kind: 'clean' }) }
    if (!CLEAN_MODES.includes(choice as CleanMode)) return { text: 'Use on, off or words.' }
    await saveSettings($, { clean: choice as CleanMode })
    $.ui.invalidate('ui.render')

    return { text: `Symbol cleaning set to ${choice}.` }
  }).catch(commandFailed)

  on('command.run', { command: 'sounds' }, async ($, e) => {
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

  on('command.run', { command: 'blind' }, async ($, e) => {
    const [choice] = word(e.args)
    if (choice === 'help') return { text: HELP }
    if (choice === 'reset') {
      await resetSettings($)
      return { text: RESET_MESSAGE }
    }
    if (choice === 'status') {
      const summary = `${describeSettings(current)}\nSpeech engine: ${engineName()}.\nType /blind help for all commands.`
      await speak($, summary, { interrupt: true, isRaw: true })
      return { text: summary }
    }

    return { text: await showScreen($, { kind: 'main' }) }
  }).catch(commandFailed)
}
