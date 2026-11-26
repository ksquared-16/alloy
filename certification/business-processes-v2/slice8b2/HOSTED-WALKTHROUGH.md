# Business Processes V2: Slice 8B-2 populated-record hosted walkthrough

**Run:** `qar_58463703cedd` (plan `bp_v2`) in QA Shared `4acc9386-c485-486f-aa1f-05d83499d142`.
**Window:** 2026-10-23, 02:55–03:34Z.
**Builds:**
- The run opened on staging `e541dba05`.
- Staging redeployed **during the run** to `267d9400b8c7` (#1575, Documents; it changes no drawer, Business Process, Scheduling or Financials code).
- The browser walkthrough ran on `267d9400b8c7`.

**Toolkit:** `2cc54168bf80`. Supabase project `ikaxilmwmrmbagoidedu`.
**Personas** (sessions verified as their exact identities):

| Persona | Identity | Roles and scope |
|---|---|---|
| admin | `qa-pool-01` | `admin` |
| director | `qa-pool-02` | `ops` + `school_director` |
| restricted_operator | `qa-pool-03` | `ops` + `school_director`, QA North only |
| no_finance_operator | `qa-pool-04` | `qa_bp_no_finance`: `ops` minus 4 financial-class keys, 57 keys |

**Grants:** Director effective financial keys are `fin.read`, `fin.write`, `billing.read` and `billing.write`.
**Fixture prefix:** "Walk 584637". Manifest: `hosted-qar_58463703cedd/fixture-manifest.json`.
**External side effects:** none. The census shows zero outbound send evidence, and no provider, merchant or payment method exists.

Classifications: **PASS** (exercised on hosted staging), **FAIL**, **BLOCKED**, **NOT EXERCISED**, **LOCAL CERTIFIED**. Local and hosted proof are never combined.

## Configuration (product configuration APIs, admin)

| Item | Result |
|---|---|
| Enrollment process | Reused, published revision 2 (`caaf8b6a…`); 8 stages, 2 tracks; 6 stage-based views with grain matching their stages |
| Assignments, Billing | Reused, published revision 1 (`1e1f598f…`, `b2dea6e2…`) |
| Child status vocabulary | **Created**: `waitlisted`, `enrolling`, `enrolled`, `withdrawn`, `not_enrolling`. Canonical keys, labels and order. Terminal semantics are code-owned (`TERMINAL_CHILD_STATUS_KEYS`). |
| Stage work units | `lead` (8B-1) plus `tour`, `decision`, `closed`, `waitlist`, `enrolling`, `enrolled`, `closed_withdrawn`, with canonical status filters |
| Option sets `person_gender`, `childcare_program_type` | Absent in new orgs: seeded only by a one-time migration (`20260430211000`). **Optional** for the walkthrough (inquiry field pickers); not authored. |

## Enrollment

Family "Walk 584637 Family" (opportunity `d9b1fbfb…`, household `23865933…`) with Ava (participation `dc2c0f43…`) and Ben (participation `1e9cb04d…`). Every step was verified against durable state: participation status and stage work.

| Scenario | Result | Evidence |
|---|---|---|
| Create Lead (normal flow) | **PASS** | `mode: committed`, stage `lead`, status `open` |
| Household + both children | **PASS** | child.add plus the canonical attach writer; both at `new_inquiry` |
| Lead → Tour ("Interested") | **PASS** | `lead_to_tour` committed; Contact Family completed; Conduct Tour spawned |
| Tour → Decision ("Tour completed") | **PASS** | `tour_to_decision`; Support Enrollment Decision spawned |
| Waitlist one child (`waitlist_child`, Ava) | **PASS** | Ava `waitlisted` (stage plus disposition); Ben unchanged (`updated_at` null); family stays at Decision |
| Child work refused as family work | **PASS** | "This work belongs to a child and cannot be completed as the family's" |
| "Family enrolling" for a two-child family | **FAIL** (defect D2) | committed, Decision work completed, only `no_movement` applied; `enter_child_enrollment` refused internally but **not reported**; no child started |
| Progress the other child (Ben) | **PARTIAL** | `update_child_enrollment_status` → `enrolling` committed; Ava unchanged. Status only: Ben's stage did not move, so the Decision row reads "1 undecided" and Registration stays 0. **BLOCKED** for full stage progression: no supported per-child Start Enrollment path in a multi-child family (D2/D5) |
| Children independent | **PASS** | both directions, durable reads |
| Work View membership and counts | **PASS** | Decision 1 (family), Waitlist 1 (Ava, child row), All 2 (includes the 8B-1 closed family); New Leads, Tours, Registration 0 |
| Opportunity Focus Panel | **BLOCKED** (defect D1) | "This inquiry drawer uses a classic layout. View Model cutover supports workflow_v1 drawers only." |
| Terminal (closed) record readable | **BLOCKED** (D3, masked by D1) | 8B-1 measured "stage `closed` offers no work templates"; now the layout gate fails first |

## Assignments

Rooms N/S, patterns N/S and assignment type `1a61c00a…` (staffing participation `supply`). Ben has an agreement, a primary assignment and a secondary ending +10 days. Cara starts +7 days. Dan has an agreement with no schedule. Ava has a proposed assignment. Eve is at QA South. A staff member is at QA North.

| View (Director) | Count | Rows | Opened record → Scheduling card | Result |
|---|---|---|---|---|
| Current assignments | 3 | Ben ("2 assignments"), Eve, QA Teacher | Ben's PRIMARY, Room N, Mon–Fri, starts Sep 22 | **PASS** |
| Ending soon | 1 | Ben, "Ends Nov 1 · in 9 days" | the secondary (Classroom), Sep 22 → Nov 1 | **PASS** |
| Upcoming changes | 1 | Cara, "New primary assignment starts Oct 29" | upcoming PRIMARY, starts Oct 29 | **PASS** |
| Schedule gaps | 1 | Dan, "No committed schedule" | "This enrollment agreement has no committed schedule yet", New schedule at QA North | **PASS** |
| Proposed / incomplete | 4 | Ava "Proposed assignment awaiting disposition"; Ben, Cara, Eve "Missing assignment type" | Ava's proposed assignment, starts Nov 5 | **PASS**. The three primaries from `enrollment.direct` carry no category, so the view correctly flags them (observation O1). |

Counts equal rows, and every row matches the fixture manifest.

| Action | Result |
|---|---|
| Director: `assignment.archive` on Ben's secondary | **PASS**: committed `ended`, `end_date` 2026-10-23; the primary is untouched (independent row read) |
| Restricted Operator: archive Eve's QA South assignment | **PASS** (refusal): 403 `site_out_of_scope`; rows byte-identical |
| Restricted Operator's Assignments views | **PASS**: Eve absent (Current 2, Proposed 3) |

## Billing

Account billing calendar and due-date policy (4 days). Templates: fee $50 fixed, and review fee $75 fixed with review required. Charges:
- `1312c61e…` $50, posted, due Oct 27;
- `baa509ae…` $75 draft, review required;
- `103787e5…` $50 posted, paid in full by check (payment `de88693a…`).

| View | Result | Evidence |
|---|---|---|
| Charges needing review | **PASS** | 1 household; the Financials card leads on "QA Supply Fee (review), Review required, $75.00" |
| Payments due | **PASS** | 1 household, "$50.00 due Oct 27"; the card shows that charge, posted, $50.00; the paid charge is correctly absent |
| Overdue payments | **NOT EXERCISED** | no past-due fixture: backdating needs an approved isolated mechanism. LOCAL CERTIFIED (S6A) |
| Payment exceptions | **NOT EXERCISED** | no provider in QA Shared, by design. LOCAL CERTIFIED (S5) |
| Funding variances | **NOT EXERCISED** | not seedable (claim-line ids not exposed). LOCAL CERTIFIED (S5/S8A) |
| No-Finance Operator | **PASS** (refusal) | all 5 views refused, counts hidden; `financials/card` and `financials/charge/{id}` return 403 |
| Restricted Operator | **PASS** (by rule) | 0 rows: household-account charges are org-scoped and hidden from site-restricted actors |
| Charge detail / card site scope | **FAIL** (D4, known debt now reproduced) | the Restricted Operator gets **200 with amounts** from `financials/charge/{id}` and `financials/card` for the household whose charges every Billing view withholds |

## Workspace tiles

- **Tiles:** all three render for every persona. There is no Enrollment fallback for Assignments or Billing.
- **Enrollment tile:** "2 open work items · 1 overdue" was **accurate**: Ava's waitlist work plus the manual overdue item.
- **Assignments and Billing tiles:** "No open work items". These processes have no Work Item producer, and view counts are kept separate from Work Items.
- **No-Finance Operator:** sees the Billing tile with uncounted view links.

**Director's presentation feedback, recorded as an acceptance observation:** Open and Overdue read as an appended line under the tile rather than part of the tile's design. Not redesigned here.

## Performance (hosted, including my fixed 5–6 s settle waits)

| Page | Time |
|---|---|
| `/workspace` | 15.6–21.2 s |
| each Work View | 12.8–15.4 s, about 8 s to network idle |

Console noise is only 404s: option sets (absent) and `financial-config/opportunity/{child id}` (D6). There were no page errors.

## Defects

| # | Severity | Defect | Reproduction | Owner | Smallest repair |
|---|---|---|---|---|---|
| D1 | **High: blocks the Enrollment record surface in every new org** | The opportunity drawer requires an org layout with `inquiry_drawer_mode: "workflow_v1"`. Only a one-time migration set it, for orgs that existed then; there is no write path (record-layouts is GET-only; the workflow_v1 editors require the mode to exist). | Open any Enrollment row in QA Shared | Configuration / Surfaces | Provision the `workflow_v1` drawer layout for a new org with its Enrollment process (template or org bootstrap), or default the effective mode |
| D2 | Medium | "Family enrolling" on a multi-child family commits and completes the Decision work. `enter_child_enrollment` refuses ("This family has 2 children…") but the refusal is not surfaced, and no child starts. | Two-child family at Decision → record "Family enrolling" | Enrollment / outcome runtime | Surface the target refusal as a failed target and do not complete the work, or keep the work open with the reason |
| D3 | Medium | A record in a stage with no work templates cannot be opened ("stage `closed` offers no work templates"). Readability depends on executable work. | Closed family (8B-1); masked by D1 now | Runtime / Enrollment | Compose a read-only record for stages without work; do not add placeholder templates |
| D4 | Medium | Charge detail and Financials card are reachable to a site-restricted actor for org-scoped household charges that Billing views withhold | Restricted Operator → `GET /api/admin/financials/charge/{id}` → 200 | Financials + Access | Apply the Financials work-visibility rule (`isFinancialWorkVisible`) on charge-detail and card reads, or decide that household reachability governs both |
| D5 | Medium | No supported per-child "Start Enrollment" that moves a child into `enrolling` in a multi-child family; `update_child_enrollment_status` changes status only | Ben: status `enrolling`, stage unchanged, Registration 0 | Enrollment | Expose the existing per-child decisions (`participant_decisions`) on the template's Decision work, or a per-child start-enrollment command |
| D6 | Low | The Scheduling card opened from Assignments calls `financial-config/opportunity/{customer_member_id}` → 404 | Open Cara or Dan from Assignments | Scheduling / Surfaces | Pass the opportunity id, or skip the preview when the subject has none |
| D7 | Low | Publish validation does not check Work View row grain against filtered stage grain; the runtime refuses at render | Family-grain view filtering `enrolling` publishes, then fails | Configuration (Business Process publication) | Add `work_view_grain_mismatch` to `validateBusinessProcessForPublish` beside the stage-reference checks, using `resolveStageGrain` |
| O1 | Observation | `enrollment.direct` creates primaries with no assignment category; Proposed / incomplete flags them | Ben, Cara, Eve | Scheduling | Product decision: a default category, or keep flagging |

## Cleanup

- **Quiesced through product commands:**
  - the review draft cancelled (now `void`, retained);
  - the due charge reversed (reversal `7d4eb377…`);
  - the paid charge covered;
  - all work items completed.
- **Close** `gar_af13e53d5984ed`: access clean, plan role emptied, sessions removed.
- **Census v2** `gar_5eb1ed3a0dee90`: **13/13**, with 4 charges (3 posted including 1 reversal, 1 void) and 1 payment retained, all by `qa-pool-01`. Bound by `gar_1f2e19bbd0f334`.
- **Verdict:** **QUIESCED_RETAINED**.
- **Retained by design:**
  - configuration: published processes, stage work units, rooms, patterns, assignment type, financial policies and templates;
  - run-tagged records: the household, 5 children, opportunity, agreements and assignments, staff person;
  - the quiesced financial history above;
  - audit rows (110).
