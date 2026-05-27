# Forms intake — runtime validation plan

**Status:** Active (FD-14)  
**Scope:** Manual QA path + configuration doctrine for public/embed/packet submission outcomes. **No OCR.** **No default opportunity creation.**

Aligns with [forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md) and [forms-intake-embed-doctrine.md](./forms-intake-embed-doctrine.md).

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
- Intake apply: `applyFormIntakeSafe` — runs on final submit when `linkRequiresLeadCapture(metadata)`
- Operator debug: `buildPublicLinkIntakeDebug` — submission review technical panel

**Not shipped (future config UI):**

- First-class `submission_outcome: create_opportunity | attach_record | task | document_only` enum in admin distribution UI
- Department / work unit mapping on intake outcome (today: vertical + status_key on metadata)

Until a dedicated UI ships, operators set outcomes via **public link metadata** at mint time (API or seed scripts).

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
| `intake_field_paths` | Maps `payload.values` → guardian/child intake hints |
| `auto_create_*` | Fine-grained CRM row creation toggles |
| `prefill_*` / `source_entity_*` | Existing-record hydration |
| `embed_mode` | Embed chrome (renderer unchanged) |

**Source labels:** Opportunity `source` is set server-side (`public_form` today in intake paths). Packet/embed distinction is via stamped `form_context_mode` and link provenance — not a separate hardcoded branch per form.

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

- [ ] Mint link with `embed_mode` + allowed origin on `form_public_links.allowed_embed_origins`
- [ ] Load `/forms/embed/[token]` in iframe host (or admin preview with `preview=1`)
- [ ] Submit — same payload path as public; origin checks pass

### 5. Submission → opportunity creation (opt-in only)

- [ ] Mint link with `INTAKE_RUNTIME_VALIDATION_LINK_METADATA_OPPORTUNITY_INTAKE` + valid `default_vertical_id`
- [ ] Submit with guardian + child hints
- [ ] Verify person/customer/member/opportunity FKs on submission row
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

## Related

- [forms-intake-prefill-doctrine.md](./forms-intake-prefill-doctrine.md)
- [forms-intake-embed-doctrine.md](./forms-intake-embed-doctrine.md)
- [../product/documents-and-forms.md](../product/documents-and-forms.md)
- [../sprints/05_2026/forms_intelligence_document_infrastructure.md](../sprints/05_2026/forms_intelligence_document_infrastructure.md)

---

## When this doc must be updated

New intake outcome types; admin UI for distribution outcomes; public renderer composition pass; embed route changes; packet intake inheritance rules.
