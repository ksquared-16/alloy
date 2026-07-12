# Forms intake — contextual prefill doctrine

**Status:** Active (OI-5)  
**Scope:** Deterministic, context-driven prefill only — no AI, no new migrations.

Aligns with BOS operational cognition: explain **where values come from**, **what operators may edit**, and **what stays locked** until review.

---

## Sources of truth (precedence, highest wins at render)

| Priority | Source | When applied |
|----------|--------|--------------|
| 1 | **Saved draft baseline** | Recipient continues an in-progress submission; server baseline wins on PATCH for `read_only` fields |
| 2 | **Explicit operator override** | Admin manual corrections on submission CRM links (post-submit) — not field prefill |
| 3 | **Launch context stamp** | `form_public_links.metadata` copied into `payload.meta` at draft create (`stampFormContextFromLinkMetadata`) |
| 4 | **Entity-bound hydration** | CRM/person/customer/opportunity fields resolved from `source_entity_type` + `source_entity_id` when `prefill_enabled` |
| 5 | **Packet session shared values** | Packet steps inherit `shared_values` / prior step answers within a session |
| 6 | **Empty** | Field renders blank; intake may attach records post-submit |

**Rule:** Never invent values. If a source is missing or ambiguous, leave blank and surface linkage/intake flags for operator review.

---

## Launch context fields (existing)

Stored on public link metadata and stamped to submission `payload.meta`:

- `form_context_mode` — `lead_capture` | `existing_record` | `document_update` | `packet`
- `source_entity_type` / `source_entity_id` — bound CRM entity for existing-record flows
- `prefill_enabled` — allow known-value hydration from entity
- `allow_auto_create` — intake may create CRM rows (subject to vertical config)
- `packet_definition_id` — packet-bound launch

See `web/lib/forms/formContextMode.ts`.

---

## Editable vs locked

| Field state | Recipient | Operator (admin) |
|-------------|-----------|------------------|
| Default | Editable unless schema marks `read_only` | N/A |
| `read_only: true` in schema | Display only; PATCH restores baseline | Cannot override via public PATCH |
| Post-submit answers | Locked after submit | Read-only in case-file review |
| CRM links | N/A | Correctable via linkage review workflow |
| Prefilled from CRM | Editable unless `read_only` | Audit via technical disclosure |

---

## Packet launch context

When a packet public link is minted:

1. Session row carries `launch_context` / `crm_snapshot` (existing).
2. Each step submission inherits packet session metadata.
3. Operator review rollup compares submitted values vs CRM snapshot (deterministic diff — existing P2 behavior).

No new session semantics in OI-5 — document only.

---

## Future AI enrichment boundaries (not in scope)

| Allowed later | Never automatic |
|---------------|-----------------|
| Summarize intake for review assist | Apply CRM mutations |
| Suggest likely linkage candidate | Confirm linkage without operator |
| Draft operator note text | Publish form versions |
| Rank inbox items | Generate PDFs without permission |

BOS Phase 3+ may **propose**; platform APIs and operator actions remain authoritative.

---

## Implementation inventory (partial wire)

| Surface | Status |
|---------|--------|
| Link metadata stamp | Shipped (`stampFormContextFromLinkMetadata`) |
| Submission meta display | Shipped (`SubmissionReviewTechnicalPanel`, intake section) |
| Entity-bound prefill hydration | Existing public resolver paths — not expanded in OI sprint |
| Builder “context preview” | OI-4 presentation target |

---

## Related

- `docs/product/documents-and-forms.md`
- `docs/product/bos-foundation.md`
- `docs/system/forms-intake-runtime-validation.md` — outcome doctrine + QA checklist (FD-14)
- `docs/system/forms-intake-runtime-phase.md` — phase operating model + Tests 2–5
- `docs/sprints/archive/05_2026/forms_operational_intelligence_workflow_polish.md`
