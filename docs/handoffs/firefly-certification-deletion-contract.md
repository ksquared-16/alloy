# Firefly Certification Reset — deletion contract

Companion to [`firefly-certification-baseline.md`](./firefly-certification-baseline.md).
Written **before** implementation, from hosted read-only evidence and schema/FK inspection.

---

## 1. The problem this contract solves

The existing reset is **opportunity-anchored**: every deletion is reachable from a selected
opportunity. Hosted Firefly has 8 opportunities and 59 customers, so most of the operational
population is unreachable and survives — while verification reports success.

This contract adds a **second anchor** so the reset can remove operational identities that no
opportunity points at, without ever touching configuration, users, or access.

---

## 2. Evidence the contract is built on (hosted, read-only, 2026-08-03)

**Customers — 59 total, 51 unreachable from any opportunity.**
All 59 have `customer_type = NULL` and `external_source = NULL`. The 51 survivors are referenced by
**zero** processing cases and **zero** contacts. Their names are unambiguous test fixtures:
`Jordan Enrollment Lead` (many), `Jordan IC55`, `Jordan Lifecycle Coherence`.

**Persons — 53 total, 32 unreachable.**
`is_employee = true` for **zero** persons. `archived_at` set for zero. Of the 32: 27 are linked to a
survivor customer via `customer_persons`, 0 via `customer_members`, 0 via `contacts`, and 5 carry no
reference at all. Emails are fixtures (`ic55-…`, `ic56-lead-proof-…`, `lifecycle-coherence-…`).

**Persons and users are disjoint in this schema.** `user_roles` is `(user_id, role, org_id)` and
`user_access_profiles` is `(user_id, org_id, department_scope, site_scope)`. Neither carries a
`person_id`. `user_profiles` is empty. **No access table can be orphaned by deleting a person.**
This is the single most important safety fact in the contract, and it is a schema property, not an
observation about current rows.

**Processing — 61 cases, all `retention_class = uncommitted_submission`.**
**Zero** have `primary_opportunity_id`. **Zero** have `primary_customer_id`. All 61 are unanchored,
so the opportunity graph can never reach them. Dependents: `processing_case_sources` 58,
`processing_facts` 40, `processing_resolutions` 24, `processing_commit_plans` 5,
`processing_plan_operations` 38, `processing_commit_attempts` 5, `processing_approvals` 5,
`processing_exceptions` 0.

**Documents — 73.** 20 are `entity_type = person` / `doc_type = profile_photo` on deletable persons
(already covered). 53 have `entity_type = NULL` and are attached to nothing.

**Workflow events — 440.** 23 on selected opportunities. The remaining 417 include
`program` 20 and `gl_accounts` 10 — **configuration subjects, not operational ones.**

---

## 3. Answers to the required design questions

1. **What makes a customer operational rather than configuration?**
   Nothing in `customers` is configuration. The table holds households/accounts. Configuration lives
   in `departments`, `locations`, `work_units`, definitions and layouts. A customer is operational by
   table identity; the only question is whether it is *protected by reference*.

2. **What makes a person operational rather than a user/access identity?**
   `is_employee = true` marks staff. Access identities do not live in `persons` at all — they are
   auth users joined through `user_roles` / `user_access_profiles`, neither of which references
   `persons`. So a person is operational unless `is_employee` is true or a protected record
   references it.

3. **Which relationships make an identity shared and therefore preserved?**
   Reference from any opportunity outside the target set; from a customer outside the target set
   (via `customer_persons` or `customer_members`); from `contacts` tied to a preserved customer; or
   from a golden-path–protected record. These are the existing shared-reference rules, reused
   verbatim over the wider candidate set.

4. **How do Processing cases relate to the rest?**
   Through `primary_customer_id` / `primary_opportunity_id` when set — and on this tenant they are
   never set. Dependents hang off `case_id` (`case_sources`, `facts`, `resolutions`,
   `commit_plans`, `commit_attempts`, `approvals`, `exceptions`) and `plan_id`
   (`plan_operations` → `commit_plans`). Processing is therefore its **own anchor**, not a
   dependent of the opportunity graph.

