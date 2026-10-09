# Roadmap

The order the work will be done in. Each step should be usable on its own before the next one starts.

Progress as of version 0.1.0: steps 1 to 4 are done. Step 5 is partly done: the quiet status line and sound cues for all four events work; plain tool rows, diffs and notifications do not yet. From step 6, the install and uninstall scripts and the marketplace file are done. Pause and resume from step 3 are not built.

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
2. Add `/voices`, `/voices test`, `/rate` and `/volume`.
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
2. Answered: Claude Code's `$.audio.play` does not play sounds on Windows, so sounds go through the PowerShell speech server, as WAV files.
3. Answered: the Windows SAPI voice list includes "NVDA Sapi" when NVDA is installed, which speaks through NVDA. This may make the NVDA controller client unnecessary.
4. How does NVDA react to the rewritten rows? Does it read them once, or again on every redraw?
