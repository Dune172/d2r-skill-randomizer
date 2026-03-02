/**
 * Minimal Windows Shell Link (.lnk) binary generator.
 * Implements a subset of MS-SHLLINK sufficient to create a shortcut that
 * launches a local executable with command-line arguments.
 *
 * Sections written:
 *   1. ShellLinkHeader (76 bytes)
 *   2. LinkInfo  — VolumeIDAndLocalBasePath (ANSI path, expanded fallback)
 *   3. StringData — Arguments only (UTF-16LE, as required by IsUnicode flag)
 *   4. ExtraData  — EnvironmentVariableDataBlock (env var path resolution)
 */

function u16le(n: number): Buffer {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32le(n: number): Buffer {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n, 0);
  return b;
}

/**
 * Build an EnvironmentVariableDataBlock (MS-SHLLINK §2.5.4).
 * Allows Windows to resolve the target path via an environment variable string.
 *
 * BlockSize      = 788 (0x314)
 * BlockSignature = 0xA0000001
 * TargetAnsi     = 260 bytes, null-padded
 * TargetUnicode  = 520 bytes, null-padded UTF-16LE
 */
function buildEnvVarBlock(): Buffer {
  const envPath = '%ProgramFiles(x86)%\\Diablo II Resurrected\\D2R.exe';

  const ansi = Buffer.alloc(260, 0);
  ansi.write(envPath, 0, 'ascii');

  const unicode = Buffer.alloc(520, 0);
  unicode.write(envPath, 0, 'utf16le');

  // 4 + 4 + 260 + 520 = 788 (0x314) ✓
  return Buffer.concat([
    u32le(0x00000314),  // BlockSize
    u32le(0xA0000001),  // BlockSignature
    ansi,               // TargetAnsi   (260 bytes)
    unicode,            // TargetUnicode (520 bytes)
  ]);
}

/**
 * Build a Windows .lnk shortcut that launches D2R via %ProgramFiles(x86)%.
 * The target path is resolved at runtime using the EnvironmentVariableDataBlock,
 * with an expanded fallback path in LinkInfo.LocalBasePath.
 */
export function createD2RShortcut(): Buffer {
  const TARGET_PATH = 'C:\\Program Files (x86)\\Diablo II Resurrected\\D2R.exe';
  const ARGS = '-mod mod -txt';

  // ── 1. ShellLinkHeader (exactly 76 bytes) ──────────────────────────────
  //
  // LinkFlags used:
  //   HasLinkInfo  = 0x00000002
  //   HasArguments = 0x00000020
  //   IsUnicode    = 0x00000080  (StringData fields are UTF-16LE)
  //   HasExpString = 0x00000200  (EnvironmentVariableDataBlock present)
  const LINK_CLSID = Buffer.from([
    0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
  ]);

  const header = Buffer.concat([
    u32le(0x4C),           // HeaderSize
    LINK_CLSID,            // LinkCLSID  (16 bytes)
    u32le(0x000002A2),     // LinkFlags: HasLinkInfo | HasArguments | IsUnicode | HasExpString
    u32le(0x00000020),     // FileAttributes: FILE_ATTRIBUTE_ARCHIVE
    Buffer.alloc(8),       // CreationTime   (FILETIME, zero)
    Buffer.alloc(8),       // AccessTime     (FILETIME, zero)
    Buffer.alloc(8),       // WriteTime      (FILETIME, zero)
    u32le(0),              // FileSize
    u32le(0),              // IconIndex
    u32le(0x00000001),     // ShowCommand: SW_SHOWNORMAL
    u16le(0),              // HotKey
    u16le(0),              // Reserved1
    u32le(0),              // Reserved2
    u32le(0),              // Reserved3
  ]);
  // 4 + 16 + 4 + 4 + 8 + 8 + 8 + 4 + 4 + 4 + 2 + 2 + 4 + 4 = 76 ✓

  // ── 2. LinkInfo ────────────────────────────────────────────────────────
  //
  // LocalBasePath holds the expanded fallback path.
  // Windows will prefer EnvironmentVariableDataBlock for resolution.

  const volumeLabel = Buffer.from([0x00]); // empty, null-terminated
  const volumeIDHeaderSize = 16;
  const volumeIDSize = volumeIDHeaderSize + volumeLabel.length;
  const volumeID = Buffer.concat([
    u32le(volumeIDSize),
    u32le(3),                  // DRIVE_FIXED
    u32le(0),                  // DriveSerialNumber
    u32le(volumeIDHeaderSize), // VolumeLabelOffset
    volumeLabel,
  ]);

  const localBasePath = Buffer.from(TARGET_PATH + '\0', 'ascii');
  const commonPathSuffix = Buffer.from([0x00]);

  const linkInfoHeaderSize = 0x1C; // 28
  const volumeIDOffset = linkInfoHeaderSize;
  const localBasePathOffset = volumeIDOffset + volumeID.length;
  const commonNetRelLinkOffset = 0; // not present
  const commonPathSuffixOffset = localBasePathOffset + localBasePath.length;
  const linkInfoSize =
    linkInfoHeaderSize +
    volumeID.length +
    localBasePath.length +
    commonPathSuffix.length;

  const linkInfoHeader = Buffer.concat([
    u32le(linkInfoSize),
    u32le(linkInfoHeaderSize),
    u32le(1),                       // LinkInfoFlags: VolumeIDAndLocalBasePath
    u32le(volumeIDOffset),
    u32le(localBasePathOffset),
    u32le(commonNetRelLinkOffset),
    u32le(commonPathSuffixOffset),
  ]);

  const linkInfo = Buffer.concat([
    linkInfoHeader,
    volumeID,
    localBasePath,
    commonPathSuffix,
  ]);

  // ── 3. StringData — Arguments (UTF-16LE) ───────────────────────────────
  //
  // Because IsUnicode is set, each CountedString is:
  //   CountCharacters  UInt16LE  (number of UTF-16 code units, not bytes)
  //   String           UTF-16LE  (no null terminator)
  const argsUTF16 = Buffer.from(ARGS, 'utf16le');
  const argsStringData = Buffer.concat([
    u16le(ARGS.length), // CountCharacters (code units)
    argsUTF16,
  ]);

  // ── 4. ExtraData — EnvironmentVariableDataBlock ─────────────────────────
  const envVarBlock = buildEnvVarBlock();

  return Buffer.concat([header, linkInfo, argsStringData, envVarBlock]);
}
