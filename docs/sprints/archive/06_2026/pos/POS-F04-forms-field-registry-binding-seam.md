# POS-F04 — Forms ↔ Field Registry Binding Seam

> **Status:** Foundation Gate artifact — investigation result + Foundation Package 0 scope. Draft.
> **Not** a Forms refactor, a Forms redesign, POS implementation, schema, migrations, APIs, or code. Conceptual seam + package scope only.
> **Principle:** existing legacy forms keep working unchanged; **new POS-connected Forms / Documents / Packets must bind fields to the shared field registry wherever possible.**
> **Grounding:** read directly — `web/lib/forms/schema.ts` (`FormField`, `FormFieldSource`, `formFieldSchema`), `web/lib/forms/systemFieldRegistry.ts` (`OPERATIONAL_FORM_SYSTEM_FIELDS`), `web/lib/forms/validateSubmission.ts`, `web/lib/forms/prefill/prefillFieldMap.ts`, `web/lib/forms/intake/buildFormIntakeMetaFromPayload.ts`, `web/lib/forms/pdf/pdfMappingContract.ts`; plus `field_definitions` per `configuration-system.md` / `entity-model.md`.
> Branch: `pos-planning-v1`. Continues **POS-F01 Risk 2** and **POS-F03 step 1**.

## Goal

Identify the **narrowest seam** that prevents POS from deepening the Forms JSON-field divergence — without refactoring or redesigning Forms, and without starting POS implementation. The headline result: the seam already exists in the form schema (`field_source.field_key`), so the minimum binding **reuses an existing optional slot** rather than adding anything new.

---

## 1. Where Forms still define field structure in JSON

All field structure today lives in form-version JSON; the shared registry is not consulted at form runtime. Five surfaces:

| Surface | Location | Encodes |
|---------|----------|---------|
| **Form schema** | `form_definition_versions.schema_json` (`FormSchemaV1` / `FormField` in `web/lib/forms/schema.ts`) | Field `id` (arbitrary string), `type`, `label`, `required`, `validate`, `visibility`, `layout_width`, options — fully self-contained |
| **Prefill map** | link/definition `metadata.prefill_field_map` (`prefillFieldMap.ts`) | form-field-id → `entity.column` path (regex-validated roots: person/customer/customer_member/opportunity/contact) |
| **Intake paths** | link `metadata.intake_field_paths` (`buildFormIntakeMetaFromPayload.ts`) | form-field-id → lead-capture semantic fields; hardcoded `DEFAULT_FORM_INTAKE_VALUE_PATHS` |
| **PDF mapping** | `form_definition_versions.pdf_mapping_json` (`pdfMappingContract.ts`) | dot-paths into submission `payload` → PDF slots |
| **Authoring catalog** | `OPERATIONAL_FORM_SYSTEM_FIELDS` (`systemFieldRegistry.ts`) — **in-memory, hardcoded** | `field_key`, `crm_mapping_key`, default label/type/required; the source new form fields are born from |

Confirmations: `validateSubmission.ts` validates against `schema_json` only (no registry join); the form field `id` is free-form (`z.string().min(1)`), **not** a `field_definitions.field_key`; `field_definitions.is_visible_in_form` exists on the registry but Forms never query it.

## 2. Where Forms already touch (or can touch) `field_definitions`

The convergence hooks already exist; they are just optional and unenforced:

- **`field_source` on every field (the seam).** `FormFieldBase.field_source?: FormFieldSource` where `FormFieldSource = { entity_type, field_key, shared_value_key?, crm_mapping_key? }` (`schema.ts` L52–61, L75–76). The code comment is explicit: *"Provenance for operational mapping (CRM, shared_values, etc.); optional for legacy/demo schemas."* This is the per-field slot a `field_key` already lives in — it is read by intake/linkage today, just never validated against the registry.
- **Authoring catalog already carries registry-shaped keys.** Each `SystemFieldRegistryEntry` has `field_key` (e.g. `child_first_name`) and `crm_mapping_key` (e.g. `child.first_name`, `guardian.first_name`, `enrollment.desired_start_date`) and an `entity_type`. Picking a system field sets the form field's `id` to `sys:<id>` and records `field_source`. So system fields are *already* provenance-bound — the catalog is simply hardcoded rather than resolved from `field_definitions`.
- **Registry side is ready.** `field_definitions` is keyed by `(org_id, entity_type, field_key)` with `field_type`, label, policies, and an unused `is_visible_in_form` flag — i.e. the registry can already answer "is this a real field for this entity, and what is its structure?"
- **Partial intent elsewhere.** `web/lib/fields/inquiryChildPlacementFieldMetadata.ts` is annotated as consumed by *"layout runtime, field_definitions.config, and create/intake forms"*; the lifecycle requirement contract resolves submissions against `OrgFieldDefinitionRow[]` **post-submission**. Both show the platform leaning toward the registry without forms binding to it at authoring time.

**Net:** Forms can touch `field_definitions` through the existing `field_source.field_key`; nothing new is needed to *carry* the binding — only to *require and validate* it for POS-connected surfaces.

## 3. The minimum registry-backed field binding for POS V1

The minimum is a **rule on POS-connected surfaces**, reusing the existing `field_source` slot — not a Forms change:

