# Challenge 12 Recap: Rust and Rot

**Generated:** 2026-08-23 (last day of cycle, rotation Monday 2026-08-24)

---

## TLDR

| Metric | Value |
|---|---|
| Challenge | #12: Rust and Rot (Entropy + Pestilence + Heavy Burden) |
| Entries | 0. Nobody claimed this board. |
| Winner | None |
| Generation delta | +469 vs last recorded snapshot (5,703 now vs 5,234 on Jul 27). That span is 27 days, not a clean 14-day cycle, because weeks 10-11 were never recapped (see flag 3 below). |
| Top channel (sessions) | Unknown this cycle. `/api/stats?days=14` is still returning the exact same numbers it returned in June, see flag 2 below. |

---

## Operational flags (for Andrew, not for posting)

1. **Zero leaderboard entries.** Challenge 12 (Rust and Rot) closes with no submissions at all. Not necessarily a crisis, three stacked mutations (Entropy + Pestilence + Heavy Burden) is a rough combo, degrading gear plus poison plus heavier armor reqs. Worth watching if a shutout happens again next cycle.
2. **`/api/stats?days=14` looks frozen.** This is the third consecutive check (Jun 28, Jul 12, and now Aug 23) returning byte-for-byte identical numbers: 776 sessions, 5,021 generations, same per-day and per-source breakdown, same "since" date of 2026-06-16. Two months of an unmoving 14-day rolling window is not stale data, it's a stuck endpoint. Worth a look before anyone reports these figures as current.
3. **Weeks 10 and 11 (Jul 13 to Aug 9) were never recapped.** The Jul 27 file in this folder documents a site bug: `/challenge` was showing stale Week 8 data while `/archive` had Week 9 as the latest completed challenge, and Week 10 didn't exist anywhere. No package or recap got drafted for either week as a result. The leaderboard now correctly reports `weekNumber: 12` today, so the rotation itself seems to be moving again, but the two-cycle gap in the archive may still need a look.
4. **Health counter behavior contradicts the "resets on restart" assumption from the Jul 12 recap.** That recap assumed `/api/health`'s `counter` field zeroes out on process restart. But the Jun 28 snapshot recorded 4,964 generations at only 12 seconds of uptime, which isn't possible if it resets. Treating the counter as persistent (not reset by restarts) fits all four snapshots better. Flagging so the old "resets" note doesn't get reused.

---

## This Cycle by Channel (via /api/stats?days=14)

**Do not treat this as real.** Numbers below are unchanged from the Jun 16-28 window and have not moved in two months (see flag 2).

| Source | Sessions | Share |
|---|---|---|
| Direct | 363 | 47% |
| Reddit | 225 | 29% |
| Organic (search) | 157 | 20% |
| NexusMods | 31 | 4% |
| **Total** | **776** | |

---

## Leaderboard (Challenge 12: Rust and Rot)

No entries. `weekNumber: 12`, `entries: []`, difficulty normal, straight from the API.

Rust and Rot stacks Entropy, Pestilence, and Heavy Burden: gear degrades 4x faster and costs 10x to repair, monsters poison you on top of normal damage, and armor strength requirements are up 50%. Rough combo, might explain the shutout, but that's a guess.

---

## Draft: Discord Recap

```
Rust and Rot (Challenge 12) closes tonight with an empty board. Nobody turned in a run this cycle, gear falling apart 4x faster on top of poison stacking and heavier armor reqs must have kept people away.

If you were mid-run, the timer's up as of midnight Pacific, but feel free to still drop your build in here, we'd love to see how far you got.

New challenge flips tomorrow. https://d2rrandomizer.com/challenge?utm_source=discord&utm_campaign=challenge-12
```

Reasoning: No runners to congratulate, so pivoted to acknowledging the empty board honestly instead of glossing over it, per the "zero-entry weeks are a signal, not an embarrassment" rule. Invited people to share unfinished attempts to keep the channel warm. No theme name for the next challenge here since Discord's in-app webhook already handles the official announcement.

---

## Draft: X Post

```
Challenge 12 (Rust and Rot) closes with zero finishers, gear degrading 4x faster stacked with poison damage and heavier armor reqs was a rough one. Challenge 13 starts Monday. https://d2rrandomizer.com/challenge?utm_source=x&utm_campaign=challenge-12 #Diablo2 #D2R
```

Reasoning: Led with the honest result (zero finishers) instead of manufacturing a highlight that doesn't exist. Named the closing theme and its already-public mutations, kept the next challenge to "starts Monday" with no theme or mutation names, one link, two hashtags, 264 characters.

---

## Draft: Reddit

**Decision: skip.**

No evidence a Challenge 12 thread exists or got traction: `/api/stats` has been frozen for two months (flag 2) so Reddit referral activity this cycle can't be verified, and there's no leaderboard result to report even if a thread is live. Post nothing until someone confirms a real thread and the stats endpoint is fixed.

---

## Next Challenge Tease

Challenge 13 theme: **Jackpot**. Mutation details held back for Monday's announcement per skill rules (never reveal next cycle's mutations early).

---

## Data Snapshot (for next cycle baseline)

```json
{
  "challenge": 12,
  "theme": "Rust and Rot",
  "captured_at": "2026-08-23",
  "leaderboard_entries": 0,
  "winner": null,
  "stats_14d_sessions": 776,
  "stats_14d_generations": 5021,
  "stats_14d_note": "FROZEN: identical to the Jun 28 and Jul 12 snapshots, endpoint likely broken, do not trust for reporting",
  "health_counter_at_capture": 5703,
  "health_counter_uptime_seconds": 2070,
  "health_counter_prior_snapshot": 5234,
  "health_counter_prior_snapshot_date": "2026-07-27",
  "health_counter_delta": 469,
  "health_counter_delta_span_days": 27,
  "health_counter_note": "treating as a persistent counter unaffected by process restarts, based on cross-snapshot inconsistency with the old 'resets on restart' theory; see flag 4"
}
```
