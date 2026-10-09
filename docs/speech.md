# Speech

Blind Claude can read Claude Code's work aloud with text to speech. This document covers how much it says, which engine does the talking, and how to control it.

## Speech levels

There are four levels. Change them with `/speak` followed by the level name. The level is saved between sessions.

### All

Everything that happens is spoken.

1. Every part of Claude's reply, as it arrives.
2. Every tool call, in plain words, such as "Running command: npm test" or "Editing file register.ts".
3. A short summary of each tool result, such as "Command finished, 42 lines of output" or "Command failed with exit code 1". The output itself is not read; it is on screen.
4. Permission requests, in full.
5. Errors and warnings.
6. Status changes, such as "Working" and "Done, took 12 seconds".

Best for: following along closely without reading the screen at all.

### Most

The reply and the important events, without the detail.

1. Every part of Claude's reply, as it arrives.
2. A short note for each tool call, such as "Editing register.ts". Several reads or searches in a row are grouped into one note, such as "Read 4 files".
3. Permission requests, in full.
4. Errors.

Tool results and status changes are not spoken.

Best for: everyday use with speech as the main way of following along.

### Some

Only what you need to act on. This is the default.

1. Claude's final reply, spoken once the turn ends. Text Claude writes between tool calls is not spoken.
2. Permission requests, in full, since Claude is waiting on you.
3. Errors that stop the turn.

Best for: using a screen reader for detail and speech for the result.

### None

Nothing is spoken. Sound cues still play unless they are turned off separately.

Best for: relying fully on a screen reader.

## Controlling speech

1. `/speak stop`: stop speaking right now and clear anything queued.
2. `/speak repeat`: say the last spoken reply again.
3. `/speak pause` and `/speak resume`: pause and continue. Only some engines can pause; others will stop instead and say so.
4. Sending a new message stops any speech still playing, so speech never talks over your next request.
5. A keyboard shortcut to stop speech is planned. Whether a mod can bind a key from the prompt is still being checked. If it cannot, `/speak stop` remains the way to stop.

## The speech queue

Speech is spoken in order, one item at a time. To keep it from falling far behind:

1. Permission requests and errors jump to the front of the queue.
2. If the queue holds more than about a minute of speech, older reply text is dropped and Blind Claude says "Skipped ahead".
3. At the "all" level, tool notes that are already out of date are dropped before they are spoken.

## Speech engines

The engine is the program that turns text into sound. Blind Claude tries them in this order and uses the first one that works.

### Windows: SAPI through PowerShell

Windows ships with speech voices that can be reached from PowerShell through the `System.Speech` library. Blind Claude runs a small, long running PowerShell process and sends it lines of text to speak. This gives:

1. Every voice installed in Windows speech settings that SAPI can see.
2. Control over rate and volume.
3. The ability to stop speech mid sentence.

Keeping one process running avoids the delay of starting PowerShell for every sentence.

### Windows: OneCore voices

The newer, more natural Windows voices, the ones listed in Settings under Time and language, Speech, are not always visible to `System.Speech`. A later release will reach them through the Windows Runtime speech API from the same PowerShell process. Until then, Blind Claude lists only the voices SAPI can see, and the voices document explains how to make more voices visible.

### Claude Code's built in speech

Claude Code offers `$.audio.speak`, which uses the platform's own synthesizer. On macOS this is the `say` command. Blind Claude uses it on macOS and as a fallback wherever it works. It supports choosing a voice by name but not rate, volume or stopping mid sentence, so it is not the first choice on Windows.

### Linux

On Linux, Blind Claude uses `spd-say` from Speech Dispatcher if it is installed, and `espeak-ng` otherwise.

### Through the screen reader

A later release may send speech to NVDA through the NVDA controller client, so it speaks in the screen reader's own voice and stops with the screen reader's own keys. See the roadmap.

## If speech fails

If no engine works, Blind Claude says so once in the transcript, as plain text, and turns the speech level to "none" for the session. It does not keep retrying. `/blind` shows which engine is in use and why others were skipped.

## Privacy

All speech engines listed here run on your own computer. No text is sent anywhere to be spoken.