5. **Which documents and workflow events belong to subjects with no opportunity?**
   Documents by `(entity_type, entity_id)` against selected persons/customers/opportunities;
   workflow events the same way. Documents with `entity_type = NULL` belong to no subject.

6. **Which records are projections/history that disappear with the subject?**
   Workflow events, communications, tasks, field values and documents keyed to a deleted subject.

7. **Which identities are intentionally standalone and must survive?**
   Employees, anything referenced by a preserved record, and every configuration row. On this tenant
   that set is currently empty for persons and customers — which is why the contract must fail
   closed rather than assume it always will be.

8. **Can the scope be derived deterministically without org-wide deletion?**
   Yes. Every deletion is rooted in one of three declared anchors and traversed by foreign key. No
   rule is "delete where `org_id = Firefly`."

---

## 4. The contract

### 4.1 Anchors

| # | Anchor | Selects |
|---|---|---|
| A1 | Opportunity graph (existing) | open, or open+closed with `--include-closed-opportunities` |
| A2 | **Unlinked operational identity graph** | customers in org referenced by no *preserved* opportunity, plus persons/members reachable from them |
| A3 | **Processing operational graph** | `processing_cases` in org not anchored to a preserved opportunity/customer, plus their `case_id`/`plan_id` dependents |

A2 and A3 activate **only** under certification mode. A1 is unchanged.

### 4.2 Protected — never selected, at any breadth

Organization, locations and hierarchy, departments, work_units, users, auth identities, roles,
permission grants, access profiles, business process definitions/drafts/revisions/publications,
Work Views, stages, Work Templates, outcomes and rules, transitions, action definitions and
placements, fields, option sets, layouts, surfaces, forms and reusable templates, schedule patterns,
program categories, provider configuration, `lifecycle_builder_v1` and platform configuration.

`work_units` and `departments` remain hard-zero in reset mode. Locations remain report-only.

### 4.3 Protected identity rules (fail closed)

A person is **protected** when any holds:
- `is_employee = true`
- referenced by an opportunity outside the target set
- linked to a customer outside the target set
- referenced by `contacts` belonging to a preserved customer
- referenced by a golden-path–protected record

A customer is **protected** when referenced by an opportunity outside the target set, or
golden-path protected.

### 4.4 Classification and the ambiguity rule

Under certification mode every operational customer and person resolves to exactly one class:

- **target** — reachable from an active anchor and not protected
- **protected** — matches 4.3, with the specific reason recorded
- **ambiguous** — neither reachable nor protected

**Ambiguity fails closed.** A run reporting any ambiguous identity refuses rather than deleting it
or silently leaving it. Ambiguity is a signal the contract has met a shape it does not model, and
that must be a human decision, not a default.

*Unreferenced* is not ambiguous: a person or customer that nothing references, in an org where the
identity population is operational, is a **target** and is reported under its own class so the
breadth is visible. On this tenant that is 5 persons.

### 4.5 Traversal and ordering

Deletion order extends the existing FK-safe order. Processing dependents precede
`processing_cases`; `processing_plan_operations` precedes `processing_commit_plans`. Identity rows
(`customers`, `persons`) stay last before the configuration tail, unchanged.

### 4.6 Verification — beyond the four-table assertion

Certification mode asserts **product-facing operational emptiness**: opportunities, operational
customers, persons, participation, processing cases and every processing dependent, operational
work and tasks, tour bookings, waitlist/placement, communications, operational documents, form and
packet instances, and operational workflow history — each zero **or** matching an explicitly
declared expected set.

And **protected preservation**: organization, locations, users, access, publication identity,
`lifecycle_builder_v1` checksum, Work Templates/outcomes/rules, actions, fields/layouts/surfaces.

Where a platform bootstrap row legitimately survives, verification asserts the **declared expected
set**, never "some rows remain, that's fine."

### 4.7 Failure conditions

The run fails — before any delete in execute mode — when: any ambiguous identity exists; any
protected record appears in the delete set; any row outside the target org appears; the identity
gate fails; or, post-execute, operational survivors remain outside the declared expected set.

### 4.8 Expected survivors on hosted Firefly

Zero operational rows. Configuration exactly as in the preservation snapshot. Locations 21
(protected, report-only). `configuration_publications` 9 — all `domain_key = programs`, untouched.

