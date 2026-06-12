# extract-casc.ps1 — extract files from the local D2R CASC storage using CascLib.dll
# (from the D2RMM install). Read-only against the game storage.
#
# Usage:
#   powershell -File scripts/extract-casc.ps1 -List "data:data\global\chars\so\cof"   # list names matching prefix
#   powershell -File scripts/extract-casc.ps1 -Files "data:data\global\animdata.d2" -OutRoot "D:\D2RModding\data\data"
param(
    [string]$Storage = 'C:\Program Files (x86)\Diablo II Resurrected',
    [string]$CascDll = 'C:\Users\swann\Documents\Diablo II\D2RMM-169-1-8-0-1762645661\D2RMM 1.8.0\tools\CascLib.dll',
    [string[]]$Files = @(),
    [string]$FileList = '',   # path to a text file with one CASC name per line
    [string]$List = '',
    [string]$OutRoot = '',
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

# When invoked via `powershell -File`, array params arrive as one comma-joined
# string — split them back apart.
$Files = @($Files | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
if ($FileList) {
    $Files += Get-Content $FileList | Where-Object { $_.Trim() }
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class Casc {
    // CascLib exports return C++ bool (1 byte) — must marshal as U1, not the
    // default 4-byte Win32 BOOL, or success checks read stack garbage.
    [DllImport("CASCDLL", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CascOpenStorage(string szParams, uint dwLocaleMask, out IntPtr phStorage);

    // Same export, ANSI marshaling — CascLib's TCHAR is char unless built with UNICODE.
    [DllImport("CASCDLL", EntryPoint = "CascOpenStorage", CharSet = CharSet.Ansi, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CascOpenStorageA(string szParams, uint dwLocaleMask, out IntPtr phStorage);

    [DllImport("CASCDLL", CharSet = CharSet.Ansi, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CascOpenFile(IntPtr hStorage, string szFileName, uint dwLocaleFlags, uint dwOpenFlags, out IntPtr phFile);

    [DllImport("CASCDLL", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CascGetFileSize64(IntPtr hFile, out ulong fileSize);

    [DllImport("CASCDLL", SetLastError = true)]
    public static extern uint CascGetFileSize(IntPtr hFile, out uint fileSizeHigh);

    [DllImport("CASCDLL", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CascReadFile(IntPtr hFile, byte[] lpBuffer, uint dwToRead, out uint pdwRead);

    [DllImport("CASCDLL", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CascCloseFile(IntPtr hFile);

    [DllImport("CASCDLL", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CascCloseStorage(IntPtr hStorage);

    // CASC_FIND_DATA: name buffer is MAX_PATH(1024) ansi chars in CascLib
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct CASC_FIND_DATA {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 1024)]
        public string szFileName;
        public IntPtr szPlainName;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        public byte[] CKey;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        public byte[] EKey;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 16)]
        public string szDataFileName;
        public ulong StorageOffset;
        public ulong FileDataId;
        public ulong FileSize;
        public byte bFileAvailable;
        public uint NameType;
        public uint dwLocaleFlags;
        public uint dwContentFlags;
        public uint dwSpanCount;
    }

    [DllImport("CASCDLL", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern IntPtr CascFindFirstFile(IntPtr hStorage, string szMask, out CASC_FIND_DATA pFindData, string szListFile);

    [DllImport("CASCDLL", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CascFindNextFile(IntPtr hFind, out CASC_FIND_DATA pFindData);

    [DllImport("CASCDLL", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CascFindClose(IntPtr hFind);
}
"@

# Load CascLib.dll from its actual path by pre-loading it so "CASCDLL" resolves.
# P/Invoke resolves by module name; pre-load with LoadLibrary under the alias path.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Loader {
    [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr LoadLibrary(string path);
}
"@

# Copy the DLL next to a temp name "CASCDLL.dll" so the DllImport name matches.
$tempDll = Join-Path $env:TEMP 'CASCDLL.dll'
if (-not (Test-Path $tempDll) -or (Get-Item $tempDll).Length -ne (Get-Item $CascDll).Length) {
    Copy-Item $CascDll $tempDll -Force
}
if ([Loader]::LoadLibrary($tempDll) -eq [IntPtr]::Zero) { throw "Failed to load $tempDll" }

$hStorage = [IntPtr]::Zero
$opened = $false
foreach ($variant in @('wide', 'ansi')) {
    $ok = if ($variant -eq 'wide') { [Casc]::CascOpenStorage($Storage, 0, [ref]$hStorage) }
          else { [Casc]::CascOpenStorageA($Storage, 0, [ref]$hStorage) }
    if ($ok -and $hStorage -ne [IntPtr]::Zero) {
        Write-Host "Storage opened ($variant): $Storage"
        $opened = $true
        break
    }
    Write-Host "CascOpenStorage ($variant) failed (err $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
}
if (-not $opened) { throw "Could not open storage '$Storage'" }

try {
    if ($List) {
        $fd = New-Object Casc+CASC_FIND_DATA
        $mask = if ($List.EndsWith('*')) { $List } else { "$List*" }
        $hFind = [Casc]::CascFindFirstFile($hStorage, $mask, [ref]$fd, $null)
        if ($hFind -eq [IntPtr]::Zero -or $hFind -eq [IntPtr](-1)) {
            Write-Host "No matches for $mask"
        } else {
            $n = 0
            do {
                Write-Host ("{0}  ({1} bytes)" -f $fd.szFileName, $fd.FileSize)
                $n++
                if ($n -ge 2000) { Write-Host '... (truncated at 2000)'; break }
            } while ([Casc]::CascFindNextFile($hFind, [ref]$fd))
            [Casc]::CascFindClose($hFind) | Out-Null
            Write-Host "$n entries"
        }
    }

    $extracted = 0
    $failed = 0
    foreach ($name in $Files) {
        $hFile = [IntPtr]::Zero
        if (-not [Casc]::CascOpenFile($hStorage, $name, 0, 0, [ref]$hFile)) {
            if (-not $Quiet) { Write-Host "OPEN FAILED: $name (err $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))" }
            $failed++
            continue
        }
        [uint64]$size = 0
        $ok64 = [Casc]::CascGetFileSize64($hFile, [ref]$size)
        if (-not $ok64 -or $size -eq 0) {
            [uint32]$high = 0
            $lo = [Casc]::CascGetFileSize($hFile, [ref]$high)
            Write-Host "  size64 ok=$ok64 size=$size | size32 lo=$lo high=$high (err $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
            if ($lo -ne 0xFFFFFFFF) { $size = ([uint64]$high -shl 32) -bor $lo }
        }
        if ($size -eq 0) { Write-Host "SIZE FAILED: $name"; [Casc]::CascCloseFile($hFile) | Out-Null; continue }
        $buf = New-Object byte[] $size
        [uint32]$read = 0
        $okRead = [Casc]::CascReadFile($hFile, $buf, [uint32]$size, [ref]$read)
        [Casc]::CascCloseFile($hFile) | Out-Null
        if (-not $okRead -or $read -ne $size) { Write-Host "SHORT READ: $name ($read/$size, ok=$okRead)"; continue }

        # Strip the "data:" prefix for the on-disk path
        $rel = ($name -replace '^[a-zA-Z]+:', '').TrimStart('\', '/')
        $outPath = [System.IO.Path]::Combine($OutRoot, $rel)
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outPath)) | Out-Null
        [System.IO.File]::WriteAllBytes($outPath, $buf)
        $extracted++
        if (-not $Quiet) { Write-Host "EXTRACTED: $name -> $outPath ($size bytes)" }
    }
    Write-Host "Done: $extracted extracted, $failed not found."
} finally {
    [Casc]::CascCloseStorage($hStorage) | Out-Null
}
