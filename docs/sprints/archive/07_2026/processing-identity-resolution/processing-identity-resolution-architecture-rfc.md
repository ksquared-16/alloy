# Processing Identity Resolution — Architecture RFC (V1, implementation-authoritative)

**Status:** **Frozen and implemented locally · Locally certified · Awaiting staging reconciliation · Not promoted · Not deployed.** Product-owner decisions (new-record thresholds, 180-day reopen policy, retention classes) are incorporated. **Baseline (design):** `origin/staging` @ `65afc8527`; **certified branch HEAD:** `4f3bbdb54`. See [open-decisions](processing-identity-resolution-open-decisions.md). Evidence: **[C]** confirmed, **[P]** design-time proposal, **[D]** doctrine.

**Implementation reconciliation (2026-07-12).** V1 is implemented through E1. Manual Create Lead and public lead-capture forms are authoritative Processing adapters; neither has a legacy direct-write fallback. C1 shadow comparison code is retained only as audit tooling. D0–D5 have no runtime feature flag. Identity mutation remains human-authoritative through an immutable plan, exact approval binding, and explicit execution.

### Frozen for V1 (locked)
`persons` canonical human record · **Parent & Guardian are roles** · **Child = `customer_members`** for V1 behind semantic commands · **Family/Household = `customers`**, resolved through a household graph · Processing resolves **provisional real-world subjects and their canonical record representation** · **email/phone are strong signals, not universal unique identifiers** · **`process_instances` is the intended runtime participation owner** · Processing emits **`create_process_participation`**, not OCM/table-specific ops · **merge is propose-only in V1** · **creation does not auto-commit in V1** · **approval binds to an immutable Commit Plan version + hash**; material edits invalidate approval · **identity-graph creation uses atomic groups** · **external communication failure does not roll back identity creation** · public forms were certified in shadow before authoritative cutover · **Manual Create Lead was the first reviewed executor cutover** · public-form reviewed commit followed executor validation.

### Deferred behind an abstraction (explicitly not blocking)
OCM↔`process_instances` physical target (owned by the `create_process_participation`/`add_participation` command — Decision B) · whether children are always person-backed (owned by `add_child_to_household` — Decision A) · reusable prior resolutions (re-resolve each time in V1) · no-op auto-complete + trusted-identity auto-link (Phase G policy engine, off by default) · merge **execution** (Phase F privileged workflow).

**Design stance.** Converge, don't rebuild. Every object either **is** an existing contract, **generalizes** one, or fills a gap the repo already named (`recordResolverSeam.ts`). Deterministic-first, human-authoritative, evidence-preserving, adapter-based. Processing owns inbound information resolution and hands off to canonical owners via **semantic commands** — never raw writes, never transitional table names.

**Frozen invariants (from the decision pass).**
1. Processing emits **semantic record commands** only; command implementations own physical mapping (Decision A/B). Processing never names `opportunity_customer_members`, `process_instances`, `contacts`, or `field_values` in a plan.
2. Email/phone are **strong signals, not unique identity keys**; no person-level uniqueness (Decision C).
3. **No identity is auto-committed** in V1; a human approves every create/link/merge/contact change (Decision J).
4. **Merge is propose-only** in V1; execution is a Phase-F privileged workflow (Decision H).
5. Approval binds to **one immutable plan version + content hash**; any edit voids it (Decision F).
6. Commit uses **atomic identity groups** + sequenced dependent groups + async outbox side effects; comms failure never rolls back identity (Decision G).
7. First executor cutover = **Manual Create Lead**; first shadow = **public forms** (Decision I).

---

## 7.1 System boundary

