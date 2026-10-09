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
5. `/speak pause` and `/speak resume`: planned, not built yet.

### Voice

1. `/voices`: list the installed voices.
2. `/voices` followed by a number or name: choose a voice.
3. `/voices test` followed by a number or name: hear a sample without choosing it.
4. `/voices default`: use the system default voice.
5. `/rate` followed by a number from minus 10 to 10, or `/rate faster`, or `/rate slower`: set the speed.
6. `/volume` followed by a number from 0 to 100: set the volume.

### Output

1. `/clean on`: clean symbols from the display. Default.
2. `/clean off`: show the display unchanged.
3. `/clean words`: clean, but replace emoji with their names.

### Sounds

Sounds mark four events: done, when Claude finishes; start, when Claude starts working; attention, when Claude needs permission or has a question; and error, when a turn stops with an error.

1. `/sounds`: an overview of every event, whether it is on, and how many sounds it has.
2. `/sounds help`: list the sound commands.
3. `/sounds on` or `/sounds off`: all sounds on or off. Default on.
4. `/sounds done on` or `/sounds done off`: one event on or off. Works with any event name.
5. `/sounds list done`: list the sounds for an event, numbered.
6. `/sounds play done 2`: play a sound by number or name. Leave out the number to hear the one that would play.
7. `/sounds pick done 2`: always play that sound for the event. `/sounds pick done random` goes back to a random sound each time. Random is the default.
8. `/sounds add done C:\sounds\ding.ogg`: add your own sound. WAV files always work. Other formats, such as OGG, FLAC and MP3, are converted when ffmpeg is installed.
9. `/sounds remove done 6`: remove a sound you added. Built in sounds cannot be removed, but you can turn the event off or pick another sound.
10. `/sounds folder`: say where your own sounds are kept. WAV files dropped into the event folders there are used right away.
11. `/sounds test`: play a done sound.

Your own sounds are kept in your local app data folder, under BlindClaude, sounds, so they survive updates and reinstalls.

### Notifications

1. `/notify on` or `/notify off`: planned, not built yet.

## Settings and defaults

1. Speech level: some.
2. Voice: the system default.
3. Rate: 0.
4. Volume: 100.
5. Cleaning: on.
6. Sounds: on, for every event, with a random sound each time.
7. Notifications, the working update interval, and the screen reader overlap setting are planned, not built yet.

## Where settings live

1. Settings changed by slash command are saved in Claude Code's plugin store and apply in every project.
2. Planned: listing the main settings in Claude Code's `/config` menu as well.
