# Opens a Blind Claude change report, or a changed file, in an editor.
#
#   -Path <file>        what to open
#   -Editor <name>      auto, notepad++, notepad, browser, or a program's path
#   -Line <n>           the line to open at, where the editor allows it
#   -Report             the file is a change report: give it a name with the
#                       date and time, open it read only, and remove reports
#                       older than a week from its folder
#
# Prints "OK <editor name>|<path opened>" or "ERROR <text>".

param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Editor = 'auto',
    [int]$Line = 0,
    [switch]$Report
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Find-NotepadPlusPlus {
    foreach ($key in @('HKLM:\SOFTWARE\Notepad++', 'HKLM:\SOFTWARE\WOW6432Node\Notepad++', 'HKCU:\SOFTWARE\Notepad++')) {
        try {
            $dir = (Get-ItemProperty -LiteralPath $key -ErrorAction Stop).'(default)'
            if ($dir -and (Test-Path -LiteralPath (Join-Path $dir 'notepad++.exe'))) { return (Join-Path $dir 'notepad++.exe') }
        } catch { }
    }
    foreach ($dir in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, (Join-Path $env:LOCALAPPDATA 'Programs'))) {
        if (-not $dir) { continue }
        $exe = Join-Path $dir 'Notepad++\notepad++.exe'
        if (Test-Path -LiteralPath $exe) { return $exe }
    }
    return $null
}

# Windows may leave a window started from the background behind the
# terminal, so ask for it to come to the front.
function Show-Window($process) {
    if ($null -eq $process) { return }
    try {
        $shell = New-Object -ComObject WScript.Shell
        for ($i = 0; $i -lt 20; $i++) {
            Start-Sleep -Milliseconds 100
            if ($shell.AppActivate($process.Id)) { return }
        }
    } catch { }
}

function Quote([string]$text) {
    return '"' + $text + '"'
}

try {
    if (-not (Test-Path -LiteralPath $Path)) { throw "file not found: $Path" }
    $target = (Resolve-Path -LiteralPath $Path).Path

    if ($Report) {
        $folder = Split-Path -Parent $target
        $stamp = Get-Date -Format 'yyyy-MM-dd HH-mm-ss'
        $named = Join-Path $folder ("changes $stamp" + [System.IO.Path]::GetExtension($target))
        Move-Item -LiteralPath $target -Destination $named -Force
        $target = $named
        Get-ChildItem -LiteralPath $folder -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like 'changes *' -and $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }

    $name = ''
    $process = $null
    if ($Editor -eq 'browser') {
        Start-Process -FilePath $target
        $name = 'your web browser'
    } else {
        $npp = if ($Editor -eq 'auto' -or $Editor -eq 'notepad++') { Find-NotepadPlusPlus } else { $null }
        if ($Editor -eq 'notepad++' -and -not $npp) { throw 'Notepad++ is not installed' }
        if ($npp) {
            $arguments = @()
            # A report opens in a window of its own that leaves your open files alone.
            if ($Report) { $arguments += @('-multiInst', '-nosession', '-ro') }
            if ($Line -gt 0) { $arguments += "-n$Line" }
            $arguments += (Quote $target)
            $process = Start-Process -FilePath $npp -ArgumentList $arguments -PassThru
            $name = 'Notepad++'
        } elseif ($Editor -eq 'auto' -or $Editor -eq 'notepad') {
            $process = Start-Process -FilePath 'notepad.exe' -ArgumentList (Quote $target) -PassThru
            $name = 'Notepad'
        } else {
            if (-not (Test-Path -LiteralPath $Editor)) { throw "the editor was not found: $Editor" }
            $process = Start-Process -FilePath $Editor -ArgumentList (Quote $target) -PassThru
            $name = [System.IO.Path]::GetFileNameWithoutExtension($Editor)
        }
    }
    Show-Window $process
    [Console]::Out.WriteLine("OK $name|$target")
} catch {
    [Console]::Out.WriteLine("ERROR $($_.Exception.Message)")
}
