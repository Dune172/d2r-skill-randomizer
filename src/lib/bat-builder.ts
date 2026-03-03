/**
 * Generates the two installer files bundled in the download ZIP:
 *
 *   Install and Launch.bat  — trivial 2-line launcher, pure ASCII
 *   Install and Launch.ps1  — full installer logic in PowerShell
 *
 * Splitting into bat + ps1 eliminates every cmd.exe quoting / block-parsing /
 * ASCII-encoding pitfall that plagued earlier pure-batch approaches.  The bat
 * file simply invokes the ps1 with -ExecutionPolicy Bypass; all real work
 * (self-elevation, D2R detection, file copy, game launch) lives in the ps1.
 */

/**
 * Returns the 2-line batch launcher.
 * Pure ASCII, no variables, no encoding edge-cases.
 */
export function createInstallerBat(): Buffer {
  const script =
    '@echo off\r\n' +
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install and Launch.ps1"\r\n';
  return Buffer.from(script, 'ascii');
}

/**
 * Returns the PowerShell installer script.
 *
 * Escaping notes for the template literal below:
 *   \`         → literal backtick in output (PowerShell line-continuation / `" escape)
 *   ${modName} → only JS interpolation in this file (plus ${preconfiguredPs1})
 *   $varName   → literal PS1 variable refs (no {}, so JS leaves them alone)
 *   \\         → single backslash in output (required for path separators)
 *   [Environment]::GetEnvironmentVariable('ProgramFiles(x86)') is used instead of
 *   ${env:ProgramFiles(x86)} to avoid triggering JS template interpolation.
 */
export function createInstallerPs1(modName: string, d2rDir?: string): Buffer {
  // In PS1 single-quoted strings '' is the escape for a literal single-quote.
  const preconfiguredPs1 = d2rDir
    ? `$d2rDir = '${d2rDir.replace(/'/g, "''")}'`
    : `$d2rDir = $null`;

  const script = `# Diablo II Resurrected - Skill Randomizer Installer
# Requires PowerShell 5.1 or later (included in Windows 10/11)

# ---- Self-elevate to Administrator if needed ----
if (-not ([Security.Principal.WindowsPrincipal] \`
          [Security.Principal.WindowsIdentity]::GetCurrent() \`
         ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "\`"$PSCommandPath\`""
    )
    exit
}

# ---- Configuration ----
$modName = '${modName}'
${preconfiguredPs1}

# ---- Validate pre-configured path ----
if ($d2rDir -and -not (Test-Path "$d2rDir\\D2R.exe")) { $d2rDir = $null }

# ---- Auto-detect D2R ----
if (-not $d2rDir) {
    $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    $candidates = @(
        "$env:ProgramFiles\\Diablo II Resurrected",
        "$pf86\\Diablo II Resurrected"
    )
    foreach ($drive in 'C','D','E','F','G','H','I','J','K','L') {
        $candidates += "$drive:\\Program Files (x86)\\Steam\\steamapps\\common\\Diablo II Resurrected"
        $candidates += "$drive:\\SteamLibrary\\steamapps\\common\\Diablo II Resurrected"
    }
    $d2rDir = $candidates | Where-Object { Test-Path "$_\\D2R.exe" } | Select-Object -First 1
}

if (-not $d2rDir) {
    Write-Host 'D2R was not found automatically.'
    Write-Host ''
    $d2rDir = Read-Host 'Enter the full path to your Diablo II Resurrected folder'
    if (-not (Test-Path "$d2rDir\\D2R.exe")) {
        Write-Host "ERROR: D2R.exe not found at '$d2rDir'"
        Read-Host 'Press Enter to exit'
        exit 1
    }
}

Write-Host "Found D2R at: $d2rDir"
Write-Host ''

# ---- Copy mod files ----
$src  = Join-Path $PSScriptRoot '${modName}'
$dest = Join-Path $d2rDir "mods\\${modName}"

if (-not (Test-Path "$d2rDir\\mods")) {
    New-Item -ItemType Directory -Path "$d2rDir\\mods" | Out-Null
}

Write-Host 'Installing ${modName}...'
robocopy $src $dest /E /NFL /NDL /NJH /NJS /NC /NS | Out-Null
if ($LASTEXITCODE -gt 7) {
    Write-Host "ERROR: Failed to copy mod files (code $LASTEXITCODE)"
    Read-Host 'Press Enter to exit'
    exit 1
}

Write-Host 'Mod installed successfully!'
Write-Host ''
Write-Host 'Launching D2R... if it does not appear, launch from Battle.net.'
Start-Process "$d2rDir\\D2R.exe" -ArgumentList "-mod ${modName} -txt"
Write-Host ''
Read-Host 'Press Enter to close this window'
`;

  return Buffer.from(script, 'utf8');
}
