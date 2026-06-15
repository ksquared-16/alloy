# Forms Runtime Test 2D — Demo Childcare Co intake validation

**Status:** IC-5.6 — medication path validated; enrollment lead proof added (see below)  
**Org:** Demo Childcare Co `93667019-bd28-49b5-a688-acc9bb1e0a19`  
**Do not validate in Alloy Bend** — prior Test 1C/1D rows are the wrong org.

---

## Audit summary (Demo Childcare Co)

| Item | Result |
|------|--------|
| **Org** | Demo Childcare Co `93667019-bd28-49b5-a688-acc9bb1e0a19` |
| **Medication Authorization — Demo** | **Exists** — `8432c527-8799-4a55-88c7-f860bd78e747` (published v1) |
| **Other forms** | Parent Name, Test Child Basics, Test Form Creation, Test Guardian Basics |
| **Public links (med form)** | 8 links; **use seeded embed link** below |
| **Center location** | `7ce70708-3517-4ab3-93d0-241a75ec3284` — BrightStart Learning Center (`location_type: site`) |
| **Enrollment department** | `04958a78-32ca-4091-bcd3-4bbaef3fee4b` (key: `enrollment`) |
| **Enrollment work unit** | `5ba90557-876d-4450-9c28-36beac6e83be` (key: `enrollment_pipeline`) |
| **Vertical (use childcare)** | `1000d719-2248-4816-8ff6-cbdeee8e91ce` (slug: `childcare`) |
| **Opportunity status** | `default_opportunity_status_key: "new"` (org status registry) |

**Note:** Link metadata previously used global `cleaning` vertical — patched to **childcare** vertical for Demo org.

Re-run audit:

```bash
cd web && npx tsx --tsconfig tsconfig.json scripts/auditDemoChildcareFormsIntake.ts
```

Re-apply link patch:

```bash
cd web && npx tsx --tsconfig tsconfig.json scripts/prepareDemoChildcareMedicationIntakeTest.ts
```

---

## Test link (prepared)

| Field | Value |
|-------|-------|
| **formId** | `8432c527-8799-4a55-88c7-f860bd78e747` |
| **publicLinkId** | `187ba369-78ab-4df1-99d9-ca8d3120379f` |
| **plaintext token** | `alloy_demo_medication_authorization_v1__org_93667019-bd28-49b5-a688-acc9bb1e0a19` |
| **Embed URL** | `http://localhost:3000/forms/embed/alloy_demo_medication_authorization_v1__org_93667019-bd28-49b5-a688-acc9bb1e0a19` |

**Important:** Do **not** use `alloy_demo_medication_authorization_v1` alone — that hash resolves to Alloy Bend's link.

### Final link metadata

```json
{
  "lead_capture": true,
  "intake": true,
  "mode": "intake",
  "auto_create_person": true,
  "auto_create_customer": true,
  "auto_create_customer_member": true,
  "auto_create_opportunity": true,
  "default_vertical_id": "1000d719-2248-4816-8ff6-cbdeee8e91ce",
  "default_location_id": "7ce70708-3517-4ab3-93d0-241a75ec3284",
  "default_work_unit_id": "5ba90557-876d-4450-9c28-36beac6e83be",
  "default_department_id": "04958a78-32ca-4091-bcd3-4bbaef3fee4b",
  "default_opportunity_status_key": "new",
  "embed_mode": true,
  "intake_opportunity_source": "embed",
  "runtime_test": "forms_2d_demo_childcare"
}
```

All IDs belong to Demo Childcare Co (or global childcare vertical).

---

## Manual test instructions

### Prerequisites

- Browser logged into **Demo Childcare Co** (org picker shows Demo Childcare Co)
- Local app running at `http://localhost:3000`

### Test 2D-1 — First submit (creates CRM + opportunity)

1. Open embed URL (above) in a browser tab.
2. Fill form with **unique** guardian email (e.g. `forms2d-test1+{timestamp}@example.com`):

   | Field | Example |
   |-------|---------|
   | Child first name | Riley |
   | Child last name | Test2D |
   | Child DOB | 2022-03-15 |
   | Guardian full name | Jordan Test2D |
   | Guardian email | (unique email) |
   | Guardian phone | 6025550101 |
   | Medications group | 1 row — any med name, dose, schedule |
   | Acknowledgement | checked |
   | Signature | typed name |

3. Submit.

**Expected after submit:**

| Check | Expected |
|-------|----------|
| `/adminV2/forms` → **Review** pill | New row — “New family intake created CRM records” |
| Submitted date | Today |
| Operator notes debug | `session org` = `93667019…`, new submission ID in loaded preview |
| Opportunity | Created in Demo Childcare Co |
| Opportunity fields | `vertical_id` = childcare, `location_id` = BrightStart, `work_unit_id` = enrollment_pipeline, `status_key` = `new`, `source` = `embed` |
| Submission FKs | `person_id`, `customer_id`, `opportunity_id` populated |
| Payload meta | `intake_needs_review: true`, `intake_auto_operationalized: false`, `intake_opportunity_match: created` — reasons include `new_person_created`, `child_member_auto_created` (IC-4 blocks auto-op when child member auto-created) |

