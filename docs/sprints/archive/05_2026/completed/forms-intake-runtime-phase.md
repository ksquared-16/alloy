# Forms intake — runtime phase operating model

**Status:** Active (post Runtime Test 1 closeout · May 2026)  
**Scope:** Operating doctrine for external intake, distribution context, outcomes, and the **next manual runtime test sequence**. No new product features in this document.

**Completed:** [Runtime Test 1](../sprints/archive/05_2026/forms_runtime_test_1_external_intake_opportunity.md) — embed intake → opportunity create + dedup attach (medication demo, Alloy Bend staging).

**Related doctrine:** [forms-intake-embed-doctrine.md](./forms-intake-embed-doctrine.md) · [forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md) · [forms-intake-runtime-validation.md](./forms-intake-runtime-validation.md)

---

## 1. Iframe / embed runtime

| Principle | Rule |
|-----------|------|
| **Distribution surface** | Iframe/embed is an **external** distribution surface for recipients outside the Alloy admin shell. Primary route: `/forms/embed/[token]` (same renderer engine as public token APIs). |
| **Admin stays native** | AdminV2 **authoring**, **composition editing**, **submission review**, **packet review**, and **Generate document** remain **native React** in the Alloy shell — never iframe-wrapped. |
| **Shared renderer** | Embed and public submit share the **same public runtime renderer** and API path (`/api/public/forms/[token]/**`). Embed shell adds minimal chrome, branding, and origin allowlist — not a second field engine. |
| **Security** | Token-scoped public links only; no service-role in iframe; prefill/CRM hydration does not widen for embed hosts. |

See [forms-intake-embed-doctrine.md](./forms-intake-embed-doctrine.md) for shell boundaries and staging notes.

---

## 2. Location / context resolution

| Principle | Rule |
|-----------|------|
| **Reusable definition** | A **`form_definition`** (+ published version) is **org-scoped and reusable**. It does not embed site, department, or campaign context. |
| **Context from distribution** | **Location, work unit, vertical, launch entity, and intake flags** come from the **distribution artifact** — not from the form definition row alone. |
| **Resolution sources** (highest specificity wins at launch; combine only where metadata explicitly merges) | |

**Context resolution sources:**

| Source | Carries |
|--------|---------|
| **`form_public_links.metadata`** | `default_vertical_id`, `default_location_id`, `default_work_unit_id`, `default_department_id`, `default_opportunity_status_key`, `lead_capture` / `auto_create_*`, `embed_mode`, `intake_field_paths`, `form_context_mode`, `source_entity_*` |
| **Selected location** | Operator- or recipient-selected site/address context when minted or stamped on link/session |
| **Portal session** | Authenticated portal launch context (entity bindings, household) when wired |
| **Campaign / workflow launch** | Workflow or admin action that mints a link with stamped metadata |
| **Packet instance** | `form_packet_sessions` launch context + `crm_snapshot`; step links inherit session metadata |

**Runtime Test 1 proved:** link metadata → `applyFormIntakeSafe` → opportunity `location_id`, `work_unit_id`, `source`, `status_key` (see Test 1 closeout).

**Not yet validated:** portal-selected location, campaign mint, or packet-instance location override on cold embed submit.

---

## 3. Workflow outcomes

Submission finalization is **config-driven**. A single submit may combine several effects; not all run by default.

| Outcome | When | Primary path |
|---------|------|--------------|
| **Store submission only** | Default / standard link | Payload persisted; no CRM auto-create |
| **Create / attach Person, Customer, member** | `lead_capture` + `auto_create_*` | `applyFormIntakeSafe` on submit |
| **Create Opportunity** | `auto_create_opportunity: true` + `default_vertical_id` + guardian identifiers | `applyFormIntakeSafe` |
| **Attach to existing opportunity** | Dedup match (person + optional location + child name) or explicit launch `opportunity_id` on draft | `intakeOpportunityDedup` / existing-record launch |
| **Attach to packet session** | Packet step submit | `form_packet_session_items` + session advance |
| **Emit workflow event** | After submit / sign / document generate | `form_submitted`, `form_signed`, `form_document_generated` (`entity_type = form_submissions`) |
| **Create task** | Registered workflow actions or admin action — **not implicit** on every submit | Workflow engine / admin actions |
| **Require operator review** | Intake ambiguity, new person, linkage flags | `intake_needs_review` → inbox **Needs review** lane |

