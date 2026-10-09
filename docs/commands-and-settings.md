# Commands and settings

Every Blind Claude slash command and setting in one place. All settings are saved between sessions.

## Commands

### Overview

1. `/blind`: print and speak a summary of all current settings, including which speech engine is in use.
2. `/blind help`: list every command with a one line description.
3. `/blind reset`: put every setting back to its default.

### Speech

1. `/speak`: say the current speech level.
2. `/speak all`, `/speak most`, `/speak some`, `/speak none`: set the speech level.
3. `/speak stop`: stop speaking and clear the queue.
4. `/speak repeat`: say the last spoken reply again.
5. `/speak pause` and `/speak resume`: pause and continue, where the engine supports it.

### Voice

1. `/voice`: list the installed voices.
2. `/voice` followed by a number or name: choose a voice.
3. `/voice test` followed by a number or name: hear a sample without choosing it.
4. `/voice default`: use the system default voice.
5. `/rate` followed by a number from minus 10 to 10, or `/rate faster`, or `/rate slower`: set the speed.
6. `/volume` followed by a number from 0 to 100: set the volume.

### Output

1. `/clean on`: clean symbols from the display. Default.
2. `/clean off`: show the display unchanged.
3. `/clean words`: clean, but replace emoji with their names.

### Sounds and notifications

1. `/sounds on` or `/sounds off`: turn sound cues on or off. Default on.
2. `/notify on` or `/notify off`: turn Windows notifications on or off. Default off.

## Settings and defaults

1. Speech level: some.
2. Voice: the system default.
3. Rate: 0.
4. Volume: 100.
5. Cleaning: on.
6. Sounds: on.
7. Notifications: off.
8. Working update interval: 30 seconds. 0 turns the updates off.
9. Speak what the screen reader reads: on. When off, Blind Claude speaks only things the screen reader would not, plus permission requests.

## Where settings live

1. Settings changed by slash command are saved in Claude Code's plugin store and apply in every project.
2. The main settings are also listed in Claude Code's `/config` menu, through the plugin manifest's `userConfig` fields.
3. If both are set, the slash command value wins, since it is the most recent choice.
