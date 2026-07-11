# Forms / Documents P4 — Collection-Bound Relationship and Repeatable Authoring

**Status:** Implementation complete — **review gate (uncommitted)**  
**Branch:** `feat/forms-documents-collection-authoring`  
**Baseline:** staging `35e1a2669` (P3A #146) — **14 commits behind** `origin/staging` `61aefff37` (rebase deferred: uncommitted P4 work)

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

## Processing boundary (P5)

Metadata preserved in submission envelope. No automatic commit. `extractCollectionSubmissionEnvelope` for P5 adapter.

## Reference / delete safety

`discoverFormsDocumentsSchemaReferences` — collection provider + nested field refs discoverable.

## Key files

- `web/lib/forms/prefill/resolveFormPrefillPayload.ts`
- `web/lib/forms/prefill/mergeFormPrefillPayload.ts`
- `web/lib/forms/collection/formsCollectionSubmissionValidation.ts`
- `web/lib/forms/collection/formsCollectionNestedFieldEligibility.ts`
- `web/lib/fields/relationship/canonicalCollectionResolver.ts`
- `web/components/admin/forms/FormGroupAuthoringCard.tsx`

## Remaining work

- Rebase to current `origin/staging` (`61aefff37`) after commit
- Enrollment-context nested fields when packet subject binding exists
- P5 Processing execution bridge
- Full cross-consumer delete-safety matrix integration (bounded discovery exists)
