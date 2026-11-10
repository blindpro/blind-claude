# Blind Claude speech server for Windows.
#
# Runs for the whole Claude Code session. The mod writes one JSON command per
# file into the spool folder; this script reads them in name order, deletes
# them, and acts on them. Replies are single lines on standard output:
#   READY                 the spool folder exists and commands are accepted
#   VOICES <json>         answer to a "voices" command
#   ENGINE <name>         the engine speaking now: nvda, windows or none
#   ERROR <text>          something went wrong with one command
#   STOP <text>           why the server is about to exit
#
# Commands:
#   { "op": "speak", "text": "...", "interrupt": false }
#   { "op": "stop" }
#   { "op": "config", "voice": "Microsoft Zira Desktop", "rate": 0, "volume": 100, "engine": "auto" }
#   { "op": "play", "path": "C:\\...\\done-1.wav" }
#   { "op": "voices" }
#   { "op": "engine" }      asks for an ENGINE line
#   { "op": "title", "text": "Working, Claude Code, project" }
#   { "op": "quit" }
#
# The title command sets the title of the console Claude Code runs in, the
# window or tab title. This process has a hidden console of its own, so it
# joins Claude Code's console for a moment to set the title, then leaves
# it. When Claude Code closes, the title it had before is put back.
#
# The engine setting: "auto" speaks through NVDA while it runs and through
# the Windows voices otherwise, "nvda" only through NVDA, "windows" only
# through the Windows voices. NVDA is reached with its controller client
# library in ..\lib\nvda, so it speaks with NVDA's own voice and settings.

