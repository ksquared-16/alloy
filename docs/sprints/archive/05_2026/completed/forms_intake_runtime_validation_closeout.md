# Forms intake — runtime validation plan

**Status:** **Closed** — Forms intake runtime validation sprint (2026-05-27)  
**Scope:** Manual QA path + configuration doctrine for public/embed/packet submission outcomes. **No OCR.** **No default opportunity creation.**

**Validated:** Embed intake → opportunity create + dedup attach (Alloy Bend Test 1C/1D; Demo Childcare Co Test 2D). Workload Review/Recent lanes, centered quick review, operator narratives.

**Active validation org:** Demo Childcare Co — [Test 2D](../sprints/archive/05_2026/forms_runtime_test_2d_demo_childcare_intake.md).

**Next sprint:** [Intake Case Operational Model](../sprints/archive/05_2026/forms_intake_case_operational_model.md) — case grouping, outcome config UI, workflow events (deferred).

Aligns with [forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md), [forms-intake-embed-doctrine.md](./forms-intake-embed-doctrine.md), and [../sprints/archive/05_2026/forms_runtime_test_1_external_intake_opportunity.md](../sprints/archive/05_2026/forms_runtime_test_1_external_intake_opportunity.md).

---

## Doctrine: submission outcomes are configurable

A submitted form **does not** automatically become a new Opportunity. CRM side effects run only when the **distribution link** (or packet launch) metadata enables intake and the relevant auto-create flags.

| Outcome | When | Configuration surface |
|---------|------|------------------------|
| **Store submission only** | Default | No `lead_capture` / `intake`; all `auto_create_*` false |
| **Create / attach Person** | Intake enabled | `auto_create_person: true` on link metadata |
| **Create / attach Customer** | Intake enabled | `auto_create_customer: true` |
| **Create Customer member (child)** | Intake + child hints | `auto_create_customer_member: true` + `intake_field_paths` |
| **Create Opportunity** | Explicit opt-in | `auto_create_opportunity: true` + `default_vertical_id` |
| **Attach to existing record** | Existing-record launch | `form_context_mode: existing_record` + `source_entity_*` |
| **Packet session step** | Packet launch | `form_context_mode: packet` — session carries launch context |
| **Generate document artifact** | Post-submit operator action | Admin “Generate document” / packet review approval (existing paths) |
| **Create task** | Workflow / admin action | Registered workflow events — not implicit on submit |

**Implementation (shipped):**

- Link metadata type: `FormPublicLinkMetadata` — `web/lib/public/forms/publicFormTypes.ts`
- Auto-create flags parser: `parseIntakeAutoCreateFlags` — defaults **false** (production-safe)
- Link routing defaults: `parseIntakeLinkDefaults`, `resolveIntakeOpportunitySource` — location, work unit, department, status, embed source
- Opportunity dedup: `intakeOpportunityDedup` — open-opp match by person + optional location + child name; `intake_opportunity_match` outcome meta
- Intake apply: `applyFormIntakeSafe` — runs on final submit when `linkRequiresLeadCapture(metadata)`
- Operator debug: `buildPublicLinkIntakeDebug` — submission review technical panel

**Not shipped (future config UI):**

- First-class `submission_outcome: create_opportunity | attach_record | task | document_only` enum in admin distribution UI
- Visual admin editor for department / work unit / location routing on link mint (today: metadata JSON or seed/API patch)

Until a dedicated UI ships, operators set outcomes via **public link metadata** at mint time (API or seed scripts).

---

## Runtime Test 1 — executed results (medication demo)

**Fixture:** `medication_authorization_demo` on Alloy Bend staging — embed token `alloy_demo_medication_authorization_v1`.  
Full IDs and link metadata: [forms_runtime_test_1_external_intake_opportunity.md § Step 5](../sprints/archive/05_2026/forms_runtime_test_1_external_intake_opportunity.md).

### Test 1C — first submit → create opportunity

| Check | Result |
|-------|--------|
| submissionId | `c5e2e078-97ee-4e17-9d66-1527a9f0c46b` |
| opportunityId | `d8452586-23ea-4862-894c-9f500f390f70` |
| `intake_opportunity_match` | `created` |
| `source` / `status_key` | `embed` / `new` |
| `location_id` | `c3409d2d-0481-4e6b-939f-9c39d0a153a5` |
| `work_unit_id` | `c2b640e5-e09a-4319-9d1b-d752ebb80122` |
| `vertical_id` | `64cb7d29-ec79-494b-a4e7-d8e9b94f1fe2` |
| Workload lane | **Needs review** (`intake_needs_review: true`, new person) |