### Second submit visibility

Second submit (`intake_needs_review: false`, `intake_opportunity_match: attached_existing`) routes to **`recentlySubmitted`** lane → **`Recent`** workload pill on `/adminV2/forms`. Grouped intake case rolls up to Recent when no submission in the case requires review.

### Lead-only auto-op proof (IC-5.5 gate Flow B2)

For IC-4 auto-operationalization proof without weakening childcare-member safety, the QA gate temporarily patches the demo link with `auto_create_customer_member: false` (see `DEMO_CHILDCARE_LEAD_ONLY_AUTO_OP_LINK_METADATA`). That path expects `intake_auto_operationalized: true` and Recent workload.

### Test 2D-2 — Second submit (dedup attach)

1. Open same embed URL again.
2. Submit with **same guardian email + same child first/last name** (different medication details OK).
3. Use a **different** unique suffix if testing email-only dedup is insufficient — child name must match.

**Expected:**

| Check | Expected |
|-------|----------|
| `/adminV2/forms` → **Recent** pill | Second row — “Existing family matched” |
| Same opportunity_id | Matches Test 2D-1 opportunity |
| Payload meta | `intake_needs_review: false`, `intake_opportunity_match: attached_existing` |
| No duplicate open opportunity | One opportunity for person + child + location |

---

## IC-5.6 — Enrollment Lead proof (canonical opportunity path)

**Medication Authorization** remains the review-required child/member path (IC-4). For proving forms create real leads/opportunities, use the guardian-only demo form instead.

| Field | Value |
|-------|-------|
| **Form id** | `7cb6bd8f-8579-4a2b-8a64-969b4a37b457` |
| **Public link id** | `81f5ba41-1619-4b39-9b1c-d282ba5e79a5` |
| **Form key** | `enrollment_lead_capture_demo` |
| **Form name** | Enrollment Lead — Demo |
| **Embed token** | `alloy_demo_enrollment_lead_capture_v1__org_93667019-bd28-49b5-a688-acc9bb1e0a19` |
| **Embed URL** | `http://localhost:3000/forms/embed/alloy_demo_enrollment_lead_capture_v1__org_93667019-bd28-49b5-a688-acc9bb1e0a19` |

Prepare + gate:

```bash
cd web && npx tsx --tsconfig tsconfig.json scripts/prepareDemoChildcareEnrollmentLeadIntakeTest.ts
cd web && npx tsx --tsconfig tsconfig.json scripts/qaEnrollmentLeadOpportunityProof.ts
```

| Check | Expected |
|-------|----------|
| Public submit | Succeeds |
| `opportunities` row | Created with `status_key: new`, enrollment work unit |
| Workload | **Recent** (auto-operationalized) |
| Case subtitle | “New lead created” |
| Quick review | “New lead created” + open path via `opportunity_id` |
| Workflow events | `form_submitted`, `intake_case_created`, `intake_case_operationalized` |
| Child member | **Not** auto-created |

---

## Where to verify in UI

| Surface | Path |
|---------|------|
| Workload hub | `/adminV2/forms` → Review / Recent pills |
| First submit narrative | “New enrollment lead created” (med path: **Needs Review** because child member auto-created) |
| Second submit narrative | “Existing family matched” |
| Form inbox | `/adminV2/forms/8432c527-8799-4a55-88c7-f860bd78e747/submissions` |
| Submission detail | `/adminV2/forms/8432c527-8799-4a55-88c7-f860bd78e747/submissions/{submissionId}` |
| Enrollment queue | AdminV2 → Enrollment department → enrollment_pipeline work unit |
| Operator debug | `/adminV2/forms` → expand **Operator notes** → Browser workload debug |

---

## Acceptance

- [ ] No Alloy Bend IDs in form/link/submission/opportunity chain
- [ ] Browser org = Demo Childcare Co = data org
- [ ] First submit visible in Review with operational narrative
- [ ] Second submit visible in Recent, attaches to same opportunity
- [ ] Quick review opens centered modal
- [ ] Runtime behavior matches Test 1C/1D pattern in correct org

---

## Related

- [forms_runtime_test_2c_ui_data_mismatch.md](./forms_runtime_test_2c_ui_data_mismatch.md) — why Alloy Bend rows were invisible in Demo session
- [forms_runtime_test_1_external_intake_opportunity.md](./forms_runtime_test_1_external_intake_opportunity.md) — intake pipeline reference
