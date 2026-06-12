# POS — Process Operating System (Planning Package)

> **Status:** Planning sprint artifacts. **Not implementation.** No schema, no migrations, no APIs, no runtime behavior changed.
> **Branch:** `pos-planning-v1` (cut from latest available `staging`). **Sprint:** POS Planning v1.

## What this is

The frozen planning package for **POS = Process Operating System** — Alloy's operating layer for turning information into operational outcomes. POS is **not** "Forms V2"; forms are one input channel among many. The central object is the **Processing Case**.

These docs are the input to the **Doctrine Gate** and **UX Gate** (POS-06). Nothing here authorizes a build.

## Documents

| Doc | Purpose |
|-----|---------|
| [`POS-01-doctrine-lock.md`](./POS-01-doctrine-lock.md) | Freeze product doctrine: what POS is/is not; relationships to CRM, Lifecycle, Communications, BOS, Forms, Documents; records-own-truth; operator approval; no-intake-language. |
| [`POS-02-object-model.md`](./POS-02-object-model.md) | Freeze product object language: Source, Processing Case, Extraction, Match, Resolution, Outcome, Workflow, Operational Result. No schema. |
| [`POS-03-platform-map.md`](./POS-03-platform-map.md) | Freeze navigation + ownership: Processing, Review, Linkage, Forms, Packets, Documents, Settings + boundaries vs Communications/CRM/Lifecycle/Documents/BOS. |
| [`POS-04-ux-vision-package.md`](./POS-04-ux-vision-package.md) | 26 Alloy-native screen definitions (purpose, goal, layout, actions, BOS rail, status/empty/error states, doctrine inheritance). |
| [`POS-05-outcome-framework.md`](./POS-05-outcome-framework.md) | Outcome taxonomy, example recipes, approval model, relationships to workflows/lifecycle/billing/communications. |
| [`POS-06-claude-execution-charter.md`](./POS-06-claude-execution-charter.md) | How later development runs: branch model, package-by-package loop, substitute vs real gates, 2-failed-repair pause, report-at-gates, no doctrine drift. |
| [`POS-07-visual-mockup-brief.md`](./POS-07-visual-mockup-brief.md) | Art-direction brief to generate Alloy-native mockups for the 8 hero screen groups (Doctrine Gate follow-up 1). |
| [`POS-08-visual-vision-package.md`](./POS-08-visual-vision-package.md) | Final UX/experience definition before architecture: 11 future-state screens (purpose, goal, layout, hierarchy, BOS behavior, actions, empty/success/conflict states, doctrine notes) + Architecture Readiness Assessment. |
| [`POS-09-mockup-generation-prompts.md`](./POS-09-mockup-generation-prompts.md) | Per-screen GPT Image / Midjourney prompts + Figma recreation notes, so mockups can be generated without reinterpreting doctrine. |
| [`POS-10-visual-validation-review.md`](./POS-10-visual-validation-review.md) | Visual validation of the frozen vision — per screen: What Works, What Feels Un-Alloy, Recommended Refinements, Confidence, Remaining Risks. "Does POS feel like Alloy?" |
| [`POS-11-architecture-readiness-review.md`](./POS-11-architecture-readiness-review.md) | Architecture Gate readiness: frozen areas, open areas, risks, approach guidance (not design), Go/No-Go. |
| [`POS-12-alloyification-review.md`](./POS-12-alloyification-review.md) | Alloyification review of the 3 decisive screens vs actual Alloy doctrine — current state, un-Alloy gaps, specific doctrine violations, recommended changes, before/after, confidence. |
| [`POS-13-alloy-native-mockup-brief.md`](./POS-13-alloy-native-mockup-brief.md) | Replacement visual brief (Processing Workspace, Processing Case, Outcome Configuration) grounded in real Alloy tokens/components so concepts inherit Alloy DNA. Supersedes POS-07/09 for these 3 screens. |
| [`POS-A01-architecture-assessment.md`](./POS-A01-architecture-assessment.md) | Architecture Gate: principles, 7 architecture decisions, reuse analysis, ownership boundaries, risks, recommendations. Conceptual only. |
| [`POS-A02-foundation-recommendation.md`](./POS-A02-foundation-recommendation.md) | Which existing Alloy systems become the POS foundation: reuse candidates, extension candidates, new capabilities required, rationale. |
| [`POS-A03-implementation-roadmap.md`](./POS-A03-implementation-roadmap.md) | Phases, gates, dependencies, sequencing for future execution. No tickets/code/schema/APIs. |
| [`PR-DESCRIPTION-pos-planning-v1.md`](./PR-DESCRIPTION-pos-planning-v1.md) | Ready-to-paste PR description for the `pos-planning-v1` branch. |

