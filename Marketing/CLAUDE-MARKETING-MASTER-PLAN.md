# Master Plan: Using Claude for Marketing

**Source:** Anthropic webinar — "How Anthropic's Marketing Team Uses Claude Cowork" (54 min)
**Speakers:** Emily Holman (Product Marketing, Anthropic) and Austin (Growth Marketing, Anthropic — performance marketing / top-of-funnel acquisition)
**Purpose of this document:** An operating playbook distilled from the webinar so that any future agent (or human) can plan, build, and run Claude-powered marketing workflows professionally and efficiently. Full transcript preserved in `transcript_wrapped.txt` / `transcript.vtt` in this folder.

---

## 1. Core Mental Model: Chat vs. Cowork vs. Claude Code

| Tool | Built for | Interaction model | Best at |
|---|---|---|---|
| **Chat** | Everyone | Q&A conversation; you bring work *to* Claude (paste/upload), copy results back out | Answers, brainstorming, thinking out loud, single-file tasks |
| **Cowork** (desktop app mode) | Knowledge workers / marketers | Delegation; you bring Claude *to* your work (folders, connected apps), it runs autonomously and returns a finished deliverable | Multi-tool, multi-file, long-running tasks ending in a shareable output |
| **Claude Code** | Developers | Terminal/CLI; exposes code, bash, grep | Building and shipping software |

**Key fact:** Cowork *is* Claude Code under the hood — both are powered by the Agent SDK. Cowork wraps the same engine in a friendly chat UI. If a user is non-technical, default to Cowork; it does the same orchestration (writing code to open CSVs, move files, call APIs) invisibly.

**The delegation shape:** Human judgment is needed only at the **beginning** (instructions + context) and the **end** (evaluation). The middle — extracting, compiling, reconciling, reformatting — is "the boring part" and should be fully handed to Claude.

---

## 2. The Five Ingredients of a Cowork-Shaped Task

Use this checklist to decide whether a task belongs in Cowork (vs. plain chat). **A good candidate hits 3–4 of 5.**

1. **Multiple inputs going in** — several files, a whole folder, multiple connectors, or mixed file types. (One Word doc → chat is fine.)
2. **A deliverable coming out** — a spreadsheet, Word doc, PowerPoint, Notion page, report, or live artifact you intend to *do something with*.
3. **You'll do it again** — repetition means it can become a skill and/or a scheduled task; ROI compounds with every rerun.
4. **You know what "good" looks like** — you're familiar enough with the output's shape to validate it in ~10 seconds after a 20–30 minute autonomous run.
5. **The middle is boring** — the work between instructions and review is mechanical extraction/manipulation, not judgment.

**Agent rule of thumb:** If a request fails most of these (single input, no artifact, one-off, exploratory), answer it conversationally instead of building a workflow.

---

## 3. The Three Building Blocks

### 3.1 Connectors (MCPs) — *give Claude context*
- Connectors = MCP (Model Context Protocol) integrations: one-click connections to the systems marketing work already lives in — CRM (HubSpot, Salesforce), Slack, Gmail, Google Drive, Notion, Amplitude, ad platforms (Google Ads, Meta Ads), data warehouses.
- **Without connectors:** Claude is smart but uninformed; users end up copy-pasting context in. **With connectors:** Claude is already up to speed and can pull the latest from Slack, docs, pipelines, and customer calls when drafting campaign briefs or launch docs.
- The more context Claude has, the better the output. Always wire up the relevant connectors *before* building a workflow that depends on that data.

### 3.2 Skills — *teach Claude how your team works*
- A skill is just a **markdown file of plain-text instructions** — a reusable, shareable workflow.
- **Trigger rule of thumb:** If you do something multiple times a week, make it a skill.
- Skills can **load other skills** (e.g., a "mine search terms" skill loads a "search term methodology" skill and an "account naming conventions" skill).
- Skills vs. Projects: a project's context only applies if the conversation *starts inside* the project. A skill can be invoked from **any** conversation — chat, Claude Code, or Cowork. Company-wide assets (brand tone & voice) belong in skills, not projects.
- Skills are shareable across the team so everyone runs the process the same way — you stop being the gatekeeper.

### 3.3 Plugins — *bundle connectors + skills*
- A plugin = connectors (MCPs) + the skills that depend on them, packaged together. Install the plugin and you get both. Use plugins when a skill is useless without its connector.

