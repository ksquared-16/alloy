# Forms / Documents P4 — Collection-Bound Relationship and Repeatable Authoring

**Status:** Complete — rebased on `origin/staging`, PR open for review  
**Branch:** `feat/forms-documents-collection-authoring`  
**Baseline:** `origin/staging` `05326e2b5` (rebased 2026-07-10)

## Mission

Make collection semantics usable through Forms / Documents authoring without flattening them into Child 1 / Child 2 indexed fields.

## Enabled collections

| Collection | Provider ref | Item entity | Required context |
| --- | --- | --- | --- |
| **Children** | `children` | `customer_member` | `customer_id` |
| **Parents / Guardians** | `person.contact_role.parents` | `person` | `customer_id` |

Per-provider authoring: `FORMS_COLLECTION_BINDING_AUTHORING_ENABLED_REFS`.

## Deferred collections

Emergency Contacts (child context), Secondary, Billing, Household Members.

## Bootstrap integration

Single orchestrator: `resolveFormPrefillPayload` → scalar + relationship + collection → `mergeFormPrefillPayload`.

Wired into:
- `POST /api/public/forms/[token]/submissions` (bootstrap)
- `PATCH /api/public/forms/[token]/submissions/[submissionId]` (resume)
- `POST .../submit` (org security + envelope stamp)

Client embed uses server-returned groups for all prefill modes.

### Merge precedence

```text
saved respondent values
  > packet/session shared_values (scalars, upstream)
  > canonical record prefill
  > schema repeat-min placeholders
```

Collection rows merge by stable `collection.item_id` or `instance_key` — never array index.

## Children field ownership

Nested provider availability is derived from **canonical context requirements**, not Forms-specific allow/deny lists.

The initial Children collection supplies:

- `customer` (collection root, when `customer_id` is present)
- `customer_member` (current collection item)

Providers owned by or derived from `customer_member` are available (First Name, Last Name, DOB, Language, etc.).

Providers requiring additional context remain **unavailable until that context is explicitly supplied** — for example:

| Display field | Canonical owner | Required context | Available in default Children repeater |
| --- | --- | --- | --- |
| First Name | `customer_member` | `customer_member` | Yes |
| Last Name | `customer_member` | `customer_member` | Yes |
| Date of Birth | `customer_member` | `customer_member` | Yes |
| Language | `customer_member` | `customer_member` | Yes |
| Program | `inquiry_child` | `inquiry_child` | No — until inquiry context bound |
| Desired Start Date | `inquiry_child` | `inquiry_child` | No — until inquiry context bound |
| Current Classroom | `enrollment` | `enrollment:active` | No — until active enrollment context bound |
| Enrollment Status | `opportunity` | `opportunity` | No — until opportunity context bound |

This is a **platform capability** (`evaluateProviderAvailabilityForIteration`) shared by picker, publish validation, submission validation, and runtime prefill — not a Forms exception.

## Parents / Guardians semantics

- **One row per Person** (duplicate Person IDs normalized)
- Primary Contact **excluded** from collection
- Roles from `customer_persons` + `opportunity_persons` parent/guardian keys
- Deterministic display-name ordering

## Payload contract

```ts
groups[groupId]: Array<{
  instance_key: string;
  values: Record<string, unknown>;
  collection?: {
    provider_ref: string;
    item_id?: string;
    origin: "existing" | "respondent_added";
    iteration_entity_type: string;
  };
}>;
```

Submission meta: `collection_submission_envelope` preserved for Processing P5.

## Existing vs proposed-new

- **Existing:** prefill + `origin: existing` + `item_id`; edits are proposed values only
- **Respondent-added:** `origin: respondent_added`; no automatic CRM write
- Row removal does not delete database relationships

## Security validation

- `validateCollectionPayloadContract` — schema/metadata alignment
- `validateCollectionPayloadOrgSecurity` — org + household boundary on `item_id`
- Tampered provider ref / cross-household item rejected

## Nested field authoring

`evaluateProviderAvailabilityForIteration` compares provider context requirements against `CollectionIterationContext.available_contexts`. The picker uses `filterSystemFieldsForCollectionIteration`. Existing incompatible fields retained with visible warning; publish blocked with semantic missing-context messages.

Key modules:

