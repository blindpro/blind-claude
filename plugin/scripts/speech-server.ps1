# Blind Claude speech server for Windows.
#
# Runs for the whole Claude Code session. The mod writes one JSON command per
# file into the spool folder; this script reads them in name order, deletes
# them, and acts on them. Replies are single lines on standard output:
#   READY                 the spool folder exists and commands are accepted
#   VOICES <json>         answer to a "voices" command
#   ERROR <text>          something went wrong with one command
#
# Commands:
#   { "op": "speak", "text": "...", "interrupt": false }
#   { "op": "stop" }
#   { "op": "config", "voice": "Microsoft Zira Desktop", "rate": 0, "volume": 100 }
#   { "op": "play", "path": "C:\\...\\done-1.wav" }
#   { "op": "voices" }
#   { "op": "quit" }

param(
    [Parameter(Mandatory = $true)][string]$Spool
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Send-Line([string]$line) {
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
}

try {
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.SetOutputToDefaultAudioDevice()
} catch {
    Send-Line "ERROR speech is not available: $($_.Exception.Message)"
    exit 2
}

New-Item -ItemType Directory -Force -Path $Spool | Out-Null
Get-ChildItem -Path $Spool -Filter *.json -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# Keeps a reference to the player so a sound is not cut off by garbage collection.
$player = $null

function Invoke-SpoolCommand($cmd) {
    switch ($cmd.op) {
        'speak' {
            if ($cmd.interrupt) { $synth.SpeakAsyncCancelAll() }
            if ($cmd.text) { [void]$synth.SpeakAsync([string]$cmd.text) }
        }
        'stop' {
            $synth.SpeakAsyncCancelAll()
        }
        'config' {
            if ($null -ne $cmd.voice -and $cmd.voice -ne '') {
                try { $synth.SelectVoice([string]$cmd.voice) }
                catch { Send-Line "ERROR voice not found: $($cmd.voice)" }
            }
            if ($null -ne $cmd.rate) { $synth.Rate = [Math]::Max(-10, [Math]::Min(10, [int]$cmd.rate)) }
            if ($null -ne $cmd.volume) { $synth.Volume = [Math]::Max(0, [Math]::Min(100, [int]$cmd.volume)) }
        }
        'default-voice' {
            $first = $synth.GetInstalledVoices() | Where-Object { $_.Enabled } | Select-Object -First 1
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
        'quit' {
            $synth.SpeakAsyncCancelAll()
            exit 0
        }
        default {
            Send-Line "ERROR unknown command: $($cmd.op)"
        }
    }
}

# Claude Code normally ends this process itself. If Claude Code dies
# without doing so, notice that the parent is gone and exit too.
$parentId = (Get-CimInstance Win32_Process -Filter "ProcessId = $PID").ParentProcessId
$lastParentCheck = Get-Date

Send-Line 'READY'

while ($true) {
    if (-not (Test-Path -LiteralPath $Spool)) { exit 0 }
    if (((Get-Date) - $lastParentCheck).TotalSeconds -gt 5) {
        $lastParentCheck = Get-Date
        if (-not (Get-Process -Id $parentId -ErrorAction SilentlyContinue)) { exit 0 }
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