### 3.4 Scheduled Tasks — *shift from reactive to proactive*
- Any recurring workflow can run on a schedule (hourly, daily, weekly). Build once, run automatically forever.
- Example: weekly Monday 9 AM reporting → schedule it for 6 AM so the report is waiting when you sit down; you just polish and ship.
- Works for personal tasks too (e.g., hourly stock-check of a product page).

### 3.5 Dispatch (mobile remote control)
- Claude on the phone can dispatch tasks to the desktop app — e.g., "pull this file from my Downloads folder and send it to me via Slack" — no computer access needed.

---

## 4. Proven Marketing Workflows (Demonstrated Live)

### Workflow A — Daily Morning Brief (scheduled task)
**Problem:** Information overload — too many Slack channels, emails, and daily checks.
**Setup:** Scheduled task at 6 AM daily, connected to Gmail, Slack, and ad platforms (Google Ads, Meta).
**Instructions encoded:**
- TLDR at top (1–2 sentences, skimmable).
- Flag important emails, grouped by category.
- Auto-mark noise as read (invoice receipts, login codes, meeting accepts/declines) — explicitly list the categories to ignore.
- Report yesterday's ad spend and conversions across platforms; flag anything off.
- Surface missed Slack messages from key channels and any overnight incidents that could affect marketing or customers.
- Output: a short doc, same template every morning.

### Workflow B — Live Budget-Pacing Dashboard (live artifact)
**Problem:** Weekly ritual of exporting CSVs from each ad platform, pasting into Google Sheets, refreshing formulas.
**Setup:** Connect Google Ads + Meta Ads connectors, then describe the dashboard in plain language: pacing vs. budget visualization, single-card metrics (month-to-date spend, target, variance), callouts for what's moving budget and anomalies.
**Result:** A **live artifact** — data refreshes from the APIs every time it's opened. It becomes a personal BI tool; budget targets can be updated conversationally ("May budget is 420,000"). Shareable: anyone with the same connectors can recreate the dashboard and see the same data.
**Variants shown:** multi-platform spend/conversion dashboard; app-store review monitor (categorizes sentiment, classifies reviews, trends ratings for iOS + Google Play).

### Workflow C — Google Ads Search Term Audit (skill + connector = plugin)
**Problem:** Manually exporting the search term report, reviewing row by row for irrelevant terms, uploading negative keywords back.
**Skill architecture (3 layered skills):**
1. **Methodology skill** — judgment criteria: relevance to the business matters more than binary conversion counts; clear negative examples (e.g., "Anthropic jobs").
2. **Account conventions skill** — how campaign naming maps to products, so Claude can interpret the account.
3. **Process skill** — the executable steps: pull search terms via the Google Ads connector → evaluate → build a CSV with specified columns (campaign, keyword, search term, spend, **and a reasoning column**) → present in chat → *offer* to apply exclusions (human approves).
**Runtime:** ~10–20 minutes depending on volume.
**Critical design choice:** the reasoning column creates an **audit trail** so the human can verify and steer ("rows 6–10 look off — don't exclude those").

---

## 5. Trust, Validation, and Iteration Protocol

1. **First runs get heavy scrutiny.** New workflow → healthy skepticism; double-check everything. As the workflow proves itself, dial auditing down to spot checks (e.g., triple-check budget numbers near month-end).
2. **Always build in an audit trail.** Require Claude to show *why* it made each decision (reasoning columns, cited sources). This lets you verify correctness *and* understand failure modes.
3. **Easy-to-validate outputs are best.** Prefer workflows where validation is a quick cross-reference ("does this number match the ad platform?").
4. **Break big work into bite-sized pieces.** For something like a product launch: give Claude the bill of materials, point it at a past launch of similar shape, and have it work in chunks you can validate and steer between — never "go plan the whole launch."
5. **Check in early on first runs.** Don't let Claude run 30 minutes unattended on a brand-new workflow; structure it so you can jump in and steer.
6. **Errors feed the skill.** When a mistake recurs: "We're seeing this issue again — go back and update the skill itself so I don't have to tell you next time."

---

## 6. Prompting & Skill-Building Best Practices

