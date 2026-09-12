# Enemy reference data

Extracted read-only on September 10, 2026 from the local Diablo II: Resurrected CASC installation using the repository's `scripts/extract-casc.ps1` and the existing D2RMM CascLib runtime.

| Repository file | CASC path | Purpose |
| --- | --- | --- |
| `data/txt/monstats2.txt` | `data:data/global/excel/monstats2.txt` | Collision size, placement, special behavior eligibility |
| `data/txt/missiles.txt` | `data:data/global/excel/missiles.txt` | Audit projectile behavior and append isolated, owner-scaled quill projectiles |
| `data/txt/monlvl.txt` | `data:data/global/excel/monlvl.txt` | Reference level scaling for balance regression checks |
| `data/hd/character/monsters.json` | `data:data/hd/character/monsters.json` | Original HD mappings plus generated monster aliases |

The extracted and repository `monstats.txt` files both contain 752 parsed rows and match in every compared cell except three existing blank `TreasureClassHerald(H)` cells on `councilmember1..3`. The repository's existing monster data was preserved. Those council members are outside the shuffle roster.

The installed `monstats2.txt` has 624 parsed rows, so it is not a one-to-one positional copy of `monstats.txt`. The randomizer resolves the existing `MonStatsEx` references rather than assuming matching row positions or adding unnecessary extended rows.

On a game data update, refresh the reference files together, review the family eligibility filters, rerun the enemy tests, and repeat in-game checks. The automated tests do not verify graphics loading or hardcoded engine behavior. The generator exports `missiles.txt` when private quill projectiles are appended, preserving all original rows. `monlvl.txt` and `monstats2.txt` remain read-only references. The generated HD lookup is shipped because new monster IDs need aliases.
