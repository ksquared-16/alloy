# P5B — Existing Child Proposal Approval and Commit

**Status:** Hardened locally — ready for PR to staging.

## Scope

P5B commits approved field proposals for **existing Child records only**.

Explicitly excluded:

- proposed-new Child creation;
- Parents / Guardians commits;
- relationship writes or reassignment;
- deletes;
- automatic approval;
- collection-level bulk commit.

## Architecture

```text
RelatedRecordInstanceProposal
  -> RelatedRecordProposalDecision
  -> ExistingChildCommitPlan
  -> executeExistingChildCommitPlan
  -> customer_members update
  -> per-field result + workflow event
```

Commit execution reloads the canonical proposal server-side from the Processing case sources. It does not trust UI evidence, Forms payloads submitted by the browser, or UI write targets.

## Platform Closeout

### Neutral source orchestration

`web/lib/intake/sources/adaptSourceToRelatedRecordProposals.ts` owns source dispatch. Processing keeps a compatibility export only. Forms parsing remains in `web/lib/forms/processing/*`.

### Provider reference foundation

`web/lib/fields/providerConsumerReference.ts` defines the canonical contract:

```ts
type ProviderConsumerReference = {
  provider_ref: string;
  consumer_kind: string;
  artifact_id: string;
  artifact_version_id?: string;
  reference_path: string;
  lifecycle_status: "draft" | "published" | "active" | "archived";
};
```

Initial emitters:

- Forms / Documents schemas via `formsDocumentsProviderReferences.ts`;
- Related-record proposals via `intake/proposals/providerReferences.ts`.

This is an index foundation, not a full delete blocker.

## Approval Contract

`web/lib/intake/proposals/decisions.ts` defines field-level approve/reject/defer decisions. Whole-instance approval is a convenience that expands into field decisions during planning. No implicit approval exists; missing decisions defer.

## Existing Child Eligibility

A proposal may commit only when:

- `origin === "existing_record"`;
- `collection_provider_ref === "children"`;
- `item_entity_type === "customer_member"`;
- `existing_record_id` exists;
- current record belongs to org and expected household;
- proposal status is valid;
- field provider is writable by the existing-child adapter;
- operator decision approved the field.

## Writable Provider Set

| Provider ref | Canonical owner | Physical write target | Validation | P5B writable |
| --- | --- | --- | --- | --- |
| `child.child_first_name` / aliases | `customer_member` | `customer_members.first_name` | text <= 200 | Yes |
| `child.child_last_name` / aliases | `customer_member` | `customer_members.last_name` | text <= 200 | Yes |
| `child.child_dob` / `child.child_date_of_birth` / aliases | `customer_member` | `customer_members.dob` | `YYYY-MM-DD` | Yes |
| preferred language | unresolved / not physical column in schema | — | — | No |

## Stale Policy

Partial per-field commit. If a field proposal has `observed_value` and the current record differs from that observed value, that field is blocked as `stale_conflict`. Other clean approved fields may commit.

When `observed_value` is unavailable, P5B can still commit clean approved fields using current canonical record state; already-applied values are skipped as `unchanged`.

## Audit and Idempotency

- Decisions and commit results persist under `processing_cases.metadata.related_record_proposals`.
- A workflow event `processing_related_record_proposal_committed` is emitted per commit request.
- Repeating a request after a committed/partial result returns the stored result and does not reapply side effects.

## Operator UI

Grouped Processing evidence now shows field-level controls only for eligible existing Child proposals. Proposed-new Child and Parents/Guardians stay read-only.

## Focus Panel Audit

| Focus Panel concept | Current source | Canonical provider | Canonical resolver | Remaining adapter | Migration risk |
| --- | --- | --- | --- | --- | --- |
| Children | `focusPanel/children/*`, `_inquiry_children` / child evidence builders | `children` | `resolveCanonicalCollection` available | Resolver -> card VM | Medium; record shape differences |
| Parents / Guardians | relationship/focus card paths | `person.contact_role.parents` | available | Resolver -> card VM | Medium; primary-contact semantics |
| Primary Contact | relationship authority | relationship platform | available | Minimal | Low |
| Current Work | Focus/work-unit local paths | not registered | gap | provider registration needed | Medium |

Target: Focus Panel config -> canonical provider ref -> canonical collection resolver -> presentation adapter. Not migrated in P5B.

## Queue / Forms Derivation Audit

| Difference | Classification |
| --- | --- |
| Queue children presentation projections (`children.names`, count/summary) | consumer presentation metadata |
| Forms authoring enablement | consumer capability filtering |
| Legacy Forms relationship refs | legacy compatibility |
| Collection identity repeated in Queue/Forms derivation | duplicate provider truth |
| Canonical provider registry | canonical platform assembly |

