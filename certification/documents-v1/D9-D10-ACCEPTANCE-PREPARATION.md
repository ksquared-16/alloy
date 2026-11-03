# Documents V1 — D9 (external API) / D10 (email ingestion) acceptance preparation, and paperwork accountability

**Status: PREPARATION (2026-10-30), since partly implemented.** D9.1 (read-only standard documents, four operations) landed under `OPWORK_AA660DC9554D_SPRINT_5D62877D85D6`; §1.3 items 1–3 and the read half of 6 are now code. D10 holds every attachment until WS11 storage and screening exist. The rest of this document is the preparation record as written.
- Nothing in this document is implemented, and no API or email code was written.
- Every "exists" claim cites code. The cited symbols, and the stated absences, are pinned by `web/tests/documents/d9d10AcceptanceTraceability.test.ts`, so this document fails CI if it drifts from the tree.
- Objective `OPWORK_AA660DC9554D_SPRINT_6A4F60B1555E`, lane `lane_aa660dc9554d`, 2026-10-30.

**How claims are labelled:**
- **LOCATED:** the scope text exists and is quoted with its location.
- **INFERRED:** reasoned from adjacent text. It is not original scope.
- **UNLOCATED:** searched for and not found. That is not proof that no plan exists.

**Searches run for the original scope:**
- every Documents file ever committed;
- commit messages across all refs;
- pickaxe searches for `D9`, `D10`, "email ingestion" and "D9 consequences";
- module, API and planning docs.

The original phase plan (D0–D10) is **UNLOCATED** in this repository and its history. It was probably set in a Director authorization or sprint packet outside the repository. The Vacilando objective and Director stores were not searched.

## 0. Reconciliation of older R3/R4 claims with later receipts

`R3-R4-FINAL-CERTIFICATION.md` is a historical record and is not edited. Three of its statements were later superseded by governed receipts, read from the request store:

| Old claim (R3-R4-FINAL-CERTIFICATION.md) | Superseded by | What the receipt shows |
|---|---|---|
| "Status: NOT_YET_READY" (:3), and "D7 invariants are refused by a Vacilando analyzer defect" (:13) | `gar_3c51d48448eba3` / `tha_fdc9fb88ca74f4` (`database.run_rollback_invariant_test`) | **PASSED**. `certification/invariants/documents-d7-review-validity.sql` (`e3d42fad…`) ran on `certenv-55644086aa` (ALLOY_LOCAL_CERTIFICATION) at `625959cc07cd`: "ran to the end; rolled back; no change persisted", started 2026-10-29T21:59:26Z. The 10/10 local rollback pass is now matched in the isolated environment |
| D7 row "NOT RUN — refused statically by the harness" (:49) | same | The same file and hash ran to the end |
| "Not run: the R4 hosted gates" (:14), and the R4 persona rows "not run (persona)" (:101–103, :109) | R4 hosted matrix 35/35 on `qar_bc811ffc7da1` (commit `514788a11`) | `scoped_forms` 19/19, `health_viewer` 9/9, `doc_writer` 7/7 against contract Revision 3 |
| The R4 run's close as "ZERO_RESIDUE unproven" (commit `51135c2bd`) | Census `gar_bcf58ca61c3f22` / `tha_600d2394d06f41` (20 checks, query `7957a51a…`, run 2026-10-29T23:03:41Z), bound by `gar_6c56f9fdac73a5` / `tha_0443cce6454a32` (`environment.qa_run_close`, completed 23:25:53Z) | **`qar_bc811ffc7da1` CLOSED, verdict `ZERO_RESIDUE`, `access_clean: true`**, with the residue census attached |

**Still open from that record (unchanged):**
- the R4 synthetic fixtures for signed Forms, packet medical labels, enrollment-start renewal, BP document-stage readiness and attention above 1,000 (:101–107);
- the live suites against a certification environment (:111–112);
- R2 / R5 on hosted (see `R2-R5-PROOF-SUPPORT.md`).

## 1. D9 — external Documents API

### 1.1 Scope

**LOCATED:**
- `D5-PROCESSING-FILING.md:5` names it: "D9 (external API) … out of scope". The commit is `b5a2509c2`.
- `docs/api/documents-forms-api.md:70-74` gives the binding constraints:
  - an external Documents API "must call the same filing command (`commitDocumentFiling`) rather than writing associations, so it inherits the transaction, the Studio policy, the clearance check and the audit";
  - "its idempotency key should be caller-supplied";
  - "the stable refusal codes above are the contract to publish".
