# Forms Engine V1.5 — Enrollment Journey & Packet Operations

> **Status — May 2026**
>
> **Enrollment Packet E2E Phase 1 is shipped** for the operating loop described in **`docs/product/documents-and-forms.md`** and **`docs/product/crm-system.md`**: opportunity drawer packet launch (incl. multi-child/household launch metadata), Communications-backed templated email with packet link, public packet completion, **`workflow_events`** / Activity projections, compact opportunity overview review + operator **approve / reject / needs correction**, **approval-triggered** idempotent generated PDFs for steps with **`pdf_mapping_json`**, and opportunity **Documents** tab visibility via **`form_submission_documents`** + **`documents`** (not by storing files on `opportunities` rows). Public submit values remain **untrusted proposals** relative to canonical CRM until explicit intake / linkage / future **data change proposal** flows; Phase 1 does **not** auto-mutate person/customer/member from arbitrary public answers beyond existing intake rules.
>
> **This file** began as **Card 0 — audit & design** (Sections 1–8 below). Treat detailed bullets as **historical engineering context** where they predate Phase 1; for **current backlog and sequencing**, use **`docs/sprints/archive/05_2026/enrollment_packet_phase_2.md`**.
>
> **Phase 2 plan:** **`docs/sprints/archive/05_2026/enrollment_packet_phase_2.md`**

**Sprint:** Enrollment Journey & Packet Operations  
**Card:** 0 — Audit & Design Pass (no implementation in this card)  
**Date:** May 2026  

This document audits **current Alloy behavior** (forms, packets, CRM intake, AdminV2, public embed, documents, workflow signals) and defines a **config-first** direction for V1 enrollment packets. It does **not** introduce parallel systems or hardcoded childcare logic.

---

## Section 1 — Current State Audit

Ground truth is taken from migrations under `supabase/migrations/20260510120000_forms_packet_foundation.sql`, packet services in `web/lib/forms/packets/formPacketService.ts`, public resolution in `web/lib/public/forms/resolvePublicFormEmbedContext.ts`, public routes under `web/app/api/public/forms/[token]/`, and AdminV2 pages under `web/app/adminV2/forms/packets/`.

### 1. Packet lifecycle / state handling

**Observed behavior**

- **`form_packet_sessions.status`** is constrained to `in_progress`, `completed`, or `cancelled` (see migration check constraint). New sessions are inserted as `in_progress` with `shared_values: {}` and `current_sequence_index` set to the first definition step (`ensurePacketSessionForPublicLink` in `formPacketService.ts`).
- **`form_packet_session_items`** rows are created for every definition step at session creation; statuses are `active` for the first step and `pending` for the rest (same function).
- **Advancement** happens only from `POST .../submissions/[submissionId]/submit`: `advancePacketSessionAfterSubmit` marks the current item `submitted`, finds the next row with `status === "pending"` and greater `sequence_index`, sets it `active`, updates `current_sequence_index` and `shared_values`, or marks the session `completed` with `completed_at` when no pending step remains.
- **Idempotency shape:** one session row per `started_via_public_link_id` (unique index); reconnecting the same link reloads the same session.

**Strengths**

- Clear linear state machine; easy to reason about for a single recipient + single link.
- Session items give durable audit of which forms ran and link to `form_submissions` via `form_submission_id`.

**Missing operational capabilities**

- No **operator-driven** transitions (`needs_changes`, reopen step, cancel in product UI, archive).
- **`cancelled`** exists in schema but there is no audited product flow in the packet service paths reviewed for this doc that sets it from public/admin APIs (lifecycle gap vs schema).
- No **packet-level** outcome separate from per-step submissions (enrollment “case” is implicit).

**Architectural risks**

