# POS-11 — Architecture Readiness Review

> **Status:** Planning artifact — readiness assessment for the Architecture Gate. Draft.
> **Not architecture. No schema, no APIs, no implementation plans, no code.** This document decides only whether POS is *ready to enter* architecture, and what guardrails architecture must carry — it does not design anything.
> Inherits from **POS-01 … POS-10**. Branch: `pos-planning-v1`.

## Purpose

POS planning is frozen and the visual direction has been validated (POS-10). This review answers one question: **Is POS ready to enter the Architecture Gate?** It records what is frozen, what is deliberately open, the risks to manage, recommendations for *how to approach* architecture (not the architecture itself), and a Go/No-Go.

The constraint is strict: "architecture recommendations" below are **process and guardrail guidance** — what to preserve, what to decide first, how to sequence — never schema, API, or data-model design. Those belong to the Architecture Gate and the later Foundation Gate (POS-06).

## Frozen areas (stable inputs to architecture)

| Area | Frozen by | Status |
|------|-----------|--------|
| **Doctrine** — what POS is/is not; records-own-truth; operator approval; BOS-in-right-rail; Communications-owns-email; no-intake-language; forms/documents shared foundation | POS-01 | Frozen |
| **Object model** — Source, Processing Case, Extraction, Match, Resolution, Outcome, Workflow, Operational Result; Processing Case lifecycle | POS-02 | Frozen |
| **Platform map + ownership boundaries** — the seven POS areas; POS/Communications/CRM/Lifecycle/Documents/BOS boundaries | POS-03 | Frozen |
| **Outcome taxonomy + approval model** — five outcome categories, illustrative recipes, operator-approval-before-execution | POS-05 | Frozen |
| **UX behavior + visual vision** — 26 behavioral screens; visual doctrine; 11 future-state screens; mockup brief + prompts | POS-04 / POS-07 / POS-08 / POS-09 | Frozen |
| **Visual direction** — Midnight Forge / Bend Pine / Pine Mist / white canvas / Work Unit, Drawer, Action Workspace, Lifecycle reuse / BOS right rail | POS-07 / POS-08 / POS-10 | Validated (Medium-High → High) |
| **Hero object** — Processing Case as the POS equivalent of Work Unit / Lead / Conversation | POS-02 / POS-08 / POS-10 | Validated |
| **BOS participation model** — recommend-not-execute, consistent identity, right-rail-only, graceful degradation | POS-01 / POS-08 / POS-10 | Validated |
| **Execution model** — branch model, package-by-package loop, substitute vs real gates, two-failed-repair pause, named gates | POS-06 | Frozen |

## Open areas (decisions to resolve *in* architecture, not blockers to entering it)

These are deliberate — they are architecture trade-offs and scoping decisions, not missing product definition. None requires more UX work.

1. **Reuse vs. new foundation.** Whether POS builds on the existing forms-engine / packet / documents / Communications / BOS foundations or introduces new structure is the central architecture decision — explicitly left open here.
2. **"Intake" retirement scope.** How aggressively existing intake surfaces/rules are renamed under POS language vs. retained as implementation detail beneath it.
3. **Auto-execute in V1.** Whether any outcome step auto-executes within an approved recipe, or V1 is approval-only end-to-end.
4. **Source consolidation rules.** Whether and how one Processing Case may consolidate multiple sources (conceptually allowed in POS-02; product/architecture rules unset).
5. **Confidence thresholds.** The thresholds separating high-confidence / needs-review / needs-resolution (named conceptually; values unset).
6. **Pillar placement + Documents boundary.** Confirm POS as a peer top-level pillar and whether the Documents library lives inside POS navigation vs. as a separate Documents pillar surfaced through POS.

## Risks (to manage through architecture, not reasons to stop)

**Product/experience risks** (carried from POS-10, all execution-level)
- **Screen 02 (Processing Case) canvas density** — the screen that proves Processing Case ≡ Work Unit; must stay calm and case-first. Highest-attention item.
- **Recurring un-Alloy temptations** in mockup execution: dashboard counters, form-builder palette, marketing-email preview, administrative checklist, ML "score" aesthetic, automation-builder flowchart, BOS rail state proliferation. All addressable; none doctrinal.