### 4.9 Rerun behaviour

A second run against a completed baseline proposes **zero** deletions. This is the idempotence
assertion and the cheapest possible regression test after execution.

---

## 4bis. What A2 + A3 achieved, and the 74 rows they do not reach

Hosted dry run, `--certification-baseline`, 2026-08-03. Anchors A2 and A3 close the identity and
Processing gaps **completely**:

| | before | deleted | survives |
|---|---:|---:|---:|
| opportunities | 8 | 8 | **0** |
| customers | 59 | 59 | **0** |
| persons | 53 | 53 | **0** |
| customer_persons | 40 | 40 | **0** |
| customer_members | 20 | 20 | **0** |
| processing_* (9 tables) | 236 | 236 | **0** |
| process_instances / tour_bookings / opportunity_persons | 21 | 21 | **0** |

**74 rows still survive**, and they share one shape — *no subject, or a subject that is not an
identity*:

| table | survives | why unreachable |
|---|---:|---|
| documents | 53 | `entity_type` **and** `entity_id` are both NULL — attached to nothing |
| communication_messages | 6 | belong to the 5 threads below |
| communication_threads | 5 | 2 on `persons`, 2 `staging_live_validation`, 1 `communications_unknown`; thread selection only follows `primary_entity_type = "opportunities"` |
| contacts | 5 | `customer_id` **and** `person_id` both NULL, no vendor |
| form_submissions | 3 | 2 attached to nothing, 1 to a non-selected subject |
| form_packet_sessions | 1 | no selected parent |
| operational_tasks | 1 | `entity_type` NULL |

Separately, `workflow_events` is 440, of which **30 are configuration subjects** (`program` 20,
`gl_accounts` 10) — history about configuration, not about an operational subject. It is
deliberately absent from the §4.6 emptiness list for that reason, and that exclusion needs an
explicit decision rather than an omission.

**This defines anchor A4 precisely: subjectless operational rows** — org-scoped operational records
whose subject reference is NULL, or points at an entity type outside the identity model. Plus one
narrow fix: thread selection should follow deleted *persons*, not only opportunities.

A4 is deliberately NOT implemented here. It is a fourth anchor with its own protection question
("is a subjectless row ever legitimate?"), and inventing it at the end of this slice would put an
unproven rule in front of a destructive run. The evidence above is what the next slice needs.

---

## 4ter. A3 extension, subject fixes, and A4 — the last 74 rows

Re-classified on hosted, read-only, 2026-08-03. **The headline finding inverts the previous
conclusion: most of the residue is not subjectless.**

### The 53 "subjectless" documents are Processing source artifacts

All 53 share one shape: `doc_type` NULL, `template_key` NULL, `status = uploaded`,
`bucket = org_documents`, a real `storage_path`, no `owner_contact_id`, no
`generated_from_document_id`, and metadata `import_purpose = generate_form`. None is referenced by
`form_submission_documents`, `document_versions`, or `document_field_values`.

**51 of them are referenced by `processing_case_sources.source_id` with `source_kind = document`.**
Their subject is the Processing case, reached through the source join — not `entity_id`. Deleting a
case while leaving its source document behind is what produced this residue.

`processing_case_sources` by kind: `document` 51, `create_lead` 7, `form_submission` 1,
`form_packet_session` 1.

**This is an A3 extension, not a new anchor.** A3 must traverse `processing_case_sources` outward to
the artifacts a case was built from.

### Communication threads — canonical subjects, and two synthetic ones

| subject | count | classification |
|---|---:|---|
| `persons/1624a9ea…` | 2 (email + sms) | **DELETE** — follows the deleted person. This is the known bug. |
| `opportunities/c78a8e14…` | 1 | already followed by A1 |
| `staging_live_validation/b0000001…`, `b0000002…` | 2 | **DELETE** — synthetic validation subjects with fabricated UUIDs (`b0000001-0000-…`), fixture metadata `wi3-slice6-comms-needs-reply-fixture_active`. Not reusable infrastructure: they are per-run QA artifacts. |
| `communications_unknown/1ed43773…` | 1 | **DELETE** — metadata `{"anchor":"surrogate_phone","customer_id":"06d52eeb…"}`; weakly subjected to a customer A2 removes. |