```
                          ┌──────────────────────── PROCESSING (owns) ────────────────────────┐
 INBOUND SOURCE ─adapter→ │ Intake Envelope → Case → Facts → Semantic Mapping → Identity        │
 (forms, docs, packet,    │ Subjects → Candidate Generation → Signals → Resolution →            │
  manual, import*, api*,  │ Recommendation → Commit Plan (versioned, immutable) → Approval →    │
  comms-derived*)         │ Commit Executor ──emits semantic commands──▶                        │
                          └──────────────────────────────────────────┬─────────────────────────┘
                                                                      │ registered commands only
   ┌───────────────────────────────────────────────────────────────────┴─────────────────────────┐
   ▼ Record commands            ▼ Mutation Runtime           ▼ Business Process         ▼ Workflows
 create_person, create_household,  lead_status,            create_process_participation  emitEvent,
 link_person_to_household,         enrollment_status,       (→ process_instances via      executeAdminAction,
 add_child_to_household,           person_status (NEW)      command; OCM legacy)          comms enqueue, docs
 create_lead, update_record_fields
```
`*` import / api / comms-derived are future adapters (§migration Phase E/F).

| Layer | Owns | Must not |
|---|---|---|
| **Source adapters** | Produce a valid `IntakeEnvelope` from one source; stamp trusted context | Match, resolve, or write records; hold source-specific identity logic |
| **Processing** | Case lifecycle, facts, mapping, subjects, candidate generation, signals, resolution, recommendations, immutable Commit Plan, approval binding, executor orchestration | Own lifecycle/scheduling/billing truth; raw-write; name transitional tables; silently merge; auto-commit identity |
| **Entity/record systems** | Canonical storage + **registered record/link commands** | — |
| **Mutation Runtime** (`lib/mutations/*`) **[C]** | Status transitions (typed domains, outbox, idempotency) + new `person_status` handler | Be bypassed by Processing |
| **Business Process** (`process_instances`, outcomes) **[C]** | Participation stage/state | — |
| **Workflows / Actions** | Downstream side effects via events | — |
| **Documents** | Attachment storage, generation, extraction | own identity |
| **Communications** | Delivery; *channel* identity (`communication_identities`) — **separate domain** **[C]** | create persons |
| **BOS / AI** | *Propose* extraction/mappings/ranking/recommendations; explain | Enforce, block, create records, auto-apply |
| **Humans / versioned policy** | Approve ambiguous identity + material change; authorize narrow deterministic automation (Phase G) | — |

**Boundary rule.** Processing owns inbound *information* resolution only. It does **not** replace operational owners of lifecycle transitions, tours, scheduling, attendance, billing, payments, ledger, communication delivery, or business-process execution. After approval the executor **invokes** those owners' commands.

### Semantic command set (the only things a Commit Plan may target)
`create_person` · `update_record_fields` · `create_household` · `link_person_to_household` · `add_child_to_household` · `create_lead` · `link_person_to_lead` · `create_process_participation` · `attach_document` · `invoke_workflow` · `propose_merge` (V1 escalation, no execution). Each command is registered, idempotent, org-scoped, and reached via the `executeAdminAction` / `POST /api/admin/actions/execute` pattern **[C]**; each owns its physical mapping so Processing stays decoupled from transitional storage (Decisions A, B).

---

## 7.2 Canonical runtime objects (one purpose each)

Each object has **one** unambiguous purpose and a classification: **retain** (use as-is), **generalize** (extend an existing type), **deprecate** (legacy), **new**. Persistence follows the **reduced 7-table model** (data-model §): typed tables for evidence lineage, resolution/explainability, versioned plans, approvals, attempts, exceptions; JSON for flexible governed shapes (candidates/signals/mapping).

