# Accessible diffs

This document explains how Blind Claude shows what Claude changed in your files, and where, in a form that works with a screen reader. It started as a design and is now built; the open questions at the end are what is still being checked.

## The problem

When Claude edits a file, Claude Code draws a diff in the terminal. It relies on things a screen reader cannot pass on:

1. Color. Green means added and red means removed. NVDA does not say colors while reading the console.
2. A plus or minus sign in a narrow column at the start of each line, easy to miss or hear as part of the code.
3. Line numbers in a gutter, read out run together with the code.
4. Long diffs are cut short in the terminal, and the rest is behind Control O.
5. The console is hard to review. Reading a 40 line diff with NVDA's review cursor, while the screen keeps redrawing, is slow and easy to lose your place in.

What you need to know is the same as anyone else: which files changed, where in each file, what the old text was, and what the new text is. You also need to move around that information at your own pace, with the keys you already use.

## Goals

1. Say every change in words. A line that was added starts with "Added", never with a plus sign alone.
2. Always give the line number, so you can find the change in the real file.
3. Keep a short summary in the transcript, and put the full detail in a place made for reading: a text editor.
4. Never steal focus without being asked. Opening a window moves NVDA's focus, which is disruptive in the middle of work.
5. Never change the code. Every line is shown exactly as written. Only the labels around it are words.

## Three layers

From least to most detail:

1. In the transcript: a short worded summary in place of the colored diff.
2. Spoken: a one line summary at the speech levels that speak tool calls.
3. In an editor: the full change report, opened in Notepad++ or Notepad when you type `/changes`, or by itself after each turn if you turn that on.

## Layer one: the transcript row

The colored diff under each Edit or Write is replaced with plain text:

1. A summary line: "Edited register.tsx, lines 40 to 52: 3 lines added, 1 removed, 2 changed."
2. For a small change, up to 6 changed lines, the lines themselves, each starting with a word, as described under "How a change is written".
3. For a larger change, only the summary, then: "Type /changes to read all of it."

Control O still shows Claude Code's own diff, unchanged. `/changes rows summary` shows only the summary line for every edit, for when NVDA already reads the transcript to you.

## Layer two: speech

1. At the "all" and "most" speech levels, the summary is spoken after each edit, without the line numbers: "Edited register.tsx: 3 lines added, 1 removed."
2. At the "some" level, one line is spoken when the turn ends, before the answer: "Changed 3 files. Type /changes to read them."
3. Code is never read aloud from a diff. Speech says where and how much, the editor shows what.

## Layer three: the change report in an editor

The report is a plain text file opened in a normal editor window, where nothing redraws while you read and every key you know works: up and down arrow for lines, Control Home for the top, Control F to find.

### Opening it

1. `/changes` opens the report for the last turn that changed files.
2. `/changes session` opens every change made in this session, oldest first.
3. `/changes 2` opens the report for one file only, by its number in the last turn's list.
4. `/changes auto on` opens the report by itself when a turn that changed files ends. It is off by default, because the window takes focus.
5. Item 8 of the `/blind` menu, Changes, has the same choices as numbers, starting with "Open the change report for the last turn".

After it opens, Blind Claude says which editor it opened in. Windows sometimes leaves a window started this way behind the terminal; Blind Claude asks Windows to bring it forward, and if you do not hear it, Alt Tab reaches it.

### Which editor

1. Notepad++ if it is installed. Blind Claude looks for it in the registry and in the usual program folders.
2. Notepad otherwise.
3. `/changes editor notepad`, `/changes editor notepad++`, `/changes editor auto`, or `/changes editor` followed by the full path of any other program, such as VS Code. The choice is saved.

Notepad++ opens the report in a separate, read only window, with `-multiInst -nosession -ro`, so your own open files and saved session are left alone.

### Where reports are kept

Each report is saved in your local app data folder, under BlindClaude, changes, named by date and time, such as `changes 2026-10-24 14-05-31.txt`. Reports older than a week are removed whenever a new one is made. You can open an old report again, or attach one to an email.

### Going to the real file

1. `/changes open 2` opens file 2 of the last turn in your editor, ready to edit.
2. Notepad++ opens it at the first changed line. Notepad cannot, so Blind Claude says the line number to go to with Control G.

## How a change is written

These rules apply to the transcript row and to the report.

1. Every line starts with a word that says what happened, and the line number: "Added line 12:", "Unchanged line 11:".
2. Added and unchanged lines use the new file's line numbers. Removed lines use the old file's, and say so: "Removed, was line 14:".
3. Replaced lines are paired as changed lines. When as many lines were removed as added, they pair line by line. When the numbers differ, lines pair from the top while they share at least half their words, and the rest are listed as removed or added. A changed line reads:
   1. "Changed line 12."
   2. "Before: " followed by the old text.
   3. "After: " followed by the new text.
   4. For a short line where only a few words differ, one more line names them, such as `Words changed: "false" became "true".`, `Words added: ".trim()".` or `Words removed: "async".`