Thread selection currently follows only `primary_entity_type = "opportunities"`. It must follow the
canonical subject types — `opportunities`, `persons`, `customers` — against the already-resolved
deletion sets, and classify anything else explicitly rather than ignoring it.

Messages follow selected threads (6 rows across these threads).

### Contacts — 5, orphan compatibility rows

All five have `customer_id`, `person_id` and `vendor_id` NULL, no `contact_type`, no `source`, and
**zero** are referenced as a document `owner_contact_id`. Names/emails are test artifacts
(`Address: 123 main street`, `peyton@gmail.com`). `persons` is canonical identity here; `contacts`
is compatibility infrastructure. **DELETE** when no protected reference exists.

### Forms and packets

`form_submissions` 3: two have every subject FK NULL (public-link only); one carries
`customer_id = 7a426ef6…` **which is an org customer A2 already deletes** — it survives only
because submission selection follows `opportunity_id` alone. `form_packet_sessions` 1 shares the
public link of the third submission, `status = completed`, with 1 `form_packet_session_items` row.

Submission selection must follow `customer_id`, `person_id` and `customer_member_id` as well as
`opportunity_id`. **`form_definitions` (34) are configuration and must survive** — as must packet
definitions and public-link definitions.

### Operational task — 1

"Call the Kurzman family tomorrow morning", `entity_type` NULL, `source = manual`, assigned to a
user, `status = open`. It can still surface in Work Items with no subject behind it. **DELETE.**

### Workflow events — explicit classification

442 rows, **zero with a NULL `entity_id`**.

**PRESERVE (configuration history, 30):** `program` 20 (`configuration.program.published`,
`…modified`) and `gl_accounts` 10 (`gl_account_created`). These record changes to configuration that
survives the reset; deleting them would falsify the configuration's own audit trail. They are
therefore **excluded from the operational-zero assertion by an explicit rule**, and verification
asserts the *exact expected set*, not `count > 0`.

**DELETE (operational subjects):** `form_submissions` 167, `documents` 121, `opportunities` 41,
`persons` 15, `child_placements` 14, `tour_bookings` 12, `schedule_assignments` 10,
`customer_members` 7, `child_enrollment_agreements` 7, `child` 6, `form_packet_sessions` 4,
`opportunity` 2, `opportunity_customer_members` 1, `communications_unknown` 1 — each following its
deleted subject.

**DELETE (synthetic validation subjects, 4):** `staging_resend_smoke` 2, `staging_live_validation` 2
— same class as the threads above.

### A4 proper — what is genuinely subjectless

After the A3 extension and the subject fixes, A4 covers only rows with **no subject at all**:
2 documents referenced by no Processing case, 2 form submissions with every FK NULL, 5 contacts,
1 task. A4 is table-aware — an explicit allowlist of operational-instance tables with a stated
"what NULL means" per table — never "delete the rest of this table".

### Storage objects

All 53 documents carry a `storage_path` in bucket `org_documents`, which exists and is reachable.
Deleting the rows alone orphans the objects. Certification mode therefore removes the storage object
for each selected document and **reports object counts separately from row counts**, because a
divergence between them is itself a defect. Storage deletion is best-effort per object and a failure
is reported, never silently swallowed.

### Fail-closed

Any thread subject type outside the canonical set and outside the explicitly classified synthetic
set; any operational row in an A4 table with a subject reference the contract does not model; any
workflow-event subject type in neither the preserve list nor the operational list. All abort the
run before deletion.

---

## 4quater. EXECUTION ATTEMPT 2026-08-04 — HALTED. Tenant is partially reset.

Authorized and executed against `ikaxilmwmrmbagoidedu` / `93667019-…`. Every pre-flight gate
passed: branch on staging `e6ff28cf8`, all six slots' servers stopped, zero compute permits held,
no stacks or leases, no test/migration processes, tenant **stable over 45s across 25 tables**, and
the pre-execute dry run **byte-identical** to the authorization-ready report with 0 unexplained
survivors.

The run then failed mid-deletion:

