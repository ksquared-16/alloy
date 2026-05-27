# Forms Runtime Test 1 — External intake creates opportunity

**Status:** **Closed** — Runtime Test 1C/1D passed on Alloy Bend staging (2026-05-27)  
**Scope:** One end-to-end path only — external embed intake → opportunity create + dedup attach.

**Shipped fixes:** Test 1C routing (`parseIntakeLinkDefaults`, `intakeOpportunityDedup`, wired in `applyFormIntakeSafe`).

---

## Step 1 — Current runtime capability (audit)

### Routes

| Surface | Path | Notes |
|---------|------|-------|
| **Public UI (only)** | `/forms/embed/[token]` | `web/app/forms/embed/[token]/page.tsx` → `FormEmbedClient` |
| **Public API — resolve** | `GET /api/public/forms/[token]/resolve` | Schema + option sets bootstrap |
| **Public API — draft** | `POST /api/public/forms/[token]/submissions` | Creates draft row |
| **Public API — patch draft** | `PATCH /api/public/forms/[token]/submissions/[submissionId]` | Saves values/signatures |
| **Public API — submit** | `POST /api/public/forms/[token]/submissions/[submissionId]/submit` | Final submit + intake |

There is **no** separate non-embed public page — recipients use the embed URL (works in a top-level browser tab or iframe).

### Opportunity creation

Runs on final submit when **`linkRequiresLeadCapture(metadata)`** is true (`lead_capture`, `intake`, or `mode: intake|lead_capture` on `form_public_links.metadata`).

Pipeline:

1. `buildFormIntakeMetaFromPayload` — maps `payload.values` → `payload.meta.intake` (needs `default_vertical_id` + guardian email or phone)
2. `applyFormIntakeSafe` — person match/create → customer → opportunity (if flags allow)

Key files:

- `web/app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts`
- `web/lib/forms/intake/buildFormIntakeMetaFromPayload.ts`
- `web/lib/forms/intake/applyFormIntakeSafe.ts`
- `web/lib/forms/intake/parseIntakeLinkDefaults.ts`
- `web/lib/forms/intake/intakeOpportunityDedup.ts`
- `web/lib/public/forms/publicFormTypes.ts`
- `web/lib/forms/intake/parseIntakeAutoCreateFlags.ts`

### Answers to the five audit questions

1. **What URL to open?**  
   `https://<app-host>/forms/embed/<plaintext_token>`  
   Optional admin preview banner: append `?preview=1`.

2. **Is iframe route implemented?**  
   **Yes** — same URL serves iframe and direct browser navigation. Origin allowlist on `form_public_links.allowed_embed_origins` applies to API calls (empty allowlist = all origins pass).

3. **Does public submission support opportunity creation?**  
   **Yes, when configured** — `auto_create_opportunity: true` plus `lead_capture`/`intake`, `default_vertical_id`, and guardian email/phone in mapped fields. Default new links: **all auto_create flags false**.

4. **Where is location / work unit / status configured?**  
   - **`status_key`:** `default_opportunity_status_key` on link metadata (fallback `"new"`)  
   - **`vertical_id`:** `default_vertical_id` on link metadata (required)  
   - **`location_id`:** `default_location_id` on link metadata → `opportunities.location_id`  
   - **`work_unit_id`:** `default_work_unit_id` on link metadata → `opportunities.work_unit_id`  
   - **`default_department_id`:** validates work unit belongs to department; mismatch omits work unit and flags review  
   - **`source`:** `embed_mode: true` → `embed`; else `public_form` (override via `intake_opportunity_source`)

5. **What duplicate prevention exists?**  
   - **Person:** email/phone match before create; ambiguous multi-match → no CRM FKs, needs review  
   - **Customer:** reuse via `customer_persons` when person already linked  
   - **Opportunity:** before insert, match **open** opportunities for same `primary_person_id`, optional `location_id`, optional child first/last on linked `customer_members`  
     - **0 matches** → create new opportunity (`intake_opportunity_match: created`)  
     - **1 match** → attach submission (`intake_opportunity_match: attached_existing`)  
     - **2+ matches** → no opportunity FK; `intake_needs_review: true` (`ambiguous_opportunity`)  
   - **Child member on re-submit:** reuse existing member on attached opportunity when names match

---

## Step 2 — Prepare staging link (medication demo)

### Prerequisites

- Logged-in org has (or will receive) the medication authorization demo form
- Active **`verticals`** row with `slug = 'cleaning'` and `is_active = true` (required for seed intake defaults)

### Seed (from `web/`)

```bash
cd web
DEMO_RESET_ORG_ID=<your-org-uuid> npx tsx --tsconfig tsconfig.json scripts/seedMedicationAuthorizationDemoForOrg.ts
```

This idempotently:

