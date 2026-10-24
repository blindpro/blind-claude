# Waits for the answer to a Blind Claude dialog.
#
#   -Path <file>  the file the mod writes the answer into
#   -Seconds <n>  how long to wait before giving up for now
#
# The mod writes the answer followed by a line "END", so a file still
# being written is never read half way. Prints "ANSWER <text>" and deletes
# the file, or prints "WAITING" when the time ran out.
#
# A hook may only spend a few seconds of its own time, but time spent
# waiting on a program it ran does not count, so the dialog waits here.

param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Seconds = 540
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$until = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $until) {
    if (Test-Path -LiteralPath $Path) {
        try {
            $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
        } catch {
            $text = ''
        }
        $end = $text.LastIndexOf("`nEND")
        if ($end -ge 0) {
            Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
            # One line on standard output: newlines in a typed answer are kept as \n.
            $answer = $text.Substring(0, $end).Replace('\', '\\').Replace("`r", '').Replace("`n", '\n')
            [Console]::Out.WriteLine("ANSWER $answer")
            exit 0
        }
    }
    Start-Sleep -Milliseconds 50
}
[Console]::Out.WriteLine('WAITING')
