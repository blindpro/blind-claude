# Roadmap

The order the work will be done in. Each step should be usable on its own before the next one starts.

## Step 1: Skeleton

1. Create the plugin folder, manifest and hooks module.
2. Register `/blind` so there is a way to see the mod is loaded.
3. Save and load settings.
4. Confirm the mod loads with `claude --plugin-dir plugin` and passes `claude plugin validate`.

## Step 2: Clean output

1. Write the cleaner as a pure text function, with tests built from real Claude Code output.
2. Add the system prompt section that asks Claude to write plainly.
3. Rewrite reply rows with `ui.render` on `AssistantMessage`.
4. Add `/clean on`, `/clean off` and `/clean words`.

## Step 3: Speech

1. Start the long running PowerShell speech process and talk to it.
2. Build the speech queue with stop and priority.
3. Add the four speech levels and `/speak`.
4. Add speech cleaning for code blocks, paths and web addresses.
5. Fall back to Claude Code's built in speech when PowerShell speech is not available.

## Step 4: Voices

1. List SAPI voices.
2. Add `/voice`, `/voice test`, `/rate` and `/volume`.
3. Handle a saved voice that is no longer installed.

## Step 5: Terminal experience

1. Replace the spinner with the quiet status line.
2. Rewrite tool rows and diffs as plain sentences.
3. Add sound cues and `/sounds`.
4. Add notifications and `/notify`.

## Step 6: Sharing

1. Add a marketplace file so others can install the mod with `/plugin install`.
2. Write install steps in the README.
3. Test on a clean Windows machine with NVDA, then with JAWS and Narrator.

## Later

1. OneCore voices on Windows for more natural speech.
2. Speaking through NVDA directly with the NVDA controller client.
3. A keyboard shortcut to stop speech, if Claude Code allows a mod to bind one.
4. macOS and Linux testing.
5. Per project settings, such as a quieter speech level in one repository.

## Open questions

1. Can a mod bind a key that works while the prompt has focus? This decides how stop speech works.
2. Does Claude Code's built in `$.audio.speak` work on Windows, and with which voices?
3. Does Claude Code's `$.audio.play` play sounds in Windows Terminal, or must sounds go through PowerShell?
4. How does NVDA react to the rewritten rows? Does it read them once, or again on every redraw?