Follow-up direction: canonical provider registry -> consumer capability filter -> consumer presentation adapter.

## Next Slice

After P5B review, converge provider derivation adapters without changing Focus Panel / Queue UI behavior.


## Decision and Result Persistence (Option A)

P5B uses **bounded metadata snapshot** storage under `processing_cases.metadata.related_record_proposals`:

- `decisions[proposal_id]` — operator decisions with `decision_version`, `decided_at`, `decided_by`
- `commit_results[proposal_id]` — execution results with `idempotency_key`, `decision_version`, `audit_event_id`
- `commit_locks[proposal_id]` — short-lived in-flight guard (120s TTL)

Sibling proposals are preserved via proposal-keyed merges. Audit events remain authoritative; metadata is a read-model snapshot with a documented migration path to dedicated tables (`processing_related_record_proposal_decisions`, `processing_related_record_proposal_results`) if concurrent operator volume requires it.

## Pre-Commit Plan Preview

`POST .../preview` rebuilds `ExistingChildCommitPreview` from canonical proposal + persisted decision + authoritative `customer_members` row. The Processing UI calls preview on decision changes and disables commit unless `can_commit` is true (at least one clean approved field).

## Authorization

Server-side checks (not UI visibility): admin context org membership, proposal attached to case sources, existing-child origin, children collection, customer_member entity, org/household boundaries, writable provider eligibility.

## Concurrency and Idempotency

- `decision_version` = stable hash of normalized decision
- `idempotency_key` = hash(proposal_id, decision_version)
- Retries with the same key return stored result without duplicate writes or audit events
- Fresh `commit_locks` block competing commits with different keys (409)
- Field-level stale checks prevent silent overwrite when child record changed since proposal formation

## Audit Event Payload

`processing_related_record_proposal_committed` includes org, case, proposal, source, target child, per-field outcomes, decision version, idempotency key, operator id, and timestamp. Sensitive values are redacted via platform `redactObjectForAi` strict mode.

## Proposal Review States

`unreviewed | partially_decided | ready_to_commit | partially_committed | fully_committed | blocked_by_conflict | rejected | deferred`

Rejected/deferred fields keep the proposal open. Fully committed requires no unresolved stale/deferred/failed approved fields.

## Provider Reference Index Maturity

**Classification:** Contract + in-memory/query helper + artifact scanning (Forms schema + proposal bundles). Not live indexing or delete/archive enforcement.

## P5B Exclusions

No proposed-new Child creation, Parents/Guardians commits, relationship writes, Focus Panel / Queue convergence, or P5C work.

## P5C Prerequisites

Proposed-new Child creation adapter, relationship write contract, dedicated persistence if metadata contention appears in production.


## Platform Mutation Convergence (2026-07-11)

P5B commit execution converges on the canonical Field Platform mutation stack. Processing is an orchestrator only.

### Canonical mutation path

```text
provider ref
  → providerRefToCanonicalRef (fieldRegistryReferenceMatrix)
  → CanonicalRegistryRef
  → resolveMutationCapability (lib/fields/mutation)
  → validateMutationValue → validateCustomerMemberPatchBody
  → applyCustomerMemberMutationPatch (lib/admin/customerMemberPatch)
  → customer_members native update + field_values config upsert
```

### Removed duplicate registries

Deleted from Processing:

- `childrenCommitCapability.ts`
- `writableProviders.ts`

### Shared Customer Member mutation service

`applyCustomerMemberMutationPatch` in `customerMemberPatch.ts` is the single server mutation path used by:

- `PATCH /api/admin/customer-members/[id]`
- P5B `executeExistingChildCommitPlan`

### Storage truth

Physical DOB column is `customer_members.dob`. Layout/Forms may expose `child.date_of_birth`; canonical field key is `dob`.

### P5B bounded eligibility (unchanged)

Only existing `children` collection proposals with `item_entity_type = customer_member` and `origin = existing_record`.

### Custom/config fields

Platform capability resolves configured customer_member profile fields (e.g. `child.gender`) to config storage class. P5B consumer scope remains native identity fields (first name, last name, DOB) until explicitly expanded — enabling additional fields requires consumer capability gate changes only, not Processing field maps.

### Processing boundary

Processing owns proposal eligibility, decisions, stale policy, authorization, idempotency, audit, and orchestration. It does not own aliases, writable lists, validation, or physical storage mapping.

### Audit identity

Commit audit payloads use `provider_ref`, `canonical_field_key`, and field outcomes — not physical column names.
