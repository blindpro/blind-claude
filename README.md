# Blind Claude

Blind Claude is a mod for Claude Code that makes it easier to use with a screen reader or without sight at all.

Claude Code is built for people who look at the terminal. It draws boxes, bullets, spinners, check marks, emoji and markdown tables. A screen reader reads all of that out loud, one strange symbol at a time, or skips it in ways that lose meaning. Blind Claude fixes that.

## What it does

1. Cleans the output. Decorative symbols, emoji, box drawing, markdown markup and spinner frames are removed or turned into plain words. Tables become sentences a screen reader can follow.
2. Speaks the output. Claude Code can read its work aloud through text to speech. You pick how much it says with four levels: all, most, some, or none.
3. Lets you pick the voice. List the voices installed on your computer, try them, and choose one. Speed and volume can be changed too.
4. Makes the terminal calmer. No animated spinners, plain status messages, short sound cues for important moments, and a layout that reads in a sensible order.

## Status

Version 0.1.0, early and in active development. Working now:

1. Symbol cleaning of Claude's replies, and a system prompt section that asks Claude to write plainly.
2. Speech at four levels through NVDA, or the Windows voices when NVDA is not running, with stop and repeat.
3. Listing, testing and choosing a voice, plus rate and volume.
4. Sound cues for four events: done, start, attention and error. Five done sounds come built in, and you can add your own for any event.
5. A still "Working." line in place of the animated spinner, and "Done, took 12 seconds." at the end of a turn.
6. Edits shown in words, and `/changes` to read everything Claude changed in Notepad++ or Notepad.
7. Permission prompts and Claude's questions in a plain dialog: the question first, one choice per line, spoken as you arrow through them, Enter to choose.

Not built yet: plain rows for other tools, notifications, and pause and resume. See the roadmap.

## Installing

1. Install Claude Code first.
2. In this folder, double click `install.cmd`, or run `.\install.ps1` in PowerShell.
3. The installer checks the mod, adds this folder as a plugin source, installs the mod for your Windows user, and says out loud when it is done.
4. Start a new Claude Code session and type `/blind` to open the settings menu.

The installed mod reads from this folder, so any change here applies in the next session. Running the installer again updates an existing install.

If NVDA is running, Blind Claude speaks through it, in your NVDA voice and settings, using the NVDA controller client that comes with the mod. When NVDA is not running it uses the Windows voice. `/speak nvda` uses NVDA only, and `/speak windows` the Windows voice only.

To install straight from GitHub without downloading this folder, type these two commands in Claude Code, then start a new session:

1. `/plugin marketplace add blindpro/blind-claude`
2. `/plugin install blind-claude@blind-claude`

To try the mod for one session without installing it, run `claude --plugin-dir plugin` from this folder.

## Uninstalling

Double click `uninstall.cmd`, or run `.\uninstall.ps1`. Your settings and your own sounds are kept unless you ask otherwise:

1. `.\uninstall.ps1 -RemoveSettings` also deletes your saved settings.
2. `.\uninstall.ps1 -RemoveSounds` also deletes the sounds you added.
3. Both scripts take `-Quiet` to skip speaking the result.

## Checking and testing

1. `claude plugin validate plugin` checks the mod the way Claude Code loads it.
2. `claude plugin test plugin` runs the tests.

## Documentation

1. [Architecture](docs/architecture.md): how the mod plugs into Claude Code.
2. [Clean output](docs/clean-output.md): which symbols are removed or replaced, and how.
3. [Speech](docs/speech.md): the four speech levels, speech engines, stopping and repeating speech.
4. [Voices](docs/voices.md): listing, testing and choosing a voice.
5. [Terminal experience](docs/terminal-experience.md): spinners, status, sound cues and layout.
6. [Commands and settings](docs/commands-and-settings.md): every slash command and setting.
7. [Roadmap](docs/roadmap.md): the order the work will be done in.
8. [Accessible diffs](docs/accessible-diffs.md): what changed and where, in the transcript and in the change report.
9. [Permission prompts and questions](docs/prompts-and-questions.md): the plain dialog for permissions and Claude's questions.
10. [Writing accessible docs](docs/writing-style.md): rules for anything written in this project.

## Quick look at the commands

These work now, apart from the ones marked as planned in the commands document.

1. `/speak all`, `/speak most`, `/speak some`, `/speak none`: choose how much is spoken.
2. `/speak stop`: stop talking right now.
3. `/speak repeat`: say the last reply again.
4. `/speak auto`, `/speak nvda`, `/speak windows`: who speaks. Auto uses NVDA while it is running.
5. `/usage` and `/context`: answered in plain sentences instead of bars and grids, while cleaning is on.
6. `/voices`: list the installed voices and choose one by number.
7. `/voices 3` or `/voices Zira`: choose a voice.
8. `/rate` and `/volume`: speed and loudness.
9. `/clean on`, `/clean off` or `/clean words`: symbol cleaning.
10. `/sounds`: sound cues. `/sounds help` lists the sound commands.
11. `/changes`: read what Claude changed in Notepad++ or Notepad. `/changes help` lists the rest.
12. `/blind`: open the settings menu. Type a number and press Enter to pick a setting, then a number for its choice. 0 goes back. `/blind status` reads every setting in one list, `/blind help` lists every command, and `/blind restart` starts speech again if it has stopped.

## Platform

Blind Claude is developed and tested first on Windows 11 with NVDA. macOS and Linux support is planned but secondary. See the speech document for details on each platform.

## Requirements

1. Claude Code with support for plugins that use function hooks.
2. Windows 10 or 11 for the first release. PowerShell is used to reach NVDA and the Windows speech voices.
3. NVDA is optional. Without it, the Windows voices speak.
