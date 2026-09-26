# Master Plan: Building Marketing Automations with Claude Code (Non-Technical)

**Source:** Anthropic blog — "How Anthropic's Growth Marketing team cut ad creation time from 30 minutes to 30 seconds with Claude Code" (claude.com/blog/how-anthropic-uses-claude-marketing, published January 26, 2026)
**Subject:** Austin Lau, Growth Marketer at Anthropic — had never written code or opened a terminal before Claude Code.
**Purpose of this document:** An operating playbook distilled from the article so any future agent (or human) can replicate these workflows and apply the underlying method professionally and efficiently. Companion to `CLAUDE-MARKETING-MASTER-PLAN.md` (the Cowork webinar playbook — same presenter, complementary material: that one covers delegation/skills/connectors in Cowork; this one covers *building custom tools* with Claude Code). Raw article text preserved in `blog_raw.txt`.

---

## 1. The Core Thesis

A non-technical marketer can build real software tools — plugins, automated pipelines, custom slash commands — by describing problems in plain language to Claude Code. The headline result: **ad creation went from 30 minutes to 30 seconds.**

> "The gap between 'I wish this existed' and 'I can actually build this myself' is actually much smaller than people realize." — Austin Lau

The strategic shift: growth marketers are becoming product-manager-like — not just executing campaigns, but **building products to hit their targets**. Most marketers stop at "AI streamlines copywriting and brainstorming"; the real opportunity is embedding Claude into the workflow itself.

---

## 2. The Problem Pattern (recognize it in any marketing org)

Performance marketing at scale demands a constant stream of fresh creative under rigid constraints:
- Google responsive search ads (RSAs) require **15 unique headlines + 4 descriptions per ad**, with strict character counts.
- Copy must be refreshed every few weeks while maintaining brand voice and value propositions.
- **Old copy process:** Google Sheets → brainstorm → manually check character counts → copy-paste into Google Ads → repeat.
- **Old creative process:** Figma → duplicate a frame repeatedly → switch to Google Doc for headline copy → switch back to paste → repeat across 10+ variations × multiple aspect ratios.

**Signal to watch for:** any workflow that is repetitive, cross-application, mechanically constrained (character counts, aspect ratios, upload formats), and performed weekly+ is a build candidate.

---

## 3. The Two Workflows (replicable blueprints)

### Workflow A — Figma Plugin for Creative Variations
- **Build cost:** ~45–60 minutes with Claude Code. **Payback:** ~30 minutes saved per large batch of creative updates, forever.
- **Origin prompt (verbatim pattern):** *"Claude, I'm working in Figma. I really want to be able to solve this challenge of this repetitive copy and pasting. Can you help me build a Figma plugin to help me solve my challenge?"*
- Claude researched plugin feasibility and limitations, prototyped, and after some troubleshooting Austin had a working installed plugin.
- **How it works:** specify the creative frame, paste all headline copy variations once (from a Google Sheet), click once → the plugin generates every permutation across aspect ratios.
- **Key enabler:** Austin pointed Claude Code at the **existing Figma API documentation** — Claude did its own research from there. A barely-working prototype was enough to prove the concept and iterate to a functional product.

### Workflow B — `/rsa` Google Ads Copy Generation
- **Trigger:** a custom slash command (`/rsa`) in Claude Code.
- **Inputs requested by the command:** campaign data, existing copy, keywords.
- **Cross-referenced against three Agent Skills:**
  1. Anthropic brand tone & voice
  2. Product accuracy
  3. Google Ads RSA best practices (incl. character limits)
- **Output:** upload-ready CSV with campaign/ad group columns, 15 headlines, and 4 descriptions per ad — uploaded to Google Ads **after manual review**.
- **Time saved:** hours per week on copy creation and character validation; freed time goes to running more copy experiments and faster iteration on what performs.
- **Human foundation:** all seed copy and examples given to Claude were written in partnership with the product marketing and copywriting teams — human judgment is baked in *before* Claude brainstorms.
- **Working style:** the first output is a starting point; the real work is riffing back and forth, evaluating each headline against what resonates (Does the value prop land? Is the tone right? Does it stand out from competitors?).

---

## 4. Best Practices (from the article, generalized for execution)

