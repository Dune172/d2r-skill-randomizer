# Monthly mutation challenges

Starting October 2026, challenges run from midnight on the first of each month
through the last day, using America/Los_Angeles time. Challenge 15 ends September
30. Earlier challenge IDs, seeds, start dates and completed periods stay unchanged.

October 1–31, 2026 is **Challenge 16: Return to Tristram**, seed **21392**:

- Forgotten Arts: skills from carried scrolls, books and equipment. New characters
  begin with a Fire Bolt scroll and Horadric Cube. Corpsefire retains his
  Teleport staff drop alongside the scroll reward and normal loot.
- Molasses: monsters move 30% slower, with doubled minimum damage
  and the original damage spread. Player movement stays unchanged.
- Entropy (existing): equipment durability is quartered and base equipment costs
  are multiplied by ten, increasing repair costs. This also affects equipment
  purchase/sale valuations; scroll prices are unaffected.

The normal challenge XP, hireling and monster-randomization settings still apply.
October uses the challenge's isolated save folder, `seed21392`. Create a fresh
character. Forgotten Arts' existing in-game validation notes still apply.

November becomes Challenge 17; subsequent challenges use successive calendar
months and the existing mutation rotation. The October override doesn't replace
an entry in the historical rotation. Legacy `week` API fields, leaderboard IDs,
announcement state and webhook environment variable are retained for compatibility.

Discord announcements follow each challenge's first day at 9 a.m. Pacific, with
DST handled independently of midnight. Long waits are broken into daily timers
to avoid Node's timeout overflow. Testing must disable the actual webhook.

Verification: `node scripts/verify-monthly-challenges.mjs` checks calendar
boundaries, archive preservation, October's lineup and announcement scheduling.
With an isolated local server on port 3100 and its webhook disabled,
`node scripts/verify-monthly-mod.mjs` builds and checks the actual October ZIP.
