/**
 * Minimal Windows Shell Link (.lnk) binary generator.
 * Implements a subset of MS-SHLLINK sufficient to create a shortcut that
 * launches a local executable with command-line arguments.
 *
 * Sections written:
 *   1. ShellLinkHeader (76 bytes)
 *   2. LinkInfo  — VolumeIDAndLocalBasePath (ANSI path)
 *   3. StringData — Arguments only (UTF-16LE, as required by IsUnicode flag)
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
 * Build a Windows .lnk shortcut buffer.
 *
 * @param targetPath - Absolute Windows path to the target executable.
 *                     Must contain only printable ASCII (0x20–0x7E).
 * @param args       - Command-line arguments string.
 */
export function createShortcut(targetPath: string, args: string): Buffer {
  // ── 1. ShellLinkHeader (exactly 76 bytes) ──────────────────────────────
  //
  // LinkFlags used:
  //   HasLinkInfo  = 0x00000002
  //   HasArguments = 0x00000020
  //   IsUnicode    = 0x00000080  (StringData fields are UTF-16LE)
  const LINK_CLSID = Buffer.from([
    0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
  ]);

  const header = Buffer.concat([
    u32le(0x4C),           // HeaderSize
    LINK_CLSID,            // LinkCLSID  (16 bytes)
    u32le(0x000000A2),     // LinkFlags: HasLinkInfo | HasArguments | IsUnicode
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
  // Sanity check: header must be exactly 76 bytes
  // 4 + 16 + 4 + 4 + 8 + 8 + 8 + 4 + 4 + 4 + 2 + 2 + 4 + 4 = 76 ✓

  // ── 2. LinkInfo ────────────────────────────────────────────────────────
  //
  // LinkInfoHeaderSize = 0x1C (28 bytes, the minimum / version 1 layout)
  // LinkInfoFlags      = 0x00000001 (VolumeIDAndLocalBasePath)
  //
  // Layout inside LinkInfo:
  //   [28-byte LinkInfo header]
  //   [VolumeID struct]
  //   [LocalBasePath — null-terminated ANSI]
  //   [CommonPathSuffix — just a null byte]

  // VolumeID: minimum 16-byte header + null-terminated empty volume label
  //   VolumeIDSize         4 bytes
  //   DriveType            4 bytes  (3 = DRIVE_FIXED)
  //   DriveSerialNumber    4 bytes  (0)
  //   VolumeLabelOffset    4 bytes  (0x10 = immediately after the 16-byte header)
  //   VolumeLabel          1 byte   ('\0' = empty string)
  const volumeLabel = Buffer.from([0x00]); // empty, null-terminated
  const volumeIDHeaderSize = 16;
  const volumeIDSize = volumeIDHeaderSize + volumeLabel.length;
  const volumeID = Buffer.concat([
    u32le(volumeIDSize),
    u32le(3),               // DRIVE_FIXED
    u32le(0),               // DriveSerialNumber
    u32le(volumeIDHeaderSize), // VolumeLabelOffset
    volumeLabel,
  ]);

  const localBasePath = Buffer.from(targetPath + '\0', 'ascii');
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
    u32le(1),                         // LinkInfoFlags: VolumeIDAndLocalBasePath
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
  const argsUTF16 = Buffer.from(args, 'utf16le');
  const argsStringData = Buffer.concat([
    u16le(args.length), // CountCharacters (code units)
    argsUTF16,
  ]);

  return Buffer.concat([header, linkInfo, argsStringData]);
}
