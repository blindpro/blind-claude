# Terminal experience

This document covers the changes Blind Claude makes to how Claude Code looks and behaves in the terminal, beyond cleaning symbols.

## Problems with the default terminal

1. The spinner redraws many times a second. Some screen readers announce each change, or the constant redrawing makes reviewing the screen jumpy.
2. Status words change while Claude works, such as playful verbs next to the spinner. They are noise when read aloud.
3. Tool calls are drawn as compact rows with symbols in front, and results are folded under a corner marker. The order is hard to follow by ear.
4. Important moments, like a permission request or the end of a turn, are only shown visually.
5. Color carries meaning, such as red for removed lines and green for added lines.

## Changes

### A quiet status line

1. The animated spinner is replaced with one plain line: "Working." It does not change while Claude works.
2. Every 30 seconds, the line updates once to say how long Claude has been working, such as "Working, 1 minute." The interval can be changed or turned off.
3. When the turn ends, the line says "Done, took 45 seconds."

### Plain tool rows

Each tool call is drawn as one sentence, starting with a word rather than a symbol:

1. "Read file src/register.ts."
2. "Ran command: npm test. Exit code 0, 42 lines of output."
3. "Edited file src/clean.ts: 3 lines added, 1 removed."
4. "Searched for speak in 12 files, 4 matches."

The full output stays available by expanding the row, the same way as in plain Claude Code.

### Sound cues

Short sounds mark important moments, so you know what happened without reading.

1. Turn start: a soft click when Claude starts working.
2. Turn end: a short tone when Claude is done.
3. Attention: a distinct tone when Claude needs permission or asks a question.
4. Error: a low tone when a tool fails or the turn stops with an error.

Sounds can be turned off with `/sounds off` and back on with `/sounds on`. They are separate from speech, so you can have sounds with no speech or speech with no sounds.

On Windows, Claude Code's own sound playback may not work in every terminal. Blind Claude falls back to playing sounds through the same PowerShell process used for speech.

### Notifications

When a turn ends or Claude needs permission while the terminal is not focused, Blind Claude can raise a Windows notification. NVDA and Narrator read these aloud, so you hear about it from another window. Turn this on with `/notify on`.

### Settings summary

`/blind` prints and speaks a short summary of every Blind Claude setting: speech level, voice, rate, volume, cleaning, sounds and notifications. It is the quickest way to check the current state.

## Things Blind Claude does not change

1. Your terminal's colors, font and size. Set those in Windows Terminal or your terminal of choice.
2. Claude Code's keyboard shortcuts. Change those with the Claude Code keybindings file.
3. What Claude Code stores in its history. Only the drawing changes.

## Suggested terminal setup

These are not part of the mod, but help a lot.

1. Use Windows Terminal or the default console with NVDA. Both work with NVDA's review cursor.
2. Turn off "Speak typed characters" in NVDA if speech from Blind Claude overlaps with typing echo.
3. Use a high contrast terminal theme if you have some vision.
4. Run `/config` in Claude Code and turn off features that redraw the screen often, if offered.
