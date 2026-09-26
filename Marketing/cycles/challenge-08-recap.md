# Challenge 08 Recap: High Stakes
**Generated:** 2026-06-28 (last day of cycle, rotation Monday 2026-06-29)

---

## TLDR

| Metric | Value |
|---|---|
| Challenge | #8: High Stakes (Arcane Surge + Titan's Grip + House Always Wins) |
| Entries | 4 |
| Winner | Kano (Druid) in 57:18 |
| Generation delta | **No baseline available** (first recorded cycle file; health counter unreliable at 12s uptime). Stats API reports 5,021 generations and 776 sessions over the 14-day window. |
| Top channel (sessions) | Direct/bookmarks (363), Reddit (225), Organic search (157), NexusMods (31) |

---

## This Cycle by Channel (via /api/stats?days=14)

| Source | Sessions | Share |
|---|---|---|
| Direct | 363 | 47% |
| Reddit | 225 | 29% |
| Organic (search) | 157 | 20% |
| NexusMods | 31 | 4% |
| **Total** | **776** | |

Top referrers within Reddit: www.reddit.com (150), com.reddit.frontpage (22), old.reddit.com (15), out.reddit.com (12), reddit.com (1) = 200 attributed Reddit sessions.
YouTube drove 24 referral sessions; Twitch drove 13 (likely from runner VOD links).
Stats endpoint returned 200 OK with full breakdown.

> **Note:** health API `counter` field read 4,964 at an uptime of 12 seconds -- this is a post-restart in-memory counter, not a cumulative all-time total. No previous `cycles/` file exists to derive a delta. Record the stats API `generations` field (5,021 for this 14-day window) as baseline for the next recap.

---

## Leaderboard (Challenge 8: High Stakes)

| Rank | Name | Class | Time | VOD |
|---|---|---|---|---|
| 1 | Kano | Druid | 57:18 | https://www.twitch.tv/videos/2800719510 |
| 2 | Pitspawn | Sorceress | 2:20:12 | https://www.twitch.tv/videos/2802043811 |
| 3 | Dune172 | Druid | 2:22:44 | https://www.twitch.tv/videos/2798024964 |
| 4 | GhostDragon | Warlock | 3:15:42 | https://www.youtube.com/watch?v=4qKmrcs9FCQ |

4 entries total. All four submitted VOD proof. Two Druids in top 3; one Warlock (custom class) on the board.

---

## Draft: Discord Recap

```
Challenge 8 (High Stakes) is done. Here's how it went:

🥇 Kano - Druid - 57:18
https://www.twitch.tv/videos/2800719510

🥈 Pitspawn - Sorceress - 2:20:12
https://www.twitch.tv/videos/2802043811

🥉 Dune172 - Druid - 2:22:44
https://www.twitch.tv/videos/2798024964

4. GhostDragon - Warlock - 3:15:42
https://www.youtube.com/watch?v=4qKmrcs9FCQ

Kano's 57-minute Druid run on a seed with no weapons vendor is genuinely absurd -- go watch it. Big respect to everyone who finished High Stakes; three mutations at once is no joke.

Challenge 9 starts tomorrow. New theme, new mutations. https://d2rrandomizer.com/challenge?utm_source=discord&utm_campaign=challenge-08
```

Reasoning: Named all four finishers since the board is small enough to fit comfortably. Called out Kano's time specifically because sub-1-hour on House Always Wins (no vendor weapons) warrants a highlight. Emoji used only for rank markers, not decoratively. Kept the tease to "new mutations" without naming them.

---

## Draft: X Post

```
Challenge 8 (High Stakes) wrapped. Kano ran a Druid to credits in 57:18 -- no weapon vendors, double the mana cost, heavy strength reqs. All four entries came with VOD. Challenge 9: Toil and Trouble starts Monday. https://d2rrandomizer.com/challenge?utm_source=x&utm_campaign=challenge-08 #Diablo2 #D2R
```

Reasoning: Led with the winner and time, named the challenge theme for #9 (Toil and Trouble) without listing its mutations, closed with the link and two hashtags per channel rules. Under 280 characters.

---

## Draft: Reddit

**Decision: draft a comment, not skipped.**

Reddit drove 225 sessions this cycle (29% of total, top non-direct channel). The referrer breakdown shows substantial frontpage traffic (`com.reddit.frontpage`: 22), suggesting an existing thread had meaningful reach. A closing comment in that thread is warranted rather than a new post to avoid repeat self-promo. If no challenge thread was posted this cycle, skip this draft.

**Target:** existing Challenge 8 announcement thread in r/Diablo_2_Resurrected or r/Diablo2.

```
Challenge 8 (High Stakes) is done -- here's the final board:

1. Kano / Druid / 57:18 (https://www.twitch.tv/videos/2800719510)
2. Pitspawn / Sorceress / 2:20:12 (https://www.twitch.tv/videos/2802043811)
3. Dune172 / Druid / 2:22:44 (https://www.twitch.tv/videos/2798024964)
4. GhostDragon / Warlock / 3:15:42 (https://www.youtube.com/watch?v=4qKmrcs9FCQ)

Kano's run especially is worth watching if you want to see gambling-only gear acquisition taken to its logical extreme. Challenge 9 flips over tomorrow morning if you want in early: https://d2rrandomizer.com/challenge?utm_source=reddit&utm_campaign=challenge-08
```

Reasoning: Posted as a comment in the challenge thread rather than a new submission, so no title needed. Disclosed dev role is implied by the context (posting in own challenge thread). No hashtags per Reddit channel rules. "tomorrow morning" softens the promo angle.

---

## Data Snapshot (for next cycle baseline)

```json
{
  "challenge": 8,
  "theme": "High Stakes",
  "captured_at": "2026-06-28",
  "leaderboard_entries": 4,
  "winner": "Kano",
  "winner_class": "Druid",
  "winner_time_seconds": 3438,
  "stats_14d_sessions": 776,
  "stats_14d_generations": 5021,
  "health_counter_at_capture": 4964,
  "health_counter_note": "unreliable (12s uptime at read time)"
}
```