- **Cold-start CRM propagation:** draft `form_submissions` rows are created with FKs from `deriveSubmissionFksFromLaunchMetadata` only. For `form_context_mode === "packet"` **without** `source_entity_type` / `source_entity_id`, FKs stay null across steps until each step’s submit runs intake (when enabled). There is no automatic promotion of CRM IDs from step *n* onto the draft for step *n+1* at creation time (contrast with `form_packet_sessions.crm_snapshot`, which is populated at session creation but **not** wired into subsequent draft inserts in `POST .../submissions`).
- **Completion semantics:** when `session.status !== "in_progress"`, `advancePacketSessionAfterSubmit` treats the packet as complete without error (`packet_complete: true`). Operators must rely on DB constraints + audit if duplicates are a concern.

**Duplication risks**

- **`crm_snapshot` vs submission FKs:** snapshot frozen at session start vs live `person_id` / `customer_id` / … on each submission can diverge after intake edits or manual linkage (mental overhead for reviewers).

---

### 2. Existing packet review capabilities

**Observed behavior**

- **AdminV2 list:** `web/app/adminV2/forms/packets/page.tsx` lists sessions (latest 100) with definition name, `status`, timestamps.
- **AdminV2 detail:** `web/app/adminV2/forms/packets/[packetSessionId]/page.tsx` shows session header, **raw `crm_snapshot` JSON**, and per-step rows with item `status`, optional link to `AdminV2` submission URL (`/adminV2/forms/{formId}/submissions/{submissionId}`). The query selects `shared_values` but the **UI does not surface it** (dead data for operators today).

**Strengths**

- Fast path from packet → step → submission preserves reuse of `FormSubmissionDetailClient` (`adminV2/forms/[formId]/submissions/[submissionId]/page.tsx` re-exports the legacy admin client).

**Missing operational capabilities**

- No packet-level **linkage review** (only per submission).
- No **aggregated** answers across steps; no diff vs `shared_values`.
- No visibility into **launch_context** (prefill/intake flags) beyond CRM snapshot block.

**Architectural risks**

- Reviewers mentally stitch multiple submissions; enrollment truth is **distributed** across N rows with no first-class “packet review completed” concept.

**Duplication risks**

- Explaining CRM context twice: snapshot block + each submission’s intake meta.

---

### 3. Shared values behavior

**Observed behavior**

- Merge helper: `shallowMergeSharedValues` = object spread (`formPacketService.ts`). DB comment on `shared_values` explicitly notes shallow merge and caller responsibility for collisions.
- On submit, **only** `(finalPayload.values ?? {})` is merged into `shared_values` (`advancePacketSessionAfterSubmit`). **`payload.groups` (repeating groups) and `payload.signatures` are not merged** into session shared state.
- On new draft creation for a packet step, `POST .../submissions` loads `shared_values` from `form_packet_sessions` and sets `clientVals = { ...sv, ...clientVals }` before validation/prefill (`submissions/route.ts`). That seeds **top-level scalar `values`** only.

**Strengths**

- Simple carry-forward for cross-step fields implemented as plain field ids (e.g., guardian name on step 1 available as defaults on step 2 **if** stored under `values`).

**Missing operational capabilities**

- No namespacing convention enforced (risk of field id collisions across different form definitions in one packet).
- No merge policy for conflicting updates if a field is revisited (linear packet does not revisit earlier steps in V1).

**Architectural risks**

- **Repeating groups / nested structures** do not participate in shared merge → multi-step household/children modeling via groups cannot rely on `shared_values` without schema/product changes.
- Shallow merge + nested objects in `values` means later steps can **replace** entire nested objects unintentionally.

**Duplication risks**

- Operators may export the same logical entity from multiple steps because carry-forward is incomplete for groups.

---

### 4. Conditional / sequencing support

**Observed behavior**

- **Packet sequencing:** strictly linear; migration comments state conditionals deferred (“Card 5”). All definition steps become session items up front.
- **Form-level conditionals:** `evaluateFieldVisibility` in `web/lib/forms/validateSubmission.ts` implements `visibility.all` with AND semantics; hidden fields must be empty on submit. This supports **within-form** branching only.
- **`skipped` / `skip_reason`:** schema supports `form_packet_session_items.status === 'skipped'` and `skip_reason`, but packet progression code reviewed does **not** auto-skip steps based on answers (no dynamic DAG).

