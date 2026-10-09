# Voices

This document explains how to list, test and choose a voice, and how to change speed and volume.

## Listing voices

Type `/voices` with nothing after it. Blind Claude lists every voice the current speech engine can use, numbered, with its language and whether it is the one in use. For example:

1. Microsoft David, English, United States.
2. Microsoft Zira, English, United States. In use.
3. Microsoft Hazel, English, United Kingdom.

The list is also spoken if speech is on.

## Testing a voice

Type `/voices test` followed by a number or name, such as `/voices test 3`. Blind Claude speaks a short sample sentence in that voice without changing your choice.

## Choosing a voice

Type `/voices` followed by a number or part of a name.

1. `/voices 3` chooses the third voice in the list.
2. `/voices zira` chooses the voice whose name contains "zira". Case does not matter.
3. If more than one voice matches, Blind Claude lists the matches and asks you to be more specific.
4. `/voices default` goes back to the system default voice.

The new voice says "Voice changed to" followed by its name, so you hear it right away. The choice is saved between sessions.

## Speed and volume

1. `/rate` followed by a number from minus 10 to 10 sets the speed. 0 is normal. Experienced screen reader users often prefer 4 or higher.
2. `/rate faster` and `/rate slower` change it by one step.
3. `/volume` followed by a number from 0 to 100 sets the volume.

Each change speaks a short sample at the new setting.

## If a voice disappears

If the saved voice is no longer installed, Blind Claude uses the default voice and says once: "Saved voice not found, using default voice." Your saved choice is kept, so it comes back if the voice is reinstalled.

## Getting more voices on Windows

Windows has two sets of voices. The older SAPI voices are always visible to Blind Claude. The newer natural voices, installed from Settings under Time and language, Speech, may not be visible until OneCore support lands. Third party SAPI 5 voices, such as those from Eloquence or eSpeak packages, show up in the list once installed.
