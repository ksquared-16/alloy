# BP V2 D6/D7: local certification

| | |
|---|---|
| Lane | `lane_581d120e4e41`, branch `agent/business-processes` |
| Run | `erun2_c5aa87469ffb4325` |
| Stack | Shared local certification stack. Each live run uses a fresh org (slug `bpv2-d7-live-*`), removed by `live-fixture-teardown.sql` (0 left). |
| Firefly | Never drafted, validated or published. Read-only census only (`gar_8df61ae8b70aeb`). |

D6, D7 and D9 are classified independently.

---

## D6: the Scheduling card requested `financial-config/opportunity/<child id>` → 404

### Identity path (traced)

The flow runs: Assignments Work View row → durable child record → Focus Panel → `SchedulingCard`.

1. The card's context is the durable child: `subject {type: "child", id: <customer_members.id>}`. Its truth carries no `child.family_opportunity_id`.
2. The card computed `opportunityId = resolveFocusPanelMutationOpportunityId({subjectId, grain, truth})`. That resolver was written for grains that always have a case, so it ends with `return subjectId`.
3. The editor's pricing read, and the draft-price read, then requested `/api/admin/financial-config/opportunity/<child id>`. The result was 404, observed in hosted `qar_58463703cedd`.

Staff were already excluded, for exactly this reason. `AssignmentTuitionCard` (`resolveAssignmentTuitionOpportunityId`) already refused the self-id fallback on the same route.

### Repair

`SchedulingCard` now asks `resolveSchedulingCaseOpportunityId` (`web/lib/adminV2/runtime/focusPanel/scheduling/`). It uses only relationships the context already carries:

| Subject | Opportunity id |
|---|---|
| Staff | none |
| An opportunity subject | itself |
| A child carrying its family binding | that family |
| A durable child hosted by a case | `operationalHost.opportunityId` (server-resolved) |
| Anything else | **none**, and the card makes no `financial-config` request |

The editor's financial effects already return early when there is no case.

**Unchanged:**
- staff paths;
- financial semantics: the same route, and the same configuration when a case exists;
- assignment semantics and the `assignment.*` commands.

**Not added:** no fabricated id, no suppressed error, no per-row fan-out.

### Proof

`web/tests/businessProcesses/schedulingCaseOpportunityIdentity.test.tsx`, **6/6**:
- 5 pure identity cases;
- 1 rendered case through the real `DurableRecordContextualCard` and `SchedulingCard`. A durable child opens, "+ Add Assignment" opens the editor, timers advance, and the test records every request: **0** `financial-config/opportunity/` requests.

**Counterfactual** (the same rendered test on the base card): fails with 2 requests to `financial-config/opportunity/<child id>`.

---

## D7: publication accepted a Work View whose declared Row Grain contradicts its stages

### Cause

`validateBusinessProcessForPublish` never compared a view's `row_grain_v1` with the grain of the stages it filters. The runtime did, on every open: `resolveLensRowGrain` refused with `grain_ambiguous` ("the declaration contradicts the lens"). So a view that could never open published cleanly.

### Repair (publish validator only)

The check uses the platform's existing readers:
- `lensStageKeys`, the runtime's reading of a view's stage conditions;
- `resolveStageGrain` (via the validator's existing `stageGrainOf`), the canonical stage-grain resolution the entry-grain check already uses.

| Finding | When | Severity |
|---|---|---|
| `work_view_grain_mismatch` | A declared Row Grain matches **none** of the view's filtered stages. This is exactly the runtime refusal boundary. | **error**: publish is refused (422 `business_process_publication_blocked`) |
| `work_view_grain_mixed` | A declared-grain view that also filters stages of the other grain. The runtime serves it. | warning |

Each finding names the view (`work_view_id`, `work_view_label`), the declared grain, and every incompatible stage ref with its grain (`incompatible_stages`).

**Not checked:**
- an undeclared (legacy) view, whose grain is derived from its stages;
- a stage-independent view;
- a stage whose grain does not resolve;
- domain-projection views (Slice 2 owns them).

**Unchanged:** runtime refusals and coercion (there is none).

**Why mixed is a warning.** The read-only census shows that Firefly's published **Decision** view (`new_work_view_8`) declares `family` and filters `decision` (family) plus `offered` (child). The runtime serves it today. A blocking rule would refuse Firefly's next publication over a working view. Making it blocking is a Director/product decision and is recorded as such (see `SPRINT-STATUS.md`).

### Proof: draft → validate → publish through the real routes (`workViewGrainPublication.live.test.ts`, 11/11)

The isolated org's Enrollment process is the shipped template: lead, tour, decision and closed are family; waitlist, enrolling and enrolled are child.

| # | Case | Validate | Publish |
|---|---|---|---|
| 1 | Family view on `decision` | clean | 200 |
| 2 | Child view on `enrolling` | clean | 200 |
| 3 | Family view on `enrolling` (child stage) | `work_view_grain_mismatch` `fam_on_child` [enrolling] | **422** |
| 4 | Child view on `decision` (family stage) | `work_view_grain_mismatch` `child_on_fam` [decision] | **422** |
| 5 | Multiple compatible stages (family lead/tour/decision; child waitlist/enrolling/enrolled) | clean | 200 |
| 6a | Mixed stages, none holding the declared grain (family on waitlist + enrolling) | `work_view_grain_mismatch` [waitlist, enrolling] | **422** |
| 6b | Mixed stages, one holding the declared grain (family on decision + waitlist + enrolling) | warning `work_view_grain_mixed` [waitlist, enrolling] | 200 |
| 7 | Legacy defaults: undeclared views on enrolling, on waitlist, stage-independent, and `compat_queue_key` | clean | 200 |
| 8 | Assignments projection views (`current_assignments`, `assignments_ending_soon`) | clean | 200 |
| 9 | Billing projection views (`charges_needing_review`, `overdue_payments`) | clean | 200 |

Evidence: `live-evidence.json`.

**Counterfactual** (the same suite on the base validator, `live-evidence-without-fix.json`):
- 3, 4 and 6a **publish** (200);
- 6b has no warning;
- every other case is unchanged.

### Case 10: Firefly read-only compatibility (`workViewGrainFireflyCompatibility.test.ts`, 4/4)

Census `gar_8df61ae8b70aeb` (`work-view-grain-config-census.sql`, query hash `c4a627a6…`) read only stage keys, grains, and Work View ids, labels and stage conditions, for Firefly and QA Shared. The real validator over that data gives:
- **Firefly:** 0 errors, and one `work_view_grain_mixed` warning (Decision: `offered`).
- **QA Shared:** 0 errors, 0 warnings.
- **Firefly rev-38 fixture:** 0 errors.

---

## D9: recorded only, not fixed

See `SPRINT-STATUS.md` (D9).

## Gates

| Gate | Result |
|---|---|
| `npm run -s prebuild` | pass |
| eslint (changed files) | 0 new findings (the `SchedulingCard.tsx:230` `any` and the unused-symbol warnings are pre-existing) |
| Regression (565 covering suites, head vs base, 40-file chunks) | **0 new failures**. Pre-existing on both trees: one 10-file `tests/adminV2/runtime` group (`financialConfigCardEvidence` … `focusPanelCardConfigAndInstances`) hangs; `representativeSeedGraph` fails with 6 `stage_operating_contract` errors (none D7). Base-only failures are archive artifacts (files outside `web/`) |
| Typecheck | not run locally (the lane is unslotted, and the scoped `tsc` is killed). CI's Production and Full graph checks are authoritative |