**Strengths**

- Field-level visibility is mature and validated server-side.

**Missing operational capabilities**

- No **packet-level** conditional inclusion (e.g., infant form only if DOB indicates infant).
- No **dynamic repetition** of packet items (e.g., per-child clones).

**Architectural risks**

- Operational teams may misuse long linear packets + hidden fields as a substitute for true branching → brittle UX and validation edge cases.

**Duplication risks**

- Multiple forms might re-ask the same discriminator fields because packet cannot branch on shared state declaratively.

---

### 5. Current CRM linkage UX

**Observed behavior**

- **Explicit launch:** `deriveSubmissionFksFromLaunchMetadata` stamps FKs for `existing_record` or `packet` **with** valid `source_entity_*` (`web/lib/forms/formLaunchFkDerivation.ts`).
- **Lead capture gate:** `linkRequiresLeadCapture` returns **false** for `existing_record`, and **false** for `packet` links that include a valid source entity UUID (`web/lib/public/forms/publicFormTypes.ts`). Otherwise `lead_capture` / `intake` flags drive `applyFormIntakeSafe` on submit (`submit/route.ts`).
- **Submit path metadata:** Non-lead-capture links without explicit entity launch stamp `intake_resolution_path: skipped_intake_disabled` into payload meta; explicit entity launches stamp `launch_context` strategy with `intake_needs_review: false`.
- **Operator UI:** Linkage review, confirm linkage, manual link live on `FormSubmissionDetailClient` (`web/app/admin/forms/...`) backed by APIs such as `confirm-linkage` and `manual-link` routes; AdminV2 reuses this client.

**Strengths**

- Safe distinction between **trusted launch** and **cold intake** is encoded in one place (`linkRequiresLeadCapture` + submit route).
- Human confirmation path for ambiguous intake (`intake_needs_review`) is implemented (`applyFormIntakeSafe`, confirm linkage API).

**Missing operational capabilities**

- **Packet-level** linkage confidence summary (e.g., “step 2 still unmatched”).
- Guidance when **step 1** creates CRM rows and **step 2** cold drafts still show null FKs until submit (operator confusion).

**Architectural risks**

- **Repeated intake** on every step for cold packet links: each step is a separate `form_submissions` row; drafts do not inherit CRM IDs from prior step submits unless metadata provides them or intake resolves consistently by email/phone (organization-dependent).

**Duplication risks**

- Operators may run linkage review N times per packet instead of once per enrollment case.

---

### 6. Public resume / progress behavior

**Observed behavior**

- **Token-level resume:** `FormEmbedClient` stores **one** draft submission id per token in `sessionStorage` (`storageKey`). On load, if UUID present, it GETs that draft and restores payload (`FormEmbedClient.tsx`).
- **Packet step binding:** For packets, `POST .../submissions` checks `form_packet_session_items.form_submission_id` for the **current** `current_session_item_id`; if a draft exists, it returns that row instead of minting another (`submissions/route.ts`).
- **After submit:** On successful submit with `next_form_available`, client clears `sessionStorage` and shows interstitial “Step saved” → user clicks **Continue** → `bootstrap()` creates/resolves the **next** step draft.
- **Completed packet:** `resolvePublicFormEmbedContext` returns `packetTerminal: true` with null schema; embed shows “Packet already completed.”

**Strengths**

- Same link resumes in-progress work without new sessions (respects 1:1 session:link rule).
- Clear parent messaging for step saved vs packet complete.

**Missing operational capabilities**

- No cross-device resume beyond sharing the same browser storage (no magic link email flow in this path).
- No explicit **saved progress** indicator beyond “Step X of Y.”

**Architectural risks**

- Clearing storage mid-packet loses pointer to draft **until** next resolve recreates via server binding logic (usually recoverable while session item points to draft).