| Object | Single purpose | Class | Anchor | Persisted in |
|---|---|---|---|---|
| **Intake Envelope** | Immutable record of one inbound event + trusted context | generalize | `IntakeSourceEnvelope` **[C]** | `processing_case_sources` (+ raw snapshot) |
| **Processing Case** | The durable unit of intake work + lifecycle state | generalize | `processing_cases` **[C]** | `processing_cases` |
| **Submission** | A source reference attached to a case (primary/related) | retain | `processing_case_sources` **[C]** | `processing_case_sources` |
| **Attachment** | A document/file bound to a case as evidence | generalize | source-kind `document` + `documents` **[C]** | `documents` + `processing_case_sources` (role) |
| **Intake Fact** | One extracted, normalized value with its evidence | generalize | `IntakeFact` **[C]** | `processing_facts` |
| **Evidence Reference** | Where a fact came from (line/span; page/bbox/path future) | generalize | `IntakeFact.evidence`+span **[C]** | `processing_facts.evidence` (jsonb) |
| **Semantic Mapping** | Which facts populate which target field | generalize | `IntakeFieldMappingResult` **[C]** | jsonb on the plan operation / fact (no separate table) |
| **Identity Subject** | A provisional real-world party (parent/child/household) | generalize | `IntakePersonCandidate`/`IntakeHouseholdCandidate` **[C]** | `processing_resolutions` (one row per subject) |
| **Candidate Match** | An existing record a subject might be | generalize | `IntakeRecordResolutionCandidate` **[C]** | `processing_resolutions.candidates` (jsonb) |
| **Identity Signal** | One typed reason a candidate matches (polarity+weight) | generalize | `reasons[]`/`RecordResolutionMatchKey` **[C]** | within `candidates` jsonb |
| **Contradiction** | A negative signal against a candidate | generalize | `blocking_conflicts[]` **[C]** | within `candidates` jsonb (polarity=contradict) |
| **Resolution Decision** | The chosen action for a subject | generalize | `IntakeRecordResolutionProposal` **[C]** | `processing_resolutions` |
| **Recommendation** | A proposed change to canonical data | generalize | `IntakeRecommendation`+proposal **[C]** | `processing_plan_operations` (a plan is the recommendation set) |
| **Commit Plan** | The versioned, immutable, approvable diff | generalize | `CreateLeadCommitSelection` **[C]** | `processing_commit_plans` |
| **Commit Operation** | One typed op targeting a semantic command | generalize | `CreateLeadCommitRecord` **[C]** | `processing_plan_operations` |
| **Approval** | Binding of an approver to one plan version+hash | generalize | `include_in_commit`+BOS `approved` **[C]** | `processing_approvals` |
| **Commit Attempt** | One execution run + per-op results | new | `MutationResult`/`HandoffResult` shape **[C]** | `processing_commit_attempts` |
| **Commit Result** | Outcome of one operation | generalize | `MutationResult` **[C]** | within `commit_attempts.operations` (jsonb) |
| **Exception** | A blocker/warning/duplicate/partial-commit needing attention | generalize (unify) | `IntakeReviewWarning`+blockers **[C]** | `processing_exceptions` |

**Folded (not separate tables):** Semantic Mapping (→ jsonb), Identity Subject + Candidate + Signal + Contradiction (→ `processing_resolutions`, candidates as governed jsonb), Recommendation (→ `processing_plan_operations`), Commit Result + Compensation (→ `commit_attempts` jsonb). **Deprecated anchors:** none removed in V1; `contacts` stays legacy. See data-model for the 7-table set and phase gating.

**Versioning & immutability.** The Commit Plan is content-hashed; any material change → new version → prior approval void (mirrors `BosProposalEnvelopeV1` fail-closed **[C]**). Facts are immutable; operator corrections append a new fact `corrected_from` the original.

---

## 7.3 Source adapter contract

```ts
interface IntakeSourceAdapter {
  readonly source_kind: ProcessingCaseSourceKind;   // reuse enum [C]
  buildEnvelope(input: RawSourceInput): Promise<IntakeEnvelope>;
}
type IntakeEnvelope = IntakeSourceEnvelope & {       // generalize [C]
  org_id: string;
  idempotency_key: string;                            // submission id / message sid / import-row hash
  trust_context: {                                    // server-stamped, unspoofable (cf. mergePublicSubmissionMeta [C])
    authenticated_subject_id?: string;                // portal identity (trusted, Decision C/J)
    submission_token_id?: string;                     // existing-record/packet token (trusted)
    launch_context?: { form_context_mode?: 'lead_capture'|'existing_record'|'document_update'|'packet';
                       source_entity_type?: string; source_entity_id?: string;
                       auto_create_person?: boolean; /* default false [C] */ };
  };
  location_hint?: string | null;
};
```
**Adapters may:** read their source row; stamp trust server-side; declare `location_hint`; attach related sources. **Must not:** match, generate candidates, or write records. V1 adapters wrap existing on-ramps: `FormSubmissionAdapter`, `DocumentUploadAdapter`, `PacketAdapter`, `ManualPasteAdapter` (`parseCreateLeadIntakeText` **[C]**). Future: `ImportAdapter`, `ApiAdapter`, `EmailInboundAdapter`, `CommsDerivedAdapter`.