**Lead intake doctrine:** Cold embed lead capture with opportunity auto-create should:

1. Create (or attach) person → customer → opportunity with link routing defaults.
2. Emit **`form_submitted`** with submission + opportunity FKs in payload.
3. Surface the opportunity in the configured **work unit / queue** — for Growth cleaning demo, target lane **`new_leads`** when `default_work_unit_id` points at that work unit (Runtime Test 4 validates end-to-end).

Workflow subscriptions and queue definitions are **org config** — intake writes rows and events; lanes are downstream.

---

## 4. Prefill and packets

| Principle | Rule |
|-----------|------|
| **Packet carries record context** | Packet distribution stamps **launch context** and optional **CRM snapshot** on the session; each step submission inherits session metadata. |
| **Field states** | Per [forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md): prefilled, locked (`read_only`), editable, blank, or manually completed — precedence: draft baseline → launch stamp → entity hydration → packet shared values → empty. |
| **Trust boundary** | Public/packet values are **proposals** in `form_submissions.payload` until operator review / intake promotion rules apply. |
| **Operator diff** | Packet review rollup compares submitted values vs CRM snapshot (Phase 2 read API shipped). |

**Runtime Test 1** did not exercise packet prefill. **Test 3** validates enrollment packet with prefilled fields.

---

## 5. Rich text inline field tokens

| Principle | Rule |
|-----------|------|
| **Purpose** | Document composition **paragraph blocks** may reference canonical field keys inline, e.g. `{{guardian_full_name}}`, for narrative layout in authored documents. |
| **No duplication** | Tokens **reference** fields in `fields[]`; they do **not** create second inputs or duplicate validation. Render resolves token → current value at preview/generate time. |
| **Status** | **Not built** — composition editor supports block types and field regions; inline token parse/render in public runtime is **future** (blocked on Test 5 + composition runtime pass). |
| **Authoring today** | Admin native preview reads `document_composition`; public/embed runtime still uses flat `schema_json` fields only. |

---

## 6. AI document recreation

| Principle | Rule |
|-----------|------|
| **Future only** | AI-assisted document recreation (scan/PDF → composition) is **not** in current runtime scope. |
| **Dependency** | Requires **stable composition primitives**: block types, field regions, inline tokens, and public runtime consumption of `document_composition`. |
| **Guardrail** | BOS/AI may **propose**; platform APIs, operator review, and generate-document paths remain authoritative ([forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md)). |

---

## Remaining known gaps (post Test 1)

Track separately from the test sequence below:

- Forms hub UI polish regression on `/adminV2/forms`
- Rich text inline field tokens (§5 — not built)
- Public renderer `document_composition` consumption (§5 — admin preview only)
- Packet runtime intake + prefill (Test 3)
- Single-submission review / finalize → document (Test 2)
- Workflow event → New Lead lane (Test 4)

---

## Next runtime tests (ordered)

Manual QA only — one path per test; document results in sprint notes like Test 1.

### Test 2 — Review / finalize single submission

**Goal:** Operator completes the **single-submission** case-file loop after external intake.

**Fixture:** Test 1C submission (`c5e2e078-…`) or fresh submit in **Needs review** lane.

**Steps:**

1. Open `/adminV2/forms/{formId}/submissions/{submissionId}`.
2. Verify intake technical panel: CRM FKs, `intake_opportunity_match`, routing debug.
3. Confirm linkage review UX — operator can verify person/customer/opportunity attach.
4. **Generate document** — `POST …/submissions/{id}/generate-document` (stub PDF today).
5. Verify `documents` + `form_submission_documents` junction; **`form_document_generated`** workflow event if subscribed.