param(
    [Parameter(Mandatory = $true)][string]$Spool
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Send-Line([string]$line) {
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
}

$synth = $null
$synthError = ''
try {
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.SetOutputToDefaultAudioDevice()
} catch {
    $synth = $null
    $synthError = $_.Exception.Message
}

# The NVDA controller client that matches this process: a 64 bit
# PowerShell cannot load the 32 bit library, and the other way round.
$nvdaLoaded = $false
$nvdaError = ''
try {
    $arch = switch ([string][System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture) {
        'X86' { 'x86' }
        'Arm64' { 'arm64' }
        default { 'x64' }
    }
    $nvdaDll = Join-Path $PSScriptRoot "..\lib\nvda\$arch\nvdaControllerClient.dll"
    if (-not (Test-Path -LiteralPath $nvdaDll)) { throw "the NVDA library is missing: $nvdaDll" }
    if (-not ('BlindClaude.Nvda' -as [type])) {
        Add-Type -Namespace BlindClaude -Name Nvda -MemberDefinition @'
[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern IntPtr LoadLibraryW(string path);
[DllImport("nvdaControllerClient.dll")]
public static extern int nvdaController_testIfRunning();
[DllImport("nvdaControllerClient.dll", CharSet = CharSet.Unicode)]
public static extern int nvdaController_speakText(string text);
[DllImport("nvdaControllerClient.dll")]
public static extern int nvdaController_cancelSpeech();
'@
    }
    # Loaded by its full path first, so the imports above find this copy.
    $fullPath = (Resolve-Path -LiteralPath $nvdaDll).Path
    if ([BlindClaude.Nvda]::LoadLibraryW($fullPath) -eq [IntPtr]::Zero) {
        throw "Windows could not load the NVDA library, error $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    $nvdaLoaded = $true
} catch {
    $nvdaError = $_.Exception.Message
}

if ($null -eq $synth -and -not $nvdaLoaded) {
    Send-Line "STOP speech is not available: $synthError $nvdaError"
    exit 2
}

$engineMode = 'auto'
$lastEngine = ''
$nvdaChecked = [DateTime]::MinValue
$nvdaRunning = $false

# Asking NVDA is quick, but speech comes in bursts, so the answer is kept
# for a second.
function Test-Nvda {
    if (-not $nvdaLoaded) { return $false }
    if (((Get-Date) - $script:nvdaChecked).TotalMilliseconds -gt 1000) {
        $script:nvdaChecked = Get-Date
        try { $script:nvdaRunning = ([BlindClaude.Nvda]::nvdaController_testIfRunning() -eq 0) }
        catch { $script:nvdaRunning = $false }
    }
    return $script:nvdaRunning
}

# Which engine speaks now, told to the mod whenever it changes.
function Get-Engine {
    $engine = switch ($script:engineMode) {
        'nvda' { if (Test-Nvda) { 'nvda' } else { 'none' } }
        'windows' { if ($null -ne $synth) { 'windows' } else { 'none' } }
        default { if (Test-Nvda) { 'nvda' } elseif ($null -ne $synth) { 'windows' } else { 'none' } }
    }
    if ($engine -ne $script:lastEngine) {
        $script:lastEngine = $engine
        Send-Line "ENGINE $engine"
    }
    return $engine
}

function Stop-Speech {
    if ($null -ne $synth) { $synth.SpeakAsyncCancelAll() }
    if ($script:lastEngine -eq 'nvda') {
        try { [void][BlindClaude.Nvda]::nvdaController_cancelSpeech() } catch { }
    }
}

function Say([string]$text) {
    $engine = Get-Engine
    if ($engine -eq 'nvda') {
        if ([BlindClaude.Nvda]::nvdaController_speakText($text) -eq 0) { return }
        # NVDA closed since it was last asked. Ask again, and in auto mode
        # say it with the Windows voice instead.
        $script:nvdaChecked = [DateTime]::MinValue
        $engine = Get-Engine
    }
    if ($engine -eq 'windows') { [void]$synth.SpeakAsync($text) }
}

New-Item -ItemType Directory -Force -Path $Spool | Out-Null

# Remove spool folders left behind by sessions that ended more than a day
# ago. Only ever inside a folder named blind-claude, and only folders named
# by a number, so a wrong -Spool path cannot remove anything else.
$spoolParent = Split-Path -Parent $Spool
if ((Split-Path -Leaf $spoolParent) -eq 'blind-claude') {
    Get-ChildItem -Path $spoolParent -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d+$' -and $_.FullName -ne $Spool -and $_.LastWriteTime -lt (Get-Date).AddDays(-1) } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
Get-ChildItem -Path $Spool -Filter *.json -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# Keeps a reference to the player so a sound is not cut off by garbage collection.
$player = $null

# The processes above this one, nearest first, found when the first title
# is set; Claude Code's console is the console of the first claude, node or
# bun process among them. $originalTitle is the title before the first set.
$ancestors = $null
$consoleOwner = $null
$originalTitle = $null

function Initialize-ConsoleApi {
    if ('BlindClaude.Con' -as [type]) { return }
    Add-Type -Namespace BlindClaude -Name Con -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool FreeConsole();
[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool AttachConsole(uint pid);
[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern bool SetConsoleTitleW(string title);
[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern uint GetConsoleTitleW(System.Text.StringBuilder title, uint size);
[DllImport("kernel32.dll")]
public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
'@
}

function Find-ConsoleOwner {
    if ($null -ne $script:ancestors) { return }
    $script:ancestors = @()
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $PID"
    while ($process -and $script:ancestors.Count -lt 12) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ParentProcessId)"
        if ($process) { $script:ancestors += $process }
    }
    $script:consoleOwner = $script:ancestors | Where-Object { $_.Name -match '^(claude|node|bun)\.exe$' } | Select-Object -First 1
}

# Joins the console of process $ownerId, runs $action there, and leaves it.
# Control C in that console is ignored by this process while it is joined.
function Invoke-InConsole([uint32]$ownerId, [scriptblock]$action) {
    [void][BlindClaude.Con]::FreeConsole()
    if (-not [BlindClaude.Con]::AttachConsole($ownerId)) { return $false }
    try {
        [void][BlindClaude.Con]::SetConsoleCtrlHandler([IntPtr]::Zero, $true)
        & $action
    } finally {
        [void][BlindClaude.Con]::FreeConsole()
    }
    return $true
}

function Set-WindowTitle([string]$text) {
    Initialize-ConsoleApi
    Find-ConsoleOwner
    if ($null -eq $script:consoleOwner) {
        Send-Line 'ERROR the window title cannot be set: Claude Code''s process was not found'
        return
    }
    $isSet = Invoke-InConsole $script:consoleOwner.ProcessId {
        if ($null -eq $script:originalTitle) {
            $old = New-Object System.Text.StringBuilder 1024
            [void][BlindClaude.Con]::GetConsoleTitleW($old, 1024)
            $script:originalTitle = $old.ToString()
        }
        [void][BlindClaude.Con]::SetConsoleTitleW($text)
    }
    if (-not $isSet) { Send-Line 'ERROR the window title cannot be set: Claude Code''s console could not be reached' }
}

# Claude Code has closed: put the old title back, through a process above
# it that shares its console, such as the shell it was started from.
function Restore-WindowTitle {
    if ($null -eq $script:originalTitle -or $null -eq $script:consoleOwner) { return }
    $index = [Array]::IndexOf($script:ancestors, $script:consoleOwner)
    foreach ($process in ($script:ancestors | Select-Object -Skip ($index + 1))) {
        if (-not (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) { continue }
        $isSet = Invoke-InConsole $process.ProcessId { [void][BlindClaude.Con]::SetConsoleTitleW($script:originalTitle) }
        if ($isSet) { return }
    }
}

function Invoke-SpoolCommand($cmd) {
    switch ($cmd.op) {
        'speak' {
            if ($cmd.interrupt) { Stop-Speech }
            if ($cmd.text) { Say ([string]$cmd.text) }
        }
        'stop' {
            Stop-Speech
        }
        'engine' {
            [void](Get-Engine)
            Send-Line "ENGINE $script:lastEngine"
        }
        'config' {
            if ($cmd.engine -in @('auto', 'nvda', 'windows')) {
                $script:engineMode = [string]$cmd.engine
                [void](Get-Engine)
            }
            if ($null -eq $synth) { return }
            if ($null -ne $cmd.voice -and $cmd.voice -ne '') {
                try { $synth.SelectVoice([string]$cmd.voice) }
                catch { Send-Line "ERROR voice not found: $($cmd.voice)" }
            }
            if ($null -ne $cmd.rate) { $synth.Rate = [Math]::Max(-10, [Math]::Min(10, [int]$cmd.rate)) }
            if ($null -ne $cmd.volume) { $synth.Volume = [Math]::Max(0, [Math]::Min(100, [int]$cmd.volume)) }
        }
        'default-voice' {
            # Screen reader bridge voices such as "NVDA Sapi" report success
            # but make no sound here, so prefer a voice that really speaks.
            if ($null -eq $synth) { return }
            $enabled = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled })
            $real = $enabled | Where-Object { $_.VoiceInfo.Name -notmatch '^(NVDA|JAWS)' } | Select-Object -First 1
            $first = if ($real) { $real } else { $enabled | Select-Object -First 1 }
            if ($first) { $synth.SelectVoice($first.VoiceInfo.Name) }
        }
        'play' {
            if (Test-Path -LiteralPath $cmd.path) {
                $script:player = New-Object System.Media.SoundPlayer ([string]$cmd.path)
                $script:player.Play()
            } else {
                Send-Line "ERROR sound not found: $($cmd.path)"
            }
        }
        'voices' {
            if ($null -eq $synth) {
                Send-Line 'VOICES []'
                return
            }
            $list = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
                [pscustomobject]@{
                    name    = $_.VoiceInfo.Name
                    culture = $_.VoiceInfo.Culture.DisplayName
                    gender  = [string]$_.VoiceInfo.Gender
                    current = ($_.VoiceInfo.Name -eq $synth.Voice.Name)
                }
            })
            Send-Line ("VOICES " + (ConvertTo-Json -InputObject $list -Compress -Depth 3))
        }
        'title' {
            if ($null -ne $cmd.text) { Set-WindowTitle ([string]$cmd.text) }
        }
        'quit' {
            Stop-Speech
            Send-Line 'STOP asked to quit'
            exit 0
        }
        default {
            Send-Line "ERROR unknown command: $($cmd.op)"
        }
    }
}

# Claude Code normally ends this process itself. If Claude Code dies
# without doing so, notice that the parent is gone and exit too. The check
# must miss twice in a row, so one failed lookup does not end the server.
$parentId = $null
try { $parentId = (Get-CimInstance Win32_Process -Filter "ProcessId = $PID").ParentProcessId } catch { }
$parentStart = $null
if ($parentId) {
    try { $parentStart = (Get-Process -Id $parentId -ErrorAction Stop).StartTime } catch { }
}
$lastParentCheck = Get-Date
$parentMisses = 0

function Test-ParentAlive {
    if (-not $parentId) { return $true }
    try {
        $parent = Get-Process -Id $parentId -ErrorAction Stop
        # A new process that reused the id is not our parent.
        if ($parentStart -and $parent.StartTime -ne $parentStart) { return $false }
        return $true
    } catch [Microsoft.PowerShell.Commands.ProcessCommandException] {
        return $false
    } catch {
        # Could not tell, for example access was denied: assume it lives.
        return $true
    }
}

if (-not $nvdaLoaded) { Send-Line "ERROR NVDA cannot be used: $nvdaError" }
if ($null -eq $synth) { Send-Line "ERROR the Windows voices cannot be used: $synthError" }
Send-Line 'READY'

while ($true) {
    # Something such as a temp folder cleanup removed the spool folder.
    # Make it again rather than stopping speech.
    if (-not (Test-Path -LiteralPath $Spool)) {
        try { New-Item -ItemType Directory -Force -Path $Spool | Out-Null } catch { }
    }
    if (((Get-Date) - $lastParentCheck).TotalSeconds -gt 5) {
        $lastParentCheck = Get-Date
        if (Test-ParentAlive) { $parentMisses = 0 } else { $parentMisses++ }
        if ($parentMisses -ge 2) {
            try { Restore-WindowTitle } catch { }
            Send-Line 'STOP Claude Code has closed'
            exit 0
        }
    }
    $files = Get-ChildItem -Path $Spool -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name
    foreach ($file in $files) {
        try {
            $raw = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
            $cmd = $raw | ConvertFrom-Json
        } catch {
            # The file may still be being written. Try again next pass,
            # unless it has been sitting there broken for a while.
            if (((Get-Date) - $file.LastWriteTime).TotalSeconds -gt 2) {
                Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
            }
            continue
        }
        Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
        try { Invoke-SpoolCommand $cmd } catch { Send-Line "ERROR $($_.Exception.Message)" }
    }
    Start-Sleep -Milliseconds 40
}