- Publishes `medication_authorization_demo` form
- Creates or updates a public link with merged metadata from `intakeDefaultsForFormPublicLink`:
  - `lead_capture: true`
  - `auto_create_person/customer/customer_member/opportunity: true`
  - `default_vertical_id` (cleaning vertical UUID)

Script prints `embed_plaintext_token`.

### If seed already ran but intake metadata missing

Patch the link via admin API (admin role):

```http
PATCH /api/admin/forms/{formId}/public-links/{linkId}
Content-Type: application/json

{
  "metadata": {
    "lead_capture": true,
    "intake": true,
    "mode": "intake",
    "auto_create_person": true,
    "auto_create_customer": true,
    "auto_create_customer_member": true,
    "auto_create_opportunity": true,
    "default_opportunity_status_key": "new",
    "default_vertical_id": "<cleaning-vertical-uuid>"
  }
}
```

**Do not** use a plain “Share” link without intake metadata — it will store submission only.

**Preview button** on form detail mints a link with `alloy_admin_preview: true`; for medication demo it still merges intake defaults from `intakeDefaultsForFormPublicLink` when form key matches.

### Required form values for intake (medication demo)

Intake reads default field ids (`guardian_email`, `guardian_phone`, `guardian_full_name`, `child_first_name`, `child_last_name`, `child_dob`). Complete all required schema fields including medications group (min 1), acknowledgement checkbox, and guardian signature.

---

## Step 3 — Test URLs and expected outcomes

Replace `<host>` and `<token>` from seed output.

| URL | Purpose |
|-----|---------|
| `https://<host>/forms/embed/<token>` | Primary test (external intake) |
| `https://<host>/forms/embed/<token>?preview=1` | Same + admin preview banner |

### Expected opportunity (when intake succeeds)

| Field | Expected |
|-------|----------|
| `name` | Guardian full name, or email/phone fallback |
| `status` | `open` |
| `status_key` | Link `default_opportunity_status_key` or `"new"` |
| `source` | `embed` when `embed_mode: true` or `intake_opportunity_source: "embed"`; else `public_form` |
| `vertical_id` | Link `default_vertical_id` |
| `location_id` | Link `default_location_id` when set |
| `work_unit_id` | Link `default_work_unit_id` when set and department validates |
| `primary_person_id` | Guardian person |
| `customer_id` | Household customer |
| `metadata.form_intake` | `true` |
| `payload.meta.intake_opportunity_match` | `created` (first open opp) or `attached_existing` (dedup hit) |

Child `customer_member` + `opportunity_customer_members` row when child fields present and `auto_create_customer_member: true`.

### Duplicate test expectation

Submit **twice** with the same guardian email, child first/last, and configured `default_location_id` → **same** `opportunity_id` on both submissions; second submit sets `intake_opportunity_match: attached_existing`. No second open opportunity row for the same person + child + location.

### Where to verify in AdminV2

| Check | Location |
|-------|----------|
| Submission row | `/adminV2/forms/{formId}/submissions` or form detail → **Submissions** |
| Submission detail / signatures / intake debug | `/adminV2/forms/{formId}/submissions/{submissionId}` |
| Workload hub | `/adminV2/forms` → filter **Needs review** or **Recently submitted** |
| Opportunity FK on submission | Submission detail → entity connections / technical panel (`auto_create_opportunity`, `intake_resolution_path`) |
| CRM opportunity | Opportunity drawer (search by guardian name or open from submission link if wired) |

Successful intake with new person typically lands in **Needs review** (`intake_needs_review: true` in payload meta).

---

## Step 4 — Manual submit checklist

After you submit, verify:

- [x] `form_submissions.status = submitted`
- [x] `payload.values` contains your answers
- [x] `payload.signatures` contains guardian signature (if captured)
- [x] `person_id`, `customer_id`, `opportunity_id` populated on submission row
- [x] One new opportunity row (first submit — Test 1C)
- [x] Second submit with same data → same `opportunity_id` (`attached_existing` — Test 1D)
- [x] Inbox lane matches linkage (`needsReview` vs `recentlySubmitted`)
- [x] `location_id` / `work_unit_id` / `source` on opportunity match link metadata (Test 1C+)

---

## Step 5 — Closeout (Test 1C / 1D — Alloy Bend staging)

**Org:** Alloy Bend `7803388d-cdee-4afb-89cf-23a137f39423`  
**Form:** `medication_authorization_demo` — `e68e0160-3157-44fd-b207-2c0f14d1764f`  
**Public link:** `1fb46b72-a5ce-43ad-9fb5-80ffe9528ffa`  
**Token:** `alloy_demo_medication_authorization_v1`  
**Embed URL:** `http://localhost:3000/forms/embed/alloy_demo_medication_authorization_v1`

### Link routing metadata (patched before Test 1C)

