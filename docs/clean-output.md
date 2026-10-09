# Clean output

This document lists what Blind Claude removes or replaces in Claude Code's output, and the rules it follows.

## Goals

1. Nothing decorative is read aloud.
2. Nothing meaningful is lost. If a symbol carries meaning, it becomes a word.
3. Code is never changed. What is inside a code block, a file, or a command stays exactly as written.

## Layer one: asking Claude to write plainly

Blind Claude adds a short section to Claude's system prompt. It asks Claude to:

1. Not use emoji, arrows, check marks, or decorative symbols.
2. Not use markdown tables. Use a list, or one sentence per row, instead.
3. Use bold and italics rarely, since the markers can be read aloud.
4. Not draw diagrams or trees with characters. Describe them in words.
5. Write numbered lists for steps.
6. Say "file register.ts, line 40" rather than relying on symbols alone to point at code.

This stops most symbols before they are ever written. Layer two catches the rest.

## Layer two: cleaning what is drawn

Every reply and every tool row passes through the cleaner before it is drawn in the terminal.

### Removed

1. Emoji of every kind, including flags, skin tone modifiers and joined emoji sequences.
2. Box drawing characters, such as corners, lines and joins used for borders.
3. Block and shade characters used for progress bars.
4. Braille pattern characters used for spinner animations.
5. Horizontal rules made of dashes, stars or underscores.
6. Markdown emphasis markers: double stars, single stars and underscores around words.
7. Heading markers. The heading text stays on its own line.
8. Decorative bullets such as filled circles, hollow circles, triangles and small squares. A plain dash takes their place, or nothing when the item already starts on its own line.
9. Variation selectors and zero width joiners left behind by other symbols.

### Replaced with words

1. Check mark becomes "done".
2. Cross mark becomes "failed".
3. Warning sign becomes "warning".
4. Right arrow becomes "to", left arrow becomes "from", and double arrows become "to" as well.
5. The ellipsis character becomes three periods, or is dropped at the end of a status line.
6. Greater than or equal, less than or equal, and not equal signs become words when they appear in prose, but not in code.
7. Claude Code's own result marker, the small corner shape in front of tool output, becomes "Result:".

### Tables

Markdown tables are turned into lines a screen reader can follow. The header row names the columns, and each row becomes one line.

For a table with the columns Name and Size, and the rows "app.ts, 4 kilobytes" and "util.ts, 1 kilobyte", the output is:

1. Table with 2 rows and 2 columns: Name, Size.
2. Row 1. Name: app.ts. Size: 4 kilobytes.
3. Row 2. Name: util.ts. Size: 1 kilobyte.

### Never touched

1. Text inside code blocks and inline code.
2. File contents shown by tools.
3. Diffs. These are handled separately, see below.
4. Anything the user typed.

## Diffs

When Claude edits a file, Claude Code shows a colored diff. Color means nothing to a screen reader. Blind Claude rewrites diff rows so every changed line starts with a word:

1. "Added line 12:" followed by the new text.
2. "Removed line 12:" followed by the old text.
3. A summary line first, such as "Edited register.ts: 3 lines added, 1 removed."

## Speech cleaning

Speech goes further than display, because hearing code read out character by character is slow. On top of everything above, speech cleaning:

1. Replaces a code block with "Code block, Python, 14 lines." The full code is still on screen.
2. Shortens file paths to the file name, unless two files share a name.
3. Shortens web addresses to the site name, for example "link to github.com".
4. Reads common abbreviations as words where a voice would stumble, such as "e.g." as "for example".
5. Collapses runs of blank lines and repeated punctuation.

## Settings

1. `/clean on`: clean the display. This is the default.
2. `/clean off`: show Claude Code's output unchanged. Speech is still cleaned.
3. `/clean words`: like on, but also replaces emoji with their name, such as "smiling face", instead of removing them. Useful when an emoji might matter.

## Testing

The cleaner is a pure function from text to text. It has its own test file with examples of real Claude Code output, each paired with the expected clean result. Any new symbol found in the wild gets a test case before it gets a rule.
