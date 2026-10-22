# Business Processes V2: sprint status

**As of:** 2026-10-22T18:00Z
**Lane:** `lane_581d120e4e41` (`agent/business-processes`)
**Deployed staging:** `9d96c7e88` (`/api/build-info`). It contains every BP V2 merge below.
**Vacilando:** toolkit `7414457452d7`.

**Overall: PARTIAL.** Everything planned for V2 is merged and deployed. The only open acceptance gate is the **hosted three-process certification (Slice 8A)**. It is **BLOCKED by a Vacilando QA-runner defect** (§4): the QA run fails before granting any access. No product change is needed to unblock it.

## 1. Scope

**Goal.** Business Processes V2 lets an organization run **Enrollment**, **Assignments** and **Billing** side by side on `/workspace`, all through the *existing* process catalog, tiles, Work Views and Focus Panel:
- Enrollment stays a staged lifecycle and is unchanged.
- Assignments and Billing are stage-less **domain projections**. They read Scheduling's and Financials' own authorities, and they introduce no second engine, record authority or financial calculation.

**Agreed scope.**
- **Slice 1:** a process model, plus the three processes as tiles.
- **Slice 2:** domain-backed Work Views.
- **Slices 3–4A:** Assignments: five views, Focus on the Scheduling card, and site-scoped commands.
- **Slices 5–6A:** Billing: five views, Focus on the Financials card, and one Due / Past due classification.
- **Slice 7:** the tile's Work Items line.
- **Slice 8A:** hosted three-process certification in an isolated QA organization, a Director walkthrough, and financial quiescence.

**Changes and deferrals.**
- Billing-period variances were dropped as a view: Financials has no such comparison.
- Failed-payment exceptions are limited to provider collections that were never recognized.
- Slice 8A originally assumed a disposable organization that would be retired at the end. The Director instead chose a permanent shared QA organization with quiesced, retained records. That change added the financial-quiescence work (census v2).

## 2. Delivery inventory

The lane owns every slice.

| Slice | What | Status | PR → staging merge | Local certification | Hosted certification |
|---|---|---|---|---|---|
| 1 | `process_model_v1`; three processes, as tiles, with no Enrollment fallbacks | COMPLETE | #1513 → `4d795dcf0` | `threeProcessShell` (24), `threeProcessTiles` (2); publish rollback 12/12 | Deployed configuration census `gar_49a1b7a56ae00b` |
| 1A | Hosted evidence and the Slice 2 contract (no code) | COMPLETE (evidence) | #1516 closed; content landed with #1521 | — | `slice1a/` tenant-identity census |
| 2 | Domain-backed Work View runtime, with one reference projection per domain | COMPLETE | #1521 → `e67863e5d` | `live-projections.local-cert.json` | `slice2/hosted/` (read-only) |
| 3 | Assignments: 5 Work Views; workspace site scope | COMPLETE | #1526 → `2f2d4ca59` | `live-assignments.local-cert.json` | `slice3/hosted/` (read-only; Firefly has no Assignments process) |
| 4 | Assignment rows open the existing Scheduling card on their source | COMPLETE | #1535 → `19aa6a5ed` | `live-focus-panel.local-cert.json` | `slice4/hosted/` (read-only) |
| 4A | Assignment commands enforce the actor's site scope | COMPLETE | #1547 → `5fa727260` | `live-assignment-site-scope.local-cert.json` | `slice4a/hosted/` (read-only) |
| 5 | Billing review views: charges needing review, payment exceptions, funding variances | COMPLETE | #1549 → `488ed0b3e` | `live-billing.local-cert.json` | `slice5/hosted/` (read-only) |
| 6 | Billing on the existing Focus Panel and Financials card | COMPLETE | #1551 → `bac802bb9` | `live-billing-focus.local-cert.json` | `slice6/hosted/` (read-only) |
| 6A | One Financials Due / Past due classification; Payments due and Overdue views | COMPLETE | #1553 → `6cff6cb9c` | `live-due-parity.local-cert.json` | `slice6a/hosted/` (read-only, deployed `6cff6cb9c`) |
| 7 | Tile Work Items line (open / overdue) | COMPLETE | #1554 → `ed5abbcd1` | `live-tile-work-items.local-cert.json` | `slice7/hosted/` (read-only, deployed `ed5abbcd1`; Enrollment 111 open · 89 overdue, matching the server summary) |
| 8A-R | Hosted QA readiness, Decision classification, Director walkthrough | COMPLETE | #1567 → `a12b8808d` | — | — |
| 8A-Q | Financial quiescence: contract, census v2 (`c1b6c335…b05648`, 13 checks), handoffs | COMPLETE | #1567 → `a12b8808d` | `financialQuiescence.live.test.ts` (3 tests) on lane and staging | Deployed baselines `gar_f04e0a9aaae37e` and `gar_51efecdc15c6a5`: 13/13 |
| 8A-H | **Hosted three-process certification** (configure, fixtures, walkthrough per persona, quiesce, census) | **BLOCKED** | — | — | Run `qar_f9a9275db057` failed while opening; recovered `QUIESCED_RETAINED` (§4) |