---

## 7.4 Evidence & provenance

```
Original source (immutable snapshot) → Extracted value → Normalized fact (canonical normalizer id)
  → Semantic mapping → Identity signal (typed, polarity, weight, rule/model version)
  → Candidate match → Resolution decision → Commit operation → Committed result
```
- **Immutable originals:** raw envelope snapshot preserved; attachments keep `checksum_sha256` **[C]**.
- **Operator corrections:** never overwrite; append `processing_facts` with `corrected_from` (cf. `operatorCorrection.ts` **[C]**).
- **Evidence refs:** `source_line`/`source_span` today **[C]**; jsonb reserves page/bbox (OCR future), email span, API path, import cell.
- **Rule vs model:** each signal records `produced_by` + version (cf. `classifier_version` **[C]**); model outputs are proposals only.
- **Retention:** governed by **retention classes** (data-model §7 — product-owner finalized: committed-lineage = life of record + org/legal; uncommitted/rejected/duplicate = 24 mo; raw OCR/transient = 12 mo after completion; plans/approvals/attempts/audit = 7 yr; PII logs = only as long as operationally necessary). `retention_class` is a first-class column **from the foundation**; purge jobs are a later phase (none today **[C]**). PII kept out of AI prompts (existing redaction **[C]**).
- **Reprocessing:** appends a new candidate generation + plan version; prior retained (Decision 15). Idempotent on envelope key (`uq_pcs_primary_source_once` **[C]**).

---

## 7.5 Identity Subject model (Decision A)

| Subject | Provisional type | Resolves to |
|---|---|---|
| Parent/Guardian | `IntakePersonCandidate` (role) **[C]** | `persons` + `customer_persons` link (Parent = role, not entity) |
| Child | `IntakePersonCandidate` (child) **[C]** | `customer_members` (+ optional `persons`) |
| Household/Family | `IntakeHouseholdCandidate` **[C]** | `customers` (container, **derived** — not independently matched) |
| Enrollment context | `program_interest`/`start_date`/`location` **[C]** | `opportunities` + participation |
| Lead context | existing-open-lead detection **[C]** | `opportunities` |

Household matching is **derived** from resolving members + `customer_persons` (`findCustomerIdForPerson` **[C]**). Supports multiple guardians, shared custody, multiple households (many-to-many `customer_persons`), siblings, one person in many families, shared phone/email, multi-child submissions (`children[]` **[C]**), and multi-household submissions (split into linked cases, Decision 10).

---

## 7.6 Candidate generation (separate from scoring)

`queryMatches.ts` generates; `matchIdentity.ts` scores **[C]**. Tenant-scoped; `location_hint` re-ranks (never excludes); archived included+flagged; **capped lists** (replace the current `.limit(1)` first-match **[C]**); order email→phone→name→name+DOB backed by non-unique normalized indexes (Decision C); relationship/household/lead expansion (`findCustomerIdForPerson`, `listHouseholdChildMembers`, `findExistingLeadForIntake` **[C]**); external ids via `external_mappings` **[C]**; generations timestamped (stale → invalidate dependent approval).

---

## 7.7 Signal & confidence model

Deterministic-first; **no single percentage is authoritative**. 6-band model extending the existing 5-band **[C]**:

| Band | Meaning | Default action |
|---|---|---|
| **Confirmed** | Trusted identity or exact key + no contradiction | Auto-link *only* under policy (Decision J); else review |
| **Strong** | Strong deterministic signal corroborated | Recommend link; review unless policy |
| **Possible** | Single supporting signal | Review required |
| **Weak** | Similarity only | Review required |
| **Conflicted** | Support + contradiction | Hold; operator decides |
| **Excluded** | Exclusion rule fired (tenant/hard contradiction) | Never selected |

Each candidate carries typed signals `{signal_type, polarity: support|contradict|exclude, weight, evidence_ids, produced_by, rule/model_version}`. Band is **derived** from signals by a versioned explainable ruleset; optional numeric `score` **[C]** may display but is not authoritative. New-record creation requires the min-evidence of Decision D. Explainability payload per candidate: what/why/support/contradiction/rule-or-model/what-changes.

