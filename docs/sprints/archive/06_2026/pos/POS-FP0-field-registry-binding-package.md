# POS-FP0 — Field Registry Binding Package Plan

> **Status:** Package Planning — the first execution package. **Planning only; no code in this document.**
> **Doctrine:** legacy JSON remains supported; new POS-connected Forms/Documents/Packets must bind fields to the shared field registry; **POS never creates its own field system.**
> **Inputs:** POS-F01/F02/F03/F04 (Foundation), POS-A01/A02/A03 (Architecture), POS-01/02/03/05 (Product). Execution model: POS-06 (package-by-package, substitute gate, two-failed-repair pause).
> **Grounding (read):** `web/lib/forms/schema.ts` (`FormField`, `FormFieldSource`, `formFieldSchema`), `web/lib/forms/systemFieldRegistry.ts`, `web/lib/forms/systemFieldToFormField.ts`, `web/lib/forms/validateSubmission.ts`, `web/lib/forms/formContextMode.ts`, `web/lib/admin/forms/formsAdminDb.ts`, `web/lib/fields/useFormSystemFieldPicker.ts` / `formFieldRegistryPicker.ts` / `fieldRegistryReferenceMatrix.ts`, `web/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle.ts`.
> Branch: `pos-planning-v1` (planning); implementation later on a fresh branch off latest `staging` (POS-06).

## Package objective

Enforce the **already-present `FormField.field_source.field_key` seam** for **POS-connected** form/document/packet surfaces so that POS cannot deepen the Forms JSON-field divergence (POS-F04). Concretely, after FP0:

1. A surface can be marked **POS-connected** (via existing JSONB metadata — no migration).
2. For POS-connected surfaces, **every field that POS will extract or promote must carry a `field_source.field_key` that resolves to a `field_definitions` row** for the field's `entity_type`; publish of a POS-connected definition with an unbound field is **rejected with a clear error**.
3. The POS-connected **authoring catalog resolves against `field_definitions`** (reusing the existing field-registry pickers) instead of the hardcoded in-memory list.
4. POS read/write helpers reference values by **`field_key`**, not the arbitrary form-field `id`.
5. **Legacy (non-POS-connected) forms are completely unaffected** — same capture, same renderer, same validation, `field_source` stays optional.

FP0 ships **no POS surface** (no Workspace, no Case UI). It is the binding rule + catalog resolution + a read/write keying convention, and nothing else.

## Why no migration and no new API (reuse-first)

- **POS-connected marker** rides existing JSONB: a flag on `form_definitions.metadata` / `form_public_links.metadata` (and/or an existing `form_context_mode` value via `formContextMode.ts`). JSONB is already present → **no schema migration.**
- **Binding enforcement** hooks the existing publish path in `formsAdminDb.ts` → **no new API route.**
- **Field-definitions resolution** reuses `loadOrgFieldDefinitionsForLifecycle.ts` (or a thin generalization) and the existing `web/lib/fields/*` pickers → **no new field store.**
- The binding itself reuses the existing optional `field_source` slot → **no new field column.**

Migration/API are explicitly *out of scope unless proven absolutely necessary*; the plan is designed so they are not.

## Files likely touched

Grouped by reuse / extend / new (small). Paths are the expected surface area, not a commitment.

**Reuse (read-only dependencies):**
- `web/lib/forms/schema.ts` — the `FormFieldSource` / `field_source` slot (the binding target; unchanged shape).
- `web/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle.ts` — existing `field_definitions` loader to resolve bindings against.
- `web/lib/fields/formFieldRegistryPicker.ts`, `useFormSystemFieldPicker.ts`, `fieldRegistryReferenceMatrix.ts` — existing registry-backed pickers to source POS-connected authoring from.
- `web/lib/forms/validateSubmission.ts` — **not changed** (legacy submission validation stays schema-based).

