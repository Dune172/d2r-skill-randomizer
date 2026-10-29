# Open Acts spike: one graded test session.
# Starts the memory watcher, waits for D2R to start and close, then grades the log.
#   powershell -ExecutionPolicy Bypass -File scripts\open-acts-spike\run-session.ps1
param(
    [string]$Log = ''
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$repo = Resolve-Path (Join-Path $here '..\..')
$observe = Join-Path $here 'bin\observe.exe'
if (-not (Test-Path $observe)) { throw "Build it first: node scripts\open-acts-spike\build-observe.mjs" }
$logs = Join-Path $here 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
if (-not $Log) { $Log = Join-Path $logs ("session-{0}.jsonl" -f (Get-Date -Format 'yyyyMMdd-HHmmss')) }

Write-Host "Watching D2R. Log: $Log"
Write-Host "Start D2R with the 'Open Acts Test Session' shortcut (or -mod d2rr_openacts_arena -txt), play the checklist, then quit D2R."
& $observe -watch $Log | Out-Null

$results = [System.IO.Path]::ChangeExtension($Log, '.results.txt')
node (Join-Path $here 'check-arena.mjs') $Log $repo | Tee-Object -FilePath $results
Write-Host "`nResults saved to $results"