---

## 7.8 Household graph resolution

Resolution is a graph (`IntakeHouseholdCandidate.relationships[]` **[C]**). Individual matches reinforce/contradict the household conclusion: a child matched inside parent A's resolved household raises its band; a household-level contradiction lowers it → Conflicted. `resolveIntakeRecordResolution` already resolves guardians→household→children→lead **[C]**; V1 promotes this to explicit cross-subject signal propagation recorded in `processing_resolutions`.

---

## 7.9 Lead & Enrollment resolution (Decisions B, E)

Recommendation selection follows Decision E's rules. Participation is expressed as the semantic op `create_process_participation` (Decision B) — Processing does **not** choose OCM vs `process_instances`; the `add_participation` command does. Not every submission creates a Lead: the resolution decides create / update / attach / resume / no-op / request-information.

---

## 7.10 Recommendation model

| Type | Anchor | Semantic command target |
|---|---|---|
| Create | `create_new` **[C]** | `create_person`/`create_household`/`add_child_to_household`/`create_lead` |
| Update | DCP field apply (planned) **[C]** | `update_record_fields` |
| Link | `link_existing` **[C]** | `link_person_to_household`/`link_person_to_lead` |
| Attach | attach existing lead **[C]** | `create_process_participation`/`attach_document` |
| Invoke workflow | side effects **[C]** | `invoke_workflow` |
| No-op | `attached_existing` **[C]** | (none; recorded) |
| Request information | **[P]** | (pause case) |
| Escalate duplicate / Propose merge | `review_required`/`conflict` **[C]** | `propose_merge` (V1: escalation only, Decision H) |

Each recommendation carries: target, proposed values, **before/after**, supporting facts, supporting decisions, reason, confidence band, risk, preconditions, dependencies, editability, approval requirement, downstream effects.

---

## 7.11 Merge model (Decision H — propose-only in V1)

Match selects; Link associates; **Merge collapses two existing records** and is **proposal-only in V1**: Processing surfaces `propose_merge` (a duplicate `processing_exceptions` row) but never executes merge in ordinary intake commit. Merge **execution** = Phase-F privileged workflow (survivor/merged selection, conflict resolution, tombstone/alias redirects, relationship/history/document/work/comms reprojection, audit, reversibility). Never a candidate-selection side effect; never automatic.

---

## 7.12 Operator workflow contract

Three-pane review on the frozen Digital Mailroom Processing surface: **Evidence** (source + facts) · **Resolution** (subjects → candidates with support/contradictions → decisions) · **Plan** (operation diff → approve). Capabilities: view original + facts; correct interpretations (new fact version); edit mappings; compare candidates; accept/reject/search/choose/declare-new/mark-unresolved; request information; edit/reject recommendations; review the full diff; approve/decline; reopen on stale-plan. Approval binds to the exact plan version+hash; any edit regenerates the plan and clears approval (Decision F).

---

## 7.13 Commit Plan

```ts
type CommitPlan = { plan_id; case_id; org_id; version; content_hash;      // approval binds to (version, content_hash)
  operations: CommitOperation[]; preconditions: Precondition[];
  requires_approval; requires_privileged_approval; reversible; built_at };
type CommitOperation = { op_id;
  kind: 'create'|'update'|'link'|'attach'|'invoke_workflow'|'no_op'|'propose_merge';
  command_key;                              // one of the semantic commands; NEVER a table write
  target_type: 'person'|'household'|'child'|'lead'|'participation'|'document'|'record_fields'|'merge_candidate';
  before?; after?;                          // diff
  depends_on: op_id[]; atomic_group?;       // Decision G
  precondition_record_version?; compensation? };
```
Shows creates/updates/links/attachments/workflow invocations/no-ops/merge proposals, preconditions, record versions, execution order, atomic groups, compensation, approval requirements, reversibility. All operations originate from **registered recommendation types** (Decision F). Approval binds to one exact version+hash.

---

## 7.14 Commit execution (Decision G)