**Duplication risks**

- Parents may receive multiple confirmation emails if outbound comms are wired per submission later (not audited here).

---

### 7. Generated document integration

**Observed behavior**

- **Scope:** `POST /api/admin/forms/submissions/[submissionId]/generate-document` calls `createGeneratedPdfForSubmission` (`createGeneratedPdfForSubmission.ts`).
- **Requirements:** submission must be `submitted`; version must have usable `pdf_mapping_json`; **CRM parent** required via `resolveFormSubmissionDocumentParent` (prefers `customer_member` → `opportunity` → `customer` → `person`).
- **Artifacts:** Creates `documents` row + `form_submission_documents` junction; emits `form_document_generated` via `emitFormDocumentGeneratedSafe` (`formSubmissionEvents.ts`).
- **Update (Phase 1 shipped):** Operator **approval** of a **completed** packet session triggers the **same** `createGeneratedPdfForSubmission` path for each **submitted** packet step (idempotent; skips forms without mapping). There is still **no** automatic PDF generation on mere **packet completion** without review approval (mid-packet generation remains admin/manual unless product expands later).

**Strengths**

- Deterministic attach parent ordering reduces ambiguity.
- Idempotency key avoids duplicate PDFs per submission/version/template (`findExistingGeneratedPdfByIdempotency`).

**Missing operational capabilities**

- **Packet-aware packaging** (single enrollment PDF bundle across steps) does not exist — operators still generate **per submission** (approval backfill runs that path once per step).
- No automatic generation on packet **completion alone** without operator **approval** (see Phase 1 update above).

**Architectural risks**

- Enrollment flows needing documents **mid-packet** may conflict with `intake_needs_review` gating messaging in legacy UI (“before generating documents”) — still evaluated **per submission**.

**Duplication risks**

- Separate mappings per form version may duplicate slots for shared logical fields unless shared conventions exist.

---

### 8. Queue / workflow integration

**Observed behavior**

- **Signals:** On public submit, `emitFormSubmittedSafe` always runs; signatures may add `emitFormSignedSafe` (`submit/route.ts`). Document generation emits `emitFormDocumentGeneratedSafe`. Implementations insert **`workflow_events`** via `emitEvent` (`web/lib/forms/workflow/formSubmissionEvents.ts`).
- **Payload shape:** Includes `form_submission_id`, definition/version ids, CRM FKs, `public_link_id` — **no `packet_session_id`** in the workflow payload builder (`buildFormSubmissionWorkflowPayload`).

**Strengths**

- Existing automation plane can trigger off each step submission.

**Missing operational capabilities**

- No **`packet_completed`**-style **single** token on **`form_submissions`**-scoped `form_submitted` payloads — automations may still correlate multiple step events by `public_link_id` + ordering **unless** they subscribe to **`opportunity_enrollment_packet_*`** projections on **`opportunities`** (**Phase 1** added Activity visibility there; see **`docs/product/crm-system.md`**).
- Admin copy references workflow signals (`operatorFormGuidance.ts`) but packet correlation is not first-class for all consumers.

**Architectural risks**

- Workflow noise for long packets (N events per enrollment) without dedupe keys in payload.

**Duplication risks**

- Multiple workflows might implement overlapping “enrollment complete” detection logic.

---

## Section 2 — V1 Enrollment Packet Blueprint

Configuration and naming only — **no runtime branching hardcoded** to a vertical. Use org-specific `form_packet_definitions.key` / `metadata` and form schemas.

### A. Suggested packet structure (ordered steps)

Example **logical** enrollment packet (each bullet = one `form_packet_items` row pointing at a published form definition):