```text
[processing_plan_operations delete plan_id]
processing_plan_operations rows are immutable; build a new plan version instead
```

### Root cause — an architectural contradiction, not a bug in the reset

`supabase/migrations/20260717125500_processing_identity_d1_plan_operations_guard.sql` installs
`trg_processing_plan_operations_immutable`, a `BEFORE UPDATE OR DELETE ... FOR EACH ROW` trigger
that raises **unconditionally**. `processing_plan_operations` is an append-only ledger by design;
no client can delete a row through the sanctioned path.

The certification contract requires Processing dependents to reach zero (§4.6). The database
guarantees they never can. **Both are deliberate and they are incompatible.** This is not something
the reset utility can decide.

### Exact state after the halt

Deleted (verified by direct count, tenant stable):

| table | before | after |
|---|---:|---:|
| documents | 73 | **0** |
| communication_threads | 6 | **0** |
| communication_messages | 7 | **0** |
| form_submissions | 3 | **0** |
| form_packet_sessions | 1 | **0** |
| tour_bookings | 2 | **0** |
| opportunity_persons | 6 | **0** |
| operational_tasks | 7 | **1** |
| workflow_events | 443 | **419** |

Untouched — the deletion order never reached them:

opportunities 8 · customers 59 · persons 53 · customer_persons 41 · customer_members 20 ·
contacts 5 · process_instances 13 · and every `processing_*` table at its original count
(cases 63, sources 60, facts 52, resolutions 32, plans 5, plan_operations 38, attempts 5,
approvals 5).

**Configuration is fully intact.** Config table counts identical before and after;
`lifecycle_builder_v1` sha256 `4609859e…dd8dd4` unchanged; publications 9; the one
`business_process_drafts` row present beforehand survives.

### Known residue created by the halt

**73 orphaned storage objects** under `org_documents/93667019-…`. The document ROWS were deleted in
the main sweep; storage cleanup lives in the A4 block, which sits after the failure point and never
ran. They are deliberately **left in place** as evidence rather than cleaned up — the failure
protocol is to preserve, and those objects are now the only record of what those documents were.

### The decision this needs

Three options, and the choice is a platform decision, not a utility change:

1. **Preserve Processing plan operations** — accept that a case's plan ledger outlives the case, and
   carve an explicit exception into §4.6 with a stated reason. Cheapest; leaves a permanent
   operational remnant that the "all operational state" invariant would have to acknowledge.
2. **Give the guard a sanctioned reset exemption** — e.g. honour a session-scoped GUC the way the
   lifecycle guard token works, so only the certified reset may delete. Preserves the ledger
   guarantee for application code and makes the baseline reachable.
3. **Delete the parent and let the ledger cascade** — only viable if the FK is `ON DELETE CASCADE`
   and the trigger does not fire for cascades. Needs verification before it is a real option.

Until one is chosen, the certification baseline is **not establishable** and the tenant should be
treated as mid-reset, not as a baseline.

---

## 4quinquies. RECOVERY EXECUTION ATTEMPT 2026-08-04 — refused cleanly. Nothing changed.

Every pre-execute gate passed: HEAD `5b3ac27db`, staging `e6ff28cf8` unchanged and 0 behind, tree
clean and pushed, all six slots stopped, zero compute permits, no stacks or leases, no servers or
runners, tenant **stable across two 45-second intervals**, configuration baseline matching
(`lifecycle_builder_v1` `4609859e…dd8dd4`, program 20, gl_accounts 10), manifest valid at 73 objects
`b891466617…`, zero unexplained survivors, and the plan identity recomputed **identical** to the
authorized `aa82e0e4…b022`.

The run then refused:

```text
certification_reset_execute FAILED — database rolled back, zero rows deleted,
zero storage objects touched: Could not find the function
public.certification_reset_execute(p_actor, p_graph, p_org_id, p_purpose)
in the schema cache
```

### Root cause

`supabase/migrations/20260804090000_certification_reset_authority.sql` exists on this branch and has
been applied to the **isolated certification stack**, where it was certified 16/16. It has never
been applied to **hosted Firefly**, and it is not on `origin/staging`. The reset authority the
execution depends on does not exist in the target database.

