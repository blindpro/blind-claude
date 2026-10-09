# Installs Blind Claude into Claude Code for the current Windows user.
#
# Run from this folder:   .\install.ps1
# Or double click:        install.cmd
#
# Running it again updates an existing install to the code in this folder.
# Options:
#   -Quiet    do not speak the result out loud

param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$Marketplace = 'blind-claude'
$Plugin = 'blind-claude'
$PluginId = "$Plugin@$Marketplace"
$Root = $PSScriptRoot

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

function Fail([string]$text) {
    Say "Install failed. $text"
    exit 1
}

# Runs the claude command and returns its output and exit code.
function Invoke-Claude([string[]]$arguments) {
    $output = & claude @arguments 2>&1 | Out-String
    return [pscustomobject]@{ Code = $LASTEXITCODE; Output = $output.Trim() }
}

Write-Host 'Installing Blind Claude.'

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Fail 'The claude command was not found. Install Claude Code first, then run this again.'
}
if (-not (Test-Path -LiteralPath (Join-Path $Root 'plugin\.claude-plugin\plugin.json'))) {
    Fail 'Run this script from the Blind Claude folder. The plugin folder was not found next to it.'
}

Write-Host 'Step 1 of 3: checking the mod.'
$check = Invoke-Claude @('plugin', 'validate', (Join-Path $Root 'plugin'))
if ($check.Code -ne 0) {
    Write-Host $check.Output
    Fail 'The mod did not pass the check. The details are above.'
}

Write-Host 'Step 2 of 3: adding this folder as a plugin source.'
$known = Invoke-Claude @('plugin', 'marketplace', 'list')
if ($known.Output -match "(?m)^\s*\S*\s*$([regex]::Escape($Marketplace))\s*$") {
    $added = Invoke-Claude @('plugin', 'marketplace', 'update', $Marketplace)
} else {
    $added = Invoke-Claude @('plugin', 'marketplace', 'add', $Root)
}
if ($added.Code -ne 0) {
    Write-Host $added.Output
    Fail 'Claude Code could not add this folder as a plugin source. The details are above.'
}

Write-Host 'Step 3 of 3: installing the mod.'
$installed = Invoke-Claude @('plugin', 'list')
if ($installed.Output -match [regex]::Escape($PluginId)) {
    $result = Invoke-Claude @('plugin', 'update', $PluginId)
    $verb = 'updated'
} else {
    $result = Invoke-Claude @('plugin', 'install', $PluginId, '--scope', 'user')
    $verb = 'installed'
}
if ($result.Code -ne 0) {
    Write-Host $result.Output
    Fail 'Claude Code could not install the mod. The details are above.'
}

Say "Blind Claude is $verb. Start a new Claude Code session, then type slash blind to hear your settings."
