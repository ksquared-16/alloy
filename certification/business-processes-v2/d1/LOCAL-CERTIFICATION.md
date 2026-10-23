# BP V2 D1: Enrollment publication provisions the opportunity drawer override (local certification)

**Base:** lane `c1fa8c3d6` (staging `267d9400b8c7` merged).
**Change:** `04b40e1f0`.
**Stack:** shared local certification stack (`alloy-cert`), 418 migrations, top `20261207181600`.
**Not hosted evidence.** Hosted QA is recorded separately.

## Decision record

| Question | Decision | Why |
|---|---|---|
| Trigger | A successful `POST /api/admin/business-process/configuration/publish` whose published configuration carries an active Enrollment staged process | It is the one product path that changes runtime configuration. It runs after `publish_business_process_revision_v1` commits, so a blocked or failed publish never reaches it. That is the same point and contract as `ensureHostsForPublishedProjections`: idempotent, reported, never a failed publish. A failed provisioning is retried by the next successful publish. |
| "Enrollment" | Staged lifecycle + `tracks_v1` containing `family_track` and `child_track` | Only the Enrollment template instantiates those tracks. A department-key rule would miss Firefly's `lead_management`. Assignments and Billing are domain projections. |
| Default | `ENROLLMENT_WORKFLOW_V1_DRAWER_DEFAULT` = `20260430203000` seed config, verbatim | The last migration-era shape: later migrations added and then removed `tour_scheduling`, and renamed keys this config does not hold. It is not Firefly's edited row (no `field_placements_v1`). The gate needs only the mode, but the shell compiler reads the section keys, so a mode-only row would be an untried visual state. |
| Write | `persistOpportunityDrawerLayoutConfig(..., { onlyIfAbsent: true })`, insert-only | It never updates. `UNIQUE (org_id, entity_type, surface, key)` arbitrates concurrent callers. The loser re-reads and does not retry. |
| Existing rows | Read regardless of `is_active`, then classified | `workflow_v1` → `already_present` (untouched). Classic/unknown mode → `blocked/conflicting`. Inactive → `blocked/inactive`. Non-object config or non-string mode → `blocked/invalid`. Read error → `blocked/unreadable`. |
| Surfaces | Not touched | `entity_layouts` and the drawer-mode override are separate lifecycles. See `docs/platform/modules/configuration-platform.md`. |

## Results

`web/tests/businessProcesses/enrollmentDrawerProvisioning.live.test.ts`:
- **Real:** the route handlers, the publish RPC, the unique key, an auth user with an `admin` membership, and the production grant resolver.
- **Mocked:** only the session.
- **Run:** fresh orgs, **11/11**.
- **Evidence:** `live-evidence.json`.

| # | Scenario | Result |
|---|---|---|
| 1 | New org: no override, classic global default | PASS |
| 13 | Assignments + Billing publish: no provisioning, no `opportunity_drawer_override` on the response | PASS |
| 2–3 | Template applied, entry points set, 6 Work Views, validate: 0 errors | PASS |
| 12 | Publish with a stale editor token → 409, **no override**; retry → 200 `provisioned` | PASS |
| 4 | Exactly one active row, `config_json` = the default | PASS |
| 9 | Re-publish → `already_present`, row byte-identical (`config_json`, `updated_at`) | PASS |
| 5–6 | Create Lead (lead stage) → drawer view-model **200**, full payload (`layout`, `header`, `actions`, `summaries`, …) | PASS |
| 7–8 | `GET /api/admin/entity-layouts/focus-panel-summary` (Surfaces read) → 200 | PASS (server read only; browser render is hosted QA) |
| 10 | Operator-customized `workflow_v1` override survives re-publish byte-identical | PASS |
| 11 | Classic / inactive / malformed override → `blocked` (`conflicting` / `inactive` / `invalid`), row unchanged | PASS |
| 14 | 6 concurrent provisionings, one org → exactly 1 `provisioned`, 1 row; a retry → `already_present`, unchanged | PASS |

**Counterfactual.** The same suite on the base publish route (`live-evidence-without-hook.json`, the 10-scenario version before the D3 probe was added) fails exactly 3–4, 9, 5–6 and 10. The view-model answers **422 `{"reason":"classic_layout_deferred"}`**, which is the hosted QA Shared failure reproduced locally.

The unit tests are in `web/tests/layout/enrollmentDrawerOverrideProvisioning.test.ts`. They cover:
- eligibility;
- the classification table;
- unreadable;
- the uniqueness loss to a `workflow_v1` row and to an inactive row;
- a non-uniqueness insert failure;
- a throw becoming `failed`;
- default = migration JSON;
- the audited writer registration.

**Regression.** I ran 1,266 covering suites (configuration publication, Business Processes, lifecycle, layout, drawer view-model) on head and on base.
- Both trees: 3,447 passed and 92 failed, with **0 new and 0 fixed** failures.
- The 92 failures are identical on both trees and pre-existing, including `opportunityDrawerLayoutPhase5` › "visual editor includes entity-first field picker".

**Type check.** `tsc` scoped to the changed source and both test files: 0 errors. The governed `vac run typecheck` refuses an unslotted lane.

## D3: closed Enrollment record (measured, NOT repaired)

The live suite closes the lead through the supported path: *Not interested* on its Lead stage work → family stage `closed`, status `closed`. The published `closed` stage has **0 work templates**.

| Read | Result |
|---|---|
| Drawer view-model for the closed record | **200**. The record opens once D1 is fixed. |
| Provisioning answer, "All" view, closed record selected | **`terminal: error`, `no_truthful_primary_action`**: "stage "closed" offers no work templates — the answer will not claim operational on identity alone" |
| Same view, open lead selected | `operational` |
| Same view, no subject (initial load; default subject is the most recent row) | **`no_truthful_primary_action`** |

- **Cause.** `familyStageDestinationOperability` (`web/lib/runtime/provisioning/workViewDestinationOperability.ts`) treats a family stage with no work templates as inoperable. A terminal stage has none by design.
- **Repairing it** means the runtime provisioning answer contract would need a read-only terminal answer, with no primary action and no current work, and the Focus Panel would have to render it.
- **Status: blocker, not repaired here.** The fix is not small, and it is separable from D1. No dummy work templates were added.

## Fixture teardown

Orgs cannot be deleted through the API while they own dependents.
- **Suite.** It records its orgs (slug `bpv2-d1-live-*`).
- **Teardown script.** `live-fixture-teardown.sql` removes those orgs and their users, and nothing else.
- **After every run: 0 fixture orgs left.**
- **Orphan check.** A foreign-key orphan census after teardown found no orphans from these fixtures. Four pre-existing payment-table orphan sets date from 9–12 September and belong to live orgs; they were left untouched.
