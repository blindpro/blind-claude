# Commands and settings

Every Blind Claude slash command and setting in one place. All settings are saved between sessions.

## The settings menu

Type `/blind` to open the settings menu. It is printed and spoken as a numbered list, one setting per line with its current value:

1. Speech level.
2. Voice.
3. Rate.
4. Volume.
5. Symbol cleaning.
6. Sounds.
7. Reset all settings to defaults.

Type a number and press Enter to open that setting. Its choices are listed the same way, with the one in use marked as current. For example, symbol cleaning lists 1 on, 2 off and 3 words. Type the number of a choice and press Enter: the setting is saved, the change is confirmed, and you are back at the main menu.

How each part behaves:

1. Speech level, voice and symbol cleaning: choosing returns you to the main menu. The system default voice is listed last, so the voice numbers match the ones `/voices` uses.
2. Rate and volume: 1 is faster or louder, 2 is slower or quieter, and 3 goes back to normal. These stay open after each choice so you can press 1 several times and hear the change each time. Rate moves one step, volume ten.
3. Sounds: 1 turns all sounds on or off. 2 to 5 open the done, start, attention and error events. Each event lists on, off, a random sound each time, and then every sound file for that event. Choosing a file plays it and makes it the sound for that event. Adding and removing your own sounds still uses the `/sounds add` and `/sounds remove` commands.
4. Reset asks first: 1 resets, 2 leaves everything as it is.

Moving around:

1. 0 goes back one level. At the main menu, 0 closes the menu.
2. While the menu is open, a number you type is taken by the menu and never sent to Claude.
3. Anything else you type closes the menu and goes to Claude as usual, so you can always just carry on.
4. `/speak`, `/voices`, `/rate`, `/volume`, `/clean` and `/sounds`, each typed on its own, open their part of the menu directly. 0 from there goes to the main menu.

Menus are spoken unless the speech level is none.

## Commands

The commands below still work with words after them, for when you already know what you want.

### Overview

1. `/blind`: open the settings menu.
2. `/blind status`: print and speak a summary of all current settings, including which speech engine is in use.
3. `/blind help`: list every command with a one line description.
4. `/blind reset`: put every setting back to its default.
5. `/blind restart`: start the Windows speech server again. Rarely needed, since it restarts by itself; use it after the transcript says speech is off because the server kept stopping.

### Speech

1. `/speak`: open the speech level menu.
2. `/speak all`, `/speak most`, `/speak some`, `/speak none`: set the speech level.
3. `/speak stop`: stop speaking and clear the queue.
4. `/speak repeat`: say the last spoken reply again.
5. `/speak pause` and `/speak resume`: planned, not built yet.

### Voice

1. `/voices`: open the voice menu, which lists the installed voices.
2. `/voices` followed by a number or name: choose a voice.
3. `/voices test` followed by a number or name: hear a sample without choosing it.
4. `/voices default`: use the system default voice.
5. `/rate` on its own opens the rate menu. Followed by a number from minus 10 to 10, or `/rate faster`, or `/rate slower`: set the speed.
6. `/volume` on its own opens the volume menu. Followed by a number from 0 to 100: set the volume.

### Output

1. `/clean`: open the symbol cleaning menu.
2. `/clean on`: clean symbols from the display. Default.
3. `/clean off`: show the display unchanged.
4. `/clean words`: clean, but replace emoji with their names.

### Sounds

Sounds mark four events: done, when Claude finishes; start, when Claude starts working; attention, when Claude needs permission or has a question; and error, when a turn stops with an error.

1. `/sounds`: open the sounds menu.
2. `/sounds status`: an overview of every event, whether it is on, and how many sounds it has.
3. `/sounds help`: list the sound commands.
4. `/sounds on` or `/sounds off`: all sounds on or off. Default on.
5. `/sounds done on` or `/sounds done off`: one event on or off. Works with any event name.
6. `/sounds list done`: list the sounds for an event, numbered.
7. `/sounds play done 2`: play a sound by number or name. Leave out the number to hear the one that would play.
8. `/sounds pick done 2`: always play that sound for the event. `/sounds pick done random` goes back to a random sound each time. Random is the default.
9. `/sounds add done C:\sounds\ding.ogg`: add your own sound. WAV files always work. Other formats, such as OGG, FLAC and MP3, are converted when ffmpeg is installed.
10. `/sounds remove done 6`: remove a sound you added. Built in sounds cannot be removed, but you can turn the event off or pick another sound.
11. `/sounds folder`: say where your own sounds are kept. WAV files dropped into the event folders there are used right away.
12. `/sounds test`: play a done sound.

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

1. Settings changed in the menu or by slash command are saved in Claude Code's plugin store and apply in every project.
2. Planned: listing the main settings in Claude Code's `/config` menu as well.
