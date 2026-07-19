---
owner: platform
status: final-sprint-report
last_reviewed: 2026-07-19
report: Runtime V1 Freeze Recommendation
---

# Runtime V1 — Freeze Recommendation

## Recommendation: **DO NOT FREEZE YET.**

Substantial, browser-certified progress landed this sprint (the Focus Panel is now correct), but three
of the freeze criteria are objectively not met — and they are architectural, not cosmetic. Freezing now
would freeze in "Activity + the four operational workspaces are still legacy mount+fetch."

This is an honest recommendation backed by live browser measurement, not by reasoning. Where a criterion
is unmet, the exact blocker and a scoped plan are named.

## Freeze criteria — measured status

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Browser behavior matches product intent | **Mostly ✓** | Focus Panel Summary, Work View transitions, subject switch all certified. Two findings: a grain-ambiguous lens config error + an error terminal dropping the pill strip. |
| 2 | Focus Panel commits the published Summary composition | **✓** | `docSource=published-doc`, summary-level cards, no detail-at-commit, no settlement pop-in. Certified. |
| 3 | Work View transitions behave like Runtime | **✓** | No shell/queue/panel remount, no boot-shell flash, in-place re-commit. Certified. |
| 4 | Activity is a Runtime consumer | **Mostly ✓** | Work→Activity no longer loads: the first conversation thread is prewarmed (warm-first), no remount. Still local mode state rather than a K3 commit, but the operator-facing lifecycle (warm-first, no load) holds. Certified. |
| 5 | Communications / Processing / Work Items / OI inherit Runtime | **Mostly ✓** | All four migrated to the warm-first Runtime lifecycle (warm the exact entries the surface reads on nav intent → warm-first, deduped, no load on open). **Processing** forms storm 4→1, 0 on warm reopen. **Work Items** tasks storm 6→2, 0 on warm reopen. **OI** trends dead-fetch removed, intelligence warm cache, no skeleton on warm reopen. **Inbox** runaway 150→19 loop fixed. All browser-certified. The shared lifecycle is now extracted into `createWarmCache` (two caches migrated onto it; the rest are mechanical follow-on). Not yet a K1→K2→K3 commit, but they share ONE warm-first lifecycle. |
| 6 | Runtime honors published Focus Panel configuration | **✓ / partial** | Re-composing existing cards: **honored, zero engineering** (live-proven). A NEW card type: not yet (3 closed sets). |
| 7 | Runtime is archetype-driven where appropriate | **Partial** | Composition + 5/8 archetype bodies are config/archetype-driven; card MODELS + component dispatch are still per-key. |
| 8 | Legacy runtime code removed | **Partial** | Dead Current Work summary code removed; flag-gated comms/inbox legacy documented but blocked on flags being made permanent (product call). |
| 9 | Runtime tests reflect the final implementation | **✗** | Suite heavily pre-existing red (~79 failures); needs a dedicated rewrite sweep. Net −1 this sprint. |
| 10 | Browser certification passes | **✓ for what's a runtime consumer** | Focus Panel + Work Views certified. The legacy surfaces can't be "runtime-certified" until they are runtime consumers. |
| 11 | Tree clean, local commits only, no push | **✓** | Clean tree, all local, unpushed. |

## The blockers, precisely

1. **Activity (criterion 4).** Convert Work→Activity from `useFocusPanelMode` state + cockpit
   mount+fetch to a runtime commit (prepared destination → atomic commit → settlement). The seams
   exist (`communicationsPreview` commit seed, `focusPanelActivityPrewarm`), so this is *finishing*, not
   new architecture. Medium effort.
2. **Processing / Work Items / Operational Intelligence (criterion 5).** Each is a modal that
   mount→effect→fetches behind a warm cache. Converting each to a runtime consumer is the single
   largest remaining workstream — three surfaces, each needing a preparation/commit/settlement lifecycle
   and browser certification. Large effort.
3. **Communications (criterion 5).** The canonical *view* is already unified
   (`FamilyCommunicationWorkspaceView` via `surfaceVariant` — one interaction model, Topic→Thread→Reply→
   Compose-in-place, shared by Inbox and Activity). What remains: give the workspace modal a runtime
   lifecycle, and retire the flag-gated legacy wrappers once the `comms_v2_*` flags are made permanent
   (product decision). Smaller than 1–2 because the hard part (one canonical surface) is done.
4. **New-card-type scalability (criterion 6/7).** The 5-step plan in the Scalability Certification.
   Gated on opening `FocusPanelCardKey` (wide blast radius) — deliberately not rushed pre-freeze.
5. **Runtime test sweep (criterion 9).** A baseline-red runtime suite is not freezable. Dedicated
   triage/rewrite/delete pass (plan in the Test Report).

## What IS ready to freeze (do not reopen)

- The Focus Panel runtime: preparation completeness, commit-critical published Summary composition,
  summary-level presentation, atomic commit with reserved-not-blank geometry, timing instrumentation.
- Work View transition runtime (attention movement, no remount/flash).
- The runtime kernel (Attention → Provisioning → Commit → Settlement) and the provisioning answer,
  including the published-doc + actions projections carried at commit.

## The one question, answered plainly

> *"If I go into Settings tomorrow and publish a completely different Focus Panel using the existing
> card archetypes, will the Runtime render it correctly without engineering changes?"*

**If you re-compose the cards the runtime already has — different order, placement, span, which cards,
a different Summary composition — YES, today, zero engineering. That is live-proven: your currently
published composition is already a custom one (it includes Billing Preview and drops Readiness/Tour/
Communications/Documents) and the runtime renders exactly it at commit.**

**If "a completely different Focus Panel" means a brand-new card TYPE the runtime has never seen —
NO, not yet.** Three closed sets (the key allowlist, the per-key model producer, the closed type union)
stop it, and the renderer would reserve it forever. The exact 5-step fix is specified in the Scalability
Certification; it is the last real scalability gap for Runtime V1 and is gated on a wide-blast-radius
type change that should not be rushed into a freeze.
