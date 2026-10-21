# Enrollment V0.5 — Final Integrity Ledger (FI-01 … FI-11)

Master status ledger for the Director's "Enrollment V0.5 — Final Integrity & Product Completeness"
milestone. Starting certified staging: `90ad7843` (#1552). Staging at milestone start: `6cff6cb9`
(BP V2 Billing #1551/#1553 merged on top).

Evidence classes, always stated: **DEPLOYED** (staging acceptance), **S9** (isolated cert stack /
migration certification), **DB-TEST** (live suite on the cert database), **UNIT** (pure tests),
**UNTESTED**. No item is closed from code inspection alone.

| ID | Item | Canonical owner | Status | Evidence |
|---|---|---|---|---|
| FI-01 | Medical data access security | Medical + Access (DB grants/RLS) | REPAIRED IN BRANCH (person_health_facts) · DIRECTOR DECISION (E1–E5 wider exposure) | DB-TEST red→ pending S9 |
| FI-02 | Drawn-signature signer identity | Forms (signature authority) | IMPLEMENTED IN BRANCH | DB-TEST (real drawn shape) + UNIT |
| FI-03 | Consent withdrawal operator UI | Medical | IMPLEMENTED IN BRANCH | DB-TEST (service) + UNIT (control) |
| FI-04 | Child-specific payment default | Enrollment participant runtime (Financials projection read-only) | IMPLEMENTED IN BRANCH | UNIT |
| FI-05 | Charge child attribution | Financials | NO CONTRACT DEFECT · read-side gaps reported (Billing lane) | code census |
| FI-06 | Guardian employment / work details | CRM person facts | IMPLEMENTED IN BRANCH · config pending | DB-TEST + UNIT |
| FI-07 | Home / work / mobile phone semantics | CRM person / contact | IMPLEMENTED IN BRANCH · config pending | DB-TEST + UNIT |
| FI-08 | Tdap immunization coverage | Medical (vaccine catalog) | IMPLEMENTED IN BRANCH (catalog) · config pending | UNIT |
| FI-09 | Document-backed health requirements | Documents + Business Process | OPEN — DOCUMENTS DEPENDENCY | code census |
| FI-10 | Immunization verification / exemptions | Medical + Documents (exemption deferred by Director) | OPEN — DEFERRED (exemption) + DOCUMENTS DEPENDENCY (verification) | code census |
| FI-11 | Integrated certification | All | OPEN | — |

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