**What "hosted" means in this table.** Every hosted pass before 8A was a **read-only** check of a deployed build in Firefly, where only Enrollment is configured. Assignments and Billing have **never been exercised with real rows on a hosted deployment**. That is exactly what 8A-H is for.

**Not yet merged.** This status record and the 8A-H attempt evidence (`slice8a/hosted/`) are local lane commits only.

## 3. Product capability status

| Area | Status |
|---|---|
| **Enrollment** | Unchanged by V2; tile, views and Focus Panel proven read-only on hosted Firefly. Known debt: the Decision tab counts 12 but lists 11 (the count and the list read stage from different sources; Runtime + Enrollment). The certified Work-View filters (New Leads, Decision, Registration) are recorded nowhere in the repository. |
| **Assignments** | Five views (current, ending soon, upcoming changes, schedule gaps, proposed / incomplete) open the Scheduling card on their source. Commands enforce site scope. Certified locally; hosted only read-only. |
| **Billing** | Five views over Financials' own readers. Due and Past due match the Financials card to the cent (locally). Billing-period variances are not offered. Certified locally; hosted only read-only. |
| **Workspace tiles and navigation** | One tile per published process. Work Items line shows open and overdue counts, says "unavailable" when the source fails rather than showing zero, and flags a department shared by two processes. Enrollment hosted-proven. |
| **Work Views and projections** | Domain projections are registered per process, and publish refuses mixed configuration. Count = rows is proven locally for every projection. |
| **Focus Panel and record detail** | The existing panel and cards are reused: Scheduling for Assignments, Financials leading for Billing. |
| **Site-scoped authorization** | Views and assignment commands are site-scoped (S3, S4A). Debt: charge-detail route site scope; a child reachable through a household at a held site. |
| **Financial visibility** | Billing views require `fin.read`; refusals are proven locally. The default admin package now carries `fin.*`. |
| **Fixtures and QA lifecycle** | Shared QA organizations, identities and no-send guards are ready, and census v2 is registered. Hosted runs are blocked (§4). Some fixtures cannot be created through product commands (§5). |

## 4. QA and reliability

**Hosted attempt, Slice 8A.**
- `environment.qa_run_open` (`gar_5d90847cba7444`; plan `bp_v2`, target `alloy_staging_web`) created run `qar_f9a9275db057`.
- Personas: admin = `qa_pool_01`, director = `qa_pool_02`, restricted operator = `qa_pool_03` (QA North only), no-finance operator = `qa_pool_04`.
- The run failed **before any grant** with `qa_audited_function_failed: assign_member_role_audited — mutation_events_origin_check`.

**Root cause.**
- The Vacilando runner passes `p_origin: "vacilando_qa_run"` (`toolkit lib/qa-run-db.mjs:28`).
- Alloy's `mutation_events.origin` CHECK allows only `operator`, `automation`, `api` and `system` (`supabase/migrations/20260630121000_mutation_events_outbox.sql:16-17`).
- So every audited access write is refused. The Documents run `qar_46a50c686b62` (`authz_q1`) failed identically at 17:34Z.
- **Owner:** Vacilando Backend.
- **Smallest fix:** pass an allowed origin (`automation`) and keep the run id in `p_correlation_id`, which the runner already sends. Add a test that the origin is in Alloy's CHECK set.