The **Commit Executor** consumes an approved plan and invokes **semantic commands** — never raw-writes, never reinterprets the plan, never changes the selected target.
- **Atomic groups:** the identity group (person+household+links+child) commits in one transaction (a DB function per group, mirroring the mutation RPC atomic state+outbox **[C]**); the dependent lead/participation group sequences after it.
- **Async outbox:** comms/tasks/documents/automations/projections fire after commit via events; **comms failure never rolls back identity**.
- **Idempotency:** per-op key (plan_id+op_id); safe retry (subscribers idempotent on `mutation_id` **[C]**).
- **Partial failure:** stop; committed groups stand; `processing_commit_attempts` records per-op results; reversible ops compensate; case → `partially_committed`. Record creation is never auto-deleted (hard-delete prohibited) — flagged for operator.
- **Optimistic concurrency:** each op asserts `precondition_record_version`; mismatch → fail closed → reopen.
- **Permission & tenant revalidation** at execution; audit/activity via `workflow_events` + case outcome (`dbCompleteProcessingCaseWithResult` pattern **[C]**).

---

## 7.15 State model

Top-level `status`: `received → extracting → resolving → recommending → ready_for_commit_review → approved → committing → committed`, with branches `needs_understanding_review`, `needs_identity_review`, `needs_recommendation_review`, `needs_information`, `partially_committed`, `exception`, `cancelled`, `archived`. **Readiness projections** (`understanding_ready`, `identity_ready`, `recommendation_ready`, `commit_ready`) are **derived**, not stored — they drive review lanes without multiplying status columns (consistent with Status Truth Doctrine: status is durable truth, position/readiness are separate **[D]**). One `status` column + readiness projections.

---

## 7.16 Policy & authority (Decision J)

Versioned, org-scoped, server-enforced policy seam (modeled on `metadata.ai_policy`/`apply_policy` **[C]**), **all off by default in V1**. V1 permits at most: trusted-identity candidate **preselect** (still operator-approved) and pure **no-op auto-complete** (off by default). **Never auto-committed in V1:** create/link/merge/contact-change/contradicted ops/untrusted-anonymous ops. Policies are versioned, explainable, audited, recorded in the plan, and **cannot override hard protections** (RLS, tenant boundary, merge-privilege, hard-delete prohibition). Broader automation is Phase G, gated on measured accuracy.

---

## 7.17 Security & privacy

Org-scoped generation + commit; **prerequisite fixes:** add `persons.org_id` FK; org-scope `admin_ops_full_access` on customers/opportunities/contacts/OCM **[C]** (risk R-CROSS-TENANT). `location_hint` + permission scope. Commit under `requireAdminOrOps` + action permissions **[C]**; approval permissioned; merge privileged. `retention_class` on facts/evidence; PII out of prompts (redaction **[C]**) and logs. Attachment RLS + storage bucket **[C]**. AI propose-only, gated, redacted **[C]**. Adapters stamp trust server-side; anonymous never bypasses review absent explicit policy. Retire global `contacts` uniques; re-assert org in generation + commit.

---

## 7.18 Observability

Emit via the event spine, keyed by `org_id`/`source_kind`/`rule-or-model_version`: cases by source; resolution success; manual-review rate; candidate acceptance/rejection; false-match corrections; **duplicates prevented** and **duplicates created** (alarm); no-op rate; commit failures; partial commits; stale plans; per-stage latency; rule/model performance; adapter errors; operator overrides; **cross-tenant-leak** (alarm).

---

## Appendix — reuse ledger

| Need | Existing asset | Action |
|---|---|---|
| Envelope / Facts / Household graph / Candidate / Recommendation / Commit selection | `lib/intake/*`, `resolve/*`, `createLeadCommitSelection` **[C]** | generalize |
| Approval / versioning | `BosProposalEnvelopeV1` **[C]** | adopt pattern |
| Status commit | `lib/mutations/*` + RPCs **[C]** | invoke; add `person_status` handler |
| Record/link/participation commit | (none) | **new registered semantic commands** |
| Durable case | `processing_cases`/`_sources` **[C]** | generalize |
| Resolver seam | `RecordResolver` **[C]** | canonical Processing resolver implemented; deferred fallback removed |
| Identity primitives | `intakePersonMatch.ts`, `intakeIdentityLookups.ts` **[C]** | converge into `lib/identity` |
