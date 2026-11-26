---
owner: runtime
status: proposed
last_reviewed: 2026-11-25
supersedes: []
status_note: Evidence record for objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 — not doctrine.
---

# Environments and promotion — P3 staging configuration and test-data classification (2026-11-25)

Objective: Environments and promotion (`WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66`), slice P3. Builds on
[P1](environments-p1-production-census-2026-11-25.md) and [P2](environments-p2-production-snapshot-restore-2026-11-25.md).

**This is a decision list for the owner, not a migration.** It sorts what staging holds into product configuration
the rebuild should keep and synthetic or test data it should leave behind. It names the source, record type, count
and reason for each item, and marks every uncertain one. **No data was copied, exported or modified.** No database,
credential or live service was used. Every count below comes from census results, documents or code already committed
to this repository, with the date it was taken. **P4 has not started.** It waits for the owner to confirm this list.

## How to read this

| Class | Meaning for the rebuild |
|---|---|
| **KEEP-CODE** | Keep. It already lives in migrations or code, so the rebuild gets it by applying the migration chain and deploying. No rows have to move. |
| **KEEP-CONFIG** | Keep. It is org-authored configuration that exists only as rows. The rebuild must re-author or re-publish it from a reviewed source (see Decision R1). It is never a raw row copy. |
| **LEAVE** | Synthetic, QA, certification or demo data. Do not carry it into the rebuild. |
| **OWNER** | The evidence does not settle it. The owner decides. A recommendation is given. |
| **BLOCKED** | It cannot be classified until access exists: **P2_DATA** (production data snapshot), **P1S** (Vercel/Render/Supabase settings), or **STG-CENSUS** (a fresh read-only staging census the owner runs). |

"Keep" never means "copy rows now". It means the rebuild must end up with this configuration. How it gets there is
P4's job, after this list is confirmed.

## Evidence sources (all in-repo, read only)

| # | Source | Target and date | What it gives |
|---|---|---|---|
| S1 | `certification/business-processes-v2/slice1a/s1a-tenant-identity-census.sql.results.json` (+ `.sql`, `evidence-tenant-identity.gar_07fa9669657b3b.txt`) | hosted staging `alloy_deployed_primary` (= `ikaxilmwmrmbagoidedu`), 2026-10-20 | every org, with counts of departments, roles, cases, households and org locations; QA machine identities and their roles |
| S2 | `certification/business-processes-v2/d2d5/enrollment-decision-config-census.sql.results.json` | hosted staging, 2026-10-23 | Firefly's published Enrollment process: department `lead_management`, 7 stages |
| S3 | `certification/financials/w7-config/billing-config-org-census.sql.results.json` | hosted staging, 2026-10-09 | per-org charges, financial policies, charge templates, accounting calendars, sites |
| S4 | `certification/financials/periodic-billing/02-org-billing-readiness-census.sql.results.json` | hosted staging, 2026-09-22 | per-org readiness counts; charge-template keys |
| S5 | `certification/locations/legacy-capacity-convergence-census.sql.results.json` | hosted staging, 2026-09-19 | locations: 3 sites, 17 rooms, 20 total |
| S6 | `certification/financials/11a-fx/catalog.json`, `plans.json` | hosted Firefly via the app API, committed 2026-09-18 | program keys, fee products, rate count, plans |
| S7 | `certification/documents-v1/d0-storage-census.sql.results.json`, `d0-volume-census.sql.results.json` | hosted staging, 2026-10-20 | documents and storage volume; migration ledger head |
| S8 | `certification/business-processes-v2/slice8a/bp-quiesced-retained-census.v2.sql.results.json` | hosted staging, 2026-10-22 | ZZ Alloy QA tenant present, quiesced; what it retains by design |
| S9 | `certification/migrations/configuration-ops-org-context-census.sql.results.json` | hosted staging, 2026-09-14 | role definitions per org, `orgs_total = 3` |
| S10 | [`firefly-staging-qa-profile.md`](../governance/firefly-staging-qa-profile.md) §6.1 | hosted staging, owner-run step 1 census, 2026-11-25 (raw output owner-held) | Firefly sites and program keys; the `enrollment`-keyed department has no process; 6 managed QA identities hold Firefly roles |
| S11 | [`firefly-staging-seed.md`](../governance/firefly-staging-seed.md), `web/lib/staging/fireflyStagingSeed/dataset.ts` | repo | synthetic seed design; named QA debris on the tenant |
| S12 | [`demo-runtime-cleanup-workflow.md`](../governance/demo-runtime-cleanup-workflow.md), `web/scripts/lib/demoRuntimeCleanupScope.ts` | repo | demo and golden-path markers; "protected infrastructure" list |
| S13 | `web/lib/qa/sharedQaRegistry.ts` | repo | ZZ Alloy QA org, site and identity ids |
| S14 | `certification/**/hosted-qar_*`, `*_hosted_fixture_ids.qar_*.json` | hosted QA runs, Oct–Nov 2026 | fixture manifests and results: 31 distinct `qar_` run ids |
| S15 | `docs/platform/planning/conversation-platform-v1/PHASE-0-LIVE-VERIFICATION.md` | hosted staging, 2026-09-29 | "before real families are loaded"; 6 outbound messages in the tenant's whole life |
| S16 | `supabase/migrations/*`, `web/lib/businessProcessTemplates/*` | repo | which configuration is provisioned by migration or code |
| S17 | `data.sql`, `data_public.sql`, `prod_baseline.sql` (repo root) | committed 2026-03-23 / 2026-03-28, source database unrecorded | older-schema dumps. Only table names and row counts per `COPY` block were read, never row content |
| S18 | P1 and P2 records | production `vslwnntzzgpnmrpjipat`, 2026-11-25 | production holds 1 org row (content unreadable), an older 134-table schema, and the RLS and platform blockers |