- **Always end the initial prompt with: "Ask me clarifying questions."** This surfaces assumptions you'd otherwise forget to state — date-range definitions (does the week start Monday?), fiscal quarter starts, edge cases.
- **Dictate, don't type, when drafting a skill.** Ramble the entire process aloud (dictation is built into the Claude apps), then: "Organize these raw thoughts into a skill." Ten minutes of brain-dump beats a sparse typed prompt. (Claude has a built-in meta-skill that teaches it how to create skills.)
- **Encode your *exact* manual process** — the steps, the edge cases, what to look out for — at the same level of knowledge you'd use yourself.
- **Specify the output format precisely** (sections, columns, TLDR placement) so every run is consistent and instantly skimmable.
- **List the noise explicitly** (emails to auto-archive, channels to skip) — negative instructions are as valuable as positive ones.
- **Evolve skills with memory.** Periodically: "Search our past conversations using this skill — what nuances or corrections came up that should be folded into the skill?" Skills should be ever-evolving.
- **Find workflow candidates with Claude itself.** Weekly: "What were the top things I did this week? What did I do multiple times? What should become a skill?" Or for newcomers: "Go through our past conversations — what common work would make a good Cowork workflow?"

---

## 7. Adoption Roadmap (for a team rolling this out)

**Phase 1 — Connect (Week 1):** Inventory where marketing work lives (CRM, ads, Slack, email, docs, analytics). Set up those connectors in the Claude desktop app.

**Phase 2 — First win (Week 1–2):** Pick ONE task you know intimately that scores 3+/5 on the ingredients checklist. Run it in Cowork interactively. Validate hard. Iterate.

**Phase 3 — Encode (Week 2–3):** Dictate the process into a skill. Add audit-trail requirements and output templates. Layer skills (methodology / conventions / process) for complex domains.

**Phase 4 — Automate (Week 3–4):** Convert proven recurring skills into scheduled tasks (morning brief, weekly reporting, pacing dashboards).

**Phase 5 — Scale (ongoing):** Share skills and plugins across the team; everyone runs the same process without a gatekeeper. Keep a weekly "what should become a skill?" review. Carve out deliberate tinkering time — non-technical enablement doesn't happen by accident, and the best workflows are bespoke to *your* role (copying someone else's demo verbatim is low-ROI; pattern-match the ingredients instead).

---

## 8. Quick-Reference for Agents Executing Marketing Tasks

- **Route the task:** brainstorm/single-input → chat-style answer; multi-input + deliverable + repeatable → Cowork-style workflow with a skill.
- **Before executing:** confirm connectors/data sources exist; ask clarifying questions about date ranges, definitions, targets, and edge cases rather than assuming.
- **While executing:** keep the human's judgment at the edges — plan first, break into steerable chunks, do the boring middle autonomously.
- **In every output:** lead with a TLDR; use the user's established template; include reasoning/audit columns for any judgment calls; make validation a 10-second glance.
- **Destructive or outward-facing actions** (e.g., applying negative keywords, sending messages): present the change and **offer** to apply it — never auto-apply on first runs.
- **After executing:** if the user corrects the same thing twice, propose updating the skill so the correction is permanent.

---

## 9. Terminology Cheat Sheet

| Term | Definition |
|---|---|
| **Cowork** | Desktop-app mode where Claude works autonomously across your files and connected apps; Claude Code under the hood |
| **Connector** | An MCP integration linking Claude to an external tool (Gmail, Google Ads, Slack, HubSpot…) |
| **MCP** | Model Context Protocol — the open standard connectors are built on |
| **Skill** | A markdown file of instructions encoding a reusable workflow; invocable from any conversation; shareable |
| **Plugin** | A bundle of connector(s) + dependent skill(s), installed as one package |
| **Project** | A context container; its context only applies to conversations started inside it |
| **Live artifact** | A Claude-built dashboard/visualization that re-pulls fresh data via connectors each time it's opened |
| **Scheduled task** | A workflow that runs automatically on a recurrence (hourly/daily/weekly) |
| **Dispatch** | Triggering desktop Cowork tasks remotely from the mobile app |

---

## 10. Further Resources Mentioned

- Anthropic blog post detailing the "five ingredients" framework (shared in the webinar follow-up email).
- Austin's LinkedIn post on the Google Ads search-term-audit plugin.
- **Cowork 101 course** — recommended starting point for feature-by-feature onboarding.
- Follow-up email includes best practices on skills vs. plugins and team sharing.
