# Removes Blind Claude from Claude Code for the current Windows user.
#
# Run from this folder:   .\uninstall.ps1
# Or double click:        uninstall.cmd
#
# By default your settings and your own sounds are kept, so a later
# install picks up where you left off. Options:
#   -RemoveSettings   also delete your saved Blind Claude settings
#   -RemoveSounds     also delete the sounds you added with /sounds add
#   -Quiet            do not speak the result out loud

param(
    [switch]$RemoveSettings,
    [switch]$RemoveSounds,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$Marketplace = 'blind-claude'
$Plugin = 'blind-claude'
$PluginId = "$Plugin@$Marketplace"

function Say([string]$text) {
    Write-Host $text
    if ($Quiet) { return }
    try {
        Add-Type -AssemblyName System.Speech
        $voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $voice.Speak($text)
        $voice.Dispose()
    } catch { }
}

function Invoke-Claude([string[]]$arguments) {
    $output = & claude @arguments 2>&1 | Out-String
    return [pscustomobject]@{ Code = $LASTEXITCODE; Output = $output.Trim() }
}

Write-Host 'Uninstalling Blind Claude.'

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Say 'Uninstall failed. The claude command was not found.'
    exit 1
}

$problems = @()

Write-Host 'Step 1 of 3: removing the mod.'
$installed = Invoke-Claude @('plugin', 'list')
if ($installed.Output -match [regex]::Escape($PluginId)) {
    $uninstallArgs = @('plugin', 'uninstall', $PluginId, '--scope', 'user')
    if (-not $RemoveSettings) { $uninstallArgs += '--keep-data' }
    $result = Invoke-Claude $uninstallArgs
    if ($result.Code -ne 0) {
        Write-Host $result.Output
        $problems += 'the mod could not be removed'
    }
} else {
    Write-Host 'The mod was not installed.'
}

Write-Host 'Step 2 of 3: removing the plugin source.'
$known = Invoke-Claude @('plugin', 'marketplace', 'list')
if ($known.Output -match "(?m)^\s*\S*\s*$([regex]::Escape($Marketplace))\s*$") {
    $result = Invoke-Claude @('plugin', 'marketplace', 'remove', $Marketplace)
    if ($result.Code -ne 0) {
        Write-Host $result.Output
        $problems += 'the plugin source could not be removed'
    }
} else {
    Write-Host 'The plugin source was not added.'
}

Write-Host 'Step 3 of 3: cleaning up files.'
$spool = Join-Path $env:TEMP 'blind-claude'
if (Test-Path -LiteralPath $spool) {
    Remove-Item -LiteralPath $spool -Recurse -Force -ErrorAction SilentlyContinue
}
# Claude Code keeps each plugin's saved values in its own JSON file here.
$storeFolder = Join-Path $HOME '.claude\plugins\store'
if ($RemoveSettings -and (Test-Path -LiteralPath $storeFolder)) {
    Get-ChildItem -LiteralPath $storeFolder -Filter "$Plugin`_*.json" | Remove-Item -Force
    Write-Host 'Removed your saved settings.'
}
$mySounds = Join-Path $env:LOCALAPPDATA 'BlindClaude\sounds'
if ($RemoveSounds -and (Test-Path -LiteralPath $mySounds)) {
    Remove-Item -LiteralPath $mySounds -Recurse -Force
    Write-Host 'Removed your own sounds.'
} elseif (Test-Path -LiteralPath $mySounds) {
    Write-Host "Kept your own sounds in $mySounds. Run with -RemoveSounds to delete them."
}

if ($problems.Count -gt 0) {
    Say ("Uninstall finished with problems: " + ($problems -join ', ') + '. The details are above.')
    exit 1
}

$kept = if ($RemoveSettings) { '' } else { ' Your settings were kept.' }
Say "Blind Claude is uninstalled.$kept Start a new Claude Code session for the change to take effect."