### Test 1D — duplicate submit → attach existing

| Check | Result |
|-------|--------|
| submissionId | `50ac6911-5887-4934-9ae8-a221d61f81f6` |
| opportunityId | `d8452586-23ea-4862-894c-9f500f390f70` (same as 1C) |
| `intake_opportunity_match` | `attached_existing` |
| New opportunity row | None |
| Workload lane | **Recently submitted** (`intake_needs_review: false`, email match) |

### Lane routing (inbox)

| Lane | Trigger (submitted rows) |
|------|--------------------------|
| **Needs review** | `intake_needs_review: true` or linkage `needs_review` — e.g. new person on first cold submit |
| **Recently submitted** | CRM FKs populated, no review flag — e.g. dedup attach on second submit |
| **Needs linking** | Missing person/customer/opportunity FKs or explicit linking attention |

Resolver: `resolveSubmissionInboxLane` — `web/lib/forms/submissionInboxPresentation.ts`.

---

## Configuration model (link metadata)

```json
{
  "form_context_mode": "lead_capture | existing_record | document_update | packet",
  "lead_capture": true,
  "intake": true,
  "mode": "intake",
  "default_vertical_id": "<uuid>",
  "default_opportunity_status_key": "new",
  "default_location_id": "<uuid>",
  "default_work_unit_id": "<uuid>",
  "default_department_id": "<uuid>",
  "intake_opportunity_source": "embed",
  "intake_field_paths": { "child_first_name": "values.child_first_name", ... },
  "auto_create_person": true,
  "auto_create_customer": true,
  "auto_create_customer_member": true,
  "auto_create_opportunity": true,
  "prefill_enabled": true,
  "prefill_field_map": { "child_first_name": "customer_member.first_name" },
  "source_entity_type": "opportunity",
  "source_entity_id": "<uuid>",
  "embed_mode": true
}
```

| Key | Role |
|-----|------|
| `form_context_mode` | Launch context stamped to `payload.meta` |
| `lead_capture` / `intake` / `mode` | Gate `applyFormIntakeSafe` on final submit |
| `default_vertical_id` | Required for opportunity create |
| `default_opportunity_status_key` | Opportunity `status_key` when created |
| `default_location_id` | Opportunity `location_id` when created |
| `default_work_unit_id` | Opportunity `work_unit_id` when created (validated against department when both set) |
| `default_department_id` | Validates work unit belongs to department; mismatch omits work unit + flags review |
| `intake_opportunity_source` | Explicit opportunity `source` override (`embed` \| `public_form`) |
| `intake_field_paths` | Maps `payload.values` → guardian/child intake hints |
| `auto_create_*` | Fine-grained CRM row creation toggles |
| `prefill_*` / `source_entity_*` | Existing-record hydration |
| `embed_mode` | Embed chrome; with `intake_opportunity_source` sets opportunity `source` |

**Source labels:** Opportunity `source` is set in `applyFormIntakeSafe` via `resolveIntakeOpportunitySource` — `intake_opportunity_source` override, else `embed_mode: true` → `embed`, else `public_form`. Packet/embed distinction also via stamped `form_context_mode` and link provenance.

---

## Validation fixture form

Canonical schema: `web/lib/forms/seeds/intakeRuntimeValidationDemo.ts`

| Field | Expected behavior |
|-------|-------------------|
| Child first name | Prefilled when context + `prefill_field_map` |
| Child last name | Prefilled when context exists |
| Child DOB | Blank / manual allowed (`required: false`) |
| Guardian name | Prefilled or manual |
| Signature | Required |
| Notes | Blank / manual optional |

Metadata templates in the same file:

- `INTAKE_RUNTIME_VALIDATION_LINK_METADATA_STANDARD` — no CRM auto-create
- `INTAKE_RUNTIME_VALIDATION_LINK_METADATA_OPPORTUNITY_INTAKE` — full intake + opportunity
- `INTAKE_RUNTIME_VALIDATION_LINK_METADATA_EXISTING_RECORD` — prefill from bound entity
- `INTAKE_RUNTIME_VALIDATION_LINK_METADATA_EMBED` — embed smoke
- `INTAKE_RUNTIME_VALIDATION_LINK_METADATA_PACKET_STEP` — packet step baseline

Seed into a staging org via AdminV2 publish + link mint, or extend a org seed script mirroring `seedMedicationAuthorizationDemoForOrg.ts`.

---

## Validation checklist (Part C)

### 1. Prefilled fields