1. **Household / guardian profile** — contact, relationship, communications preferences.  
2. **Child enrollment core** — child identifiers, program/session preferences (fields, not code).  
3. **Emergency contacts** — repeatable group inside schema or dedicated form.  
4. **Authorized pickup** — names, IDs, restrictions.  
5. **Medical overview** — allergies, providers, immunization attestation fields as needed.  
6. **Medications** — uses visibility for “no medications” vs detail rows (form-level conditional).  
7. **Infant / specialized care plan** — entire form hidden unless age/program discriminator matches (visibility).  
8. **Handbook / policy acknowledgements** — checkboxes + disclosure timestamps.  
9. **Signatures** — guardian acknowledgment (signature fields).  

Optional later rows (still config): subsidy intake form, transportation, photo release.

### B. Shared value strategy

Define **canonical field ids** (documented per org packet spec) under `values` — not hardcoded in code — for example:

| Namespace (convention) | Examples | Notes |
|------------------------|----------|-------|
| **Household** | `hh_address_line1`, `hh_city`, `hh_zip` | Prefer stable ids reused across steps. |
| **Guardian primary** | `g1_first_name`, `g1_email`, `g1_phone` | Maps cleanly to CRM intake_field_paths in link metadata. |
| **Child core** | `child_first_name`, `child_dob`, `child_program` | Align with existing demo/seeds naming where practical (`medicationAuthorizationDemo.ts` illustrates slot-oriented ids). |
| **Enrollment** | `enrollment_start_date`, `schedule_preference` | Operational fields for staff. |
| **Health** | `allergy_summary`, `pediatrician_name` | Keep coarse on overview; detail in dedicated forms. |

**Important:** repeating groups **do not** propagate via `shared_values` today — either keep child roster on one step or duplicate minimal discriminators with stable ids until product supports structured merge.

### C. CRM / entity linkage strategy

Map outcomes to existing FK columns on `form_submissions` / intake:

| Entity | Typical role in enrollment |
|--------|---------------------------|
| **person** | Primary guardian / payer identity. |
| **customer** | Household account. |
| **customer_member** | Enrolled child profile. |
| **opportunity** | Enrollment pipeline / seat offer context. |
| **documents** | Generated PDFs attach via `resolveFormSubmissionDocumentParent` precedence. |

**Launch patterns**

- **Existing record launch:** packet link metadata includes `source_entity_*` → FKs stamped early; intake skipped per `linkRequiresLeadCapture`. Best for staff-started enrollment.  
- **Cold intake:** enable `lead_capture` / `intake` + `default_vertical_id` — expect CRM mutation on eligible steps; plan which step owns auto-create to minimize repeated ambiguity.

### D. Conditional form strategy (config-driven)

Use **two layers** deliberately:

1. **Within-form:** `visibility.all` conditions for infant blocks, medication details, subsidy attestations.  
2. **Packet composition:** optional separate forms toggled by **including or excluding** packet items for a given org/program via packet definition variants (`form_packet_definitions` rows), not runtime “if childcare” code paths.

Future packet-level branching should read from **declarative rules** stored on `form_packet_items.metadata` (design target only — not implemented).

---

## Section 3 — Packet Lifecycle Recommendation

### Suggested lifecycle states

| State | Meaning | Suggested trigger | Workflow / events | Queue | Parent UX |
|-------|---------|-------------------|-------------------|-------|-----------|
| **draft** | Session minted but recipient has not opened embed | Optional future: session created before link distribution | Low priority | Optional task to send link | “Not started” |
| **in_progress** | Same as today | First resolve + draft creation | Per-step `form_submitted` | — | Step X of Y |
| **submitted** | All steps submitted; awaiting backend classification | Auto when final step submits OR operator marks | Could emit **`packet_completed`** once defined | **Enqueue enrollment review** | Thank you / staff will review |
| **under_review** | Staff actively reviewing packet | Queue assign | SLA timers | In review queue | Message: received |
| **needs_changes** | Returned to parent | Operator action | Emit `packet_needs_changes` (design) | Task to parent | Opens embed with guidance |
| **approved** | Enrollment cleared | Operator | Emit `packet_approved` | Close queue | Confirmation |
| **archived** | Historical | Schedule or manual | Read-only | Archive | Read-only / hidden |

