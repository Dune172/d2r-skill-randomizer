# Challenge 13 Recap: All In

**Generated:** 2026-09-06 (last day of cycle, rotation Monday 2026-09-07)

---

## TLDR

| Metric | Value |
|---|---|
| Challenge | #13: All In (No Guard + Titan's Grip + Dead Reckoning) |
| Entries | 1 |
| Winner | Dune172 (Necromancer, 2:54:17) |
| Generation delta | +172 vs last recorded snapshot (5,875 now vs 5,703 on Aug 23). Clean 14-day span this time. |
| Top channel (sessions) | Unknown this cycle. `/api/stats?days=14` is still returning the exact same numbers it's returned since June, see flag 1 below. |

---

## Operational flags (for Andrew, not for posting)

1. **`/api/stats?days=14` is still frozen.** Fourth consecutive check (Jun 28, Jul 12, Aug 23, and now Sep 6) returning byte-for-byte identical numbers: 776 sessions, 5,021 generations, same per-day/per-source breakdown, same "since" date of 2026-06-16. This has now been broken for at least two and a half months. Worth prioritizing a fix before any of these numbers get quoted publicly.
2. **Last cycle's next-challenge tease was wrong.** The Challenge 12 recap teased Challenge 13 as "Jackpot," but `WEEK_NAMES` in `registry.ts` has no such entry, slot 12 (used by challenge 13, since `(13-1) % 31 = 12`) is actually "All In." Not sure where "Jackpot" came from, possibly a guess made before the slot was checked against the registry. Flagging so it doesn't happen again; this recap pulled the theme name directly from the registry function (`getWeekName`) rather than reusing the old tease.
3. **Health counter delta supports the persistent-counter theory from the Aug 23 recap.** This snapshot (5,875 at only 14,099s / ~3.9h of uptime) again shows a low uptime with a counter well above the prior snapshot, consistent with the counter surviving process restarts rather than resetting. Two consecutive cycles now back this reading.
4. **Leaderboard went from 0 entries (Challenge 12) to 1 (Challenge 13).** Better than a shutout, but still thin. Worth watching whether "All In" (no armor, harsher weapon reqs) scared off some runners the same way "Rust and Rot" did last cycle, or whether this is a broader participation dip.

---

## This Cycle by Channel (via /api/stats?days=14)

**Do not treat this as real.** Numbers below are unchanged from the Jun 16-28 window and have not moved in over two months (see flag 1).

| Source | Sessions | Share |
|---|---|---|
| Direct | 363 | 47% |
| Reddit | 225 | 29% |
| Organic (search) | 157 | 20% |
| NexusMods | 31 | 4% |
| **Total** | **776** | |

---

## Leaderboard (Challenge 13: All In)

`weekNumber: 13`, difficulty normal, straight from the API.

| Rank | Player | Class | Time | Video |
|---|---|---|---|---|
| 1 | Dune172 | Necromancer | 2:54:17 | https://www.twitch.tv/videos/2864778911 |

All In stacks No Guard, Titan's Grip, and Dead Reckoning: armor gives zero defense and every defensive skill is stripped from the trees, weapon strength/dex requirements are up 50% (with a damage payoff for meeting them), and stat points per level are reduced while drop rate and quality go up. One clear on the board this cycle.

---

## Draft: Discord Recap

```
All In (Challenge 13) closes tonight and Dune172 takes the win: solo Necromancer, 2:54:17, run's up on Twitch (https://www.twitch.tv/videos/2864778911).

Only one entry on the board this cycle, but clearing No Guard + Titan's Grip + Dead Reckoning with zero armor, no defensive skills, and jacked-up weapon reqs is a real run, not a participation trophy.

Nice work, Dune172. New challenge flips tomorrow.
```

Reasoning: Congratulated the sole finisher by name, class, and exact time per the API, and linked the proof video. Named the closing mutations since they're already public. No theme name for the next challenge here since Discord's in-app webhook already handles the official announcement, matching the Challenge 12 recap's convention.

---

## Draft: X Post

```
Challenge 13 (All In) closes with Dune172's Necromancer clearing it in 2:54:17, zero armor and jacked weapon reqs the whole way. Challenge 14: The Vanguard starts Monday. https://d2rrandomizer.com/challenge?utm_source=x&utm_campaign=challenge-13 #Diablo2 #D2R
```

Reasoning: Led with the winning run and exact time. Named the closing theme's already-public mutations in short form, teased Challenge 14 by theme name only ("The Vanguard"), no mutation details. One link with UTM, two hashtags, under 280 characters.

---

## Draft: Reddit

**Decision: skip.**

No evidence a Challenge 13 thread exists or got traction: `/api/stats` has been frozen for over two months (flag 1) so Reddit referral activity this cycle can't be verified, and with only one leaderboard entry there isn't much of a results story to post either. Revisit once the stats endpoint is fixed and a live thread can be confirmed.

---

## Next Challenge Tease

Challenge 14 theme: **The Vanguard**. Mutation details held back for Monday's announcement per skill rules (never reveal next cycle's mutations early).

---

## Data Snapshot (for next cycle baseline)

```json
{
  "challenge": 13,
  "theme": "All In",
  "captured_at": "2026-09-06",
  "leaderboard_entries": 1,
  "winner": {
    "name": "Dune172",
    "class": "Necromancer",
    "timeSeconds": 10457,
    "timeFormatted": "2:54:17",
    "proofUrl": "https://www.twitch.tv/videos/2864778911"
  },
  "stats_14d_sessions": 776,
  "stats_14d_generations": 5021,
  "stats_14d_note": "FROZEN: identical to the Jun 28, Jul 12, and Aug 23 snapshots, endpoint likely broken, do not trust for reporting",
  "health_counter_at_capture": 5875,
  "health_counter_uptime_seconds": 14099,
  "health_counter_prior_snapshot": 5703,
  "health_counter_prior_snapshot_date": "2026-08-23",
  "health_counter_delta": 172,
  "health_counter_delta_span_days": 14,
  "health_counter_note": "clean 14-day span this cycle; low uptime with counter above prior snapshot again supports the persistent-counter theory from the Aug 23 recap",
  "next_challenge_teaser_correction": "Challenge 12 recap wrongly teased Challenge 13 as 'Jackpot'; registry.ts has no such name, slot 12 is 'All In'. This file's own Challenge 14 tease ('The Vanguard') was pulled directly from getWeekName() to avoid repeating the error."
}
```