- `web/lib/fields/collection/providerContextRequirements.ts`
- `web/lib/fields/collection/collectionIterationContext.ts`
- `web/lib/fields/collection/evaluateProviderAvailabilityForIteration.ts`

## Packet behavior

Collection nested fields step-local (`fieldIsInsideCollectionBoundGroup`). Scalar shared_values dedupe unchanged.

## Operator / document preview modes

Three explicit preview modes share underlying orchestration where applicable:

| Mode | Entry | Behavior |
| --- | --- | --- |
| **Design placeholder** | `buildDesignPlaceholderPreviewPayload` / `FormSchemaRuntimePreview` without `customer_id` | Representative repeat structure; visibly placeholder; no canonical records |
| **Context-backed operator** | `POST /api/admin/forms/preview-payload` + `FormSchemaRuntimePreview` with launch context | Canonical prefill via `resolveFormPrefillPayload`; operator diagnostics; unavailable/invalid-context states |
| **Respondent runtime** | Public bootstrap / embed | Same prefill orchestration; no internal diagnostics; permitted controls only |

Document Composition embeds `FormSchemaRuntimePreview` in the editor preview panel.

## Processing boundary (P5)

Metadata preserved in submission envelope. No automatic commit. `extractCollectionSubmissionEnvelope` for P5 adapter.

## Reference / delete safety

**Enforcement level:** references **discoverable** + JSON walk in `fieldDeleteSafety.ts`; full cross-consumer blocking **deferred**.

- `discoverFormsDocumentsSchemaReferences` — collection provider, nested field, scalar field refs
- `indexFormsDocumentsSchemaReferences` / `formsDocumentsReferencesForFieldKey` — queryable index
- `formsDocumentsReferencesCollectionProvider` — published/draft form identity where available
- Platform field deletion workflows can query references; no silent deletion of referenced nested fields

## Deferred context providers (not P4)

Do not implement on this branch. Availability remains context-driven — no field-key deny lists.

| Future provider | Inputs | Yields |
| --- | --- | --- |
| Packet/subject inquiry | `customer_member` + packet inquiry subject | `inquiry_child` |
| Explicit enrollment selection | `customer_member` + selected enrollment | `enrollment:active` |
| Enrollment collection iteration | `Enrollments[]` | per-item enrollment context |

Tests prove providers become available when synthetic valid context is supplied via `withSupplementalIterationContexts`.

## Key files

- `web/lib/forms/prefill/resolveFormPrefillPayload.ts`
- `web/lib/forms/prefill/mergeFormPrefillPayload.ts`
- `web/lib/forms/collection/formsCollectionSubmissionValidation.ts`
- `web/lib/forms/collection/formsCollectionNestedFieldEligibility.ts`
- `web/lib/fields/relationship/canonicalCollectionResolver.ts`
- `web/lib/forms/preview/formPreviewOrchestration.ts`
- `web/components/admin/forms/FormSchemaRuntimePreview.tsx`

## P5A grouped evidence (staging follow-on)

P5A on `feat/processing-collection-execution-bridge` reads `collection_submission_envelope` into grouped Processing evidence (read-only). Commit execution remains P5B+.

## P5 scope boundary

P4 preserves `meta.collection_submission_envelope` through submit and Processing case opening. **P5 begins** Processing review, commit semantics, and automatic related-record writes — not on this branch.

## Validation summary

- P4-focused tests: 106 passing
- `tests/pos/packet`: 25 passing
- Typecheck: clean
- `verify:module-imports`: clean (7267 files)


---

## P5A canonical proposal boundary (2026-07-10)

P4 collection authoring and submission preservation remain Forms-owned. P5A adds a **Forms processing adapter** (`web/lib/forms/processing/`) that emits source-independent related-record proposals (`web/lib/intake/proposals/`). Processing evidence is a downstream projection — Forms must not own the canonical proposal contract.


### Forms collection adapters (platform split)

Forms-specific collection iteration, context resolution, and availability live under `web/lib/forms/collection/`:

- `formsCollectionIterationContext.ts`
- `formsProviderContextRequirements.ts`
- `formsProviderAvailability.ts`

Platform modules under `web/lib/fields/collection/` no longer import Forms schema types.

## P5A verified platform split (2026-07-10)

Forms adapters under `web/lib/forms/collection/` and `web/lib/forms/processing/`. Platform collection modules are Forms-free.
