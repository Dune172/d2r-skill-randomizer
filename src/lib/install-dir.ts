/**
 * Clean up a D2R install folder typed by a player, for the custom launch shortcut.
 * Browser-safe: the install panel uses it to check the field as they type.
 *
 * Accepts a drive-letter path ("D:\Games\Diablo II Resurrected"), with or without a
 * trailing slash or a trailing "D2R.exe", and forward slashes. Returns the folder with
 * backslashes and no trailing slash, or null if it can't be a Windows folder path.
 */
export function normalizeInstallDir(input: string): string | null {
  let dir = input.trim().replace(/^"(.*)"$/, '$1').replace(/\//g, '\\');
  dir = dir.replace(/\\+D2R\.exe$/i, '').replace(/\\+$/, '');
  if (!/^[A-Za-z]:(\\[^\\]+)*$/.test(dir)) return null;
  // Characters Windows forbids in a path (besides the drive's colon), and control characters.
  if (/[<>:"|?*\u0000-\u001f]/.test(dir.slice(2))) return null;
  // Room for "\D2R.exe" within the 260-character MAX_PATH the shortcut format uses.
  if (dir.length > 240) return null;
  return dir.length === 2 ? `${dir}\\` : dir;
}

/** The shortcut's default folder: the Battle.net install location. */
export const DEFAULT_INSTALL_DIR = 'C:\\Program Files (x86)\\Diablo II Resurrected';