- [ ] Mint **existing-record** link with `prefill_enabled` + `prefill_field_map` against a customer_member
- [ ] Open public or embed URL — child first/last and guardian name hydrate when CRM data exists
- [ ] Submit — prefilled values persist in `payload.values`; review shows source context in technical panel

### 2. Blank / manual fields

- [ ] Child DOB and Notes render empty on cold launch
- [ ] Recipient can enter values; required signature blocks submit until complete
- [ ] Draft PATCH preserves manual entries

### 3. Public form submission

- [ ] Mint **standard** link (`auto_create_*` all false)
- [ ] Complete and submit via `/forms/public/[token]` (or equivalent public route)
- [ ] Submission appears in AdminV2 inbox — **no** opportunity row unless metadata enabled

### 4. Iframe / embed submission

- [x] Medication demo: load `/forms/embed/alloy_demo_medication_authorization_v1` — **Test 1C/1D passed**
- [ ] Mint link with `embed_mode` + allowed origin on `form_public_links.allowed_embed_origins`
- [ ] Load `/forms/embed/[token]` in iframe host (or admin preview with `preview=1`)
- [ ] Submit — same payload path as public; origin checks pass

### 5. Submission → opportunity creation (opt-in only)

- [x] Medication demo link with intake metadata + routing defaults — person/customer/member/opportunity FKs on submit (**Test 1C**)
- [x] Second submit same guardian + child + location — same opportunity, `attached_existing` (**Test 1D**)
- [ ] Mint link with `INTAKE_RUNTIME_VALIDATION_LINK_METADATA_OPPORTUNITY_INTAKE` + valid `default_vertical_id`
- [ ] Repeat with **standard** metadata — confirm **no** opportunity created

### 6. Enrollment packet run-through

- [ ] Use `minimal_packet_proof` seed (`scripts/seedMinimalPacketProofForOrg.ts`) or production packet definition
- [ ] Launch from opportunity drawer; complete step 1 → step 2
- [ ] Packet session → `completed`; review rollup loads
- [ ] Approve → PDF generation for mapped steps; Documents tab shows provenance

---

## Surfaces under test

| Surface | Route / component | Notes |
|---------|-------------------|-------|
| Admin composition preview | `DocumentCompositionPreview` | Layout fidelity only until runtime pass |
| Admin native preview | Form detail toolbar | Recipient-facing preview |
| Public link | `/api/public/forms/[token]/**` | Authoritative submit path |
| Embed | `/forms/embed/[token]` | Same renderer; CSP / origin |
| Submission inbox | `/adminV2/forms` workload filters | Needs review / linking |
| Review / finalize | Submission case-file UI | Outcome summary + technical panel |
| Packet review | `/adminV2/forms/packets/[id]` | Rollup + approve/reject |

---

## Explicit non-goals (FD-14)

- OCR / PDF recreation
- Drag/drop composition reorder
- Public renderer reading `document_composition` (still staged)
- Forcing every submission to create an opportunity

---

## Remaining known gaps (post sprint closeout)

Validated on **embed + medication demo + opportunity create/dedup** in Demo Childcare Co (Test 2D). Still open for **next sprint**:

| Gap | Notes |
|-----|-------|
| **Intake Case operational model** | Workload still lists raw submissions — grouping by case/opportunity deferred |
| **Outcome configuration UI** | Link metadata still set via seed/API patch, not visual admin panel |
| **Rich text inline field tokens** | Composition authoring does not emit inline tokens for public render |
| **Public `document_composition`** | Embed/public renderer uses flat `schema_json` |
| **Packet runtime** | Enrollment / minimal packet step intake not validated |
| **Review → document generate** | Full case-file finalize path not validated in Test 2D |
| **AI document recreation** | Planning doc only |

Prefilled fields, blank/manual fields, standard (no CRM) link, and packet run-through checklist items remain **unchecked** for FD-14 fixture form.

---

## Related

- [forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md)
- [forms-intake-embed-doctrine.md](./forms-intake-embed-doctrine.md)
- [forms-intake-runtime-phase.md](./forms-intake-runtime-phase.md)
- [../sprints/archive/05_2026/forms_runtime_test_1_external_intake_opportunity.md](../sprints/archive/05_2026/forms_runtime_test_1_external_intake_opportunity.md)
- [../product/documents-and-forms.md](../product/documents-and-forms.md)
- [../sprints/archive/05_2026/forms_intelligence_document_infrastructure.md](../sprints/archive/05_2026/forms_intelligence_document_infrastructure.md)

---

## When this doc must be updated

New intake outcome types; admin UI for distribution outcomes; public renderer composition pass; embed route changes; packet intake inheritance rules.