1. **Every field POS extracts or promotes must carry a `field_source.field_key` that resolves to a `field_definitions` row** for the relevant `entity_type`. Reuse the existing optional `field_source`; make it **required for POS-connected** forms/documents/packets. (Legacy forms keep it optional.)
2. **POS Extraction and Outcome promotion key off `field_source.field_key` → `field_definitions`, never off the arbitrary form field `id`.** The Processing Case's extracted values are "proposed values for registry field *X*," where *X* is the bound `field_key`. The form field `id` remains the payload key for capture; the registry binding is what POS reads/writes against.
3. **The authoring catalog for POS-connected surfaces resolves against `field_definitions`.** For new POS-connected fields, `systemFieldRegistry` (or its successor selection UI) must offer **registry-backed** fields — i.e. its `field_key`/`entity_type` entries are validated to correspond to real `field_definitions` rows — so new POS fields are *born bound*. Legacy authoring keeps the hardcoded catalog.

That is the whole binding: **require + validate the existing `field_source.field_key` for POS-connected surfaces, and make the catalog registry-backed.** No new field column, no new field store, no change to legacy capture/validation.

## 4. What legacy JSON remains supported

Explicitly preserved (legacy forms continue working unchanged):

- **`schema_json` (`FormSchemaV1`)** — legacy forms keep defining fields inline; POS does not remove or migrate it.
- **`field_source` optional on legacy fields** — unbound legacy fields stay valid.
- **`prefill_field_map`, `intake_field_paths`, `pdf_mapping_json`** — legacy mapping blobs keep working as-is (they map form-field-ids and payload paths; PDF slots are output-side and orthogonal to field identity).
- **`static_options` / `option_set_key`** — inline and org-option-set choices both remain.
- **`visibility`, `validate`, `layout_width`, signature/group/repeat config** — surface behavior stays in `schema_json`.
- **The hardcoded `OPERATIONAL_FORM_SYSTEM_FIELDS` catalog** — remains for legacy/non-POS authoring.

Legacy support is a non-negotiable: this seam is additive and scoped to POS-connected surfaces only.

## 5. What new JSON patterns are forbidden (POS-connected surfaces)

To stop the fork from regrowing, POS-connected Forms/Documents/Packets must **not**:

- **Invent a POS-specific field schema, field store, or field registry.** No `pos_fields`, no parallel `field_definitions`.
- **Create POS-connected fields that are unbound** — i.e. a field with only an arbitrary `id` and no registry-resolved `field_source.field_key`.
- **Re-declare a field's structure (`type`/`label`/`required`) in JSON when a `field_definitions` row exists.** For POS-connected fields, structure resolves from the registry; `schema_json` may carry only surface overrides + the binding.
- **Introduce a new per-surface mapping dialect** (a "pos_field_map" parallel to `prefill_field_map`/`intake_field_paths`) that re-encodes field identity. POS references `field_key`; it does not invent a new mapping JSON.
- **Use `crm_mapping_key` dotted paths as a substitute for registry binding.** `crm_mapping_key` may remain as provenance, but `field_key` → `field_definitions` is the identity of record.

These prohibitions apply **only** to new POS-connected surfaces; they impose nothing on legacy forms.

## 6. Recommended Foundation Package 0 scope

The smallest package that establishes the binding before any POS surface exists to bind incorrectly (POS-F03 step 1). **Scope is the rule + the catalog resolution; not a Forms refactor, not POS surfaces.**

**In scope (FP0):**
- **FP0-A — Binding rule.** Define and document that POS-connected forms/documents/packets require a registry-resolved `field_source.field_key` per extracted/promoted field, reusing the existing slot. (Specification + a publish-time validation *concept* for POS-connected definitions — "registry-bound or rejected." Mechanism choice deferred to package planning.)
- **FP0-B — Registry-backed catalog for POS-connected authoring.** Resolve/validate the authoring catalog against `field_definitions` for POS-connected surfaces; reconcile catalog `entity_type`/`field_key`/`crm_mapping_key` to registry rows. Legacy catalog untouched.
- **FP0-C — POS read/write keys off `field_key`.** Establish (conceptually) that POS Extraction proposals, confidence, Review, Resolution, and Outcome promotion all key by `field_definitions.field_key`, not form-field-id.

**Explicitly out of scope (FP0):**
- Migrating or rebinding legacy forms; changing legacy `schema_json`, prefill/intake/PDF blobs, or legacy validation.
- Building any POS surface (Workspace, Case, Review, Outcome) — those are later packages (POS-F03 / POS-A03).
- Document AI extraction / OCR; per-field confidence overrides; auto-execution.
- Platform-wide forms↔registry convergence beyond what POS-connected surfaces require (broader effort; POS only needs the binding rule, per POS-F01 Risk 2).

**Exit (FP0):** there is an accepted, validated rule that a POS-connected field cannot exist without a registry binding, and a registry-backed catalog to author from — so when the Processing Case envelope and surfaces are built (next packages), they bind to `field_definitions` by construction and cannot deepen the JSON divergence.

---

## One-line summary

The narrowest seam is the **already-present, currently-optional `field_source.field_key`** on form fields: make it **required and registry-validated for POS-connected surfaces**, back the authoring catalog with `field_definitions`, and have POS read/write by `field_key` — legacy forms keep their JSON, new POS-connected fields are born bound, and no new field model is introduced. This is **Foundation Package 0**.