1. **Start with small, repetitive steps.** Identify work that's repetitive or automatable and begin with something tiny and easy. Austin's very first build was a throwaway calculator app — purely to learn how Claude Code responds. Build a trivial thing first; the perspective shift is the deliverable.
2. **Let curiosity drive — persist to the point of stubbornness.** The path from "blank terminal I can't use" to "daily-driver tools" was persistence, not talent.
3. **Explain the problem like you're talking to a colleague.** No code knowledge needed — only the ability to state the challenge and desired outcome clearly and concisely. Domain experts already know their workflows, friction points, and what good output looks like; that's the hard part.
4. **Build on existing resources.** Point Claude at existing documentation (APIs, guides, internal docs) rather than making it work from scratch. A rough prototype that proves the concept is a legitimate milestone — iterate from there.
5. **Keep humans in the loop at the quality layer.** Seed the system with expert-written examples; manually review outputs before they go live (CSV review before Google Ads upload).

---

## 5. Proven ROI Benchmarks Across Anthropic Marketing

Use these as realistic targets when pitching or prioritizing similar builds:

| Team | Use case | Result |
|---|---|---|
| Growth Marketing | Ad creative + RSA copy automation | 30 min → 30 sec per ad |
| Influencer Marketing | Script writing for influencers and podcasts | 100+ hours/month freed |
| Customer Marketing | Case study drafting | 2.5 hrs → 30 min (10 hrs/week saved) |
| Digital Marketing | Web development workflows | 5× team productivity year-over-year |
| Product Marketing | Launch briefs via Skills + Projects | 5–10 hours saved per launch |
| Partner Marketing | Self-serve event enablement for Sales | 40% less trade show prep time |

---

## 6. Execution Playbook for Agents

When asked to build a marketing automation in this style, follow this sequence:

1. **Qualify the task.** Confirm it's repetitive, cross-tool, and mechanically constrained. One-off creative judgment work stays human/chat.
2. **Capture the manual process first.** Have the user walk through exactly what they do today, step by step, including the constraints (character limits, formats, naming conventions) and what "good" looks like.
3. **Locate existing documentation** for any third-party surface (Figma plugin API, Google Ads upload formats, etc.) and feed it to the build rather than guessing.
4. **Prototype small and ugly.** Aim for proof-of-concept in under an hour; troubleshoot iteratively with the user rather than engineering for completeness up front.
5. **Encode standards as Skills.** Brand tone & voice, product accuracy facts, and platform best practices belong in separate reusable skills the workflow cross-references — not buried in one prompt.
6. **Package the entry point** as a slash command (or plugin/button) so invocation is one action with clear required inputs.
7. **Output in upload-ready format** (CSV matching the destination platform's import schema) but **always route through manual review** before anything is published or spent against.
8. **Seed with human-expert examples.** Get approved copy/examples from the brand owners before generating at scale.
9. **Measure and report time saved** (before/after per-task minutes) — this is the currency that drives adoption.

---

## 7. Key Quotes for Stakeholder Buy-In

- "You don't need to know how to code. All you need to know is how to explain your challenge and what you're trying to solve in a very clear, concise manner."
- "A few years ago, if you had an idea to build something like this workflow, you would probably need a team of engineers… Now, as a non-technical marketer, I can actually go out and build these things."
- "I think growth marketing is going the way of almost like a product manager. We're not only able to execute on campaigns, we're able to actually build products in order to help us achieve our targets."
- "Most marketers… just see [AI] as a way to help streamline things like writing copy or brainstorming. But they haven't really thought through what are the actual areas that they can truly embed tools like Claude into their workflow."

---

## 8. Related Resources Referenced

- "The Claude Cowork product guide" (claude.com blog, Jun 5, 2026)
- "Best practices for getting started with Claude Cowork" (claude.com blog, Jun 3, 2026)
- "How Anthropic enables self-service data analytics with Claude" (claude.com blog, Jun 3, 2026)
- "How one Anthropic seller rebuilt his team's workflows with Claude Code" (claude.com blog, Jun 5, 2026)
- Companion playbook in this folder: `CLAUDE-MARKETING-MASTER-PLAN.md` (Cowork webinar — five-ingredients framework, connectors/skills/plugins, scheduled tasks, validation protocol)
