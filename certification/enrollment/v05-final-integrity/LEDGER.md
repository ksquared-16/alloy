# Enrollment V0.5 — Final Integrity Ledger (FI-01 … FI-11)

Master status ledger for the Director's "Enrollment V0.5 — Final Integrity & Product Completeness"
milestone. Starting certified staging: `90ad7843` (#1552). Staging at milestone start: `6cff6cb9`
(BP V2 Billing #1551/#1553 merged on top).

Evidence classes, always stated: **DEPLOYED** (staging acceptance), **S9** (isolated cert stack /
migration certification), **DB-TEST** (live suite on the cert database), **UNIT** (pure tests),
**UNTESTED**. No item is closed from code inspection alone.

| ID | Item | Canonical owner | Status | Evidence |
|---|---|---|---|---|
| FI-01 | Medical data access security | Medical + Access | **DEPLOYED** (5a0046fc) · Documents app routes still need doc-type check (Documents-owned) | DEPLOYED + S9 + DB-TEST |
| FI-02 | Drawn-signature signer identity | Forms | **DEPLOYED** (66d6ee27) · per-signer authority contract missing (refused, reported) | DEPLOYED + DB-TEST |
| FI-03 | Consent withdrawal operator UI | Medical | **DEPLOYED** · unauthorized refusal DB-TEST only | DEPLOYED + DB-TEST |
| FI-04 | Child-specific payment default | Enrollment runtime | **DEPLOYED** | DEPLOYED (UI + ledger census) + UNIT |
| FI-05 | Charge child attribution | Financials | NO CONTRACT DEFECT · read-side gaps → Billing lane | code census |
| FI-06 | Guardian employment / work details | CRM person facts | **DEPLOYED** (66d6ee27) | DEPLOYED + DB-TEST |
| FI-07 | Home / work / mobile phone semantics | CRM person | **DEPLOYED** (66d6ee27) | DEPLOYED + DB-TEST |
| FI-08 | Tdap immunization coverage | Medical | **DEPLOYED** | DEPLOYED + UNIT |
| FI-09 | Document-backed health requirements | Documents + BP | **BLOCKED — Documents contract** | code census |
| FI-10 | Immunization verification / exemptions | Medical + Documents | **DEFERRED** (exemption, Director) + **BLOCKED** (verification, Documents) | code census |
| FI-11 | Integrated certification | All | PARTIAL — see final certification | — |

## Item detail

(Each item: owner · current behavior · defect / missing capability · authority reused · change ·
dependency · acceptance criteria · status · evidence. Filled as the milestone proceeds.)

### FI-01 — Medical data access security

- **Owner:** Medical (`health.view` / `health.manage`, `assertHealthAccess`) + database grants.
- **Proven defect (DB, cert stack, 2026-10-21):** `person_health_facts` granted SELECT to
  `authenticated` under `org_id = current_org_id()` (20260826120000, recorded there as a stopgap
  "until D-H6 lands"). `current_org_id()` returns the org whenever `orgs` has one row and never
  reads the caller. Simulated single-org in a rolled-back transaction: a signed-in user with NO
  role read **49/49** rows (allergy, immunization, insurance). Operators hold real Supabase browser
  sessions (`app/login/page.tsx` `signInWithPassword`; hosted PostgREST is reached directly).
- **Repair (branch):** `20261203090000_person_health_facts_server_only.sql` — drop the same-org
  policy, revoke everything from `authenticated`/`anon`/`PUBLIC`, service-role policy only, with a
  self-verifying block (the pattern of `person_medical_consents` and
  `20260803230000_trust_runtime_v1_privilege_correction`). Re-runnable (applied twice in one
  rolled-back transaction). Every app reader already uses the service role behind
  `assertHealthAccess` (health card, collection resolver, health-fact service, Processing
  commits, actions executor) — verified by reading each caller.
- **Test:** `tests/health/live/healthRecordsBrowserAccess.live.test.ts` signs in as a disposable
  roleless user and asserts a **privilege refusal (42501)**, not an empty list (an empty list
  depends on org count). **Red before the repair** (`expected [] to be null`), 4/5 others green.
- **Wider exposure found — NOT repaired, Director decision required** (medical/security
  ambiguity: restricting it changes who sees a child's allergies, a safety signal):
  - E1 Processing case evidence (`api/admin/processing/cases/[caseId]`) returns every submission
    answer, incl. medical answers, to any admin-context operator; no `health.view` check.
  - E2 `GET /api/admin/customer-members/[id]` returns `allergies`/`medical_notes` under
    `CRM_CUSTOMERS_READ` only.
  - E3 Child drawer / durable record / Children card show `allergies`/`medical_notes` without
    `health.view`. `CHILD_PROFILE_HEALTH_REF_KEYS` is defined and never used;
    `special_instructions` (medical section) lacks `sensitivity:"health"`.
  - E4 DB: `field_values`, `documents` (immunization/physical doc types), `form_submissions`
    payloads and `form_submission_signatures` are readable via RLS by owner/admin/ops/manager
    browser sessions regardless of `health.view`. These are shared tables; revoking them needs a
    browser-query census and touches the Documents sprint's area.
  - E5 `p076-first-order-prototype` hardcodes `healthView: true` (admin-gated, 404 unless
    `ALLOY_ROUTE_TIMING=1`; low).
- **Acceptance:** S9 apply on cert + suite green; deployed: roleless/ops session refused.

### FI-04 — Child-specific payment default (census)

- Every payment line already carries `subjectCustomerMemberId` (`participantEnrollmentPayment.ts`);
  the payment route knows the session's child (`session.crm_snapshot.customer_member_id` →
  `family.value.focusedCustomerMemberId`) but does not return it. The card defaults to the first
  payable line — the sibling's fee in ZZQAV5082106 (L1).
- **Fix:** return the session's focused child on the payment view; the card defaults to that
  child's payable line, falling back to the first payable line; the other fees stay selectable.
  POST is unchanged (`payableChargeIds` is family-scoped, household-checked server-side).

### FI-05 — Charge child attribution (census)

- **Contract:** `charges` has no child column **by design** (`20260827120000_household_billable_source.sql`:
  "no childcare-specific `child_id` column is added"). Enrollment fees are household-source charges
  whose child is the **subject**, written once by Financials' writer as
  `metadata.subject_customer_member_id` (Director decision H3-2, #1464); idempotency is narrowed to
  household+child.
- **Readers:** fee projection, consumption and resolver match the metadata subject; charge index
  and charge detail render it as `childName` and deliberately keep `customerMemberId` null so a
  label never selects a child's payment arrangement (#1499). Position, allocation and responsibility
  treat household-source charges as household-grain on purpose.
- **Verdict:** no contract defect; no historical migration warranted. Gaps are read-side only:
  no index on the metadata subject; no API returns the subject id as a field; child-scoped account
  reads (bundle RPC, `accountChargeLedger`) include every household fee in each child's scope.
  The readers live in the active BP V2 Billing lane (`resolveFinancialWorkQueue.ts`) — not edited
  here.

### FI-06 / FI-07 — Guardian work info, phone semantics (census)

- `persons` has one `phone` (identity-bearing via `phone_canonical`); intake folds mobile/cell into
  it. No phone-type model exists. Of the work fields only `person.employer` exists (field
  definition + drawer edit). No `work_phone`, `home_phone`, `work_hours`, `employer_address`,
  `preferred_contact_method` definitions (`communication_preference` exists: email/sms/phone).
- Participant eligibility marks guardian employer `process_scoped` ("no canonical owner") — stale.
- Prefill reads `persons` columns only, never person `field_values`; `guardian_email` /
  `guardian_phone` registry keys have no alias (fall through to non-existent columns).
- No reviewed Processing path commits person `field_values` from a submission.
- Household-scoped need identity collapses guardian #1 and #2 answers for the same key.

### FI-02 — Drawn-signature signer identity (branch `f3d659704`)

- **Defect (deployed, ZZQAV5082106):** a drawn signature stored no signer; the consent recorded
  "the family". The prior live test inserted a drawn row WITH `typed_full_name` — a shape the
  persister never writes; it proved nothing about the real path.
- **Change (Forms authority reused):** signature entry gains `signer_printed_name` (strict schema
  kept); `require_typed_name` now requires it beside a drawn mark; the capture dialog asks the
  signer for their printed name (required when the policy says so, offered otherwise) and never
  fills it from the recipient. `persistFormSubmissionSignatures` writes `metadata.signer`:
  method, printed name, identity basis (`typed_signature` | `printed_name_with_drawn_mark` |
  `not_captured`), acknowledged-at, channel (public link / operator), link, packet session,
  recipient person, and `printed_name_matches_recipient` (observed, never assumed). The medical
  consent proposal uses the printed name; a consent with no named signer is `incomplete` and its
  commit refuses `signer_unknown`. The signed artifact's evidence names the printed signer.
- **Historical:** existing signature rows and consents are untouched (no backfill; nothing
  fabricated). Already-recorded consents short-circuit on the ledger before the new refusal.
- **Tests:** real drawn shape through the real persister → `metadata.signer` → consent granted by
  "Jordan Rivers" while the recipient is "Pat Rivers" (DB-TEST); drawn with no name → proposal
  incomplete, commit refused, no consent row (DB-TEST); validator + `describeSignatureSigner` (UNIT).
- **Config to apply after deploy:** `require_typed_name: true` on Lil' Sunshine consent signature
  fields (new published versions via authoring API; historical versions untouched).

### FI-03 — Consent withdrawal UI (branch `7ff323d21`, `bd809ef22`)

- Medical card shows "Record withdrawal…" on active consents → required reason (≥3 chars) →
  explicit "Confirm withdrawal" → existing `medical_consent.withdraw` action (`health.manage`) →
  card reload. Withdrawal scoped to the card's child: another child's consent refused and
  untouched (DB-TEST). Repeat → `not_active` refusal shown (DB-TEST + UNIT). Never deleted;
  granted fields immutable (DB trigger, DB-TEST). Evidence document pointer retained.

### FI-04 — Payment default (branch `1231891a8`)

- `defaultParticipantPaymentChargeId`: the session child's payable fee, else the first payable
  fee; mixed due/not-due, household fee, foreign child id, nothing payable (UNIT). Other fees stay
  selectable; payer and POST boundary unchanged.

### FI-06 / FI-07 — Parent work and contact facts (branch `1cecf22ed`)

- **Canonical homes:** `persons.phone` = mobile/primary (identity, untouched by this path);
  person field values `home_phone`, `work_phone`, `employer`, `work_hours`, `work_address`,
  `communication_preference` (existing option set email/sms/phone). Definitions are org config
  (field authoring API), not seeded by migration.
- **Path:** respondent's top-level answers bound to those facts → one `person_contact_facts`
  Processing proposal → operator approval → written on the submission's own adult
  (`form_submissions.person_id`). Refused: adult of another household
  (`person_wrong_household`); stated name ≠ the adult (`different_adult`); unconfigured field
  (`fact_not_configured`, all-or-nothing). A blank never clears; a changed value is recorded with
  what it replaced (commit ledger on the case). Rows of repeatable groups (other guardians,
  emergency contacts) are other people and are never read here.
- **Prefill:** guardian keys alias to the adult's facts; resolver reads person field values; a
  sibling's form prefills them (DB-TEST). Fixed fall-through of registered `guardian_email` /
  `guardian_phone` to non-existent columns.
- **Second guardian:** TA-806 asks guardian #2 only name/relationship/phone/email (relationship
  collection, M1). A "#2 Employer" question stays `process_scoped` — no per-guardian identity in the
  household-scoped need; never folded into guardian #1's facts.
- **Config to apply after deploy (Lil' Sunshine):** person field definitions `home_phone`,
  `work_phone` (phone), `work_hours`, `work_address` (text) via `POST /api/admin/field-definitions`;
  a new TA-806 version binding `occ_guardian_home_phone` / `_work_phone` / `_work_hours` /
  `_work_address` to them.

### FI-08 — Tdap (branch `0af383866`)

- `tdap` in Medical's vaccine catalog, distinct from `dtap`; an empty Tdap row proposes nothing;
  nothing inferred from titles (UNIT). Config after deploy: add `tdap` dose fields to the Lil'
  Sunshine `health_capture.immunization_grid` declaration only where the form has Tdap rows.

### FI-09 / FI-10 — Documents dependency (open, explicit)

- No Documents contract exists for a document-backed requirement (`stageRequirementsV1`
  `kind:"document"` is not authorable; no document-type → requirement evaluation). A parallel
  engine in Medical would duplicate Documents — not built. Reported to the Documents lane.
- Exemption lifecycle: deferred by the Director. Immunizations stay "reported", never
  auto-verified; the BP "requirement does not apply" exception is not used for exemptions.

## Promotion and deployed evidence (2026-10-21)

- **PR #1556** merged → staging `8f0961717b2b` (first approved merge `gar_69febebce79cdc` failed
  `base_integration_in_progress` while #1557 merged; refiled `gar_7d55d6dbaec5d6`, merged clean).
- **Migration 20261203090000:** certification `gar_8e0fdf14fd8caf` complete; staging applied by the
  Supabase integration on merge (direct apply `gar_a41a01387908e5` correctly refused
  `migration_owned_by_pending_merge`); on the deployed ledger (identity census `gar_de5d2cc7c8c674`).
- **S9 (cert DB, migrated):** `healthRecordsBrowserAccess.live` 5/5 (red before the migration),
  `medicalCompleteness.live` 7/7 incl. FI-02 real drawn shape.
- **FI-01 DEPLOYED:**
  - catalog census `gar_640372d1c5e32c` on `alloy_deployed_primary`: `authenticated` and `anon`
    hold no SELECT/INSERT/UPDATE/DELETE on `person_health_facts`; `service_role` holds all; one
    policy (`person_health_facts_service_role_all`, service_role); RLS enabled + forced.
  - live: the deployed QA operator's own signed-in Supabase browser token (role `authenticated`),
    sent straight to staging PostgREST → `person_health_facts` **403 42501 permission denied**;
    `person_medical_consents` **403 42501**. (Session restored `gar_122d1fb0ce98aa`, state mtime
    18:55Z.)
- **Deployed SHA:** `/api/build-info` = `8f0961717b2b` at 18:57Z.
- **Post-deploy config (authoring API, Lil' Sunshine):** person field definitions created via
  `POST /api/admin/field-definitions` — `home_phone` (phone), `work_phone` (phone), `work_hours`,
  `work_address` (text), section `contact`. 201 each.

### Post-deploy configuration (Lil' Sunshine, authoring APIs only)

- Person field definitions `home_phone`, `work_phone`, `work_hours`, `work_address` (above).
- **TA-806 v4** published (draft → publish; v3 untouched, snapshot kept): `occ_guardian_home_phone`
  / `_work_phone` / `_work_hours` / `_work_address` bound to `person.*`. Same 95 fields.
- **Oregon CIS**: `health_capture.immunization_grid` gains `tdap` (`imm_tdap_dose_1..5`) — the form
  already had Tdap rows that were silently dropped. Every other metadata key preserved.
- **FI-02 config**: every consent signature already had `require_typed_name: true` — no change.

### Deployed acceptance — disposable family ZZQAFI120104 (Ava, Ben), build 8f096171

- **FI-02 DEPLOYED** — Ava's Enrollment Application, drawn signature: row `typed_full_name` empty,
  drawn asset present, `metadata.signer` = drawn · printed_name "Parent ZZQAFI120104" ·
  `printed_name_with_drawn_mark` · public link · ack time (census `gar_0b519812602e29`). Her
  medical records release (drawn) proposed **"Signed by = Parent ZZQAFI120104"** (ZZQAV5082106
  showed "the family"); committed → consent `cfcc7453` `grantedByName` "Parent ZZQAFI120104".
- **FI-08 DEPLOYED** — CIS Tdap dose 1 → its own `health.immunizations:tdap` proposal (DTaP
  separate) → committed 200; retry `alreadyDone: true`.
- **FI-03 DEPLOYED** — Medical card (Registration view → Ava → View health details): "Record
  withdrawal…" on the active consent; confirm disabled until a reason; confirm →
  `medical_consent.withdraw` 200 `withdrawn` (19:28:37Z); control gone after refresh; card shows
  status withdrawn, reason, withdrawn-at, granted-by and evidence document retained. Repeat →
  409 "Only an active authorization can be withdrawn." Unauthorized refusal: DB-TEST only (the
  deployed QA identity is an admin).
- **FI-06/07 DEPLOYED — DEFECT FOUND**: the operator case carried the `person.contact_facts`
  proposal (home 5035550199 and work 5035550101 distinct; cell not included), but commit refused
  `missing_person_anchor`: **packet submissions carry no `form_submissions.person_id`**. Also the
  household check did not consult `customer_persons`, the canonical household membership. Fixed
  in a follow-up (anchor = `person_id` else the link's `recipient_person_id`; membership via
  `customer_persons` first); DB-TEST reproduces the deployed shape.

### Remaining deployed acceptance

- TA-806 new version binding `occ_guardian_home_phone` / `_work_phone` / `_work_hours` /
  `_work_address`; `require_typed_name` on consent signature fields; Tdap rows where a form has them.
- Disposable family: FI-02 drawn signature with printed name → `metadata.signer`, consent granted
  by; FI-03 withdraw on the Medical card; FI-04 second child's session defaults to its own fee;
  FI-06/07 reviewed commit → Person facts → sibling prefill.

## Final certification — continuation (2026-10-21)

Deployed staging: **`5a0046fcdfc3`** (#1560), on top of `66d6ee27` (#1559) and `8f096171` (#1556).
Migrations on the deployed ledger: `20261203090000`, `20261204090000`.

### FI-06/07 — deployed (family ZZQAFI120104, build 66d6ee27)
- Approved through the operator commit route (`person.contact_facts`); repeat → `alreadyDone`.
- Census `fi06-deployed-parent-facts-census.sql`: 5 facts (home 5035550199, work 5035550101, work
  hours, work address, employer) on person `4f913a59` = the link recipient, a `customer_persons`
  member of the household; one parent person (no duplicate); `persons.phone` (mobile) unchanged and
  distinct; case ledger `applied · 5 written` on that person.
- Ben (sibling): guardian identity `confirm_known_value`; home/work phone, employer, work hours and
  address not asked again; Ben's own allergies / immunizations asked fresh (no child Medical reuse);
  paperwork submitted.

### FI-02 — second signer (family ZZQASG142512, build 66d6ee27)
- "Jordan ZZQASG142512" drew and printed his name on the Medical Records Release ("Authorization to
  Disclose and Receive Medical Records"); signature row `b5ae5376`: drawn asset present,
  `printed_name` Jordan, `printed_name_matches_recipient=false`, recipient `f158d762` (the parent).
- Proposal shows "Signed by = Jordan …"; operator commit → **409 `signer_not_authorized`** (twice);
  Medical card: no consent. No substitution of the recipient.
- **Missing contract:** a per-signer authority for an adult other than the link recipient (their
  own link, or verified identity + guardianship authority). Until it exists, such a signature is
  evidence on the submission, never a consent.
- All 10 ZZQAFI120104 drawn signatures: printed name, `matches_recipient=true`, recipient `4f913a59`.

### FI-04 — deployed
- Ben's page: lines list Ava's fee first; default = Ben's fee (API `defaultChargeId` and rendered
  select); Ava's page defaults to Ava's; the other child's fee stays selectable; payer "Parent".
- Stripe **test mode** (`pk_test_`) payment from Ben's page → "Payment received"; Ben Paid, $75 due
  (Ava). Census `fi04-deployed-payment-census.sql`: 2 charges (subject Ava / Ben), 1 payment
  `23fe1bcf` $75 inbound posted, payer person `4f913a59`, Stripe `pi_…`, 1 allocation → Ben's
  charge. No duplicate charge, payment or application; ledger and UI agree.

### FI-01 — Medical visibility (Director policy), #1560
- Census of exposures and legitimate readers: see PR #1560. No care / classroom / attendance surface
  receives medical data; no scoped care-access capability exists.
- Repaired: child API (read `health.view`, write `health.manage`), shared profile loader (access
  required), drawer / durable record, Processing case evidence and existing-child commit, Forms
  submission list/detail, intake source, packet review rollup, p076; DB restrictive policies.
- **S9 (cert):** before the migration an ops browser session read an immunization document, a
  medical form submission and its signature; after → refused; `health.view` admin still reads;
  ops non-medical access unchanged; no-role user reads nothing (25/25 incl. prior suites).
- **Deployed:** census `fi01-deployed-medical-rls-census.sql` — 11 RESTRICTIVE policies, 4 security
  definer functions, anon cannot execute. Authorized path on 5a0046fc (QA admin, health.view):
  PostgREST reads 5 medical submissions and 3 immunization documents; child API returns medical
  fields; case evidence carries health proposals. Unauthorized path deployed: **not exercised** — no
  non-Medical QA identity exists on staging; evidence is S9 + identical deployed policies.
- **Remaining confirmed exposure (Documents-owned):** `/api/admin/documents/**`, signed URLs,
  `entity/documents/[id]`, `related/*` documents authorize on `documents.read` or role with no
  health doc-type check (service role, so RLS does not apply). Needs a Documents-owned health
  doc-type gate.

### Validation
- typecheck, typecheck:tests, prebuild, production build pass on each PR head.
- #1559 covering suites 153/153; #1560 affected suites 752 pass, the 32 failures byte-identical by
  name to the untouched base (none new).
- Historical immutability: no form version edited (TA-806 v4 published beside v3); no signature,
  consent or health fact backfilled or rewritten.
