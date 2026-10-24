# Architecture

This document explains how Blind Claude plugs into Claude Code.

## What kind of mod it is

Blind Claude is a Claude Code plugin that uses function hooks. A function hook plugin is a folder with three parts:

1. `.claude-plugin/plugin.json`: the manifest. It names the plugin, its version, and the settings it offers.
2. `hooks/hooks.json`: points at the hooks module.
3. `hooks/register.ts`: the hooks module. It exports a `register` function that attaches hooks to Claude Code events.

The hooks module is TypeScript. It runs inside Claude Code in its own sandbox, with no direct access to Node or the file system. Everything it does goes through the engine interface, written as `$` in the code. For example, `$.audio.speak` speaks text, `$.process.run` runs a program, and `$.store` saves settings between sessions.

The function hook API is early access and changes between Claude Code releases. The type declaration file that ships with Claude Code is the final word on what exists. When this document and the types disagree, the types win, and this document should be updated.

## Folder layout

The planned layout of the repository:

1. `plugin/`: the mod itself. This is the folder Claude Code loads.
2. `plugin/.claude-plugin/plugin.json`: the manifest.
3. `plugin/hooks/hooks.json`: names the hooks module.
4. `plugin/hooks/register.ts`: wires every feature to its events. It stays short and calls into the files below.
5. `plugin/hooks/clean.ts`: the symbol cleaner. Pure text in, text out, with no engine calls, so it is easy to test.
6. `plugin/hooks/speech.ts`: the speech queue, speech levels and speech engines.
7. `plugin/hooks/voices.ts`: listing and choosing voices.
8. `plugin/hooks/settings.ts`: reading and saving settings.
9. `plugin/hooks/commands.ts`: the slash commands.
10. `plugin/hooks/terminal.ts`: spinner, status and layout changes.
11. `plugin/sounds/`: short sound cue files.
12. `plugin/hooks/*.test.ts`: tests, run with `claude plugin test plugin`.
13. `docs/`: this documentation.

## The events Blind Claude uses

Each feature is attached to one or more Claude Code events.

### Cleaning output

1. `prompt.compose`: adds a short section to the system prompt asking Claude to write in a screen reader friendly way. This prevents most symbols before they are ever written.
2. `ui.render` on the `AssistantMessage` component: rewrites the text of each reply before it is drawn. This is the safety net that removes whatever symbols still got through.
3. `ui.render` on `ToolUse`, `ToolResult`, `ToolGroup`, `Spinner`, `TurnDuration` and `InfoNotice`: replaces the engine's decorated rows with plain text rows.

Rewriting a row in `ui.render` only changes what is drawn. It never changes what Claude reads or what is stored in the conversation. Code, file contents and tool input are never altered.

### Speaking output

1. `session.append`: sees every row as it is added to the conversation, including each block of Claude's reply and each tool result. The speech layer decides from the current speech level whether to speak it.
2. `turn.complete`: marks the end of a reply. At the "some" level, this is when the final reply is spoken.
3. `prompt.submit`: when you send a new message, any speech still playing is stopped. While the settings menu is open, a number you type is answered by the menu and dropped, so it never reaches Claude.
4. `tool.call`: announces tool calls at the "all" and "most" levels, and permission requests at every level except "none".

### Commands and settings

1. `session.start`: registers the slash commands and loads saved settings.
2. `command.run`: answers `/speak`, `/voices`, `/rate`, `/volume`, `/clean`, `/sounds` and `/blind`. Each one typed on its own opens its part of the settings menu. It also answers the built in `/usage` and `/context` in plain sentences, from `$.session.usage`, since Claude Code draws those as panels the cleaner never sees. The sentences are built in `plugin/hooks/usage.ts`.
3. `plugin/hooks/menu.ts`: the settings menu screens and what each number does there, with no engine calls, so it is easy to test.
4. `$.store`: keeps settings between sessions.
5. `userConfig` in the manifest: exposes the main settings in the Claude Code config menu as well.

### Diffs, permission prompts and questions

1. `tool.call` on Edit and Write records each change in `$.state`, declared in `plugin/types/index.d.ts`, and works out a preview of the change before it runs. `plugin/hooks/diff.ts` turns them into words. See the accessible diffs document.
2. `ui.render` on `ToolResult` draws edits as worded rows, and `/changes` opens the change report through `plugin/scripts/open-changes.ps1`.
3. `tool.check` shows Blind Claude's own dialog when Claude Code would ask you for permission, and `tool.call` on AskUserQuestion answers Claude's questions with it. The dialog is a focused pane drawn from `plugin/hooks/prompts.ts`, with `ui.focus` speaking each choice and `plugin/scripts/wait-answer.ps1` waiting for the answer. See the prompts and questions document.

## Flow of one reply

1. You send a message. Blind Claude stops any speech still playing.
2. Claude starts working. The spinner is replaced with a single line that says "Working". If sound cues are on, a short start sound plays.
3. Claude calls a tool. At the "all" and "most" levels, Blind Claude says something like "Reading file register.ts".
4. Claude needs permission. Blind Claude plays the attention sound and, at every level but "none", speaks the request.
5. Claude writes its reply. The text is cleaned and drawn. The speech layer cleans it again for speech and queues it according to the speech level.
6. The turn ends. A finish sound plays. At the "some" level the final reply is spoken now.

## Two kinds of cleaning

Text is cleaned twice, for two different readers.

1. Display cleaning is for the screen and the screen reader. It keeps code blocks exactly as they are and keeps paths and commands readable.
2. Speech cleaning is for the voice. It goes further: code blocks become a short description such as "Code block, Python, 14 lines", long paths are shortened to the file name, and web addresses are reduced to their site name.

Both use the same rules from `clean.ts`, with speech adding extra steps on top. See the clean output document for the full list.

## Working with the screen reader, not against it

Many users run NVDA, JAWS or Narrator alongside Claude Code. Two voices talking at once is worse than one. Blind Claude handles this in three ways.

1. The default speech level is "some", which only speaks the final reply.
2. A setting turns off Blind Claude's own speech for anything the screen reader already reads, such as text drawn in the terminal, while still allowing sound cues.
3. When NVDA is running, Blind Claude speaks through NVDA itself, using the NVDA controller client, so there is one voice and one set of controls. See the speech document.

## Developing and loading the mod

1. During development, start Claude Code with `claude --plugin-dir plugin` from the repository folder. Claude Code reloads the mod after each change.
2. Check the mod with `claude plugin validate plugin`.
3. Run the tests with `claude plugin test plugin`.
4. For sharing, the repository will carry a `.claude-plugin/marketplace.json` so others can install it with `/plugin install`.
