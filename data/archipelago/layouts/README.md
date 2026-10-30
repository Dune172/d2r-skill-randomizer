# Chat layouts for Archipelago mods

`hudmessagepanel.json` and `hudmessagepanelhd.json` are the game's own chat panel layouts
(legacy and HD graphics), unmodified, extracted on 2026-10-30 from D2R 3.3.93847's CASC
storage (`data:data\global\ui\layouts\`) with `scripts/extract-casc.ps1` and D2RMM 1.9.1's
CascLib.

An Archipelago mod ships both with one extra text box, `ArchipelagoMessages`, added at
build time. The companion app writes "You received ..." and "You sent ..." lines into it,
and the game draws them beside the chat, in any display mode.
