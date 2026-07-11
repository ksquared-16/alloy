# P5 — Processing Collection Proposal and Commit Bridge

**Status:** P5A architecture convergence complete — uncommitted (review gate)  
**Branch:** `feat/processing-collection-execution-bridge`  
**Baseline:** staging `9cd4bd5ae` (merge-base `c6e1adec8`)  
**Worktree:** `/Users/Kelly/.cursor/worktrees/Alloy/processing-collection-execution-bridge`

## Mission

P4 preserves collection submission metadata through public submit into `form_submissions.payload`. P5 must determine how Processing displays grouped collection instances, distinguishes existing-record edits from proposed new records, resolves nested canonical bindings, produces operator-reviewable proposals, and commits approved changes safely — preserving human authority and avoiding automatic destructive relationship changes.

**P5 does not begin on the P4 branch.** This sprint starts from merged staging.

---

## Current Processing flow (Phase 0)

```text
Form submission (public submit)
  → validateFormPayload + collection security
  → stamp meta.collection_submission_envelope
  → form_submissions.payload persisted
  → maybeOpenProcessingCase(sourceKind: form_submission, sourceId)
  → processing_case_sources (reference only)
  → labelSubmissionValues (top-level payload.values only)
  → PosCaseWorkColumn (flat submitted values)
  → extractBoundPerson (flat person.email binding)
  → ReviewDecideCard / recommendationFromSubmission
  → POST approve → runMinimalDestinationHandoff
  → persons create/link by email only
```

### Flow table

| Stage | Current input | Collection metadata retained? | Grouping retained? | Canonical identity retained? | Existing/new distinction retained? | Gap |
| --- | --- | --- | --- | --- | --- | --- |
| Form submission | payload.groups + envelope stamp | Yes | Yes (by groupId) | Yes | Yes (origin) | Admin submit path missing envelope stamp |
| collection_submission_envelope | Projection of groups | Yes | Yes | Yes | Yes | Not read downstream |
| maybeOpenProcessingCase | source id reference | No on case row | No | No | No | By design — reference only |
| Case payload / source envelope | DB join to submission | Yes in submission | Yes in submission | Yes in submission | Yes in submission | Processing read path ignores groups |
| Classification | Document metadata | N/A for forms | N/A | N/A | N/A | form_submission unsupported for auto-classify |
| questionResolutionModel | PDF/draft fields | No | No (flat list) | Partial scalar | No | Document template path only |
| canonicalBindingSuggestions | Label + type | No | No | Scalar field_source | No | No iteration scope |
| Review UI | labelSubmissionValues | No | No | Partial | No | Collection rows invisible |
| Recommendation | extractBoundPerson | No | No | Person spine only | No | No child/parent matching |
| Approval | runMinimalDestinationHandoff | No | No | Person email only | No | Ignores intake recommendation |
| Commit | persons insert/lookup | No | No | Partial | No | No member/relationship writes |

**Architecture snapshot:** P4 preservation ends at form_submissions. Processing today is reference + flat scalar pipeline.

---

## Collection proposal contract (Phase 1)

Adapt to existing Processing contracts — no fourth binding dialect. Provider refs remain canonical.

```ts
type ProcessingCollectionInstanceProposal = {
  group_id: string;
  collection_provider_ref: string;
  iteration_entity_type: string;
  instance_key: string;
  origin: "existing" | "respondent_added";
  existing_item_id?: string;
  submitted_values: Record<string, unknown>;
  field_bindings: Array<{
    field_id: string;
    provider_ref: string;
    submitted_value: unknown;
  }>;
};
```

Envelope adapter input: extractCollectionSubmissionEnvelope(payload) + schema nested field bindings.

---

## Operator review model (Phase 2)

For each collection instance, show as a coherent unit: collection label, existing vs new, matched record identity, proposed nested changes, conflicts, approve/reject/defer controls.

Do not flatten Child A First Name / Child B First Name / Parent A Email into one undifferentiated question list.

Bounded UI: extend PosCaseWorkColumn evidence; optional nested list in ReviewDecideCard — no full workspace redesign.