**Freshness.** The newest broad staging census is from 2026-10-20 (S1, S7). The only later one is the owner's
2026-11-25 step 1 (S10), which covers Firefly's lifecycle, sites and programs only. **Counts can have moved since
then**, because QA runs kept writing to staging in late October and November (S14). Every count below is "as observed
on that date", not "now". A single fresh, read-only, configuration-only census (STG-CENSUS, Decision R3) would bring
them all up to date.

## Staging at a glance (S1, 2026-10-20, plus S8 and S10)

| Org | id | Status | Departments (builder) | User roles | Cases | Households | Org locations | Class |
|---|---|---|---|---|---|---|---|---|
| Firefly Early Learning (slug `demo-childcare-co-c144769f`) | `93667019-…0a19` | active | 5 (1) | 13 | 67 | 74 | 37 | configuration → C-items; records → L-items |
| Alloy Bend | `7803388d-…f423` | retired | 0 (0) | 2 | 0 | 0 | 0 | **LEAVE** (L7) |
| W-17 self-test (slug `_w17_selftest_0bbaad43`) | `0bbaad43-…950a` | active | 0 (0) | 0 | 0 | 0 | 0 | **LEAVE** (L6) |
| ZZ Alloy QA (`qa_shared`) | `4acc9386-…d142` | present 2026-10-22 (S8), after S1 | — | — | — | — | — | **LEAVE** (L5) |
| ZZ Alloy QA — Cross-Org | `ad53fee2-…73b6` (S13) | pinned in code; hosted presence not in a committed census | — | — | — | — | — | **LEAVE** (L5) |

Migration ledger head on staging: `20261129090000`, 533 rows (S7, 2026-10-20). Production is on an older, 134-table
schema (S18). The two are not the same schema generation.

## Decision list

### R. Rules that frame every item (owner confirms these first)

| ID | Decision | Recommendation | Why |
|---|---|---|---|
| **R1** | The source for KEEP-CONFIG items | **Re-author or re-publish through the app's own write paths** (publish RPC, work-unit repair, catalog publish), from a reviewed configuration-only listing. **Not** a row dump or a `pg_dump` of tenant tables. | Raw rows carry tenant ids, revision history and QA residue, and they bypass publish guards (e.g. `trg_departments_lifecycle_projection_guard`). The repo's only Firefly configuration capture is defective (C14). |
| **R2** | What "the rebuild" starts from | The **staging migration chain** (head `20261129090000` or later) plus code templates, **not** the P2 production snapshot | Production's schema is a generation behind (S18). The P2 snapshot is for recovering production, not a design source. |
| **R3** | Refresh the counts before P4 | The owner runs one read-only, configuration-only staging census covering the C-items (keys, labels, active flags and counts only; no names, contacts or amounts). `supabase/seed/firefly_staging_department_census.sql` already covers C1–C3. The rest needs a new census written in P4. | Most counts here are 5–10 weeks old (Freshness). |
| **R4** | How test data is recognised | By **markers** (table T below), never by guessing from names | Markers are deterministic and already used by the cleanup and seed tooling (S11, S12). |

### K. Platform configuration that comes with the code (KEEP-CODE)

These need no data decision. They are listed so the owner can see that they are covered.

