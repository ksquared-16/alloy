---
owner: engineering
status: investigation
last_reviewed: 2026-07-24
supersedes: []
---

# Platform Integrity Investigation — How did Qualification get into the running platform?

**Nothing was fixed.** This is the provenance trace only. Every claim is proven against the
tenant's exact published metadata (`assets/firefly-config/raw-builder.json`) and the real
runtime predicates (`tests/lifecycle/fireflyStageProvenance.test.ts`, 12 tests).

---

## The one answer

**Qualification is not in Firefly's configured Business Process, was never seeded by a
migration, and is not given to fresh tenants. It reached the running platform as
operator-authored tenant data — a single lead-stage outcome rule ("Reached / Qualified → move
to Qualification") built in the Business Process builder while `qualification` was still a
template stage. "Part 9" later removed `qualification` from the template, but three things were
never updated to match, so the runtime still accepts and executes it:**

1. **the dangling rule was never cleaned up** — there is no referential-integrity check that
   rejects a `move_to_stage` target which is not a stage of the process;
2. **the platform's built-in stage lists still contain `qualification`** — `LIFECYCLE_STAGE_ORDER`
   and `ENROLLMENT_TEMPLATE_STAGE_KEYS`, plus a code-default `reached_to_qualification` rule;
3. **neither the transition resolver nor the stage-move writer checks stage membership** —
   they trust the built-in lists (or nothing at all) instead of the configured process.

So recording "Reached / Qualified" on a real lead **moves the family into `qualification`, a
stage that does not exist in their process.** That is a **platform defect** — per the mission's
rule, the runtime executing/exposing a stage absent from the configured Business Process is the
platform's fault, not the tenant's.

`decision` is the opposite: it **is** a configured stage, it **is** in the fresh-tenant
template, and it is operator-authored. It is **expected**. (This corrects my prior Firefly
report, which wrongly called `decision` a critical missing-stage defect — see §7.)

---

## Ground truth — the configured process

`GET /api/admin/departments/3933ac47…/lifecycle-builder` (verbatim, `raw-builder.json`):

```
Firefly enrollment process — 6 stages:
  lead → tour → decision → waitlist → enrolling → enrolled
```

`qualification` is **not** among them. *Proven:* `configuredStageKeysForMetadata(metadata)` ===
`["lead","tour","decision","waitlist","enrolling","enrolled"]`; `isConfiguredStageKey(metadata,
"qualification")` === `false`; `isConfiguredStageKey(metadata, "decision")` === `true`.

---

## Provenance of `qualification` — every occurrence, classified

| Layer | Present? | Detail | Classification |
|---|---|---|---|
| **Published tenant data** | **YES** | `departments.metadata.lifecycle_builder_v1` → lead stage → `stage_operating_plan_v1` → rule `reached_move`: `reached_qualified → move_to_stage {stage_key: "qualification"}`. Operator-authored (builder-generated keys). | trigger (tenant data) |
| **Migration** | no | `grep 'qualification' supabase/migrations` → **0 hits**. Not seeded. | — |
| **Seed** | no | none | — |
| **Fresh-tenant template** | **no** | `enrollmentProcessTemplate.ts:31` — *"`qualification` removed (Part 9): no distinct work — folded into the Lead stage."* Template stages: lead, tour, decision, closed, waitlist, enrolling, enrolled, closed_withdrawn. | expected (removed) |
| **Runtime fallback (built-in)** | **YES** | `LIFECYCLE_STAGE_ORDER` (`lifecycleProgressionRequirementsCatalog.ts:54`) still lists `"qualification"`. `ENROLLMENT_TEMPLATE_STAGE_KEYS` (`enrollmentQueueMembershipDefaults.ts:23`) still lists it. | **platform defect** |
| **Resolver** | **YES** | `isValidBootstrapBuilderStage` returns `true` for `qualification` **via the built-in list, before** checking the configured process. `resolveStageTransitionExecutionTargets` accepts the legacy `stage_key` with no membership check. `applyStageOutcomeRuleTarget` (move_to_stage) writes `opportunities.stage_key` with no membership check. `defaultEnrollmentStageOperatingPlans.ts:611` still has `reached_to_qualification → move_to_stage: qualification`. | **platform defect** |
| **File (code, ~20 sites)** | **YES** | presentation/KPI/eligibility switches, status catalogs, operator-stage mapping (`enrollmentOperatorStage`), etc. all still branch on `"qualification"`. | **platform defect (stale)** |
| **Test fixture** | incidental | prior tests referenced it; not a runtime source | — |
| **Cached artifact** | no | reads are live; the provenance test uses the captured metadata but the live probe agrees | — |

## Provenance of `decision` — every occurrence, classified

| Layer | Present? | Detail | Classification |
|---|---|---|---|
| **Published tenant data** | **YES** | a first-class configured stage (id `e126ac3e…`, active), with its own operating plan (`paths_chosen`, `needs_follow_up`) | **expected** |
| **Fresh-tenant template** | **YES** | `enrollmentProcessTemplate.ts:28` — `{ key: "decision", label: "Placement / Decision" }` | **expected** |
| **Migration / seed** | no | not seeded as a string; comes from the builder template | expected |
| **Runtime fallback (built-in)** | **no** | `decision` is **not** in `LIFECYCLE_STAGE_ORDER`; it passes validity via `isConfiguredStageKey` (it is configured) | expected |
| **Resolver** | n/a | `tour_transition_2 → decision` resolves cleanly because `decision` is configured | **expected** |

---

## Required trace 1 — Business Process → UI

```
Configured Business Process   6 stages; qualification ABSENT, decision PRESENT
        ↓
Published Plan (lead)         rule reached_move → move_to_stage: qualification   ← dangling
        ↓
Stage Inventory              configuredStageKeysForMetadata = [lead,tour,decision,waitlist,enrolling,enrolled]
        ↓                    → qualification NOT in inventory
Transition Resolver          lead plan has NO outgoing_transitions → legacy branch →
                             accepts {stage_key: "qualification"} with NO membership check   ← DEFECT
        ↓
Stage Resolver               isValidBootstrapBuilderStage("qualification") = TRUE via built-in
                             LIFECYCLE_STAGE_ORDER, before the configured check   ← DEFECT
        ↓
Current Work / move writer   applyStageOutcomeRuleTarget writes opportunities.stage_key =
                             "qualification" — no membership guard   ← DEFECT
        ↓
What's Next                  operator_stage resolves to "qualification" (built-in mapping);
                             its plan is null → empty What's Next
        ↓
UI                           live: GET stage-bootstrap?stage_key=qualification → HTTP 200,
                             operator_stage="qualification"  (a non-configured stage, served)
```

*Observed resolution of "Reached / Qualified"* (`reached-qualified-resolution.json`):
`[update_family_case_status, move_to_stage → qualification, mark_stage_work_complete]` — the
move **executes**; it does not error.

## Required trace 2 — history → runtime

```
Migration history      no migration references qualification or decision  (grep = 0)
        ↓
Seed data              none
        ↓
Published tenant       operator authored lead rule "Reached/Qualified → Qualification" via the
metadata               builder (while qualification was still a template stage), then the
                       qualification stage was dropped; the rule was left dangling
        ↓
Current runtime        built-in stage lists + resolvers (never updated after "Part 9") accept
                       and execute the dangling reference
```

---

## Required proof — for every stage referenced during runtime

| Stage referenced (move target) | From | In configured process? | Runtime rejected it? | Verdict |
|---|---|---|---|---|
| `lead` | (entry) | **YES** | n/a | expected |
| `tour` | (entry) | **YES** | n/a | expected |
| `decision` | tour_transition_2 | **YES** | n/a | **expected** |
| `waitlist` | tour_transition_1 | **YES** | n/a | expected |
| `enrolled` | enrolling.complete | **YES** | n/a | expected |
| **`qualification`** | lead.reached_move | **NO** | **no** — accepted + executed | **platform defect** |
| **`enrollment`** | waitlist.offer | **NO** (tenant uses `enrolling`) | **no** — accepted + executed | **platform defect (same class)** |
| **`closed_withdrawn`** | enrolling.withdrew | **NO** | validity gate rejects it, **but the move-writer executes it anyway** | **platform defect (writer has no guard)** |

**Why the runtime did not reject `qualification` (the bug):**
`isValidBootstrapBuilderStage(metadata, key)` is `LIFECYCLE_STAGE_ORDER.includes(key) ||
isConfiguredStageKey(metadata, key)`. Because the built-in `LIFECYCLE_STAGE_ORDER` still
contains `qualification` (and `enrollment`), the first clause returns `true` and the configured
process is never consulted. Separately, the `move_to_stage` writer sets `stage_key` with no
membership check at all — proven by `closed_withdrawn`, which the validity gate *does* reject
yet the writer still executes. **Two independent missing guards, both trusting built-ins or
nothing instead of the configured process.**

*Control:* a genuinely unknown key (`zzz_not_a_stage`) **is** rejected by the validity gate —
so the gate is not simply open; it is specifically leaking the stale built-in identifiers.

---

## Root cause

`qualification` (and `enrollment`) are **stale built-in stage identifiers**. They were
first-class stages in an earlier enrollment model; "Part 9" (`enrollmentProcessTemplate.ts:31`)
removed `qualification` and the model moved to `decision`/`enrolling`. The **process template**
was updated; the **built-in runtime constants and resolvers were not**:

- `LIFECYCLE_STAGE_ORDER` still lists `qualification` + `enrollment`, and omits `decision` +
  `enrolling` — it encodes the *old* model. *Proven.*
- `ENROLLMENT_TEMPLATE_STAGE_KEYS` still lists `qualification`.
- `defaultEnrollmentStageOperatingPlans.ts` still routes `reached_family → qualification`.
- ~20 code sites still branch on `"qualification"`.

Per the mission's explicit rule, these are **not** tenant configuration — they are stale
built-ins, and the runtime's willingness to accept/execute a non-configured stage because of
them is a **platform defect**.

---

## Classification summary

- **`qualification` — PLATFORM DEFECT.** The runtime exposes it (stage-bootstrap HTTP 200) and
  executes a move into it (proven resolution), despite it being absent from the configured
  process. Root: stale built-in stage lists trusted ahead of the configured process, plus a
  move-writer with no membership guard.
- **`decision` — EXPECTED.** A legitimately configured stage, present in the fresh template.
- **Same-class corroboration — `enrollment`, `closed_withdrawn`** reach records the same way.

---

## §7 — correction to the prior Firefly certification report

`firefly-config-certification-report.md` was written against a **wrong stage list** (it assumed
`lead/qualification/tour/waitlist/enrollment/enrolled` because those returned HTTP 200 from
stage-bootstrap — which is exactly the built-in-leak defect this investigation uncovered). The
true configured stages are `lead/tour/decision/waitlist/enrolling/enrolled`. Consequences:

- **Prior F4 ("tour → `decision` is a non-existent stage, CRITICAL") is WRONG.** `decision` is
  configured. That transition is correct.
- **Prior F2/F3 ("qualification is an empty configured stage") is REFRAMED.** Qualification is
  **not** a configured stage at all; the real issue is the platform defect documented here.
- The genuine platform defect fixed that session (F7, forms API shape) stands.

I will supersede the prior report's stage findings once the fix is authorized. No fix is applied
in this investigation, per instruction.

---

## How to reproduce

```bash
# Capture the tenant's real published process (read-only):
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json npx playwright test playwright/tests/firefly-raw-builder.spec.ts playwright/tests/firefly-stage-provenance.spec.ts --workers=1
# Prove the acceptance chain deterministically:
cd web && npx vitest run tests/lifecycle/fireflyStageProvenance.test.ts
```
