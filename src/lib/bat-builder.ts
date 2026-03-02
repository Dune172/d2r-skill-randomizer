/**
 * Generates a Windows batch script that installs the D2R mod and launches the game.
 * The script:
 *   1. Self-elevates to admin if not already elevated
 *   2. Checks a pre-configured path first (if user specified one in the UI)
 *   3. Auto-detects common D2R install paths (Battle.net, Steam)
 *   4. Falls back to prompting the user if none found
 *   5. Copies the mod folder into <D2R dir>\mods\<modName>\
 *   6. Launches D2R.exe with -mod <modName> -txt
 */
export function createInstallerBat(modName: string, d2rDir?: string): Buffer {
  // Pre-configured path line: blank if not provided, set if user entered one in the UI.
  // Strip any double-quotes from the path to avoid breaking the batch SET command.
  const preconfiguredLine = d2rDir
    ? `set "D2R_DIR=${d2rDir.replace(/"/g, '')}"`
    : `set "D2R_DIR="`;

  // Escaping rules for this template literal:
  //   - Regular batch variables  (%VAR%)  : write %VAR%  — % is not special in JS strings
  //   - FOR loop variables       (%%G)    : write %%G    — batch .bat files need double-% for FOR vars
  //   - Script path              (%~f0)   : write %~f0   — batch special syntax, no doubling needed
  //   - Script dir               (%~dp0)  : write %~dp0
  //   - JS interpolation         (${...}) : used only for modName/preconfiguredLine
  const script =
`@echo off
setlocal

set "SELF=%~f0"

:: ── Self-elevate to Administrator if needed ──────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "& { Start-Process cmd.exe -ArgumentList ('/c ' + [char]34 + $env:SELF + [char]34) -Verb RunAs }"
    exit /b
)

:: ── Pre-configured path from installer (optional) ────────────────────────
${preconfiguredLine}
if defined D2R_DIR if not exist "%D2R_DIR%\\D2R.exe" set "D2R_DIR="

:: ── Auto-detect D2R if not pre-configured ────────────────────────────────
if not defined D2R_DIR (
    if exist "%ProgramFiles(x86)%\\Diablo II Resurrected\\D2R.exe" (
        set "D2R_DIR=%ProgramFiles(x86)%\\Diablo II Resurrected"
        goto :found
    )
    if exist "%ProgramFiles%\\Diablo II Resurrected\\D2R.exe" (
        set "D2R_DIR=%ProgramFiles%\\Diablo II Resurrected"
        goto :found
    )
    for %%G in (C D E F G H I J K L) do (
        if exist "%%G:\\Program Files (x86)\\Steam\\steamapps\\common\\Diablo II Resurrected\\D2R.exe" (
            set "D2R_DIR=%%G:\\Program Files (x86)\\Steam\\steamapps\\common\\Diablo II Resurrected"
            goto :found
        )
        if exist "%%G:\\SteamLibrary\\steamapps\\common\\Diablo II Resurrected\\D2R.exe" (
            set "D2R_DIR=%%G:\\SteamLibrary\\steamapps\\common\\Diablo II Resurrected"
            goto :found
        )
    )
    echo D2R was not found automatically.
    echo.
    set /p "D2R_DIR=Enter the full path to your Diablo II Resurrected folder: "
    if not exist "%D2R_DIR%\\D2R.exe" (
        echo ERROR: D2R.exe not found at "%D2R_DIR%"
        pause
        exit /b 1
    )
)

:found
echo Found D2R at: %D2R_DIR%
echo.

:: ── Copy mod files ───────────────────────────────────────────────────────
set "SRC=%~dp0${modName}"
set "DEST=%D2R_DIR%\\mods\\${modName}"

if not exist "%D2R_DIR%\\mods" mkdir "%D2R_DIR%\\mods"

echo Installing ${modName}...
robocopy "%SRC%" "%DEST%" /E /NFL /NDL /NJH /NJS /NC /NS >nul
if %errorlevel% gtr 7 (
    echo ERROR: Failed to copy mod files.
    pause
    exit /b 1
)

echo Mod installed successfully!
echo.
echo Launching D2R... if it does not appear, launch from Battle.net.
start "" "%D2R_DIR%\\D2R.exe" -mod ${modName} -txt
echo.
pause
exit /b 0
`;

  return Buffer.from(script, 'ascii');
}