- `docs/api/api-architecture.md:52-54,75` sets the boundary. `/api/v1/**` is a frozen external contract. The caller is an Application Principal: Developer Application → Installation → Credential → scopes plus resource boundary, with "no admin session, no caller-selected tenant". "Service-role access must never mean unscoped access."

**INFERRED:**
- `docs/api/developer-platform/product/06-gaps-and-slice-b.md:52` (D-2) says documents are not modelled as external resources.
- The public OpenAPI spec (`docs/api/openapi/alloy-public-api.v1.json`) has no documents path.

**UNLOCATED:**
- the endpoint list;
- whether D9 is filing only, or also reads, downloads, uploads or requirement status;
- the scope names;
- the phase boundary;
- any partner use case.

### 1.2 What already exists (reuse; no new framework)

| Need | Existing capability |
|---|---|
| Partner authentication | `requireExternalPrincipal` (`web/lib/platform/external/externalRequest.ts`). Bearer token only; org, installation, scopes and boundary come from trusted state |
| Scope declaration and enforcement | `PUBLIC_SCOPES` / `PUBLIC_OPERATIONS` / `requireOperationScope` (`web/lib/platform/external/scopeCatalog.ts`). **There is no `documents.*` scope** |
| Resource boundary | `{mode: "org_wide"}` or `{mode: "locations", locationIds}` (`web/lib/platform/principal/platformPrincipalTypes.ts`). A request with no sites is refused `outside_boundary` |
| Rate limits | `consume_rate_limit` (`web/lib/platform/external/rateLimit.ts`): authenticated read 600/60 s, write 120/60 s per installation |
| Idempotency | v1 has **no** `Idempotency-Key` header; it is domain-native (attendance `external_event_id` gives 409 `idempotency_conflict`). Filing's own key is `commitDocumentFiling`'s `filingKey`: 8–200 characters, replays the committed record, and a different filing gives 409 `ALREADY_FILED` (`web/lib/documents/filing/documentFiling.ts`) |
| Filing command | `commitDocumentFiling(supabase, actor, req, route)`. One transaction, Studio policy, clearance and audit. Refusal codes: `DOCUMENT_UNAVAILABLE`, `ALREADY_FILED`, `TYPE_UNAVAILABLE`, `TYPE_SUBJECT_NOT_APPLICABLE`, `TYPE_FORMAT_NOT_ALLOWED`, `REVIEW_REQUIRED`, `TYPE_REPLACEMENT_NOT_ALLOWED`, `NEW_VERSION_REQUIRED`, `TYPE_NEW_DOCUMENT_REQUIRED`, `SUBJECT_NOT_RELATED`, `BAD_FILING`, `SUBJECT_NOT_FOUND`, `NOT_FOUND`, `TARGET_UNAVAILABLE`, `AUDIT_UNAVAILABLE`, `STORAGE_COPY_FAILED` |
| Subject scope inside an org | `formsSubjectInActorScope` / `formsDestinationInActorScope`. An opportunity's department/site decides; a subject with no opportunity is unrestricted-only |

### 1.3 Remaining interfaces

These are requirements, not designs.

1. **Scopes.**
   - New `PUBLIC_SCOPES` entries, for example a filing write scope and, only if reads are in scope, a narrow read scope.
   - Medical-class documents need an explicit decision. The internal clearance check (`SENSITIVITY_CLEARANCE_REQUIRED`) has no external principal equivalent today. **Decision required** (UNLOCATED).
2. **Actor mapping.**
   - `commitDocumentFiling` takes a `DocumentActor`. An external call needs a principal-to-actor adapter that carries installation id and scopes into the audit.
   - It must never borrow an admin session.
3. **Boundary.**
   - Every subject the call names (child, household, person, opportunity) must resolve inside the installation's org.
   - With `locations` mode, it must also resolve inside the boundary's sites.
   - Anything else answers like a missing record.
4. **Idempotency.**
   - The caller supplies the key, mapped to `filingKey` under an installation namespace (for example `ext:<installation>:<key>`).
   - A replay returns the committed result; a different body with the same key gives 409.
5. **Upload.**
   - If D9 includes upload, the bytes must enter through the same upload path as the admin route (storage plus Processing case).
   - It must not write a `documents` row directly.
6. **Published contract.**
   - The OpenAPI spec gains the operations plus the refusal codes above as stable error codes.

### 1.4 Acceptance criteria

These are traceable to the LOCATED text; anything beyond it waits for the scope decision.