**Program risks** (operational, observed this sprint)
- **Shared-checkout collisions.** `~/Alloy-Claude` is used for POS work while also being touched for Communications gating; this already produced a blocked rebase and a stale `.git/HEAD.lock`. Architecture work must run from a clean, dedicated checkout, and Communications gating from a separate clone (as already directed).
- **Sandbox toolchain limits.** SSH to the remote and full `vitest` / `npm run build` / DB reset are not reliably runnable inside Cowork; real gates need host-side execution (POS-06).
- **Doctrine drift under implementation pressure.** The lines most likely to erode — records own truth, operator approval, BOS in the right rail, no-intake-as-concept, document-first composer — must be protected; changes require escalation to the Doctrine Gate.

## Architecture recommendations (guidance only — not design)

These are recommendations for **how to approach** the Architecture Gate. They intentionally contain no schema, API, or data-model proposals.

1. **Front-load the reuse-vs-new decision (Open #1) first.** It conditions everything else; make it the opening question of the Architecture Gate, evaluating the existing forms-engine, packet, documents, Communications canonical-enqueue, and BOS-capability foundations for reuse before proposing anything new.
2. **Architect to the boundaries in POS-03, not around them.** Treat the ownership table as a hard contract: CRM owns identity, Communications owns email/delivery, Lifecycle owns progression, Documents owns artifacts, BOS proposes from the rail, the platform owns workflows. POS proposes; owners own results.
3. **Make the approval boundary a first-class architectural seam.** "BOS prepares → operator approves → outcome executes" should be an explicit seam in the design, so V1's no-silent-execution doctrine is structural, not merely UI convention. This also cleanly contains the auto-execute decision (Open #3).
4. **Treat the Processing Case as the spine.** Architecture should center on the Processing Case and its lifecycle as the organizing object (mirroring how Work Unit anchors Lifecycle), with Sources/Extractions/Matches/Resolutions/Outcomes hanging off it — so the hero object stays primary in the system, not just the UI.
5. **Carry the open items in as named decisions.** Enter the Architecture Gate with Open #1–6 on the agenda as explicit decisions with owners, not as discoveries to stumble into.
6. **Sequence per POS-06 gates.** Architecture Gate resolves structure; no code until the Foundation Gate; build then proceeds package-by-package with substitute gates and real (host-side) gates at named checkpoints.
7. **Isolate the environment.** Dedicated clean checkout for POS architecture/build; Communications gating elsewhere; plan real toolchain runs host-side.

## Success criteria check

| Criterion | State |
|-----------|-------|
| Doctrine is frozen | ✅ POS-01–03, 05, 06 |
| UX is frozen | ✅ POS-04, 07, 08, 09 |
| Visual direction is accepted | ✅ Validated in POS-10 (Medium-High → High); refinements are execution-level |
| Processing Case is validated | ✅ Validated as the hero object; Screen 02 density is the watch-item, not a blocker |
| BOS participation model is validated | ✅ Right-rail participant, recommend-not-execute, consistent identity, degrades gracefully |
| POS is ready for Architecture Gate | ✅ Yes (conditional — see below) |

## Go / No-Go recommendation

**GO — POS is ready to enter the Architecture Gate.**

Doctrine, object model, platform structure, navigation, outcomes, and UX are frozen; the visual direction is validated as Alloy-native with only execution-level refinements; the Processing Case hero object and the BOS participation model are validated. The open items are genuine architecture trade-offs, not gaps in product definition, and are listed for the Architecture Gate agenda.

**Conditions on GO** (none require more UX work):
- Carry Open #1–6 into the Architecture Gate as explicit, owned decisions — with the reuse-vs-new decision first.
- Apply the POS-10 refinements during mockup generation, giving Screen 02 the most iteration; generate mockups from POS-09 so visuals don't reinterpret doctrine.
- Run architecture from a clean, dedicated checkout; keep Communications gating separate; plan real gates host-side.
- Hold the protected doctrine lines; any change escalates to the Doctrine Gate.

**Next program phase:** the Architecture Gate, opening with the reuse-vs-new foundation decision and the POS-03 boundary contract — still no code until the Foundation Gate (POS-06).