**Extend (small, additive, POS-connected-gated):**
- `web/lib/admin/forms/formsAdminDb.ts` — at the version **publish** step for a POS-connected definition, call the new binding validator before insert; non-POS-connected path unchanged.
- `web/lib/forms/formContextMode.ts` and/or definition/link metadata helpers — recognize a `pos_connected` marker (reuse `form_context_mode` if a value fits; otherwise a metadata boolean).
- `web/lib/forms/systemFieldToFormField.ts` / `systemFieldRegistry.ts` — for POS-connected authoring, source the catalog from the registry pickers; legacy authoring keeps the hardcoded list.

**New (small):**
- A **binding validator** module (e.g. `web/lib/forms/binding/validatePosConnectedFieldBinding.ts`) — pure function: given a parsed `schema_json` + org field definitions, assert every POS-relevant field has a `field_source.field_key` that resolves; return structured violations. No side effects.
- A **field-key read/write helper** (e.g. `web/lib/pos/fieldKeyBinding.ts`) — conceptual: resolve a Processing-Case proposed value by `field_key` ↔ a source's bound field. (Thin; consumed by later POS packages, not by any UI in FP0.)
- **Tests** under `web/tests/forms/` and `web/tests/pos/` (below).

**Possibly touched (only if the marker can't live in metadata):** a forms publish **route** under `web/app/api/admin/forms/**` — only to pass the marker through; avoided if metadata suffices. **No migration unless a metadata flag is proven insufficient.**

## Risks

1. **Marker leakage to legacy.** If "POS-connected" is misread, legacy forms could get validated and break. *Mitigation:* default is non-POS-connected; the validator only runs when the marker is explicitly set; legacy fixtures in the test plan prove non-interference.
2. **`entity_type` / `field_key` namespace mismatch.** The authoring catalog uses semantic entity types (`child`, `guardian`, `enrollment`) and dotted `crm_mapping_key`s (`child.first_name`); `field_definitions` is keyed `(org_id, entity_type, field_key)`. *Mitigation:* FP0 defines the **resolution mapping** (catalog → registry) explicitly; where a catalog entry has no registry counterpart, it is treated as **not registry-backed** and is unavailable to POS-connected authoring (not silently invented).
3. **Incomplete org field coverage.** An org may lack `field_definitions` rows for some needed fields. *Mitigation:* publish-time error names the missing `field_key`; FP0 does not auto-create registry rows (that's a separate, deliberate action).
4. **Over-reach into the renderer/validator.** Temptation to rewrite submission validation. *Mitigation:* out of scope; binding validation is a **separate publish-time check**, not a change to `validateSubmission.ts`.
5. **Packet path divergence.** Packets compose multiple step forms (`packetDefinitionStepForms.ts`). *Mitigation:* a POS-connected packet validates each step form through the same binding validator; no packet-specific binding logic.
6. **Scope creep into POS surfaces.** *Mitigation:* the "must not happen" list; FP0 ships no Workspace/Case UI.

## Test plan

All Claude-runnable in the sandbox (unit/contract level), per POS-06 substitute gate.

- **Binding validator — unit (`web/tests/forms/posConnectedFieldBinding.test.ts`):**
  - POS-connected schema where every field has a resolvable `field_source.field_key` → **passes**.
  - POS-connected schema with one unbound field (no `field_source`) → **fails** with a violation naming the field `id`.
  - POS-connected schema with a `field_source.field_key` that has **no `field_definitions` row** for its `entity_type` → **fails** with a violation naming the missing `field_key`.
  - Nested **group/repeat** fields are validated recursively.
- **Legacy non-interference — contract (`web/tests/forms/legacyFormsUnaffected.test.ts`):**
  - A non-POS-connected (legacy) schema with optional/absent `field_source` → **publish path unchanged, no binding validation invoked**.
  - Existing forms admin route tests (`formsAdminRoutes.test.ts`) continue to pass unchanged.
- **Catalog resolution — unit (`web/tests/forms/posAuthoringCatalogRegistryBacked.test.ts`):**
  - POS-connected authoring sources fields from the registry pickers; a catalog entry without a registry counterpart is **excluded** (not surfaced as bindable).
  - Legacy authoring still returns the hardcoded `OPERATIONAL_FORM_SYSTEM_FIELDS`.
- **Read/write keying — unit (`web/tests/pos/fieldKeyBinding.test.ts`):**
  - A proposed value resolves by `field_key` (not by form-field `id`); two different form-field `id`s bound to the same `field_key` resolve to the same registry field.
- **Submission validation untouched — regression:** existing `validateSubmission` tests pass with no changes.

## Substitute gate plan (POS-06)

Claude-runnable verification that earns continuation without a human gate:

1. **Build** the binding validator + catalog resolution + read/write helper.
2. **Run substitute gate:** `npm run test` for the FP0 test files above; type-check; lint; plus a **fixture sweep** asserting a corpus of representative **legacy** form schemas all still publish-validate as before (non-interference proof).
3. If a check fails, **fix** and **rerun**.
4. If the **same failure survives two repair attempts**, **pause and escalate** with the failure, the two attempts, the suspected cause, and options.
5. If green, continue to the next package.
6. **Real gate (host-side):** full `vitest` + `npm run build` run outside the sandbox at the named gate (Foundation Gate continuation), since the sandbox cannot run the full toolchain (POS-06).

Substitute-gate pass criteria: all FP0 tests green, legacy fixture sweep green, type-check/lint clean, no change in legacy submission-validation behavior.

## Acceptance criteria

FP0 is accepted when:

1. A definition/link can be marked **POS-connected** via existing metadata (no migration).
2. Publishing a **POS-connected** definition **fails** when any extract/promote field lacks a registry-resolved `field_source.field_key`, with a violation that names the field and the missing/invalid `field_key`.
3. Publishing a POS-connected definition **succeeds** when all such fields are bound.
4. **POS-connected authoring** offers only **registry-backed** fields (sourced from `field_definitions` via existing pickers).
5. POS proposed-value read/write resolves by **`field_key`**, demonstrated by a unit test (no form-field-`id` coupling).
6. **Legacy forms are provably unaffected:** non-POS-connected publish, capture, render, and submission validation are unchanged; the legacy fixture sweep and existing forms route tests pass.
7. **No new field store, no new field schema, no POS field system** exists.
8. **No migration and no new API** were introduced (or, if one is proven absolutely necessary, it is escalated and justified before merge).

## Rollback plan

- **Marker-gated, so rollback is trivial:** because all FP0 behavior is gated on the POS-connected marker and the marker is opt-in metadata, disabling FP0 = not setting the marker (no POS-connected definitions exist yet in V1). Legacy behavior is the default and is untouched.
- **Code rollback:** the new validator + helper are additive modules; reverting the FP0 commit removes the publish-time check and the registry-backed catalog path with **no data changes** (no migration was run, so there is nothing to un-migrate).
- **No data migration → no data rollback.** If a metadata flag was written to any definition during testing, clearing the flag fully reverts behavior.
- **Forward-safe:** because legacy is the default path, a partial rollback (e.g. keep the validator, disable catalog resolution) is safe and independent.

## "Must not happen" list

- **Must not** create a POS-specific field schema, field store, or field registry.
- **Must not** change legacy `schema_json`, `validateSubmission.ts`, the form renderer, or legacy publish behavior.
- **Must not** run binding validation on non-POS-connected (legacy) forms.
- **Must not** auto-create `field_definitions` rows to satisfy a binding (missing fields are an explicit error, resolved deliberately, not silently).
- **Must not** introduce a new per-surface mapping JSON (e.g. a `pos_field_map`) — POS references `field_key`.
- **Must not** add a schema migration or a new API route unless proven absolutely necessary and escalated first.
- **Must not** build any POS surface (Processing Workspace, Processing Case UI), OCR, or auto-execution in this package.
- **Must not** couple POS reads/writes to the arbitrary form-field `id`.
- **Must not** let a POS-connected field be born unbound.

## Position in the roadmap

FP0 is **POS-F03 step 1 / POS-A03 P0 (Foundation)** — the unified-model binding that must exist before the Processing Case envelope and any POS surface are built. It is deliberately the smallest first move: it changes no product behavior a user sees, ships no UI, and exists solely so that everything built after it binds to `field_definitions` by construction and cannot deepen the Forms JSON divergence.