Read in order. POS-01 is load-bearing; everything else inherits from it. POS-04 / POS-07 / POS-08 / POS-09 are the UX/visual set; POS-08 is the canonical final UX artifact reviewed before the Architecture Gate.

## Doctrine in one screen

- **Information enters Alloy once; POS does as much work as possible.**
- **Records own truth.** Sources (forms, packets, PDFs, emails) are proposals until promoted.
- **BOS recommends; operators approve.** No silent execution in V1.
- **BOS stays in the right rail.** Workspace is primary.
- **Communications owns email.** POS consumes attachments/messages.
- **Forms and documents share one foundation.**
- **No "intake"** as the product name or main concept — the concept is the **Processing Case**.

## Relationship to existing docs

This package sits under `docs/product/` alongside `crm-system.md`, `communications.md`, `documents-and-forms.md`, `bos-foundation.md`. It **reframes and supersedes the product vocabulary** in `documents-and-forms.md` (forms/packets/documents) under POS, but does **not** delete existing implementation docs or rules. Locked system doctrine (routing, navigation, drawers, work-unit layout, queue-record, performance, configuration) is **inherited, not restated**.

## Open questions (for the Doctrine / UX Gates)

1. **"Intake" retirement scope.** Existing code, rules, and docs use "intake" heavily (e.g. forms intake outcome rules). POS-01 retires it as a *product concept* but keeps legacy rules until migrated. Confirm: how aggressively do we rename existing surfaces/rules vs. leave them as implementation detail?
2. **Auto-execute in V1.** POS-05 allows steps configured `auto-execute` *within an operator-approved recipe*. Confirm whether any auto-execute is enabled in the first release, or whether V1 is approval-only end-to-end.
3. **Screen count.** POS-04 defines 26 screens (within the 20–30 ask). Confirm none of the required families need additional breakouts (e.g. mobile/recipient-facing packet completion views were treated as recipient previews, not separate operator screens).
4. **POS as a top-level pillar vs. nested.** POS-03 presents POS as a left-nav pillar with seven areas. Confirm POS is a peer pillar to CRM/Lifecycle/Communications, not nested under one of them.
5. **Documents pillar boundary.** POS "produces/consumes" documents while Documents "owns" artifacts. Confirm the Documents Library lives *inside* POS navigation (as mapped) vs. as a separate Documents pillar surfaced through POS.
6. **Baseline staging freshness.** This branch was cut from cached `origin/staging` @ `2b899cce` because the sandbox could not reach the Git remote over SSH. Confirm that is the intended baseline, or re-cut host-side from a freshly fetched `staging`.

## Environment notes (sandbox)

- **Remote fetch blocked:** SSH to the Git remote is not reachable from the Cowork sandbox; `pos-planning-v1` was created from the most recent cached `origin/staging` (`2b899cce`, "BOS Adoption Sprint 01 — freeze doctrine v1.0"). Re-base host-side if a newer `staging` exists.
- **Git locks:** the repo mount permits file rename but not unlink, so git's own lock cleanup fails; stale `.git/index.lock` must be cleared by renaming it. Heavy git operations (commit/push) may be more reliable host-side.
- **Real toolchain runs** (`vitest`, `npm run build`, DB reset) likely need to run outside the sandbox — see POS-06.

## Status

Planning only. Awaiting the **Doctrine Gate** and **UX Gate** (POS-06). Do not start development until those pass.
