# D2RR Marketing — To-Do List (2026-06-11)

## Today — finish the plumbing (~20 min)

- [x] **Redeploy the VPS** — done 2026-06-11, dashboard live with password gate.
- [x] **Verify attribution end-to-end** — done, sessions recording.
- [x] **Re-save the d2rr-voice skill** — done.
- [x] **Run-now access** — done via the d2rr-marketing-dashboard control panel artifact (Run buttons for all 5 tasks).
- [x] **Delete leftovers** — done.
- [x] `git status` check — done.

## This week — the distribution push (biggest traffic lever, ~one afternoon)

Work from `Marketing/distribution/targets.md` + `listing-drafts.md` (copy is pre-written, UTM-tagged).

- [ ] **Nexus Mods** (top priority, ~830 D2R mods): create an account, generate 2–3 sample-seed ZIPs from the site, create the mod page using draft (c), upload the samples (required — pages need a file), link the generator.
- [ ] **D2R-Modding Discord** (~24k members): join via the invite in targets.md, read the rules, post the showcase message (draft d) in their mod-showcase channel.
- [ ] **ModDB** D2R section: create the listing with draft (c).
- [ ] Optional second tier: Phrozen Keep forum, diablo2.io, PureDiablo — check each one's self-promo rules on posting day.
- [ ] **Investigate the failing GitHub deployment integration** (red ✗ on commits, ~376 failed deployments — predates this work; probably a dead Vercel hook worth removing).

## This weekend — first automated cycle (supervise it)

- [ ] **Sunday Jun 14, ~6 PM**: the recap task runs — review the draft in `Marketing/cycles/`. Challenge 7's leaderboard is empty, so expect the "nobody claimed this board" angle. Post what you like.
- [ ] **Monday Jun 15, ~6 AM**: Challenge 8 ("High Stakes") starts and the package task drafts your Reddit/X/Discord posts. Review, keep UTM links intact, post. The in-app Discord announcement fires at 9 AM Pacific on its own.
- [ ] First-run protocol: check every fact in the drafts against the live challenge page. If you correct the same thing twice, tell Claude to fold the correction into the skill.

## Ongoing rhythm (~30 min per 2-week cycle)

- [ ] Mon/Thu: skim the pulse brief (`Marketing/pulse/`), post at most the 3 suggested replies, always with dev disclosure.
- [ ] Friday: glance at the health TLDR; watch `Marketing/metrics.csv` for the sessions trend.
- [ ] July 1: creator-outreach CSV arrives (`Marketing/outreach/`) — approve good rows, then send the Gmail drafts yourself.
- [ ] After 2 full cycles (~mid-July): compare sessions by channel on the dashboard and double down on whichever channel actually converts.

## Backlog / nice-to-have

- [x] Add a clear Generate-page checkbox to enable or disable enemy shuffling, then document its default and shared-link behavior. Done 2026-09-10: Randomize monsters defaults on for Season Beta Race, off for Turbo; shared links preserve the choice.
- [ ] Real auth for marketing.html (nginx basic auth on the VPS) — current gate is client-side only.
- [ ] Fix README drift: it says 12 mutations / weekly challenge / 26-week rotation; reality is 14 / biweekly / 31-slot.
- [ ] In-product virality (the one optimization not yet built): per-seed share links + OG cards so every generated run markets itself.

**Baseline to beat:** 4,787 generations, ~0 attributed sessions (2026-06-11).
