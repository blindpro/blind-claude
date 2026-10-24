# Permission prompts and questions

This document explains Blind Claude's own dialog for permission prompts and for the questions Claude asks you. It is on by default.

## The problem

Claude Code asks before it runs a command or edits a file, and Claude sometimes asks you to choose between options. Claude Code draws both as boxes with pointer arrows, check boxes and numbers in columns. With a screen reader they can be clunky: it is not always clear what is being asked, which choice you are on, or what each one means.

## What Blind Claude shows instead

A dialog above the prompt, laid out to be read from the top:

1. The title, such as "Permission needed." or "Claude has a question, Database."
2. What is being asked, in plain sentences, one per line. For a command: "Claude wants to run a command.", what it does, then the command itself, one line per line of the command, so nothing is hidden. For an edit: the file, and a summary of the change, such as "Edited a.ts, line 4: 1 line changed."
3. The question, such as "Allow it?"
4. The choices, one per line, numbered, with no symbols.
5. A box to type in, under the choices.

When the dialog opens, the attention sound plays and everything above is spoken, including every choice, followed by "Use up and down arrow and Enter, or press a number."

## Moving and choosing

1. Up and down arrow move between the choices. Each choice is spoken as you reach it, with its place, such as "No. 3 of 4."
2. Enter chooses the one you are on.
3. A number key chooses that choice straight away.
4. Down arrow past the last choice reaches the text box. Type there and press Enter to answer in your own words.
5. Escape closes the dialog. For a permission that means no; for a question it means you did not answer, as in Claude Code's own.

## Permission choices

1. Yes.
2. Yes, and allow it for the rest of this session. For edits this allows every file edit; for a command, that exact command; for any other tool, that tool. It lasts until Claude Code is closed.
3. Read the change in your editor first, for edits only. This opens the change report for the edit that is waiting, and keeps the dialog open, so you can read it and come back. See the accessible diffs document.
4. No.
5. Show Claude Code's own prompt instead. This hands the question back to Claude Code, for its other choices such as saving a permission rule for good.

Typing in the box refuses the call and passes what you typed to Claude, so you can say what to do instead, such as "Use the test folder, not the real one."

## Question choices

1. Each choice, with its description after a colon, such as "SQLite: One file, no server."
2. For a question that takes several answers, each choice says "Chosen" or "Not chosen". Choosing one turns it on or off and says its new state. "Done" sends them.
3. Show Claude Code's own question instead.

Typing in the box answers with your own words. When Claude asks several questions at once, they come one at a time, "Question 1 of 2", and the answers are sent together.

## When Claude Code's own prompt is used

1. When the dialog is turned off: `/blind prompts off`, or item 9 of the `/blind` menu. `/blind prompts on` turns it back on.
2. When the terminal is too narrow for Blind Claude's dialog to be placed. Claude Code's own prompt is shown instead, and the debug log says why.
3. For approving a plan in plan mode, which Claude Code must answer itself.
4. When Claude Code would not ask at all, for example because of your permission settings or mode. Blind Claude only takes over a question Claude Code was going to put to you.

## How it works

1. Claude Code decides whether a tool call needs your permission. Blind Claude hooks `tool.check`, and when the answer is "ask", and you are the one to be asked, it shows its dialog and gives your answer back as allow or deny.
2. Questions come through the AskUserQuestion tool. Blind Claude hooks its `tool.call` and answers in its place with the choices you made, so Claude Code's own question dialog never opens.
3. The dialog is a pane opened with the keyboard focus, drawn by a `ui.render` hook from `plugin/hooks/prompts.ts`, which builds its text and is tested in `prompts.test.ts`. A `ui.focus` hook speaks each choice as you move.
4. A hook may only spend a few seconds of its own time, but time waiting on a program it started does not count. So while the dialog waits for you, `plugin/scripts/wait-answer.ps1` waits for the answer, which the dialog writes to a small file when you choose.

## Open questions

1. How NVDA reads the dialog as it is drawn in different terminals, on top of what Blind Claude speaks. If it reads too much, a setting to stop Blind Claude speaking the choices may help.
2. The pane asks for the keyboard when it opens. If you are typing in the prompt at that moment, it opens without it; Control X then Tab reaches it.