### The design held

This is the failure mode the whole recovery slice was built for, and it behaved exactly as
specified: the adapter treated the RPC error as total failure, storage was never reached, and the
run exited non-zero without verification.

Verified after the attempt — the tenant is **byte-identical** to its pre-execute state:
opportunities 8, customers 59, persons 53, customer_persons 41, customer_members 20, contacts 5,
operational_tasks 1, process_instances 13, workflow_events 419, every `processing_*` table
unchanged, and all **73 storage objects still present**. Zero rows deleted. Zero objects deleted.

Contrast with the first execution attempt, which deleted 9 tables' worth of leaves before failing.
The difference is atomicity plus ordering, and this is the evidence that both work.

### What this now needs — a decision, not a retry

Applying the migration to hosted Firefly is **not** part of "execute the reset". It would:

- run DDL against shared hosted infrastructure
- from a branch that is not on staging
- creating a permanent `SECURITY DEFINER` function
- and **replacing three production immutability guard functions** on the hosted database

That is a schema promotion with a platform-safety dimension, and it belongs in the managed
promotion workflow rather than in a reset run. The options:

1. **Promote the branch** (PR → staging → hosted migration) and then re-run the recovery with a
   freshly recomputed plan identity. Slowest, most orthodox, leaves the authority on staging where
   it can be reviewed.
2. **Apply this single migration to hosted Firefly only**, as a governed non-production schema
   change, keeping the branch unmerged. Faster; puts schema on hosted that is not on staging, which
   is its own kind of drift.
3. Reconsider whether the hosted tenant needs the authority at all — it does, because the three
   append-only Processing tables cannot otherwise reach zero.

Until one is chosen and executed, hosted recovery cannot proceed. The plan identity
`aa82e0e4…b022` remains valid only while the tenant is unchanged; any schema or data movement
requires a fresh dry run and renewed authorization.

---

## 4sexies. EXECUTED 2026-08-04 — baseline established, with one preservation defect

Plan identity `30190d071e…` verified, atomic RPC committed **849 rows**, database verified, then
storage removed **73/73** with 0 failures. `baselineEstablished: true`.

**Operational: 26/26 certification tables at ZERO.** Storage: 0 objects remain under the org prefix.
Audit event `certification.reset.executed` written. Second dry run proposes **0 database rows and
0 storage objects**; zero-state identity `f585538e7364ec75b6fc3911d11633f104de70a063b470738d99c911635bf8e7`.

Preserved: `lifecycle_builder_v1` `4609859e…dd8dd4` unchanged · departments 5 · work_units 9 ·
entity_layouts 265 · form_definitions 34 · business_process_drafts 1 · publications 9 ·
field_definitions 202 · action_placements 158 · protected events 20 `program` + 10 `gl_accounts`
(+1 reset audit).

### THE DEFECT — locations 21 → 20

`locations.customer_id → customers(id)` is **ON DELETE CASCADE**. One location referenced a deleted
customer and Postgres removed it. Configuration preservation required 21.

The guard inventory checked **RESTRICT** foreign keys — the ones that would *block* a delete — and
never enumerated **CASCADE** foreign keys, the ones that silently propagate one. A blocking FK
announces itself by failing; a cascading FK does not. `locations` is the only configuration table
reachable this way; every other cascade target was already inside the deletion contract.

The verification did not catch it either: the config check asserts a table did not lose *all* rows,
so 21→20 read as "OK".

**Owed:** enumerate CASCADE FKs from every deletion anchor to any preserved table, add them to the
preflight, and change the config assertion from "not empty" to "exact expected count". The lost
location's identity is not recoverable from this side — it went with the cascade.

---

## 5. Interface

```text
default                          → open opportunity graphs                    (unchanged)
--include-closed-opportunities   → + closed opportunity graphs                (unchanged)
--certification-baseline         → + A2 unlinked operational identities
                                   + A3 processing operational graphs
                                   + extended verification (4.6)
                                   implies --include-closed-opportunities
```

Composition, not a fork: certification mode adds anchors to the same resolver and the same delete
order. Dry-run stays the default, and execute still requires
`CONFIRM_RESET_OPERATIONAL_STATE=true`.
