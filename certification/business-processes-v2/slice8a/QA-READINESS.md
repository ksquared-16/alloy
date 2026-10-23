# Business Processes V2: Slice 8A, hosted QA readiness

**Status:** `PARTIAL`. Two things are blocked: an isolated staging QA organization, and the QA identities needed in it. No existing governed action can create either (see §1).
**Deployed staging:** `ed5abbcd1` (PR #1554), confirmed by `/api/build-info`, 2026-10-21.
**Firefly** (the operating tenant): no configuration or financial records were changed. Only read-only GETs were used.

---

## 1. The blocker, and the exact approval needed

**What exists.** These are all of this host's QA environment actions (from `vac governed-action --list`):

| Action | What it can do | Why it is not enough |
|---|---|---|
| `environment.provision_qa_identity` | Creates the managed QA identity for a lane slot | Creates one identity only. It cannot choose an organization. |
| `environment.assign_qa_identity_access` | Gives that identity staging access | The organization is fixed inside the trusted host: the seeded staging org (`DEV_QUEUE_ORG_ID`), which is Firefly. The role is a fixed constant. Any `orgId`, `role` or `identity` input is **rejected** (`qa-access-assign-action.mjs:44-49`). |
| `environment.restore_deployed_qa_session` | Restores the browser session for the one managed deployed identity (`alloy_staging_web`) | Covers one identity only. The four required personas need four sessions. |
| `environment.build_certification_baseline` | Builds an isolated certification **database** on this host (ports 56100–56299) | It runs locally, not on hosted staging, so it cannot serve hosted browser QA. |

**No action** creates an organization on staging, assigns a QA identity to a non-Firefly org, grants a specific role or site restriction, or restores a session for more than one identity. Seeding Firefly would breach the standing rule, so this slice stops at that boundary.

**Approval request.** Choose either form; both use only the existing access model.

> **Option A: one-time operator provisioning, recorded as a governed exception.** Create the staging organization **"Alloy QA — Business Processes V2"** with the current default RBAC seed (`seed_default_rbac`, which already grants `admin` `fin.read` and `fin.write`) and two sites, **QA North** and **QA South**. Then create four QA identities:
>
> | Persona | Roles (existing) | Scope | Effective grants to verify server-side |
> |---|---|---|---|
> | QA Admin | `admin` | all departments, all sites | configure and publish processes; `scheduling.write`; `fin.read`, `fin.write`, `fin.subsidy` |
> | QA Director | `ops` + `school_director` | all sites | portal admission (`ops`); `fin.read`, `fin.write`, `billing.read`, `billing.write` (seeded `ops`) — *corrected 2026-10-23, see below* |
> | QA Restricted Operator | `ops` + `school_director` | **QA North only** (`user_site_access`) | as Director, restricted to one site — **the site-scope negative test** |
> | QA No-Finance Operator | `qa_bp_no_finance` (plan role: seeded `ops` minus `fin.*`, `billing.*`, `staff.compensation.*`, `enrollment.pricing.override`; keeps `portal.access`) | all sites | none of those keys — **the financial negative test** (*corrected 2026-10-23*) |
>
> Allow `environment.restore_deployed_qa_session` to target each of the four identities.
>
> **QA contract correction (2026-10-23, BP V2 Slice 8B-1).** This is not a role-policy change. No grant was added or removed anywhere.
> - **Director.** The original row said "no `fin.write`". That assumed seeded `ops` carried no financial keys, but it does: hosted run `qar_1546aa9036c7` measured `fin.read`, `fin.write`, `billing.read` and `billing.write`. The Director is the existing `ops` + `school_director` persona with exactly those grants. No `qa_bp_director` role is introduced. No Business Processes V2 acceptance scenario depends on the Director being refused a financial write: the walkthrough has the Director read and decide.
> - **No-Finance.** The original row (`ops`) was not finance-less for the same reason. The plan now provisions the bounded role `qa_bp_no_finance`, and hosted run `qar_1546aa9036c7` verified it: 57 keys, none financial, `portal.access` kept. All five Billing views are refused, 8 finance APIs return 403, and no figures are disclosed. It remains the explicit financial negative test.
> - **Restricted Operator.** It remains the explicit site-scope negative test.
>
> **Option B: extend the governed catalog.** Add `environment.provision_qa_organization`, whose inputs are a name, sites and the persona table above, together with a persona-aware deployed session restore. This option is the better fit if hosted QA will recur.

Once approved, everything below runs without any further authority.

---

## 2. Configuration, via the existing paths only

All three processes are created in **Organization → Processes** (`/organization/processes`) with **Create process**, choosing the **Process type**:

1. **Enrollment**: staged lifecycle, from the certified Enrollment template. Publish it with its usual Work Views (New Leads, Decision, Registration, Waitlist, Tours, All) and its stage work templates.
2. **Assignments**: process type *Assignments*. Under Work Views, add five views and choose these projections: Current assignments, Ending soon, Upcoming changes, Schedule gaps, Proposed / incomplete. Then publish.
3. **Billing**: process type *Billing*. Add five views and choose: Charges needing review, Payment exceptions, Funding variances, Payments due, Overdue payments. Then publish. Billing-period variances is **not offered** by the picker, so it cannot appear as an empty view.

Record the published revision id of each process, and check that `/workspace` shows three tiles.

---

## 3. Fixture plan

Each fixture is created with the product's own commands, as the QA Admin, and every one is recorded in a manifest (`fixture-manifest.json`, written as it is created).

| Process | Fixtures | Created through |
|---|---|---|
| Enrollment | a new lead; a family at Tour/Decision; a child enrolling; a waitlisted child; active stage work; one Work Item **overdue** (due yesterday); one completed Work Item; one unattributed manual Work Item | Create lead, stage outcomes, Work Items create |
| Assignments | a current child assignment and a current staff assignment; one ending in about 10 days; one starting in about 7 days; an agreement with no schedule; a proposed assignment; one child with two current assignments; one assignment at QA South (outside the restricted operator's scope) | Scheduling card commands (`assignment.*`, `schedule.create`) |
| Billing | a draft charge flagged for review; a charge with a failed post; an unrecognized collection; a submitted subsidy claim with expected funding and an open short-paid variance; a charge due today; a charge due in 4 days; a past-due charge; a fully paid charge (must not appear) | Financials commands (`charge.add`, posting, `payment.record`); subsidy claim and remittance; **no live provider collection**. The unrecognized collection must come from the provider sandbox or a test-mode attempt. If none exists, report that row as not seeded. |
| Work Items | none for Assignments or Billing | Neither process has a Work Item producer, so their tiles must read "No open work items". |

**Financial safety.** *Superseded 2026-10-22.* The shared QA organization is permanent, so it is never retired. A run's financial records are **retained and quiesced**: drafts are cancelled, posted charges reversed or fully paid, and variances resolved, all through product commands, before the run closes. Census v2 then proves it. The definition, run contract and proof are in [`FINANCIAL-QUIESCENCE.md`](FINANCIAL-QUIESCENCE.md). Nothing is deleted, and no trigger is bypassed. No real collections, refunds, emails or SMS are sent. QA Shared has no merchant or payment method, and the no-send guards serve it.

---

## 4. Hosted results available now (Firefly, read-only, `ed5abbcd1`)

| Check | Result |
|---|---|
| `/workspace` Enrollment tile | "55 Family Leads / 56 Children". Work Items line: "111 open work items · 89 overdue", equal to the server's by-department summary (111 / 89) |
| Enrollment Work Views | New 27 rows = pill 27, All 73, Registration 27, Waitlist 21, Tours 0, Enrolled children 4. Pill navigation and the opportunity Focus Panel work |
| Workspace site filter | Enrollment rows are identical with and without a selected site |
| Errors | 0 page errors, 0 HTTP errors. The single console line is the test's own aborted write |
| Assignments / Billing | not configured in Firefly (correctly), so they cannot be shown hosted until §1 is approved |

Evidence: `certification/business-processes-v2/slice7/hosted/` (deployed `ed5abbcd1`).

### Enrollment Decision: count 12, rows 11 (reproduced, classified, not repaired)

- **Measured, read-only.** For Decision (`new_work_view_8`), `POST /api/admin/queue-view-totals` returns **12** (`known: true`), while the provisioning answer returns **11** family-grain rows with 11 distinct ids.
- **Ruled out.** Each row is a single opportunity, so this is not grain collapse.
- **Most likely cause (from the code, not yet confirmed by data).** The two paths take each family's effective stage from different sources:
  - The totals read **live** `process_instances` (`evaluateWorkViewTotalsForGroup.ts:314-320`).
  - The answer reads the **stored** `opportunities.maintained_operational_facts` (`workUnitProvisioningAnswer.ts:1598`).
  - The stored copy is kept current only by specific RPCs, and several writers update `process_instances` directly (for example `processInstances.ts:502`, `applyChildParticipationEdit.ts:200`, `executeParticipantDecisionForChild.ts:469/569/579`). One opportunity whose stored copy is stale would be counted at Decision by the totals but not listed.
- **Owner.** Runtime chose which source each path reads; Enrollment owns the stored facts.
- **Confirming reads.** These need a deployed census:
  1. List the 12 totals ids and diff them against the 11 row ids to find the extra opportunity.
  2. For that opportunity, compare `maintained_operational_facts->'participants'` with `opportunity_participant_facts(org, id)`.
- **Other candidates, if the facts match:**
  - location scope applied only on the totals side;
  - a different host work unit;
  - non-atomic snapshots, which also fit the "All 74 vs 73" seen once.

---

## 5. Director walkthrough (run in the QA org once §1 is approved)

Sign in as **QA Director**. Everything starts at **Workspace**.

**Workspace: where should I focus?**
1. Three cards: Enrollment, Assignments, Billing.
2. On each card, read the headline, then the line under it, e.g. "3 open work items · 1 overdue". These are follow-ups someone has been assigned.
3. Under **Today's Work**, each view shows how many records match it. A count there is not a task.
4. Assignments and Billing should read "No open work items". Nothing assigns follow-ups in those processes yet; their views list conditions, not tasks.

**Enrollment: which families need progression or follow-up?**
1. Open **Enrollment**, then **New Leads**. Choose a family; the family's panel opens on the right.
2. Open **Decision**. Note the count on the tab, then count the rows. If they differ by one, note it (known issue, §4).
3. In the panel, open **Work** and find the overdue follow-up. Complete it, and check that the card's line drops by one.

**Assignments: what is current, ending, changing or incomplete?**
1. Open **Assignments**, then **Ending soon**. Choose a child. The panel opens on **Assignment**, on the assignment that is ending, with its end date.
2. **Upcoming changes**: choose the child whose assignment starts next week. The panel shows the future assignment, not the current one.
3. **Schedule gaps**: choose the child. The panel says "Not yet assigned" at the agreement's site.
4. **Proposed / incomplete**: choose the proposed assignment.
5. **Current assignments**: choose the child with two assignments. The panel opens on the one the row named.
6. Try one change, such as archiving the ending assignment: confirm it, and check that the view updates.
7. Sign in as **QA Restricted Operator** and try to change the assignment at QA South. It must be refused, and nothing changes.

**Billing: which families need review, and why?**
1. Open **Billing**, then **Charges needing review**. Choose a family. The **Financials** card leads the panel, open on that charge. The row reads "failed to post" or "needs review".
2. **Payment exceptions**: the panel opens Payments with the unrecorded collection marked as "collected by the provider, not yet recorded". It is not a payment.
3. **Funding variances**: the panel opens the charge the agency short-paid.
4. **Payments due**: "$… due today · through …". The amount equals the card's figures.
5. **Overdue payments**: "$… past due · since …". The amount equals the card's **Past due**.
6. **Decision for you.** On the subsidy family, Past due counts the full overdue amount even though an agency claim is submitted. The card's "Due now" figure reflects the claim. Decide whether the Overdue queue should show *total past due* or *what the family currently owes*.
7. Sign in as **QA No-Finance Operator**. The Billing views are refused, and no figures are shown.

---

## 6. Known domain debt (kept separate)

1. Billing-period variances: no comparison exists (Financials).
2. Failed-payment exceptions: no org-wide readers for failed attempts, autopay or disputes (Financials Payments).
3. Subsidy suppression vs Past Due labelling: a decision for you (Financials).
4. Funding-variance source targeting: variance ids, plus showing and resolving variances in the card (Financials Subsidy).
5. Charge-detail route site scope: `GET /api/admin/financials/charge/[id]` (Financials + Access).
6. Enrollment Decision count mismatch: §4 (Runtime + Enrollment).
7. Per-process durable-record layout authoring (Configuration/Surfaces).
8. Work Items "due today" uses the server day, not the org day (Work Items).
9. Record reachability: a child is reachable through a household case at a held site even when the child's own agreement is elsewhere (Access).