**Pass criteria:**

- [ ] Generate document succeeds when intake policy allows (not blocked by missing parent)
- [ ] Document appears on submission detail and linked entity Documents tab
- [ ] Operator can clear or acknowledge review state without breaking FKs

**Out of scope:** DCP apply, packet approve batch, real PDF engine.

---

### Test 3 — Enrollment packet with prefilled fields

**Goal:** Packet step launch **prefills** CRM-bound fields; recipient completes remainder; session advances.

**Fixture:** `seedMinimalPacketProofForOrg.ts` or enrollment packet on opportunity drawer; existing person/member on opportunity.

**Steps:**

1. Mint packet public link from opportunity with `prefill_enabled` + `prefill_field_map`.
2. Open embed URL for step 1 — verify prefilled child/guardian fields where map exists.
3. Complete blank required fields + signature; submit.
4. Advance to step 2 (if multi-step); complete session.
5. Open packet review rollup — diff vs CRM snapshot.

**Pass criteria:**

- [ ] Prefilled values match CRM; editable fields accept changes
- [ ] `read_only` fields resist PATCH override
- [ ] Session status → `completed`; rollup loads warnings
- [ ] CRM FKs on step submissions match launch context

**Out of scope:** Auto-promote payload → entity field_values; DCP.

---

### Test 4 — Workflow event from lead intake

**Goal:** Lead intake opportunity create triggers **workflow visibility** into **New Leads** lane.

**Fixture:** Medication demo (or intake runtime validation form) with routing to Growth **`new_leads`** work unit (`4e49ac35-a353-4e48-a93b-8fbe15b5e8ed` on Alloy Bend) **or** document actual configured work unit.

**Steps:**

1. Cold embed submit (unique guardian email) — opportunity create (`intake_opportunity_match: created`).
2. Confirm **`form_submitted`** row on `form_submissions` entity in activity/workflow feed.
3. Open Growth workspace → **New Leads** lane (or queue bound to opportunity work unit).
4. Locate new opportunity by name/email.

**Pass criteria:**

- [ ] `form_submitted` emitted with `opportunity_id` in payload
- [ ] Opportunity appears in expected work unit queue / lane
- [ ] No duplicate opportunity on second submit (Test 1D regression)

**Out of scope:** New workflow definition authoring; autonomous task creation.

---

### Test 5 — Public renderer consumes `document_composition`

**Goal:** Embed/public runtime renders **document layout** from `document_composition`, not only flat `sections`/`fields`.

**Prerequisite:** Staged runtime pass in code (explicit build — not Test 2–4).

**Steps:**

1. Publish form version with `document_composition` (field regions + paragraph blocks with inline tokens when available).
2. Open `/forms/embed/[token]` — layout matches admin preview structure (regions, column layout).
3. Submit — validation and payload keys unchanged (`fields[]` semantics authoritative).
4. Regression: medication demo without composition still renders.

**Pass criteria:**

- [ ] Composition blocks render in embed and top-level browser
- [ ] Field ids / validation identical to schema
- [ ] Inline tokens resolve at render (when §5 shipped)
- [ ] No admin-only composition leakage to wrong org/link

**Out of scope:** OCR / AI recreation; full WYSIWYG parity.

---

## Test sequence summary

| Test | Focus | Depends on |
|------|--------|------------|
| **1** ✅ | Embed intake → opportunity create + dedup | Shipped + verified |
| **2** | Review / finalize single submission | Test 1 submissions |
| **3** | Enrollment packet + prefill | Opportunity + packet seed |
| **4** | Workflow event → New Leads lane | Test 1 routing + queue config |
| **5** | Public `document_composition` render | Code staging pass |

---

## When this doc must be updated

New intake outcome types; public composition runtime shipped; inline token format locked; workflow/queue binding rules change; completion of Tests 2–5.
