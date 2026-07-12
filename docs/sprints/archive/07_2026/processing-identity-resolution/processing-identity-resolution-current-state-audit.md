# Processing Identity Resolution — Current-State Audit

**Status:** Historical pre-implementation audit. **Do not treat the findings below as current runtime state.**

**Implementation reconciliation (2026-07-12):** the gaps identified here were closed locally through E1: durable facts and resolutions, immutable Commit Plans and approvals, registered identity commands, deterministic executor, operator review, authoritative Create Lead and public-form adapters, and retirement of their direct-write paths. Current status: **Implemented locally · Locally certified · Awaiting staging reconciliation · Not promoted · Not deployed.**

**Audit baseline:** `origin/staging` @ `65afc8527506057ece2798675c6050e86ca92bcf` (HEAD of audit branch `claude/proc-identity-resolution-audit`; the merge of PR #141 `feat/processing-form-workflow-finish`). Read-only audit — no runtime code, schema, or migration was modified by this artifact.

**Evidence tags:** **[C]** = confirmed by reading the code/migration. **[I]** = inferred from structure, comments, or absence of a constraint.

---

## 1. Executive summary

**At this audit baseline, Alloy did not have a canonical intake engine.** It had three overlapping intake substrates plus a purpose-built seam that anticipated this sprint. The hard contracts already existed and were well-typed; the audit identified the durable evidence store, versioned approval-bound plan, executor, and direct-write retirement work that V1 subsequently implemented.

### What exists (reusable)
- A **pure, source-agnostic intake pipeline** — `web/lib/intake/*`: extract → normalize → group → map → **resolve** → recommend → review, with typed Facts (with evidence), a Household Graph, Candidate Matches (with `reasons[]` and `blocking_conflicts[]`), a 5-band confidence, and Proposals. **[C]**
- A **durable Processing Case** — real tables `processing_cases` + `processing_case_sources` (`20260612120100_pos_processing_cases_v1.sql`), a 7-state lifecycle, and a **source-idempotency guarantee** (`uq_pcs_primary_source_once`). **[C]**
- A **deterministic document toolchain** — text-layer PDF extraction (`unpdf`, no OCR), a 583-line structure detector (`fp11.3`), classification (`fp9.1`, confidence capped ≤0.95), and form-draft generation. **[C]**
- A **commit-execution runtime** — `web/lib/mutations/*` (4-phase DecisionIntent → MutationResult, `mutation_events` outbox, idempotent `mutation_id`) that **rejects direct status PATCH** and executes typed domain RPCs. **[C]**
- A **versioned proposal/approval substrate** — `BosProposalEnvelopeV1` (optimistic concurrency, fail-closed on stale) and the BOS **propose → human-approve → apply via registered action keys** governance pattern. **[C]**

### What is fragmented or dangerous
- **The Processing Case is opened in parallel, never as a gate.** For the live public-form path, `applyFormIntakeSafe` writes `persons/customers/opportunities/customer_members` *before* the case is opened; the case only references the submission. **No inbound source commits identity through a Processing Case approval step — that gate does not exist yet.** **[C]**
- **At the audit baseline, the record-resolver seam was a no-op stub.** `web/lib/pos/recordResolution/recordResolverSeam.ts` exposed `deferredRecordResolver`, which returned `deferred` and never called the real `lib/intake/resolve` brain. V1 replaced and removed that fallback. **[C]**
- **The canonical mutation layer governs almost nothing.** `web/lib/mutations/*` is wired to two commands (status only), one route, two tables; even those two status fields have **three** competing writers; there is **no record-creation, link, or merge command**. Every identity record is created/linked/hard-deleted by raw `supabase.from(...)`. **[C]**
- **The canonical identity table has no uniqueness.** `persons` has no unique constraint on email/phone/name/dob and no org FK — duplicate persons are DB-legal; the 23505 recovery guarding person inserts can never fire (dead code). Meanwhile the *deprecated* `contacts` table carries **global (non-org) unique** indexes on email/phone (cross-tenant collision + doubled redundant indexes). **[C]**
- **Normalization is inconsistent.** Phone has **three mutually incompatible canonical forms** (E.164, digits-only-10, no-canon); email has 9 normalizers; "find-or-create person" has 6 entry points; two person-matchers disagree (ambiguity-safe vs first-match). **[C]**
- **No merge exists.** All "merge" code is match-and-link or in-memory projection collapse; a privileged record-merge workflow is greenfield. **[C]**

### What blocks a canonical engine (ranked)
1. No durable, typed **evidence + resolution + plan** store (facts/decisions live in `metadata` jsonb and derived presentation state).
2. No **versioned, immutable Commit Plan** bound to one approval; the mature `CreateLeadCommitSelection` is create-lead-specific.
3. No **commit executor** that routes creates/links/updates through canonical commands; three ad-hoc writers exist instead.
4. Pre-resolution **direct writes** from live sources must be wrapped/retired.
5. **Identity primitives** (phone/email/name/dob normalization, candidate generation) are duplicated and contradictory — must converge to one library with DB support.

### Recommended direction
Promote `lib/intake/resolve` to the **canonical Record Resolution service** behind the existing `RecordResolver` seam; persist the middle of the pipeline as **typed evidence/resolution/plan tables** hung off `processing_cases`; generalize `CreateLeadCommitSelection` into a **source-agnostic, versioned, immutable Commit Plan** approved once and executed by a **Commit Executor** that calls canonical record-creation + mutation commands (never raw writes); route sources in as **thin adapters** producing the existing `IntakeSourceEnvelope`; and cut over the **live public-form path first** in shadow mode. This is the same shape the repo already named as "the next separate sprint."

---

## 2. The three intake substrates (and how they relate)

| Substrate | Location | Role | Persistence | Status |
|---|---|---|---|---|
| **Intake Engine (pure)** | `web/lib/intake/*` | Source-agnostic extract→map→resolve→recommend→commit-overlay | None (pure functions) | Library; wired mainly to Create Lead **[C]** |
| **Processing Case (durable)** | `web/lib/pos/processingCase/*` | Reference envelope + 7-state lifecycle + classification/structure/form-draft | `processing_cases`, `processing_case_sources`; results in `metadata` jsonb | Real tables; "staging QA candidate, not V1 complete" per `07_2026/processing-intake-completion-closeout.md` **[C]** |
| **Forms Intake (live writer)** | `web/lib/forms/intake/*` | Public-form lead-capture → CRM identity writes | Writes `opportunities` etc. directly | Shipping in production **[C]** |

**Relationship:** the pure engine supplies contracts the durable engine reuses (`IntakeHouseholdCandidate` is imported by the seam, not redefined). The live forms writer runs **independently** of both — it is the production path and it bypasses the resolve engine. The strategic goal is to make **one** durable spine (`processing_cases` + the resolve brain) the single path, with forms/create-lead/documents as adapters.

**"Digital Mailroom" vs "Processing":** per `docs/platform/modules/documents-and-forms.md`, **Digital Mailroom** is the operator-facing product ("Import Form → Review → Generate native form → Studio Builder"; V1 UI approved/frozen 2026-07-08); **Processing is the engine underneath.** Identity Resolution is a new engine capability surfaced through the same operator product, not a new operator surface. **[C]**

---

## 3. Existing runtime object contracts (firsthand)

### `web/lib/intake/types.ts` **[C]**
- `IntakeSourceKind` = `paste_text | form_submission | document | email_body | api_payload` — the source enum.
- `IntakeSourceEnvelope` `{source_id, source_kind, captured_at, raw_material, metadata?}` — **the Intake Envelope, already exists.**
- `IntakeFact` `{fact_id, fact_type, raw_value, normalized_value, confidence, validation_state, source_line?, source_span?, evidence?, role_hint?}` — Fact + Normalized Fact + Evidence folded into one type.
- `IntakePersonCandidate`, `IntakeAddressCandidate`, `IntakeLocationCandidate`, `IntakeRelationshipCandidate` (`parent_guardian_to_child | household_to_person | lead_to_person | unresolved`), `IntakeHouseholdCandidate` (parents_guardians, children, household_contacts, relationships, `commit_limited_to_primary?`) — **the provisional Identity Subject graph.**
- `IntakeFieldCandidate` / `IntakeFieldMappingResult` — the Semantic Mapping.

### `web/lib/intake/resolve/types.ts` — "Source-agnostic record resolution for intake flows (Create Lead, forms, POS, imports)" **[C]**
- `IntakeRecordMatchConfidence` = `exact_match | probable_match | possible_match | no_match | conflict` (5-band).
- `IntakeRecordResolutionAction` = `link_existing | create_new | review_required | reject`.
- `IntakeMatchedEntityType` = `person | customer | customer_member | opportunity` (canonical entities).
- `IntakeRecordResolutionCandidate` `{…, matched_entity_type, matched_entity_id, confidence, score?, reasons[], blocking_conflicts?, match_display_name?}` — **Candidate Match with explainability + contradictions.**
- `IntakeRecordResolutionProposal` `{intake_candidate_id, action, selected_match_id?, confidence, reasons[]}` — **Recommendation.**

### `web/lib/intake/resolve/commitOverlayTypes.ts` + `web/lib/admin/actions/createLead/commit/createLeadCommitSelection.ts` **[C]**
- `CreateLeadCommitSelection` `{version:1, parents[], children[], household_contacts, household_address?, household_resolution?, lead_resolution?}` — **the commit plan (versioned, but create-lead-specific and not persisted immutably).**
- `CreateLeadCommitRecord` `{include_in_commit, primary, commit_blockers[], validation_state, resolution?}` — the commit operation with per-record approval flags.

### `web/lib/mutations/types.ts` **[C]**
- `DecisionIntent`, `MutationResult` (committed|blocked|previewed, `mutationId` idempotency), `MutationDomainKey` = `lead_status | enrollment_status | person_status | account_status` — but only the first two have registered handlers.

### `web/lib/pos/processingCase/types.ts` + `recordResolution/recordResolverSeam.ts` **[C]**
- `ProcessingCaseStatus` = `received | processing | needs_review | needs_resolution | ready | completed | archived`.
- `ProcessingCaseSourceKind` = `form_submission | form_packet_session | document | upload | email_attachment | import | recreated_document` — full source taxonomy already enumerated.
- `RecordResolver.resolve(candidate, context) → RecordResolutionProposal` — the seam V1 subsequently filled; `deferredRecordResolver` was the audit-baseline no-op.

---

## 4. Gap analysis against the target pipeline

Target: `Receive · Preserve · Extract · Normalize · Map · Resolve · Recommend · Review · Build commit plan · Approve · Commit · Record outcome`.

| Stage | Where it lives | Verdict |
|---|---|---|
| **Receive** | `IntakeSourceEnvelope`; POS `openProcessingCaseFromSource` + `maybeOpen…Safe` on-ramps; forms submit | **Exists-canonical (POS) / fragmented across forms** |
| **Preserve** | `processing_case_sources` (reference-only, copies no data); `raw_material` on envelope; PDF bytes via `documentBytes.ts`; `documents.extracted_text/extracted_data` | **Exists but reference-only** — no immutable original-snapshot store; corrections overwrite |
| **Extract** | `extractFactsFromText` (regex); POS `buildProcessingExtraction`/`documentFacts`; `detectDocumentStructure` (fp11.3) | **Exists-canonical (deterministic; no OCR/LLM)** |
| **Normalize** | `web/lib/intake/normalize/*` (folded into `IntakeFact.normalized_value`) | **Exists but duplicated/contradictory** (3 phone forms, 9 email, 2 dob) |
| **Map** | `IntakeFieldMappingResult`; `mapFactsToActionIntake` (only `create_lead` wired) | **Exists-fragmented** (single action; stub otherwise) |
| **Resolve** | `resolveIntakeRecordResolution` + `matchIdentity` + `queryMatches`; `resolveIntakeIdentity` (FP8a read-only) | **Exists-canonical but not wired to POS** (seam is a stub) |
| **Recommend** | `IntakeRecordResolutionProposal` + `defaultActionForConfidence`; `IntakeRecommendation` | **Exists-canonical** |
| **Review** | `buildIntakeReviewPresentation` + `IntakeReviewWarning`; submission linkage-review UX; POS read-models | **Exists (presentation) / UI-only for operators** |
| **Build commit plan** | `CreateLeadCommitSelection` + `applyResolutionToCommitSelection` | **Exists-fragmented** (create-lead-specific; not versioned-immutable; not persisted) |
| **Approve** | `include_in_commit`/`primary` flags; POS approve route; BOS proposal envelope pattern | **Exists-fragmented** (no first-class Approval bound to a plan version) |
| **Commit** | `executeCreateLeadHouseholdCommit` (rich) / `runMinimalDestinationHandoff` (minimal) / `applyFormIntakeSafe` (live) | **Exists-fragmented** (3 separate writers; no unified executor; none invoke canonical commands for creation) |
| **Record outcome** | `dbCompleteProcessingCaseWithResult` → status + `metadata.operational_result`; forms lifecycle events | **Exists-canonical but thin** (jsonb, not an Outcome Engine) |

**Cross-cutting missing:** a unified **Exception** type (dispersed across `IntakeReviewWarning`, `blocking_conflicts`, `commit_blockers`); a persisted **evidence/provenance lineage**; **idempotency** on inbound events (`form_submissions` and `workflow_events` have none); a 6-band **signal model** with contradictions first-class (today: 5-band with `blocking_conflicts[]`).

---

## 5. Direct-write violation summary

The full matrix is in [source-mutation-inventory](processing-identity-resolution-source-mutation-inventory.md). Classification of the inbound identity writers:

| Path | Writes | Class |
|---|---|---|
| `app/api/leads/gutters/route.ts` | `contacts` + `opportunities` (contact-first, LEGACY_COMPAT, non-idempotent) | **Must retire** |
| `backend/app/routes/leads.py:submit_cleaning_lead` | `contacts` + `opportunities` + GHL | **Must retire** (per own header, "until redirected to /book-v2") |
| `lib/forms/intake/applyFormLeadCaptureIntake.ts` | (would write persons/opportunities) | **Dead code** (no route caller) |
| `lib/forms/intake/applyFormIntakeSafe.ts` | `persons/customers/customer_persons/opportunities/opportunity_persons/customer_members` before the parallel case | **Must wrap / needs decision** — the central pre-case identity commit |
| `app/api/book-v2/quote-start`, `specialty-quote-start` | `persons/opportunities/locations/person_locations` via **first-match** matcher (no ambiguity guard) | **Must wrap** (share the ambiguity-aware matcher) |
| `app/api/book-v2/confirm` | full commercial graph, guarded by `booking_attempt_id` | **Legitimate operational** |
| `app/api/vendor-application` | `persons/vendors/contacts/documents` (own `pending` gate) | **Legitimate operational** |
| Manual **Create Lead** (`entryLifecycleActions.executeCreateLeadAction`) | full household + `process_instances`; opportunity **not idempotent** | **Legitimate operational** (add idempotency) |
| `app/api/admin/persons/route.ts` | blind `persons` insert (no dedup) | **Must wrap if any bulk caller** |
| Inbound SMS (`backend/.../sms_inbound.py`) | messages only; never a person; no `external_sid` dedup | **Legitimate (comms) — fix idempotency** |

**Boundary reminder (from the initiative):** book-v2 confirm, vendor application, and manual Create Lead are legitimate *operational* funnels — the audit does not propose forcing every mutation through Processing. It proposes that **inbound-information** identity resolution converge, and that even legitimate funnels **share the one resolver library** and gain idempotency.

---

## 6. Legacy & duplication inventory

| Category | Items | Evidence |
|---|---|---|
| **Duplicate normalizers** | Email ×9; phone ×3 incompatible canonical forms; name-part (collapse `\s+` vs not); DOB ×2 byte-identical | `bookingIdentityNormalize.ts`, `contactNormalize.ts`, `forms/intake/intakePersonMatch.ts`, `intake/normalize/*`, `communications/recipientKey.ts`, `communications/v2/inboundNormalization.ts`, `pos/…/fieldNormalization.ts` **[C]** |
| **Duplicate matchers** | `childIdentityMatches` ×2; two person-matchers (ambiguity-safe `applyFormIntakeSafe` vs first-match `findOrCreatePersonInOrg`) | `intake/resolve/matchIdentity.ts`, `admin/person/findOrCreateChildPersonInOrg.ts` **[C]** |
| **Duplicate find-or-create** | 6 person entry points | `lib/persons/findOrCreatePersonInOrg.ts`, `forms/intake/applyFormIntakeSafe.ts:insertPersonForIntake`, `admin/person/upsertAndLinkPersonForAdmin.ts`, `admin/person/findOrCreateChildPersonInOrg.ts`, `bookingResolver.ts`, `bookingPersonCustomerResolve.ts` **[C]** |
| **Competing commit writers** | 3 (create-lead household / POS handoff / forms intake) | §2, §5 **[C]** |
| **Competing status authorities** | 3 for `opportunities.status_key` / OCM `outcome_status_key` | runtime RPC vs `updateOpportunityStatusWithEvent` vs `updateOpportunityCustomerMemberLifecycleStatus` **[C]** |
| **Dual person representation** | `persons` vs legacy `contacts.person_id` | entity-model.md; person-vs-contact-audit.md **[C]** |
| **Dual child-participation substrate** | `opportunity_customer_members` vs `process_instances` (create-lead moved to the latter; intake/relationship/REST still write OCM) | `createLeadChildOcmPersistence.ts`, `20260713000000_process_instances.sql` **[C]** |
| **Dead code** | `applyFormLeadCaptureIntake.ts`; `persons`/`opportunity_persons` 23505 recovery (no constraint to violate) | **[C]** |
| **Deferred stub (audit baseline)** | `deferredRecordResolver` (POS did not call the real resolver; removed by V1 closeout) | `recordResolverSeam.ts` **[C]** |
| **Superseded doctrine** | `operational-mutation-platform.md` (never realized for identity) | header marks Superseded **[C]** |

**Deletion caution:** do not delete `applyFormLeadCaptureIntake.ts` or the 23505 recovery blocks without a dependency pass — the recovery code becomes live if/when `persons`/`opportunity_persons` gain unique constraints (a proposal in the data model). Retire only after the constraint decision is made.

---

## 7. Security & schema findings (identity-relevant)

- **`persons`:** no uniqueness, no org FK; org isolation rests solely on RLS. Duplicate persons DB-legal. **[C]**
- **`contacts`:** global (non-org) unique on `lower(trim(email))` and `phone`, each **doubled** by a redundant index — cross-tenant collision and information leak on insert failure. **[C]**
- **`customer_members`:** no natural-key unique — duplicate children not DB-prevented. **[C]**
- **`processing_case_sources`:** `uq_pcs_primary_source_once` UNIQUE(org_id, source_kind, source_id) WHERE role='primary' — the on-ramp idempotency guarantee. **[C]**
- **`form_submissions`:** no idempotency key — resubmission = duplicate row (deduped only downstream by submission id). **[C]**
- **`workflow_events`:** no event-id/idempotency column — duplicate emits DB-legal. **[C]**
- **RLS defect:** legacy `admin_ops_full_access` on `customers`/`opportunities`/`contacts`/OCM is **not org-scoped** — an admin/ops `app_user` can read/write every org's data. **[C]** (predicate confirmed; impact depends on whether `app_users` is strictly internal — **[I]**).
- **No retention/TTL/purge** anywhere; PII in `documents.extracted_text/extracted_data` and `form_submissions.payload`; deletion is hard-delete only (e.g. `20260712000000_remove_auto_seeded_identity_demo.sql`, `deleteOpportunityLead.ts`). **[C]**
- **No OCR / no AI in intake:** extraction/classification/matching are fully deterministic; AI is gated propose-only enrichment; inbound email and email-attachment intake are absent. **[C]**

Full per-table detail in [data-model](processing-identity-resolution-data-model.md) and the risk register.

---

## 8. Operator workflow (as-built)

- **Where cases are reviewed:** AdminV2 sidebar **Processing** → `ProcessingModal` (Digital Mailroom); forms submissions list with a **Linkage** column (`Needs review` / `Link CRM`) and submission detail with an amber blocked-by-linkage callout. **[C]**
- **Decisions available:** Confirm linkage / Correct linked records (Advanced UUID paste); operator classification correction on documents; packet review `approve | reject | needs_correction`. **[C]**
- **Editable extracted values / mappings:** partially — form-draft mapping is editable in the builder; extracted facts are review-surfaced. **[C]**
- **Existing-record candidates shown:** **not yet** — the linkage panel does not present resolver candidates (the resolver is not wired). **[C]**
- **Commit preview / immutable plan:** **no** — approval binds to per-record `include_in_commit` flags, not to a persisted plan version; POS approve is a minimal single-person write. **[C]**
- **Create-new from linkage:** **explicitly deferred** — "Alloy does not create new persons, customers, child members, or opportunities from the submission linkage panel in this release" (`linkage-review-operator-flow.md`). **[C]**
- **Partial-failure visibility:** none — the three writers are not transactional plans; a mid-sequence failure leaves partial records. **[I]**

This defines the **future workflow contract** the RFC must deliver: view original + facts, edit interpretations/mappings, compare candidates with support/contradictions, accept/reject/search/declare-new/mark-unresolved, review the full diff, approve one immutable plan, and see partial-failure status.

---

## 9. Reconciliation flags (doctrine vs runtime)

Detailed in [doctrine-reconciliation](processing-identity-resolution-doctrine-reconciliation.md). Highlights:
- Doctrine already states the trust boundary ("public values are proposals until intake/DCP promotes them") — runtime honors it for packets but **not** for `applyFormIntakeSafe` lead-capture. **[C]**
- `operational-mutation-platform.md` claims "all mutations require the runtime" — contradicted by ~30 raw `opportunities.update` sites and all identity creation. **[C]**
- The canonical glossary defines **Person/Customer/Contact/Opportunity** but **not Intake, Processing, Processing Case, Identity Resolution, or DCP** — glossary additions required. **[C]**
- `intake_case_*` events are catalogued in `platform-event-catalog.md` but the derived-intake-case model says they are not all emitted — reconcile the event contract. **[C]**