### Fit with existing schema

- Today **`form_packet_sessions.status`** only allows `in_progress | completed | cancelled`.  
- **`completed`** overlaps proposed **submitted** + parts of **approved**. Introducing richer states requires **migration** to widen CHECK constraint or move operational state to `metadata` JSON with partial indexes (less ideal).

### Migration impact

- Additive enum expansion + backfill: map `completed` → `submitted` or `approved` depending on org policy (needs decision).
- New nullable timestamps: `submitted_at`, `review_started_at`, `approved_at`, `archived_at` if tracking SLAs.

### Backward compatibility

- Public embed must treat unknown future statuses safely (fail closed to support message).
- Automations keyed on `completed` need migration if renamed.

---

## Section 4 — Multi-Child Strategy (design only)

### Audit of current primitives

- **Repeating groups:** robust inside a single submission (`validateSubmission.ts`); **not** merged into packet `shared_values` (`advancePacketSessionAfterSubmit`).
- **CRM:** intake supports auto-create flows (`applyFormIntakeSafe`); linkage review is **per submission**.
- **Packet session:** single linear runner — no native “fork” per child.

### Recommendation

1. **Family vs children modeling**  
   - **One packet session per enrollment case** (still one link : one session).  
   - Represent multiple children either:  
     - **Inside** one “children” repeating group on a dedicated step (fits current engine), or  
     - **Separate packet definitions** per child (multiple links) — operational overhead but avoids packet branching.

2. **Child-specific forms**  
   - Prefer **one form definition** reused with repeated group rows **or** duplicate packet item templates in metadata only if operational clarity demands separate signatures per child.

3. **Conditional forms per child**  
   - Until packet branching exists, use **per-child sections inside one form** with visibility driven by answers (e.g., “Child A DOB” triggers infant fields for row A only — requires careful schema design).

4. **Future-safe direction**  
   - Introduce **packet instances keyed by `instance_key`** (parallel to repeating groups) stored in session metadata — still config-driven.  
   - Long-term: optional **`shared_structured`** JSON or normalized tables for household members to escape shallow scalar merge limits.

**Do not implement in Card 0.**

---

## Section 5 — Operator / Review UX Gaps

### Audit (AdminV2 today)

- Packet list/detail exists; submission detail reuse gives **strong per-step tools** (linkage, PDF gen when wired).
- **Gap:** packet detail ignores `shared_values` in UI despite querying it.
- **Gap:** no rollup of intake meta across steps.
- **Gap:** no packet completion checklist (signatures, PDFs, linkage confidence).
- **Gap:** queues do not show packet sessions as first-class rows (only derivable via submissions).

### Minimal V1 improvements (highest ROI)

1. Surface **`shared_values`** + **`launch_context`** on packet detail (read-only JSON sections).  
2. **Linkage summary strip:** worst-case `intake_needs_review` across steps + deep links.  
3. **Progress:** counts submitted/pending/skipped with timestamps.

### Highest leverage (later)

- Packet-level actions: approve / request changes / archive (ties to Section 3).  
- Correlated workflow inbox (**packet_session_id**).

### Defer

- Visual packet builder/drag-drop (explicitly out of scope).  
- Side-by-side diff across submissions.

---

## Section 6 — Implementation Plan (recommended cards)

Grouped phases; each card should remain **config-driven** and respect existing tables/services.

### Phase — Architecture

| Card | Purpose | Dependencies | Migration | Risk | Design-first? |
|------|---------|--------------|-----------|------|---------------|
| **A1 — Packet CRM continuity** | Stamp drafts with session `crm_snapshot` or latest submission FKs when creating step *n+1*; define rules for cold intake vs explicit launch | Packet session schema (existing) | Likely none if logic-only; optional session column for `last_intake_fks` | **High** if mis-linked | Design-first **then** implement |
| **A2 — Shared carry-forward v2** | Decide merge for nested structures OR document limitation; optionally merge selected group keys | Schema discussions | Possible JSON schema version in session metadata | Medium | Design-first |
| **A3 — Packet workflow events** | Add `packet_completed` (+ optional correlation id in submission workflow payload) | emitEvent pipeline | None | Medium | Implementation-ready after payload shape agreed |