1. An external filing reaches `commitDocumentFiling` and nothing else writes document associations (`documents-forms-api.md:70-74`).
2. The caller's idempotency key gives exactly-once filing: a replay returns the same result, a conflict gives 409.
3. The published refusal codes are exactly the stable codes above.
4. There is no admin session and no caller-selected tenant. A token from org B gets a not-found answer for org A's subject. A token without the scope gets 403 before any read (`api-architecture.md:75`).
5. A boundary-restricted installation cannot name a subject outside its sites.
6. The audit row names the installation and credential.

## 2. D10 — email ingestion of documents

### 2.1 Scope

**UNLOCATED.** No Documents doc, plan, commit message or diff says what D10 is.

**INFERRED, the strongest evidence that D10 means email-attachment ingestion:**
- `processing_case_sources.source_kind` has admitted `'email_attachment'` since the first Processing migration (`supabase/migrations/20260612120100_pos_processing_cases_v1.sql`). The latest constraint still allows it (`20261124090000_processing_participant_child_requests.sql`).
- It is listed among the non-form sources, but **no code opens such a case**.
- It is **not** in `DOCUMENT_SOURCE_KINDS` (`web/lib/pos/documentFiling/documentFilingModel.ts`), so the filing queue would not treat it as a document source today.
- Communications inbound email stores attachments as metadata only and tells the sender "attachment support is not available yet" (`web/lib/communications/email/inboundEmailNormalization.ts`).

### 2.2 What already exists (Communications; reuse, no new pipeline)

| Need | Existing capability |
|---|---|
| Receipt | `webhooks/resend` → `ingestResendInboundEmail` (`web/lib/communications/email/inboundEmailIngestion.ts`) |
| Tenant resolution | `resolveInboundEmailOwnership` (`inboundEmailRouting.ts`): the candidate addresses (to, received_for) matched against `communication_provider_bindings.inbound_address` / `communication_ingress_routes.destination`. Outcomes are owned, `no_attributable_org` or `cross_org_ambiguous` |
| Dedupe | A unique receipt row per (provider, channel, provider_message_id) in `communication_inbound_ingress`, and a unique inbound message per (org, provider, channel, provider_message_id) |
| Attachment metadata | id, filename, content_type, content_disposition and size, at most 50, in `communication_messages.metadata.attachments` |
| Attachment storage plan | Conversation Platform **WS11**: `documents` table plus `org_documents` bucket, and a new `communication_message_attachments (org_id, message_id, document_id → documents ON DELETE RESTRICT, disposition, UNIQUE(message_id, document_id))` (`CONVERSATION-PLATFORM-V1-PLAN.md:195,414-422`). **Not in any migration** |
| Filing | Processing case → filing workspace → `commitDocumentFiling` (D5) |

### 2.3 Remaining interfaces (all owned by WS11 or Processing; Documents adds none of its own)

1. **WS11** retrieves an attachment's bytes, stores it as a `documents` row in `org_documents`, and links it through `communication_message_attachments`. Communications owns this.
2. **A Processing case** opens per stored attachment with `source_kind = 'email_attachment'`. This reuses the non-form opener and adds `email_attachment` to the filing queue's document sources. It is a one-line consumer change, made only when D10 is decided.
3. **Filing** stays `commitDocumentFiling`, with key `email_attachment:<message>:<document>`. A redelivered email therefore files nothing twice: idempotent from the ingress dedupe through the filing key.
4. **Ownership failures** (`no_attributable_org`, `cross_org_ambiguous`) never reach Documents. They stay in Communications' ingress triage.
5. **Unsafe content.** Attachments enter quarantine and malware scanning like uploads; that is D1c-2, deferred in `D5-PROCESSING-FILING.md:5`. **Decision required:** whether D10 waits for D1c-2.

### 2.4 Acceptance criteria (conditional on D10 being email-attachment ingestion)

1. Every stored attachment is a `documents` row linked to its message. Unsupported or oversized ones are recorded as metadata and not silently dropped.
2. Each opens at most one Processing case, whatever the redelivery.
3. Filing is only `commitDocumentFiling`, so there is no second filing path.
4. Only an owned message reaches Documents, in its own org.
5. An attachment whose subject can't be resolved lands in the existing "Needs a record" lane (`awaiting_subject`), not a new queue.
6. No outbound message is sent by ingestion.

## 3. Paperwork accountability (folded into the existing Documents / BP consumer design)

