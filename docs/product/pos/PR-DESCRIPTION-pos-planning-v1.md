# PR: POS — Process Operating System Planning Package

> **Branch:** `pos-planning-v1` → **base:** `staging`
> **Type:** Documentation / planning only. **No runtime code, no migrations, no schema, no API changes.**
> **Gate:** Doctrine Gate (conditionally accepted) — opening for review of the planning package.

## Summary

This PR adds the **POS (Process Operating System)** planning package under `docs/product/pos/`. POS is Alloy's operating layer for turning information into operational outcomes. It is **not** "Forms V2" — forms are one input channel among many. The package freezes product doctrine, object language, navigation/ownership, a 26-screen UX vision, the outcome framework, the execution charter for later development, and a visual mockup brief.

Everything here is planning. No application behavior changes.

## What was added

All files under `docs/product/pos/`:

| File | What it freezes |
|------|-----------------|
| `README.md` | Package index, one-screen doctrine, open questions, environment notes |
| `POS-01-doctrine-lock.md` | What POS is/is not; pillar relationships; records-own-truth; operator approval; no-intake-language |
| `POS-02-object-model.md` | Product object language: Source, Processing Case, Extraction, Match, Resolution, Outcome, Workflow, Operational Result (no schema) |
| `POS-03-platform-map.md` | Navigation areas (Processing, Review, Linkage, Forms, Packets, Documents, Settings) + ownership boundaries vs Communications/CRM/Lifecycle/Documents/BOS |
| `POS-04-ux-vision-package.md` | 26 Alloy-native screen definitions (purpose, goal, layout, actions, BOS rail, status/empty/error states, doctrine inheritance) |
| `POS-05-outcome-framework.md` | Outcome taxonomy (Record/Workflow/Communication/Document/Review), example recipes, approval model |
| `POS-06-claude-execution-charter.md` | Branch model, package-by-package loop, substitute vs real gates, 2-failed-repair pause, report-at-gates, no doctrine drift |
| `POS-07-visual-mockup-brief.md` | Art-direction brief to generate Alloy-native mockups for the 8 hero screen groups (Doctrine Gate follow-up) |

**Committed delta:** the initial commit (`d3bfc4b0`) adds POS-01–06 + README. `POS-07` and this PR description are added as the Doctrine-Gate follow-ups (see *Branch state* below).

## Why POS is a platform pillar

POS sits beside CRM, Lifecycle, and Communications as a peer operating pillar, because it owns a distinct operating concern none of the others own: **information becoming operational outcomes.**

- **CRM** manages relationships (who exists). **Lifecycle** manages progression (where work is). **Communications** manages conversations (how we talk). **POS** manages the path from *incoming information* → *reviewed, resolved, approved operational result*.
- That path has its own primary object (the **Processing Case**), its own lifecycle (Received → Processing → Needs Review → Needs Resolution → Ready → Completed → Archived), and its own surfaces (Processing, Review, Linkage, Forms/Packets/Documents libraries, Settings).
- Folding POS into Forms would mis-frame it as a form builder; folding it into Communications would conflate email ownership with information processing; folding it into CRM would imply forms own truth. Keeping POS a pillar is what lets the boundaries in POS-03 stay clean.

## Doctrine decisions (frozen in this package)

- **Processing Case is the primary object** — not "responses," not "an intake."
- **Records own truth.** Forms, packets, PDFs, emails are *sources*; their values are **proposals** until an approved outcome promotes them.
- **BOS recommends, operators approve.** No silent execution in V1; BOS prepares and explains, humans approve.
- **BOS stays in the right rail.** The workspace is primary; BOS is an operational participant, not a separate workspace or mere chat sidebar.
- **Communications owns email.** POS consumes attachments/messages and executes communication outcomes through Communications' canonical enqueue.
- **Forms and documents share one foundation** — a field is not duplicated across form/packet/state-form/generated-document surfaces.
- **No "intake"** as the product name or organizing concept (deliberate divergence from current doc vocabulary; legacy intake rules remain as implementation detail until migrated).
- **Outcomes are operator-approved** and act against the owning pillar (CRM/Lifecycle/Billing/Communications/Documents); POS proposes, the owner owns the result.

## Unresolved questions (for reviewers)

1. **"Intake" retirement scope** — how aggressively to rename existing intake surfaces/rules vs. leave them as implementation detail beneath POS language.
2. **Auto-execute in V1** — POS-05 permits `auto-execute` steps *within an operator-approved recipe*; confirm whether any auto-execute ships in the first release or V1 is approval-only end-to-end.
3. **Screen breakouts** — POS-04 lands 26 screens (within the 20–30 ask); confirm no required family needs additional screens (recipient-facing packet completion is treated as a preview, not an operator screen).
4. **Pillar placement** — confirm POS is a peer top-level pillar, not nested under CRM/Communications.
5. **Documents boundary** — confirm the Documents library lives inside POS navigation vs. as a separate Documents pillar surfaced through POS.
6. **Baseline freshness** — see *Branch state*; confirm the intended base for merge.

## What reviewers should focus on

- **POS-01 boundaries and language** — this is the load-bearing doc; everything inherits from it. Scrutinize the pillar relationships and the no-intake decision.
- **POS-03 ownership table** — confirm the POS/Communications/CRM/Lifecycle/Documents/BOS boundaries match how you want the pillars to divide.
- **POS-05 approval model** — confirm "operator approves before execution," and decide the auto-execute question.
- **POS-04 doctrine inheritance** per screen — confirm screens stay Work-Unit-native (queues/cards/right-rail) and never drift toward survey-builder or dashboard.
- **POS-06 execution loop** — confirm the package-by-package cadence, substitute-vs-real gates, and the 2-failed-repair pause before any build starts.

## Explicitly out of scope

- No database schema, tables, columns, or migrations.
- No API routes or contracts.
- No runtime/UI code, components, or styles.
- No commitment to specific outcome-recipe configurations (recipes in POS-05 are illustrative).
- No authorization/permission model changes (capability gating stays with the platform).
- Mockup *images* are not included — POS-07 is the brief to generate them.

## Branch state (please read before merging)

- **Committed contents of this branch** (the PR diff vs `staging`): the POS planning docs only. The initial commit `d3bfc4b0` adds POS-01–06 + README; `POS-07` and this file are the Doctrine-Gate follow-ups and **must be committed** for the PR to reflect them.
- **Baseline:** the branch was cut from `staging` @ `2b899cce`. `origin/staging` has since advanced to `73abe69a` (branch and origin/staging diverged 1/1). Re-base or merge host-side as you prefer — **do not rebase from inside Cowork** (see below).
- **Shared-checkout caution:** this working copy (`~/Alloy-Claude`) currently also holds a large volume of **unrelated uncommitted work** (POS/BOS/performance changes) and **untracked Communications V2 files** (migrations + `web/lib/communications/v2/**` + tests) that are **not part of this PR**. They are not in any commit on this branch. Do not `git clean`/`reset` this checkout without first preserving that work; Communications gating should run from a separate clean clone.

## Next gate recommendation

Approve the **Doctrine Gate** for POS-01–03, POS-05, POS-06 (conditionally accepted — resolve the open questions above), then take **POS-04 + POS-07 through the UX Gate** (review the screen vision and generate mockups from the brief). Do **not** begin development until both the Doctrine and UX Gates pass; the first build package then starts at the **Foundation Gate** per POS-06, on a fresh branch cut host-side from the latest `staging`.