---

## Commit semantics (Phase 3)

### Existing item
Update approved fields only; detect stale changes; verify org/household; audit events.

### Respondent-added item
Duplicate match; explicit create; attach to Customer; assign roles; reject incomplete; operator approval required.

### Removed visual instance
Must not delete child, Person, relationship, or membership automatically.

---

## Entity-specific audit (Phase 4)

### Children
- Target: customer_members (+ person where applicable)
- Duplicate: name + DOB within customer
- Requires customer_id from link metadata

### Parents / Guardians
- Target: persons + role assignment on customer_persons
- Dedupe by person id; email/phone match for respondent_added
- Primary Contact exclusion preserved
- Separate commit adapter from Children

---

## Human authority (Phase 5)

understand → recommend → operator approves → commit

No automatic record creation from collection metadata alone.

---

## Duplicate-resolution needs

Children: name + DOB within customer. Parents: email/phone Person match. Cross-collection dedupe in UI only.

---

## Security and organization boundaries

Re-verify org_id at commit; no cross-org writes; provider ref must match schema; no forged supplemental context.

---

## Audit / event requirements

Instance-level approve/reject/defer logging; field before/after; workflow events for member create / person link / role assign.

---

## Exact proposed files to change

**New:** web/lib/pos/processingCase/collection/*, web/lib/forms/collection/formsCollectionCommitBridge.ts

**Read model:** processingCaseEvidenceDb.ts, resolveSourceEvidence.ts, recommendationFromSubmission.ts

**Commit:** approveHandoff.ts, approve/route.ts

**UI:** PosCaseWorkColumn.tsx, ReviewDecideCard.tsx, usePosCase.ts

**Parity:** admin forms submit route envelope stamp

---

## Tests required

Envelope → proposal adapter; grouped evidence API; approve existing child update; approve respondent_added parent; reject instance; no delete on row removal; cross-org blocked; Primary Contact exclusion; admin submit parity.

---

## Recommended implementation phases

| Phase | Scope |
| --- | --- |
| P5A | Envelope adapter + grouped evidence (read-only UI) |
| P5B | Children existing-item field commit |
| P5C | Children respondent_added create + household link |
| P5D | Parents/Guardians commit adapter |
| P5E | Admin submit parity + audit hardening |

---

## Risks

Flat evidence pipeline; person-only approveHandoff; false duplicate merges; packet flat aggregation; operator UX complexity.

---

## Split recommendation

Implement shared P5A infrastructure once. Split commit adapters: Children (P5B/C) first, Parents/Guardians (P5D) second — same sprint doc, separate adapters.

---

## P4 boundary (complete on staging)

Collection metadata on form_submissions.payload; Processing opens by reference; no automatic mutation on submit. P5 begins at evidence adapter.


---

## P5A — Architecture convergence (implemented, uncommitted)

**Status:** Refactored to canonical proposal boundary — review gate (do not commit product code until reviewed)

### Core dependency direction

```text
Source payload
  → Source-specific adapter
  → Canonical related-record proposal envelope  (web/lib/intake/proposals/)
  → Processing evidence projection             (web/lib/pos/processingCase/collection/)
  → Processing UI                              (ProcessingCollectionEvidencePanel)
```

Forms path:

```text
form_submissions.payload
  → extractFormCollectionEnvelope              (web/lib/forms/processing/)
  → adaptFormSubmissionToRelatedRecordProposals
  → adaptSourceToRelatedRecordProposals        (dispatch — Forms only for P5A)
  → projectRelatedRecordProposalsToEvidence
  → processingCaseEvidenceDb → resolveSourceEvidence → PosCaseWorkColumn
```

### Collection Provider vs Related-Record Proposal

| Concern | Ownership | P5A scope |
| --- | --- | --- |
| Collection provider runtime (Children, Parents, Documents…) | `web/lib/fields/collection/` | Unchanged — not proposal model |
| Related-record proposals (existing update / proposed new) | `web/lib/intake/proposals/` | **New canonical contract** |
| Forms envelope parsing | `web/lib/forms/processing/` | Forms-owned adapter |
| Processing review projection | `web/lib/pos/processingCase/collection/` | Evidence VM only |
| Commit execution | P5B+ | **Not started** |

### Canonical proposal contract

Module: `web/lib/intake/proposals/types.ts`

- `RelatedRecordInstanceProposal` — `proposal_id`, `collection_provider_ref`, `item_entity_type`, `origin: existing_record | proposed_new_record`, `field_proposals[]`, `source_lineage`, `diagnostics`, `status`
- `RelatedRecordFieldProposal` — `provider_ref`, `submitted_value`, optional `source_fact_ref`, optional `label`
- `ProposalSourceLineage` — `source_kind`, `source_record_id`, optional `source_path`, optional typed `source_metadata`
- No FormSchema, form group IDs as semantic identity, or packet structures in canonical types

### Evidence is a review projection

Processing evidence adds presentation: labels, identity hints, display values, valid/incomplete/unsupported state, operator copy. Future commit execution must operate from **approved canonical proposals**, not evidence VMs.

### Scalar compatibility (unchanged)

- `labelSubmissionValues` — top-level scalar only
- Collection nested fields never flattened into `proposedValues`
- Malformed collection instances do not suppress scalar evidence

### Grouped evidence UI (preserved)

`ProcessingCollectionEvidencePanel` — collection grouped, instance grouped, existing vs proposed-new, diagnostics visible, no approve/commit controls.

### Alternate-source readiness

Architecture tests prove OCR/import/API fixtures project through `projectRelatedRecordProposalsToEvidence` without Forms types. No real alternate-source adapter implemented in P5A.

### P5A boundary

No approve, commit, record create/update/link/delete. Evidence and diagnostics only.

### P5B dependency

Children existing-item field commit adapter consumes **canonical proposals** after operator approval UI — not raw Forms payload or evidence VMs.

### Remaining placement debt

- `web/lib/fields/collection/*` still imports Forms types (P4 debt — not relocated in this pass)
- Processing instance lineage VM retains Forms field names for display traceability only


---

## Canonical Collection Platform Convergence (2026-07-10)

### Platform stack (dependency direction)

```text
Canonical Provider Platform
  -> Canonical Relationship Platform
  -> Canonical Collection Platform (web/lib/fields/collection/, relationship/canonicalCollection*)
  -> Canonical Context / Availability Platform
  -> Canonical Related-Record Proposal Platform (web/lib/intake/proposals/)
  -> Consumer Adapters (Forms, Processing, Queue Rows, Focus Panel)
```

### Collection provider ownership

Neutral registry: `web/lib/fields/collection/canonicalCollectionProviderRegistry.ts`

Forms derivation (`canonicalFormsRelationshipProviderDerivation.ts`) remains a **consumer adapter** that projects registry entries into `CanonicalDataProvider` seeds for authoring.

### Context requirement ownership

Platform: `providerContextRequirementsFromCanonicalRef` (entity ownership derived).

Forms adapter: `web/lib/forms/collection/formsProviderContextRequirements.ts`.

### Processing evidence ownership

Evidence is a review projection only. Canonical proposals -> `projectRelatedRecordProposalsToEvidence` -> UI.

### Reference governance (deferred index)

Shared contract: `web/lib/fields/providerConsumerReference.ts`. Full cross-consumer index deferred.

### Remaining consumer migrations (not this pass)

- Focus Panel card composition
- Queue Row projection unification
- Full provider reference index

## P5A verified architecture status (2026-07-10)

### Resolved contradictions (working-tree verified)

- `web/lib/fields/collection/*` **does not** import Forms after platform split.
- Neutral registry **exists**: `canonicalCollectionProviderRegistry.ts`.
- Canonical focused P5A tests: **43 tests** in 9 files.
- `verify:module-imports` must pass after staging (not while untracked).

### Temporary source dispatch

`adaptSourceToRelatedRecordProposals.ts` — Processing case ingestion orchestration seam. Calls Forms adapter; no envelope parsing.

### P5A boundary

Read-only grouped evidence. No approve/commit/record mutation. P5B begins after merge.