**What exists** (`web/lib/documents/requirements/`):
- One evaluator, `evaluateDocumentRequirement`. Its states are `missing | pending_review | satisfied | waived | expired | blocked` (`REQUIREMENT_STATES`).
- Satisfaction is derived on every read, never stored.
- The due date is derived: `dueOn()` uses a timing of `immediate` or `within_days` from the subject's creation, the in-scope BP journey start, or `effective_from`. `overdue` is a blocking requirement with `due_on` before today.
- Work rows (`listRequirementWork`) are derived, "never a stored task".
- Readiness counts come from `buildSubjectReadiness`.
- BP stage requirements of kind `document` are evaluated for a child by `evaluateDocumentTypeRequirementsForChild` and projected into Enrollment participant progress.
- Waivers are per subject, with reason and expiry.
- There is no hardcoded legal or licensing requirement set: requirements are org-authored.

**What is absent:**
- an owner or responsible party for a missing requirement;
- a stored deadline override;
- reminders;
- escalation;
- any "attendance-ready" state.

POS `requirement_responsibilities` (`web/lib/pos/packet/requirementResponsibility.ts`) has a `responsible_party` vocabulary (guardian variants, child participant, a staff role), but it is keyed to form/packet fields in packet metadata, not to Documents requirements.

### 3.1 Requirements (design only; nothing to build here)

1. **Three states stay separate.** `uploaded` (evidence exists), `reviewed` (a decision exists) and `attendance-ready` (every blocking requirement of the subject is satisfied or waived) must never collapse into one flag.
   - "Uploaded" is already not a state: it is `pending_review`, or `satisfied` when the type needs no review.
   - Attendance-ready belongs to the consumer (Enrollment/BP), derived from `buildSubjectReadiness`. It is not a Documents state.
2. **Missing-paperwork owner.**
   - It is an authored attribute of the requirement version, reusing the `ResponsibleParty` vocabulary rather than inventing one: family-side parties for what a guardian provides, `role` for what staff collect.
   - Unset means "unassigned", shown as such. **No legal default.**
3. **Deadline.**
   - Keep the derived `due_on`.
   - A per-subject override, if needed, is an audited, expiring exception, like a waiver. It must not be a mutable column.
4. **Reminders and escalation.**
   - These are derived from `listRequirementWork` (overdue / due soon, by owner) and sent only through the existing canonical enqueue, `enqueueCanonicalOutboundMessage` (`web/lib/communications/canonicalOutboundEnqueue.ts`), with the existing staff-recipient resolution.
   - No new pipeline and no scheduler of their own.
   - **Real sends are a separate, explicitly approved step.**
5. **Canonical filing exceptions for a child or family.**
   - An unresolved subject uses the existing `awaiting_subject` lane.
   - A failed commit uses `filing_error`, with `last_error` and `attempts` in `processing_cases.metadata.document_filing`.
   - An exception to a requirement uses the existing waiver: per subject, reasoned, revocable, expiring.
   - Nothing new is needed for these three. A new "exception" table would duplicate them.

### 3.2 Decisions required (not inferred)

1. Who owns which requirement types per org: Enrollment configuration, which owns UI and config readiness.
2. Reminder cadence and escalation targets.
3. Whether a guardian-facing reminder is in scope, which would be an external send.
4. The immunization enforcement and fee question: still awaiting Kelly, and not assumed here.

## 4. Minimal work plan (after the scope decisions; owners named)

| # | Work | Owner | Gate |
|---|---|---|---|
| 1 | Decide D9's operations and scopes, and medical-document handling | Kelly / Director | **UNLOCATED scope** |
| 2 | Decide whether D10 is email-attachment ingestion, and whether it waits for malware scanning (D1c-2) | Kelly / Director | **UNLOCATED scope** |
| 3 | WS11 attachment storage (`communication_message_attachments`, bytes to `documents`) | Communications | Conversation Platform plan |
| 4 | D9: scopes, principal-to-actor adapter, installation-namespaced filing key, OpenAPI operations; tests for the six criteria in §1.4 | Documents (with Developer Platform for scopes and OpenAPI) | 1 |
| 5 | D10: open an `email_attachment` case per stored attachment, filing-queue source kind, key `email_attachment:<message>:<document>`; tests for §2.4 | Documents / Processing | 2, 3 |
| 6 | Accountability: owner attribute on requirement versions, derived reminder rows, enqueue through the canonical path; tests that uploaded / reviewed / attendance-ready stay distinct | Documents with Enrollment / BP | §3.2 |

Each row is its own sprint slice, with the existing certification: targeted tests, then a checkpoint, then the Director release.