| Key | Value |
|-----|-------|
| `default_vertical_id` | `64cb7d29-ec79-494b-a4e7-d8e9b94f1fe2` (Cleaning) |
| `default_location_id` | `c3409d2d-0481-4e6b-939f-9c39d0a153a5` (Please Work — 97701) |
| `default_work_unit_id` | `c2b640e5-e09a-4319-9d1b-d752ebb80122` (Enrollment pipeline) |
| `default_department_id` | `2d8e99ae-da3d-49ed-8238-614edf07dd6c` (Growth) |
| `default_opportunity_status_key` | `new` |
| `embed_mode` | `true` |
| `intake_opportunity_source` | `embed` |

### Test 1C — First submit (create opportunity)

| Field | Result |
|-------|--------|
| **submissionId** | `c5e2e078-97ee-4e17-9d66-1527a9f0c46b` |
| **opportunityId** | `d8452586-23ea-4862-894c-9f500f390f70` |
| **submitted_at** | 2026-05-27 18:09:16 UTC |
| **Test identity** | Guardian `forms-test-002@example.com`; child Daffy / Duck |
| **intake_opportunity_match** | `created` |
| **opportunity.source** | `embed` |
| **opportunity.status_key** | `new` |
| **opportunity.location_id** | `c3409d2d-0481-4e6b-939f-9c39d0a153a5` |
| **opportunity.work_unit_id** | `c2b640e5-e09a-4319-9d1b-d752ebb80122` |
| **opportunity.vertical_id** | `64cb7d29-ec79-494b-a4e7-d8e9b94f1fe2` |

**Lane routing (1C):** **Needs review** — `intake_needs_review: true`, `intake_resolution_path: created_records` (new person created from form). CRM FKs populated; operator review required before document generation.

**Submission detail:** `/adminV2/forms/e68e0160-3157-44fd-b207-2c0f14d1764f/submissions/c5e2e078-97ee-4e17-9d66-1527a9f0c46b`

### Test 1D — Duplicate submit (attach existing)

| Field | Result |
|-------|--------|
| **submissionId** | `50ac6911-5887-4934-9ae8-a221d61f81f6` |
| **opportunityId** | `d8452586-23ea-4862-894c-9f500f390f70` (**same as 1C**) |
| **submitted_at** | 2026-05-27 18:22:17 UTC |
| **intake_opportunity_match** | `attached_existing` |
| **New opportunity created** | **No** — one open opp for person + location; two submissions on same opp |
| **Routing fields on opp** | Unchanged — still `embed` / `new` / configured location + work unit |

**Lane routing (1D):** **Recently submitted** — `intake_needs_review: false`, `intake_resolution_path: matched_email`, all CRM FKs set. Dedup attach does not re-flag new-person review.

**Submission detail:** `/adminV2/forms/e68e0160-3157-44fd-b207-2c0f14d1764f/submissions/50ac6911-5887-4934-9ae8-a221d61f81f6`

### Lane routing summary

Inbox lanes (`resolveSubmissionInboxLane` in `submissionInboxPresentation.ts`):

| Lane | When |
|------|------|
| **Needs review** | Submitted + linkage kind `needs_review` (e.g. new person auto-created, ambiguous match, work-unit/dept mismatch) |
| **Recently submitted** | Submitted + CRM linked + no review flag |
| **Needs linking** | Submitted + missing CRM attach targets |

Test 1C → Needs review (expected for cold guardian create). Test 1D → Recently submitted (email match + attach existing).

### Test 1C routing fix (root cause)

Initial Test 1 submit after metadata patch still wrote `source: public_form` and null location/work unit because **`parseIntakeLinkDefaults` / `intakeOpportunityDedup` were not wired in `applyFormIntakeSafe`**. Submit route was correct (`applyFormIntakeSafe` + live link metadata); opportunity insert path was Card-8-era hardcoded logic. Fixed in Test 1C code pass; verified after dev server restart.

---

## Remaining known gaps (post Test 1)

Not in scope for Runtime Test 1 — track separately:

- **Forms hub UI polish regression** — layout/filter presentation on `/adminV2/forms` needs follow-up polish pass
- **Rich text inline field tokens** — not built (composition authoring only)
- **Public renderer `document_composition`** — admin preview only; embed/public submit path still uses flat `schema_json` fields
- **Packet runtime** — enrollment/minimal packet intake not validated in this test series
- **Review / finalize flow** — submission case-file approve → document generate path not validated here

---

## Out of scope (Test 1)

- OCR, drag/drop, composition editor changes
- Packet step intake inheritance
- Admin distribution outcome UI (metadata/API/seed only)

---

## Related

- [forms-intake-runtime-phase.md](../system/forms-intake-runtime-phase.md) — **phase operating model + Tests 2–5 plan**
- [forms-intake-runtime-validation.md](../system/forms-intake-runtime-validation.md)
- [forms-intake-prefill-doctrine.md](../system/forms-intake-prefill-doctrine.md)
- [forms-intake-embed-doctrine.md](../system/forms-intake-embed-doctrine.md)
