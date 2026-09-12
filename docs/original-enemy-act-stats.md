# Original enemy stats by act

Research date: September 11, 2026. This analysis does not change randomizer balancing.

The original expansion tables do not provide a universal percentage increase per act. Monster level, difficulty, and the monsters available in each act all affect the result. Health and damage need separate treatment. The previously suggested 15% per act was not supported by this data.

## What was measured

Run `node scripts/analyze-enemy-act-stats.mjs` to reproduce the results from the repository's original `data/txt/monstats.txt`, `levels.txt`, and `monlvl.txt`. See [reference provenance](enemy-reference-data.md) for the comparison with installed D2R data.

The sample contains enabled, spawnable, killable, hostile, ordinary ratio-scaled monsters listed in random spawn slots in campaign areas 2–132, excluding the cow level and areas with zero density. Bosses and NPCs are excluded. Each distinct monster ID and effective level counts once per act. Normal uses the monster's native level; Nightmare and Hell use the area's expansion level. Special encounters, summoned escorts, Terror Zones, and player-count bonuses are outside this sample.

For each monster, calculate the midpoint of its health range and primary physical attack (A1) range after multiplying by the appropriate expansion level table. Report the median of those midpoints. These are table-derived values before integer rounding, not measured combat rolls. Monsters with absent A1 physical damage or a SkillDamage override are excluded from damage samples, rather than counted as zero damage.

The formula is `monster coefficient × level-table base / 100`. The reconstructed legacy engine's `DATATBLS_CalculateMonsterStatsByLevel` implements separate health, damage, defense, attack-rating, and experience calculations, with an exception for noRatio monsters. This is corroborating engine research, not Blizzard-published D2R source or a live D2R combat measurement. [D2MOO implementation](https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Common/src/DataTbls/MonsterTbls.cpp#L541)

## Normal

| Act | Health samples / A1 samples | Native level range | Median health | Change from previous act | Median A1 physical damage | Change from previous act |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| I | 54 / 48 | 1–12 | 23.98 | — | 4.54 | — |
| II | 57 / 47 | 13–23 | 54.00 | +125.23% | 10.56 | +132.86% |
| III | 57 / 54 | 19–25 | 108.36 | +100.67% | 13.12 | +24.27% |
| IV | 20 / 20 | 24–32 | 218.54 | +101.68% | 17.60 | +34.12% |
| V | 35 / 31 | 31–43 | 332.28 | +52.04% | 17.16 | −2.50% |

These describe the sampled rosters, not an engine rule at act boundaries. Act V's lower A1 median does not mean it is easier: spells, other attacks, elements, projectile additions, attack speed, resistances, and pack composition are not measured by A1 physical damage.

## Nightmare and Hell

| Difficulty | Act | Median health | Health change | Median A1 physical damage | Damage change |
| --- | --- | ---: | ---: | ---: | ---: |
| Nightmare | I | 522.00 | — | 24.75 | — |
| Nightmare | II | 780.30 | +49.48% | 32.17 | +30.00% |
| Nightmare | III | 1025.10 | +31.37% | 35.20 | +9.40% |
| Nightmare | IV | 1722.60 | +68.04% | 49.35 | +40.20% |
| Nightmare | V | 1344.53 | −21.95% | 43.73 | −11.40% |
| Hell | I | 4032.75 | — | 65.25 | — |
| Hell | II | 5399.23 | +33.88% | 75.08 | +15.06% |
| Hell | III | 5409.25 | +0.19% | 74.40 | −0.90% |
| Hell | IV | 8345.70 | +54.29% | 100.80 | +35.48% |
| Hell | V | 5803.20 | −30.46% | 81.38 | −19.27% |

Changes are calculated from unrounded values. The Hell sample includes optional level-85 areas in earlier acts, so act number is especially limited as a proxy for progression there.

## Separate monster identity from level growth

The Blunderbore family provides a useful comparison across acts. Its four original Normal variants all have the same midpoint health coefficient of 180, while their resulting health increases through level scaling:

| Original monster ID | Act | Level | Health coefficient | Level health base | Derived midpoint health |
| --- | --- | ---: | ---: | ---: | ---: |
| blunderbore1 | II | 18 | 180 | 64 | 115.2 |
| blunderbore2 | II | 20 | 180 | 73 | 131.4 |
| blunderbore3 | III | 25 | 180 | 100 | 180.0 |
| blunderbore4 | IV | 32 | 180 | 150 | 270.0 |

Moving the level-32 variant to level 18 while retaining its health coefficient would reduce its health by 57.3%. Its level-scaled physical damage would decrease by 40% (damage base 20 becomes 12). Those percentages come directly from the original level curve; they are not proposed universal act modifiers.

For another illustration, the original Normal level curve from level 40 to level 5 reduces health by 92.1% (215 to 17) and damage by 84% (25 to 4), holding the monster coefficients constant.

## Interpretation for shuffling

A researched percentage can be calculated separately for each stat from the original source and destination level-table values. This changes a monster's actual health and damage while retaining its relative attack and health characteristics. It avoids turning every replacement into the particular weak or strong monster slot it replaces.

If a clone already receives the destination monster level, this level scaling already happens in the engine. Applying the full source-to-destination percentage to its coefficients again would double-count the level reduction. Fixed-damage skills and projectile additions require separate handling.

The roster medians above are useful benchmarks, but are not ready-to-apply balancing constants. Equal weighting gives each distinct monster/level one vote; it does not reflect how frequently players encounter it. As a sensitivity check, counting every area occurrence instead changes Normal Act II median health from 54.00 to 74.17. The script supplies both weightings and source-to-destination Normal comparison matrices.

## Input fingerprints

SHA-256:

```text
monstats.txt d87a04cc4900b5974d8b4cb0e06f0f2eaebdacb07544f37e33baf035191cb2cf
levels.txt   67b99ee9c928d758c25a08f3fbc8d2e02acf57f98e5d351567e20a0fdf37427e
monlvl.txt   bda243efe1d1e9591f75b8cf97ac73f78ff691362381f35cc000233eb46c092a
```