4. A change of indent alone says so in one line: "Changed line 12, indent only, 2 spaces became 4 spaces:" and the code. A change of spaces at the end of a line says "spaces at the end of the line only".
5. Empty lines say "empty" rather than showing nothing.
6. Two unchanged lines are shown before and after each change in the report, so you can tell where you are. `/changes context` followed by a number from 0 to 5 changes that. The transcript row shows none.
7. Each change starts with a heading line, "Change 2 of 3 in register.tsx, near line 40.", and ends with "End of change 2." When the change is inside a function, a class or a markdown section, it is named: "in function speak", "in class Player", "in section Installing". Blind Claude finds it from the file as it was, looking for the nearest definition indented less than the change.
8. A new file says "Created notes.md, 40 lines." and lists its lines as added, up to 200. A longer one says how many were left out.
9. An emptied file, a deleted file, and a file rewritten while too large to compare are each said in one line.
10. Long lines are never cut. Editors wrap them, and the full text matters.

## An example report

What follows is how the start of a report reads, one line of the report per item. In the real file, each item is simply its own line.

1. Blind Claude change report for the last turn that changed files.
2. 2 files changed: 4 lines added, 1 removed, 2 changed.
3. Files: 1, register.tsx, 3 changes. 2, speech.ts, 1 change.
4. Each file starts with a line beginning "File", and each change with a line beginning "Change".
5. (empty line)
6. File 1 of 2: plugin\hooks\register.tsx. Edited: 3 lines added, 2 changed.
7. Change 1 of 3 in register.tsx, near line 41, in function speak.
8. Unchanged line 40: `  const spoken = cleanForSpeech(text)`
9. Changed line 41.
10. Before: `  if (spoken === '') return`
11. After: `  if (spoken.trim() === '') return`
12. Words added: ".trim()".
13. Added line 42: `  // Never wait for speech to finish.`
14. Unchanged line 43: `  const isSent = await sendToServer($, command)`
15. End of change 1.

Control F with the word "Change" moves from one change to the next, and "File" from one file to the next.

## The web page view

For long reports, `/changes view browser` makes the report a web page instead, opened in your browser:

1. Each file is a heading level 2 and each change a heading level 3, so NVDA's H and 3 keys jump between them, and the elements list, NVDA plus F7, shows every file and change at once.
2. Removed text is marked as deleted and added text as inserted, which NVDA can announce.
3. A list of links at the top goes to each file.

It is a single local file with no scripts and no internet use, and it uses the same wording. `/changes view text` goes back to the text file, which stays the default because it is quicker and more familiar.

## Changes made outside Edit and Write

Claude sometimes changes files with shell commands, which never reach the Edit or Write hooks. `/changes git` covers those: it runs `git diff HEAD` and builds the same report from it, covering every change since the last commit, whoever made it. New files git does not track yet are named at the end, but not shown. Outside a git repository, only changes made through Edit and Write can be reported.

## Before you approve an edit

When Claude wants to edit a file and Claude Code would ask you first, Blind Claude works out the change before it is made:

1. The permission dialog says it, such as "Edited a.ts, line 4: 1 line changed.", and offers "Read the change in your editor first". See the prompts and questions document.
2. `/changes preview` opens the change waiting for permission, when a slash command can be typed.
3. `/changes before on` opens it in your editor by itself whenever an edit asks for permission. It is off by default.

## Commands and settings

1. `/changes`: the report for the last turn that changed files.
2. `/changes session`: every change in this session.
3. `/changes` followed by a number: one file from the last turn.
4. `/changes open` followed by a number: open that file itself, at the first change.
5. `/changes git`: a report of `git diff`.
6. `/changes preview`: the change waiting for permission.
7. `/changes auto on` or `off`: open the report by itself after each turn that changed files. Default off.
8. `/changes before on` or `off`: open the change before you approve an edit. Default off.
9. `/changes editor` followed by auto, notepad++, notepad or a program path. Default auto: Notepad++ if installed, else Notepad.
10. `/changes view text` or `/changes view browser`. Default text.
11. `/changes context` followed by a number from 0 to 5. Default 2.
12. `/changes rows full` or `/changes rows summary`: what edits show in the transcript. Default full.
13. `/changes help`: this list. `/changes settings`: the changes menu.

## How it fits in the code

1. `plugin/hooks/diff.ts` holds the pure logic: reading Claude Code's `structuredPatch` into worded lines, pairing removed and added lines, finding the words that changed and the function a change is in, reading `git diff`, working out a preview, and writing the report text and the web page. It is tested in `diff.test.ts`.
2. `register.tsx` records each change from the `tool.call` results of Edit and Write, in the main conversation and in helper agents, in `$.state`, so a reload of the mod mid-session keeps them. They are not kept between sessions; old reports are kept as files instead.
3. A `ui.render` hook on `ToolResult` for Edit and Write draws layer one.
4. `/changes` writes the report with `$.fs.write` and opens it with `plugin/scripts/open-changes.ps1`, which finds Notepad++, names the report, removes old ones and brings the window forward.

## Open questions

1. Does the editor window come to the front reliably on every Windows setup? If not, the spoken message says to press Alt Tab.
2. Windows 11 Notepad restores its tabs between runs, so report files may pile up as tabs. Removing old reports may be enough, but it needs checking.
