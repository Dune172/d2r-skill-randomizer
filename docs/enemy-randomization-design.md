# Cross-act enemy randomization

Status: experimental implementation, updated September 11, 2026. Available as **Randomize monsters** on the generator. The user has playtested some areas with the earlier roster; the new balance model still needs combat testing.

## Settings and scope

- On by default for Season Beta Race, off for Turbo. Manual changes switch the preset indicator to Custom.
- Shared links and downloads carry `enemyShuffle=1` when enabled. Older links without it stay off.
- Official mutation challenges enable the shuffle starting at Challenge 15 (September 21, 2026). Challenges 1–14 keep their original spawns on replay. The fixed challenge-number rule overrides client flags, and generation/download requests pin the displayed challenge number.
- Seventeen donor families, including mummies, Enslaved and Zakarum zealots. Reviewed donors reject skills, resource drain, unsupported projectiles, incompatible placement and special handlers.
- The tested roster replaces 969 of 1,753 spawn references, including 301 of 540 Normal entries (56%). This measures spawn-table coverage, not the percentage of monsters encountered. All three Blood Moor families change.
- Bosses, presets, scripted areas, unsupported encounters and player summons stay protected. Ground collision size cannot grow beyond the original encounter's size.

## Balance: level handles progression

The replacement keeps its own raw health, physical attack, active elemental damage, defense, attack rating and experience coefficients. Normal receives the original local monster's level. The expansion engine supplies the destination area's level in Nightmare/Hell. The engine applies `monlvl.txt` scaling once; no extra act percentage or source/destination peer normalization is applied.

A low-level brute therefore has much less actual health and damage than its original late-game version, while retaining the brute's own characteristics. Unused attack channels remain unused instead of receiving a fabricated fallback attack. This follows the original game's separate health and damage level curves; see [original stats research](original-enemy-act-stats.md).

Retain targeted safeguards for properties that level does not adjust:

- Resistances: donor values capped at 25% below Normal level 12 and 50% elsewhere in Normal. Nightmare and Hell retain the donor's original resistance values, including vulnerabilities and immunities, without caps or copying the replaced monster's immunities.
- Status duration: retain the established raw duration limit of 25 for poison/cold/random elements and 10 for stun. Below Normal level 12, disable chilling duration and stun procs. Active elemental damage magnitude still uses the donor coefficient and engine level scaling.
- Critical chance: retain the existing cap of 5 below destination Normal level 6 and 10 elsewhere. This field is shared across difficulties.
- Pack size: keep donor group sizes, capped at four below destination Normal level 6 and eight elsewhere, without peer-based toughness resizing. Groups and self-party counts are shared across difficulties. Self-only escorts point to the clone; mixed linked groups remain protected.
- Quill projectiles inherit the relocated monster's attack instead of importing independent projectile damage or level-dependent projectile acceleration.
- Unreviewed skill damage and special handlers remain excluded from the donor pool.

Movement, blocking, regeneration, drain and cold response retain the donor values. Drops, spawn rarity and quest treasure fields remain destination-appropriate. Level scaling is campaign progression, not dynamic scaling to player equipment. These safeguards are playtest settings, not percentages inferred from the original act averages.

## Dependencies and projectiles

Target-only permissions allow replacing some monsters whose original mechanics are not supported as donors: blunderbore properties, doll death explosions, and skeleton/fetish resurrection metadata disappear with the original monster. They are not transferred into the replacement.

Area protection covers every variant in a leader's linked family, plus broader greater-mummy and fetish-shaman resurrection families. Protected families can neither be replaced nor introduced as donors in that area. Linked groups, flying placements, casters and independent damage paths need individual review.

Zakarum zealots are donors outside their native Act 3 only. Their quest-dependent flight is restricted to Act 3 in the reviewed classic-engine implementation. Original zealots retain their quest behavior.

Quill rats use private `d2rr_spike*` projectile rows. `SrcDamage=128` and `HitShift=8` inherit the balanced monster attack. Independent base and per-level damage are zero, and `VelLev=0` prevents imported projectile acceleration. Original missile rows and references remain unchanged. Only generated mods using private projectiles export the appended missile table.

## Determinism and integration

- Selection still uses `enemies:v3`; the balance revision changes stats, not the selected roster. Manifest version is 5 and cache pipeline version is 52.
- Original monster order, variant chains, extended shape rows and original graphics aliases are preserved. Clones keep the donor's `BaseId` and `MonStatsEx`, clear `NextInClass`, and receive HD aliases.
- Clones are keyed by act, original variant and donor. Shared clones use the same Normal level; Nightmare/Hell levels come from their spawn areas.
- The manifest records source act, raw balanced coefficients and final coefficients after modifiers.
- Player/XP scalers and mutations receive explicit destination acts. Balance precedes those modifiers; shared level-table updates compose with density mutations.
- Skill RNG is independent. Changing or toggling monster balance does not change skill trees.

## Verification

Run `npm run test:enemies` for deterministic eight-seed checks, original-row preservation, references, group protection, unchanged donor stat coefficients, actual level-curve calculations, Act V-to-Act I resistance caps, status durations, modifiers and ZIP packaging. Replacing Fallen versus zombies cannot change the donor's combat coefficients. Moving the same donor between levels changes its effective stats through the original level table.

Against an isolated local server on port 3107:
- `node scripts/verify-enemy-download.mjs` compares shuffle off/on and player/XP settings, then writes a sample ZIP to the system temporary directory.
- `node scripts/verify-challenge-enemies.mjs` checks the rollout boundary and actual mutation effects for challenges 14–16.

In-game checks still need to cover attack frequency, burst damage, time to kill, pack pressure, rewards, rendering, pathing, resurrection interactions, champions/uniques and quest progression. Coefficient checks do not measure actual combat balance.

## References

- Local `monstats.txt`, `levels.txt`, `monstats2.txt`, `missiles.txt` and `monlvl.txt`; see [reference provenance](enemy-reference-data.md).
- [D2R data guide](https://locbones.github.io/D2R_DataGuide/): monster levels, ratio scaling, elemental fields and projectile damage.
- [D2MOO AI implementation](https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Game/src/AI/AiThink.cpp): mummy/minion attacks and Act III zealot behavior. Classic-engine references inform the review; they do not prove D2R compatibility.
