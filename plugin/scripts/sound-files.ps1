# Adds or removes one of the person's own sound files for Blind Claude.
#
#   -Action add    -Source <any audio file> -Dest <folder>
#       Converts the file to WAV with ffmpeg when ffmpeg is installed, or
#       copies it when it is already a WAV file. Prints the new file name.
#   -Action remove -Source <file inside the sounds folder>
#
# Prints "OK <name>" on success or "ERROR <text>" on failure.

param(
    [Parameter(Mandatory = $true)][ValidateSet('add', 'remove')][string]$Action,
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$Dest
)

$ErrorActionPreference = 'Stop'

try {
    if ($Action -eq 'remove') {
        if (-not (Test-Path -LiteralPath $Source)) { throw "file not found: $Source" }
        Remove-Item -LiteralPath $Source -Force
        Write-Output "OK $(Split-Path -Leaf $Source)"
        exit 0
    }

    if (-not (Test-Path -LiteralPath $Source)) { throw "file not found: $Source" }
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null

    $base = [System.IO.Path]::GetFileNameWithoutExtension($Source) -replace '[^\w.-]', '_'
    $name = "$base.wav"
    $n = 2
    while (Test-Path -LiteralPath (Join-Path $Dest $name)) { $name = "$base-$n.wav"; $n++ }
    $target = Join-Path $Dest $name

    $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($ffmpeg) {
        & $ffmpeg.Source -loglevel error -y -i $Source -ac 2 -ar 44100 -sample_fmt s16 $target
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $target)) { throw "ffmpeg could not convert $Source" }
    } elseif ([System.IO.Path]::GetExtension($Source) -ieq '.wav') {
        Copy-Item -LiteralPath $Source -Destination $target
    } else {
        throw 'only WAV files can be added without ffmpeg. Install ffmpeg, or convert the file to WAV first.'
    }
    Write-Output "OK $name"
} catch {
    Write-Output "ERROR $($_.Exception.Message)"
    exit 1
}