**Corrected by P4** ([F4](environments-p4-rebuild-and-integration-rehearsal-2026-11-25.md#findings)): `permission_keys` and `permissions` no longer exist, and K4 `metric_placements`, K6 global `entity_layouts` and K7 `customer_person_role_types` are per-org backfills that write nothing on a fresh database. For a rebuilt tenant those three are KEEP-CONFIG.

| ID | Record types | Provisioned by (S16) | Class |
|---|---|---|---|
| K1 | Permission catalog: `permission_definitions`, `permission_keys`, `permissions` | migrations (e.g. `20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql`) | KEEP-CODE |
| K2 | System role definitions per org (4 system roles) | DB function `seed_default_role_definitions(p_org_id)` (`20260729120000_…`; backfill `20260505153000_backfill_default_role_definitions.sql`) | KEEP-CODE |
| K3 | Action registry: `action_definitions`, `action_placements` | migrations (`20260427180000_…`, `20260430215000_…`, `20260430220000_…`) | KEEP-CODE |
| K4 | Metric catalog: `metric_definitions`, `metric_placements`, `metric_visualizations` | migrations (`20260624120100_…`, `20260707120100_…`) | KEEP-CODE |
| K5 | Global status defaults in `status_definitions`, plus the legacy status tables | migrations (e.g. `20260421120000_…`, `20260422100000_…`) | KEEP-CODE |
| K6 | `industry_default_entity_labels`, global system entity layouts (`entity_layouts.org_id IS NULL`), seeded `record_layouts` | migrations (`20260430211000_childcare_mvp_control_plane_seed.sql`, `20260409140000_…`) | KEEP-CODE |
| K7 | Household role vocabulary defaults (`customer_person_role_types`) | migrations (`20260403101000_…`, `20260430103000_…`) | KEEP-CODE |
| K8 | **The platform Enrollment business-process template**, its default tracks and queue-membership defaults | code: `web/lib/businessProcessTemplates/enrollmentProcessTemplate.ts` (`buildEnrollmentTemplateStageRecords`, `ENROLLMENT_DEFAULT_TRACKS`), `processTrackTemplates.ts`, `enrollmentQueueMembershipDefaults.ts`; `web/lib/lifecycle/defaultEnrollmentBusinessProcessV1Stages.ts` | KEEP-CODE |
| K9 | Synthetic seed *definitions* (code, not rows): Firefly staging seed, local representative seed | `web/lib/staging/fireflyStagingSeed/`, `supabase/seed/*.sql` | KEEP-CODE. These are tools that regenerate test data on demand. They are not data to carry. |

**Watch item (uncertain):** `20260506120000_forms_medication_authorization_demo_seed.sql` and two cleaning-org
migrations (`20260408180000_…`, `20260409090000_…`) insert demo or org-specific rows. On a fresh database they write
rows that belong to no rebuilt tenant. The owner should decide whether the rebuild keeps them (they are harmless if
their org is absent) or neutralises them in P4. **OWNER — recommendation: leave the migrations untouched and do not
re-create the orgs they target.**

### C. Firefly's org-authored configuration on staging

Firefly is the only staging school and the only tenant with real configuration. Every item here is row-only
configuration, so it falls under R1.

| ID | Record types | Count / shape (source, date) | Class | Rationale | Uncertainty / dependency |
|---|---|---|---|---|---|
| **C1** | Lifecycle department `lead_management` (id last seen `3933ac47-…0413`), `departments.metadata.lifecycle_builder_v1`, published process `enrollment` (`business_process_revisions`), its `work_views_v1` | 1 department, 1 builder department; 7 stages `lead, tour, decision, waitlist, offered, enrolling, enrolled` (S2, 2026-10-23); published revision 12 as of 2026-08-13 (`docs/product/records-roster-completion/firefly-enrollment-qa-configuration-proposal.md`) | **KEEP-CONFIG**, then OWNER on the source (C1a) | This is the tenant's business process and lifecycle setup, the main product configuration on staging. Five Firefly migrations already UPDATE this department by id. | Last observed 2026-10-23. **C1a (OWNER):** rebuild from Firefly's published revision (its tuned outcomes, work templates and views) or from the platform template K8? **Recommendation:** export Firefly's *current* published revision as a reviewed configuration-only document (R1/R3) and diff it against K8. Keep Firefly's version only where the diff is intentional. |
| **C2** | Lifecycle work units `lifecycle_wu_<stage>` × 7 (`work_units`, queue definitions) | **Never observed on hosted staging.** S2 read stages, not work units (QA profile §6.5) | **KEEP-CONFIG**, BLOCKED (STG-CENSUS) | The lanes operators work from. | If any are missing, they come from the app's work-unit repair, not from data. The owner-run census in QA profile §6.5 answers this. |
| **C3** | Department keyed `enrollment` with no active process | 1 (S10, 2026-11-25); origin not in the repo | **OWNER**. Recommendation: **LEAVE** | It has no process, nothing binds to it, and the seed and census explicitly never bind to it. | It may hold work units or views someone uses. The department census (`firefly_staging_department_census.sql`) settles this. |
| **C4** | The other Firefly departments | 5 departments in total (S1). 3 besides C1 and C3 are unidentified | **BLOCKED** (STG-CENSUS) | It is unknown whether they hold real configuration (other operational areas) or test structure. | Same department census. |
| **C5** | Sites and rooms (`locations`: `site`, `unit` with capacity, ratio and age group in `metadata`) | 3 sites North/South/West Campus and 17 rooms, 20 locations (S5, 2026-09-19); **37 org locations by 2026-10-20** (S1) | **KEEP-CONFIG** for the 3 sites and 17 rooms. **OWNER** for the 17 added later | The physical structure of the school. | The jump from 20 to 37 in a month coincides with hosted QA runs that create rooms (S14 `slice8b2` manifest creates a `room`). The extra 17 are most likely QA rooms, but that is **unverified**. STG-CENSUS should list locations with their creation run marker. |
| **C6** | Program categories (`location_program_categories`, `programs`) | Keys `infant, toddler, preschool, pre_k, kindergarten, school_age` (S6). Hosted step 1: 14 of 16 keys present at the bound sites, North `kindergarten`/`school_age` WARN (S10) | **KEEP-CONFIG** | The school's program structure. | The two North WARNs read in opposite directions in the owner's report (QA profile §6.1 note 1). The owner-held `tenant_keys_at_north` row settles which. |
| **C7** | Program key `stage4_ok3_w9k7sx` (3 category rows) | S6 | **LEAVE** | QA debris from a certification run, named as such in `dataset.ts:17`. | — |
| **C8** | Catalog and rates: `program_offerings`, variants, `commercial_tuition_rates`, `commercial_products` | 4 fee products (Activity Fee, Annual Supply Fee, Enrollment Fee, Registration Fee), 36 rates, 7 plans (S6, 2026-09-18) | **OWNER**. Recommendation: **KEEP-CONFIG** for the org-default rate card | It looks like Firefly's rate card, and the seed mirrors it. | Whether these are Firefly's *real* prices or demo numbers is not recorded. It is a commercial fact only the owner knows. |
| **C9** | North-site rate overrides | count not recorded (S11) | **LEAVE** | Named QA debris (`dataset.ts:17`). | Count and ids need STG-CENSUS. |
| **C10** | Charge templates (`financial_charge_templates`) | 5 keys `registration_fee, late_pickup_fee, materials_fee, field_trip, tuition` (S4, 2026-09-22); **8 by 2026-10-09** (S3 `o3`), the 5 plus `enrollment_fee_waived` ("Enrollment fee (waived)", inactive), `cert_household_fee` ("Certification household fee", inactive) and `waived_fee_1790630157816` ("Enrollment fee (waived)", active) | **KEEP-CONFIG** for the 5 named keys. **LEAVE** for `cert_household_fee` and `waived_fee_1790630157816`. **OWNER** for `enrollment_fee_waived`. Recommendation: **LEAVE** | The 5 keys are billing configuration. `cert_household_fee` carries the `cert_` prefix and a "Certification" label. `waived_fee_1790630157816` carries an epoch-ms suffix (2026-09-28), a run-unique key of the kind test code generates. Being active does not make it configuration. | `enrollment_fee_waived` has no marker, but it is inactive and shares its label with the timestamped key, so it most likely came from the same waiver testing. If Firefly needs a waived-fee template, the rebuild authors it fresh (owner decision 5). |
| **C11** | Financial policies (`financial_policies`, `policy_type` `due_date` and `billing_calendar`) | 3 (S4, 2026-09-22) → **10** (S3 `o2`, 2026-10-09), all active. **3 `due_date`**, org-scoped: "QA due date — on invoice" (from 2026-09-18), "QA due date — 10 days after invoice" (from 2026-09-19), "Tuition terms — net 10" (10 days after invoice, from 2026-08-01). **7 `billing_calendar`**: 6 "S1 proof — …" (3 site-scoped at North/West/South Campus, 1 explicit account calendar, 2 account-scoped to the demo households Chen and Okafor) and "S2 proof — configuration B, future-effective" (from 2027-03-01) | **LEAVE** for the 2 `QA …` due-date policies and the 7 `S1 proof`/`S2 proof` billing calendars. **OWNER** for "Tuition terms — net 10" | The `QA …` policies are QA-labelled. The `S<n> proof` calendars are certification residue: their labels name the proof they served, and two are scoped to demo households. | "Tuition terms — net 10" carries no marker and its effective date (2026-08-01) is earlier than the QA policies', so it may be Firefly's real due-date term (owner decision 5). With every billing calendar classed LEAVE, the rebuild's billing calendar is authored fresh. |
| **C12** | Accounting calendar (`calendar_month`, 2026-01-01 → 2026-12-31, 11 open, 1 closed) | 1 (S3) | **OWNER**. Recommendation: **KEEP-CONFIG** for its shape (monthly) but re-create it **without** its open/closed period state | The calendar shape is configuration. Period closes are transactional history tied to test charges. | — |
| **C13** | Forms and document templates: `form_definitions`(+versions), `form_packet_definitions`, `document_types`(+versions), `document_requirements` | count not in any committed census. Named debris: `Cert Enrollment/Consent <timestamp>` forms (S11) | **KEEP-CONFIG** for Firefly's enrollment packet and real forms. **LEAVE** for the `Cert …` timestamped forms. Counts **BLOCKED** (STG-CENSUS) | The enrollment packet is product configuration. Timestamped `Cert` forms are certification residue. | S7 shows 175 `generated_form_pdf` documents with `template_key` set, so templates are in use, but their count is unknown. |
| **C14** | Field definitions, sections, option sets, tenant entity layouts, tenant status definitions (Firefly's "control plane") | not in a committed census | **KEEP-CONFIG**, counts BLOCKED (STG-CENSUS) | The seed doc states that staging uses this control plane as is. The rendered surfaces depend on it. | Only the code defaults (K5–K7) are known. The July 2026 API capture `docs/sprints/active/assets/firefly-config/` is **not** a usable source: it was taken from a local server against an unrecorded database, it is marked "structural only; do not treat as current state" (`docs/handoffs/bp-config-integrity-handoff.md:333`), and the seed builder deliberately does not use it because it carries certified defects (`web/lib/staging/fireflyStagingSeed/builder.ts:7-10`). |
| **C15** | Communications configuration: `communication_templates`(+versions), snippets, `communication_identities`, provider accounts and bindings, ingress routes | not counted. "Provider bindings and payment merchants exist for Firefly only on staging" (QA profile §2.1, toolkit evidence 2026-11-05) | **KEEP-CONFIG** for the templates and snippets. **OWNER** for provider bindings and merchants, which are **re-provisioned per environment and never carried** | Templates are product content. Bindings and merchants are environment credentials: staging ones point at test or sandbox providers. | Secret values are in Vault or platform env. Their names are BLOCKED on P1S. |
| **C16** | Tour availability rules, public booking links | not counted | **KEEP-CONFIG**, counts BLOCKED (STG-CENSUS) | Scheduling configuration. | Public links embed a staging origin and must be re-issued per environment. |
| **C17** | Role definitions and `org_settings` | 5 role definitions in Firefly (S9). 1 `org_settings` document | **KEEP-CONFIG** | Access model and tenant settings. | `org_settings.metadata` is one JSON document edited in place. It may mix real settings with QA toggles. Review it key by key in P4. |
| **C18** | Configuration *history*: older `business_process_revisions`, `business_process_drafts`, `configuration_publications`, `workflow_events`, `mutation_events` | not counted | **OWNER**. Recommendation: **LEAVE** (keep the current published state only; archive the history with the decommissioned staging) | The history records QA and certification edits, and it is not needed to run. | If audit continuity is required, this becomes an archive decision, not a rebuild one. |

### L. Synthetic, QA and test data to leave behind

| ID | Record types | Count (source, date) | Class | Rationale | Uncertainty / dependency |
|---|---|---|---|---|---|
| **L1** | Firefly households, guardians and children, cases (`customers`, `customer_members`, `persons`, `opportunities`), participations, tasks and work items | 74 households, 67 cases (S1, 2026-10-20) | **LEAVE**, with **OWNER confirmation** (L1a) | Every indicator says demo or test: the slug `demo-childcare-co-…`; "before real families are loaded" with 6 outbound messages ever (S15, 2026-09-29); QA runs create families in this tenant (S14, e.g. "Walk 584637 Family"); demo and golden-path markers exist for it (S12). | **L1a:** no committed evidence says there are **no** real families. S3 counts 13 "customers" and 4 "demo households" on 2026-10-09, against 74 households on 2026-10-20. Those are different definitions, and the gap is not explained. **The owner confirms that Firefly staging holds no real family.** If any does, it is a data-protection decision, not a test-data one. |
| **L2** | Financial records: `charges`, enrollment agreements, `enrollment_pricing_terms`, payments, reversals | 143 charges (S3, 2026-10-09); 8 agreements, 2 live tuition terms, 82 charges (S4, 2026-09-22) | **LEAVE** | Posted against test families during financial certification ("humanqa" terms, S4). | Payments made through a real merchant would be a different matter: see C15/P1S. |
| **L3** | Documents and storage: `documents`, `form_submission_documents`, `storage.objects` in `org_documents` | 279 documents (16.6 MB), 313 objects (33.9 MB), 34 objects with no document row. 175 generated form PDFs, 32 immunization records, 24 signature assets, 44 point-of-sale intake uploads (S7, 2026-10-20) | **LEAVE** | Generated from test families and QA runs. | Uploaded immunization records and signatures **may contain realistic or real-looking personal content**. They are never copied, even as samples. Deleting them with staging is part of the decommission (outside P3). |
| **L4** | Communications: `communication_threads`, `communication_messages`, reads, scheduled sends, `messages_outbox` | 6 outbound messages ever (S15, 2026-09-29); later volume not counted | **LEAVE** | Runtime history of test traffic. | — |
| **L5** | ZZ Alloy QA tenants (`qa_shared` `4acc9386-…`, Cross-Org `ad53fee2-…`) with their departments, sites (QA D1, QA D2, QA North, QA South, Cross-Org Site), QA pool and admin identities | 2 orgs. The S8 census (2026-10-22) shows `qa_shared` quiesced: no merchant, no usable payment method, 0 messages sent, 0 retained charges | **LEAVE**, with **OWNER** on re-creation (L5a) | Synthetic, non-school plan tenants by design (`sharedQaRegistry.ts`). | **L5a:** their ids are pinned in code (S13) and in the installed toolkit. A rebuilt staging that runs the shared-QA plans needs them **re-created by their own tooling** (`ensureSharedQaTenant.ts`), not copied. The owner decides whether the rebuilt staging hosts them. |
| **L6** | W-17 self-test org | 1 org, 0 rows of any kind counted (S1) | **LEAVE** | A self-test fixture (`_w17_selftest_` slug). | — |
| **L7** | Alloy Bend org (retired) | 1 org, 2 user roles, 0 departments, 0 records (S1); 5 role definitions (S9) | **LEAVE** | Retired early cleaning-vertical tenant. A migration already promoted its field registry to the target org (`20260427153000_promote_system_field_registry_bend_to_target_org.sql`). | Its 2 user roles may be real people's accounts. They are covered by L8a. |
| **L8** | QA identities: `qa-slot<N>-…@example.com` auth users and their Firefly `user_roles`/access profiles; `QA Operator · Slot N` persons (`external_source = alloy_qa_fixture`); QA pool and ZZ administrators | 7 slot identities on 2026-10-20, 6 of them Firefly `admin` (S1); 6 confirmed 2026-11-25 (S10) | **LEAVE**. Re-provision with the installed toolkit (`vac-qa-identity-provision`, `vac-qa-access-assign`) after the rebuild | Machine identities. Every one is idempotently re-creatable. | **L8a (OWNER):** Firefly has 13 user roles (S1). About 7 are **not** managed QA identities. They may be the owner's or real staff accounts (QA profile §4: "Firefly's real staff accounts share that project"). Which of them carry into the rebuild is an owner decision. Their emails are in the owner-held census output, not in this repo. |
| **L9** | Hosted QA and certification run fixtures (rows tagged `qa_run_id` / `QA… <run>` prefixes) across Firefly and ZZ | 31 distinct `qar_` run ids in committed certification evidence (S14) | **LEAVE** | Explicit test fixtures, each recorded with its run id. | The manifests list what each run *created*. Whether every run cleaned up afterwards is not proven, so the marker sweep (T) is what finds them. |
| **L10** | Demo and golden-path seed rows (`metadata.demo_seed_package`, `is_demo_data`, `seed_key LIKE 'golden_path%'`, `golden_path_enrollment_v1`) | not counted (S3 shows 4 demo households on 2026-10-09) | **LEAVE** | Demo data by definition (S12). | Counts need STG-CENSUS. |
| **L11** | The Firefly staging seed (`f17e0000-0000-4000-8000-…`, `[Staging seed]`) | **0 on hosted staging.** It has not been applied (QA profile §7) | Nothing to leave. **OWNER**: re-run it on the rebuilt staging? | It is designed to be re-applied idempotently (K9). | The bare-org path authors configuration of its own, so it must not be run on a rebuilt Firefly before C1–C17 exist, or it would author a second, template-only configuration. |
| **L12** | Process instances, work items, stage-work rows, scheduled work, audit and mutation events tied to L1–L10 | not counted | **LEAVE** | Runtime state of test records. | — |

### B. Items that depend on the blocked P2_DATA and P1S access

| ID | Item | Blocked on | What is known | Class until unblocked |
|---|---|---|---|---|
| **B1** | Whether production's single org (`public.orgs`, 1 live row, 22 updates) is a real tenant whose configuration the rebuild must carry | **P2_DATA** (or a P1 row-visibility grant) | The row exists, and its content is unreadable under RLS. Production also has 0 current payments, 0 messages and 12 outbox rows (P1). | **BLOCKED**. If it is real, its configuration needs its own classification. It lives on the older schema, so it cannot be compared row for row with staging. |
| **B2** | Production `auth.users`, storage objects, Vault secrets | **P2_DATA** | The role reaches none of these (P2). | **BLOCKED** |
| **B3** | Environment variable *names* per platform and scope (Vercel Preview/Production, Render backend, Supabase project settings), so staging-only keys can be separated from keys the rebuild keeps | **P1S** | From the repo (`deployment-and-environments.md`, QA profile §4): `ALLOY_ENVIRONMENT` (required, fail-closed) is **KEEP**, with a per-environment value. `COMMUNICATIONS_STAGING_EMAIL_ALLOWLIST`/`_SMS_ALLOWLIST` are **staging-only** and must not be set on production. `DEV_QUEUE_ORG_ID` is host toolkit configuration (Firefly id), not app configuration. The staging Supabase custom SMTP must be a capture-only sandbox. | **BLOCKED** for the full list. The listed keys are classified. |
| **B4** | Provider bindings, payment merchants and sender identities (C15) | **P1S** (secret names), STG-CENSUS (binding rows) | They exist for Firefly only on staging. Every email and SMS in the 30 days before 2026-11-05 went through a Firefly binding. | **OWNER and BLOCKED**. Recommendation: re-provision per environment and never carry credentials. |
| **B5** | Whether staging's Supabase Auth mailer is delivering or capture-only | **P1S** | Not recorded in the repo. | **BLOCKED**. This is a safety item for the rebuilt staging, not a data item. |

### X. Data-bearing artefacts already in this repository

| ID | Artefact | What it holds (only table names and `COPY` row counts were read) | Class | Note |
|---|---|---|---|---|
| **X1** | `data.sql` (1.0 MB) and `data_public.sql` (0.97 MB), repo root, last changed 2026-03-23 | A data dump of an **older, cleaning-vertical** database. `data.sql` includes `auth.users` (3 rows), `auth.sessions` (5), **`auth.refresh_tokens` (75)**, `auth.identities` (3), `auth.mfa_amr_claims` (5) and `storage.objects` (14). Both include `orgs` (1), customers (7), persons (11), jobs (8), payments (7), 152 field definitions, 18 workflows, 105 workflow runs, 28 pricing-matrix rows and the cleaning pricing tables. | **LEAVE**. Not a rebuild source | It is the wrong vertical and schema generation, and the source database is unrecorded. |
| **X1a** | — | — | **OWNER (security)** | A committed file containing **auth session and refresh-token rows** (and possibly password hashes in `auth.users`) is credential material in git history. It was not opened beyond its `COPY` headers. **Recommendation:** have the owner decide whether those sessions are still valid (revoke them if the source was production or staging) and whether to purge the files from history. That is a repo-history rewrite, outside this objective. |
| **X2** | `prod_baseline.sql` (0.34 MB), 2026-03-28 | Schema only. No `COPY` data blocks. | Historical reference. Superseded by the P2 snapshot for production recovery, and by the migration chain for the rebuild (R2). | — |
| **X3** | `docs/sprints/active/assets/firefly-config/` (July 2026 API capture) | Firefly department, queues, forms and action placements, from an unrecorded database | **LEAVE** as a source (see C14). | It is useful only as a structural cross-check. |

## T. Test-data markers (the rule P4 would apply)

A row is **test data to leave behind** if any of these hold. Everything else in Firefly is configuration (C) or needs an
owner answer.

| Marker | Where it appears | Set by |
|---|---|---|
| `org_id` in {ZZ Alloy QA, ZZ Cross-Org, W-17 self-test, Alloy Bend} | every org-scoped table | S1, S13 |
| id in `f17e0000-0000-4000-8000-…`, `external_source = 'firefly_staging_seed'`, `[Staging seed]` in a name, `metadata.seed` | 17 seed write-set tables | Firefly staging seed (S11) |
| `metadata.qa_run_id`, or a `QA<slice> <run>` name prefix | QA-run fixtures | hosted QA runners (S14) |
| `external_source IN ('alloy_qa_fixture', 'alloy_qa_structure', 'alloy_seed_fixture')` | persons, structure | toolkit and QA fixtures |
| `metadata.demo_seed_package`, `metadata.is_demo_data`, `metadata.seed_key LIKE 'golden_path%'` | demo rows | demo seeders (S12) |
| auth email `qa-%@example.com`, `cert-%@example.com`, `%+qa%@%`; any `@example.com` / `.invalid` address; NANP `555-01XX` phones | auth, persons, contacts | QA identities, seeds |
| keys or labels `stage4_ok3_*`, `QA …`, `Cert … <timestamp>`, `S<n> proof — …` | program categories, policies, forms | certification runs (S3, S6, S11) |
| key prefix `cert_` (e.g. `cert_household_fee`) | charge templates, keyed configuration | certification runs (S3) |
| numeric epoch-ms key suffix, `_<13 digits>` (e.g. `waived_fee_1790630157816`) | charge templates, keyed configuration | test runs generating unique keys (S3) |

**Known limit:** QA runs that created rows through the ordinary UI without a run marker (for example the room in the
`slice8b2` manifest) carry no marker on the row itself. They can be found only from the committed manifests (S14) or by
creation time. That is why C5 stays OWNER until STG-CENSUS lists those rows. C10 and C11 are settled by the S3
listing: their remaining OWNER items (`enrollment_fee_waived`, "Tuition terms — net 10") are commercial questions, not
missing evidence.

## Internal consistency check

- Every item has exactly one class. Items with two or more parts name each (C5, C10, C11, C13, C15), and each part is classed.
- No item is both KEEP and LEAVE for the same rows. The splits are by marker or key (C6/C7, C10, C11, C13).
- Org totals agree. S9 (2026-09-14) and S7 (2026-10-20) both give 3 orgs: Firefly, Alloy Bend and W-17. The ZZ orgs
  first appear on 2026-10-22 (S8). So staging held 3 orgs through 2026-10-20 and 4–5 after.
- The QA identity counts agree. S1 lists 7 slot identities, 6 with a Firefly `admin` role, and the owner's
  2026-11-25 census found 6 (S10).
- Charge templates 5 → 8 (C10) and financial policies 3 → 10 (C11) are explained: S3 lists every row, and each is
  classed by key or label.
- These counts **disagree and are explained only as unverified**: locations 20 → 37 (C5), Firefly customers 13 (S3) vs
  74 households (S1) (L1a).
- No production data is classified as KEEP. Every production item is BLOCKED (B-section).

## Owner decisions this list needs

Grouped by what they unblock. P4 starts only after the owner confirms the list.

1. **Confirm R1–R4.** Re-author configuration through the app (no row copies). Rebuild from the staging migration
   chain. Run one fresh configuration-only staging census. Classify by marker.
2. **L1a. Is there any real family in Firefly staging?** The recommendation assumes none.
3. **C1a. Firefly's published Enrollment process or the platform template?** Recommendation: Firefly's, after a reviewed
   diff against the template.
4. **C8. Are Firefly's staging rates and fees its real prices?**
5. **C11 and C10. Is "Tuition terms — net 10" (due 10 days after invoice, effective 2026-08-01) Firefly's real
   due-date policy, and does Firefly need a waived enrollment-fee template (`enrollment_fee_waived`)?**
   Recommendation: carry "net 10" only if the owner confirms it, authored fresh; leave `enrollment_fee_waived`. The
   billing calendars on staging are all certification proofs, so the owner also states Firefly's real billing cadence.
6. **L8a. Which of Firefly's ~7 non-QA user accounts carry into the rebuild?**
7. **L5a and L11. Does the rebuilt staging host the ZZ Alloy QA tenants and re-run the Firefly seed?**
   Recommendation: yes to both, via their own tooling and after the Firefly configuration exists.
8. **C3, C12, C18 and the K watch item.** Recommendation: leave the process-less `enrollment` department; keep the calendar
   shape only; leave configuration history; leave the demo migrations untouched.
9. **X1a (security, independent of the rebuild).** What to do about the committed `auth.refresh_tokens` and sessions in
   `data.sql`.
10. **Access, for the BLOCKED items:** P2_DATA (production data snapshot) for B1–B2, P1S (platform tokens) for B3–B5.
    STG-CENSUS (owner-run) for C2, C4, C5, C9, C13, C14, C16 and L10.

## What was not done

- No database, API, CLI or credential was used. No staging or production row was read, copied, exported or changed.
- The committed `data.sql`/`data_public.sql` were read only for table names and per-table row counts. No row content
  was viewed.
- No census was written or run for STG-CENSUS. Writing it is P4 work, after confirmation.
- P4 was not started.
