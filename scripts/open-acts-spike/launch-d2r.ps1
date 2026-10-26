# Start D2R on a mod in windowed mode, for test sessions driven by computer use.
#   powershell -ExecutionPolicy Bypass -File scripts\open-acts-spike\launch-d2r.ps1 [-Mod d2rr_openacts_arena] [-SavePath d2rr_openacts_test]
#
# Computer use cannot send input to D2R in exclusive fullscreen (Windows reports no
# foreground window), and D2R keeps a separate Settings.json per mod save folder, so
# each new mod starts fullscreen. This sets "Window Mode" to 0 (windowed) in that
# folder's Settings.json, seeding it from the global one if needed, then starts D2R.
param(
    [string]$Mod = 'd2rr_openacts_arena',
    [string]$SavePath = 'd2rr_openacts_test',
    [string]$Game = 'C:\Program Files (x86)\Diablo II Resurrected'
)
$ErrorActionPreference = 'Stop'
$saved = Join-Path $env:USERPROFILE 'Saved Games\Diablo II Resurrected'
$dir = Join-Path $saved "mods\$SavePath"
$settings = Join-Path $dir 'Settings.json'
New-Item -ItemType Directory -Force $dir | Out-Null
if (-not (Test-Path $settings) -and (Test-Path (Join-Path $saved 'Settings.json'))) {
    Copy-Item (Join-Path $saved 'Settings.json') $settings
}
if (Test-Path $settings) {
    $text = Get-Content $settings -Raw
    $new = [regex]::Replace($text, '("Window Mode"\s*:\s*)\d+', '${1}0')
    if ($new -ne $text) { Set-Content $settings $new -NoNewline; Write-Host "Set windowed mode in $settings" }
} else {
    Write-Host "No Settings.json yet; press Alt+Enter in game once to switch to windowed."
}
if (Get-Process D2R -ErrorAction SilentlyContinue) { throw 'D2R is already running; quit it first.' }
Start-Process (Join-Path $Game 'D2R.exe') -ArgumentList "-mod $Mod -txt" -WorkingDirectory $Game
Write-Host "Started D2R -mod $Mod -txt"
