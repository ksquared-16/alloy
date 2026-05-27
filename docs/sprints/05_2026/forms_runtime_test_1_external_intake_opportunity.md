# Forms Runtime Test 1 — External intake creates opportunity

**Status:** Active runbook (manual QA)  
**Scope:** One end-to-end path only — no new product features.

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
   - **`source`:** hardcoded `"public_form"` in `applyFormIntakeSafe` (not link-configurable today)  
   - **`location_id` / `work_unit_id` on opportunities:** **not set** by form intake — **gap** (columns exist on `opportunities` but intake path does not populate them)

5. **What duplicate prevention exists?**  
   - **Person:** email/phone match before create; ambiguous multi-match → no CRM FKs, needs review  
   - **Customer:** reuse via `customer_persons` when person already linked  
   - **Opportunity:** **no dedup** by email + child + location — each new submission with `auto_create_opportunity: true` inserts a **new** opportunity unless `form_submissions.opportunity_id` was already set on the draft (existing-record / packet attach flows)  
   - **`idempotency_key`:** stored in opportunity `metadata` only (trace); **not** used to block duplicate inserts

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
| `source` | `public_form` |
| `vertical_id` | Link `default_vertical_id` |
| `location_id` | **null** (not implemented) |
| `work_unit_id` | **null** (not implemented) |
| `primary_person_id` | Guardian person |
| `customer_id` | Household customer |
| `metadata.form_intake` | `true` |
| `metadata.idempotency_key` | Submission UUID (trace only) |

Child `customer_member` + `opportunity_customer_members` row when child fields present and `auto_create_customer_member: true`.

### Duplicate test expectation

Submit **twice** with the same guardian email and child name → **expect two opportunities** today. Document as **known gap** until dedup is implemented.

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

- [ ] `form_submissions.status = submitted`
- [ ] `payload.values` contains your answers
- [ ] `payload.signatures` contains guardian signature (if captured)
- [ ] `person_id`, `customer_id`, `opportunity_id` populated on submission row
- [ ] One new opportunity row (first submit)
- [ ] Second submit with same data → second opportunity (**expected gap**)
- [ ] Inbox lane matches linkage (`needsReview` vs `recentlySubmitted`)
- [ ] `location_id` / `work_unit_id` on opportunity remain null (**expected gap**)

---

## Out of scope (Test 1)

- OCR, drag/drop, composition editor changes
- Work unit / location assignment from link metadata (not implemented — do not hack without explicit sprint)
- Opportunity dedup by email + child + location (not implemented)

---

## Related

- [forms-intake-runtime-validation.md](../system/forms-intake-runtime-validation.md)
- [forms-intake-prefill-doctrine.md](../system/forms-intake-prefill-doctrine.md)
- [forms-intake-embed-doctrine.md](../system/forms-intake-embed-doctrine.md)