### Phase — Parent UX

| Card | Purpose | Dependencies | Migration | Risk | Design-first? |
|------|---------|--------------|-----------|------|---------------|
| **P1 — Resume clarity** | Explain cross-device limits; optional server-side draft discovery copy | Current embed | None | Low | Mostly implementation |
| **P2 — Needs-changes loop** | When lifecycle adds `needs_changes`, reopen correct session item + messaging | A1/A3 | Maybe status enum | Medium | Design-first |

### Phase — Operator UX

| Card | Purpose | Dependencies | Migration | Risk | Low |
|------|---------|--------------|-----------|------|-----|
| **O1 — Packet detail hardening** | Show shared_values + launch_context + step timestamps | None | None | Low | Implementation-ready |
| **O2 — Rollup linkage** | Aggregate intake flags across submissions for one session | O1 | None | Medium | Design-first |

### Phase — Orchestration

| Card | Purpose | Dependencies | Migration | Risk | Design-first? |
|------|---------|--------------|-----------|------|---------------|
| **R1 — Queue integration** | Enqueue on `packet_completed` / `submitted` per org policy | A3 | Queue tables per product | Medium | Design-first |
| **R2 — SLA / assignment** | Tie packet session to owner | R1 | Maybe columns | Medium | Design-first |

### Phase — Documents

| Card | Purpose | Dependencies | Migration | Risk | Design-first? |
|------|---------|--------------|-----------|------|---------------|
| **D1 — Packet PDF bundle** | Merge mappings across submissions or zip outputs — **policy-driven** | Stable shared ids | None initially (could be app-layer) | High | Design-first |
| **D2 — Attach to canonical entity** | Prefer household vs child attach based on template metadata | documents API | Low | Medium | Design-first |

### Phase — Hardening

| Card | Purpose | Dependencies | Migration | Risk | Design-first? |
|------|---------|--------------|-----------|------|---------------|
| **H1 — Cancellation path** | Productize `cancelled` status with audit | lifecycle design | Enum/check updates | Medium | Design-first |
| **H2 — Authz review** | Re-verify RLS + service role usage for packet routes | security checklist | None | High | Implementation-ready |

---

## Card 0 — Outcomes Summary

### Architectural risks identified (top)

1. **CRM FK continuity across cold packet steps** — drafts do not inherit intake outcomes automatically; repeated intake per step.  
2. **`shared_values` omits repeating groups** — limits multi-step household/child modeling.  
3. **No packet-level workflow signal** — noisy multi-event automations and brittle correlation.  
4. **Lifecycle enum mismatch** — product wants richer states than DB allows today.  
5. **Document generation is per submission** — enrollment bundles need explicit design.

### Recommended first implementation phase

**Architecture phase (A1 + O1)** together: **operator-visible truth** (`O1`) unblocks enrollment pilots while **CRM continuity (A1)** addresses the highest correctness risk for cold-start packets without abandoning packet/session architecture.

### Highest leverage next cards

- **A1** — Correctness for real enrollments.  
- **A3** — Unlocks orchestration without hacks.  
- **O1** — Fast transparency win, tiny scope.

### Blockers / concerns before implementation

- Policy decision: **when** should CRM rows be created in cold intake (first step only vs any step)?  
- Decision: rename vs extend **`completed`** session status to avoid breaking implicit assumptions.  
- Naming convention agreement for **shared field ids** across definitions (org playbook).  
- Legal/ops: **signature placement** per step vs consolidated signing step affects packet ordering.

---

*End of Card 0 — Enrollment Journey & Packet Operations audit.*