**Cleanup is accounted for.**
1. Recovery close `gar_9d0be10c850567`: access clean, 0 rows removed, 0 roles and 0 profiles left for each pool identity, sessions signed out.
2. Census v2 `gar_51efecdc15c6a5`, run after close: all 13 checks true, with 0 charges, payments, variances, publications and audit rows in QA Shared.
3. Census bound to the run with `gar_8c0a22cfabba7a`. Verdict **`QUIESCED_RETAINED`**.
4. QA Shared was never written.

Evidence: `slice8a/hosted/`.

**Local versus hosted.** Every slice's behavior is certified locally against independent SQL, on a cert stack whose migration ledger trails staging. Hosted evidence is read-only on Firefly. No hosted write-path or persona-refusal certification exists yet.

**Known regressions.** None attributed to V2. Every PR's CI passed at merge. The staging context-package manifest is out of date for `financials-canonical-authorities.md`; that was not caused by V2, CI does not check it, and the docs owner should fix it.

**Fixtures that cannot be created through product commands** (traced on `9d96c7e88`):

| View row | Why | Unblock owner |
|---|---|---|
| Funding variance (open short-paid) | No API returns claim-line ids, and variances are written by `reconcile_remittance` | Financials: expose claim-line ids |
| Failed post | Written only on an unexpected error in automatic posting | Certify the view as empty (not seedable by design) |
| Payment exception (unrecognized provider collection) | QA Shared has no provider, by design | Certify the view as empty |
| Past-due charge | Needs `charge.add` with a back-dated `payload.today` | Director accepts this input |

**Hosted QA prerequisites the attempt surfaced** (all available through product APIs; none done yet):
- one builder-owned department per process, plus publish;
- Enrollment template, entry points, Work Views and stage work units (`create_lead` returns 422 without them);
- rooms, schedule patterns and an assignment type per site;
- per-household billing calendar and due-date policies, and fixed-amount charge templates.

## 5. Completion assessment

**Planned increments.** Twelve are merged and deployed: Slices 1, 1A, 2, 3, 4, 4A, 5, 6, 6A, 7, and 8A readiness and quiescence. One acceptance increment, **8A-H**, is blocked.

**Not ready for final acceptance.** The V2 acceptance requires Assignments and Billing to work with real rows, per persona, on a hosted deployment. That hasn't happened yet.

**Critical path.**
1. Vacilando fixes the origin and reinstalls the toolkit.
2. Open `bp_v2` (re-measure the no-send revisions and the Documents run first).
3. Configure the three processes.
4. Create fixtures under the `qar_` id.
5. Walkthrough per persona.
6. Quiesce through product commands.
7. Close, run the census, bind it.

**Independent work.**
- Financials: claim-line id exposure; QA-org provider refusal; a periodic-billing stop.
- Runtime and Enrollment: confirm the Decision 12-vs-11 count.
- Docs: manifest drift.

**Director decisions** (also in `slice8a/QA-READINESS.md §5`):
- (a) Should the Overdue queue show total past due, or what the family currently owes, when a subsidy claim is pending?
- (b) Accept "certified empty" for the funding-variance, failed-post and payment-exception views, or require the Financials endpoint first?
- (c) Accept the stage-based Enrollment Work-View filters for QA Shared: New Leads = `lead`; Decision = `decision`; Registration = `enrolling`; Waitlist = `waitlist`; Tours = `tour`; All = no filter.
- (d) Accept back-dated `payload.today` for the past-due fixture?
- (e) Promote this local evidence with the next code-bearing PR? The recommendation is yes, rather than a PR for evidence only.

## 6. After V2 (not started)

- **Must finish in V2:** 8A-H, including the walkthrough with all three processes and four personas.
- **Domain debt that doesn't block V2:**
  1. Billing-period variance comparison.
  2. Failed-payment, autopay and dispute readers.
  3. Subsidy labelling (decision a).
  4. Variance id targeting and resolution in the card.
  5. Charge-detail route site scope.
  6. Decision 12-vs-11 count.
  7. Per-process record layout authoring.
  8. Work Items "due today" uses the server day, not the org day.
  9. Household-based record reachability.
  10. QA-org provider refusal.
  11. A periodic-billing stop.
- **Future enhancements:**
  - Work Items producers for Assignments and Billing;
  - a Work Items destination filtered by process;
  - signals and KPIs for Assignments;
  - a Billing-period close view;
  - a third domain projection, for example Staff;
  - a recorded, versioned Enrollment Work-View template so QA organizations and new tenants get certified views without hand authoring.
