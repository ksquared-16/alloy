# Forms / Intake — Intake Case Operational Model + Outcome Configuration

**Path:** `docs/sprints/05_2026/forms_intake_case_operational_model.md`  
**Date:** May 2026  
**Status:** IC-0.5 through IC-6 code shipped · **IC-8 intake experience simplification in progress**  
**Scope:** Shift operator work from raw submissions to **Intake Cases**; surface outcome configuration near form authoring; confidence-based review routing. **No OCR. No packet runtime rewrite. No large schema migration without approval.**

**Validated baseline (Runtime Tests 1–2D):**

- `/forms/embed/[token]` external intake works
- Public submit persists values/signatures
- Link metadata can create routed opportunities (Demo Childcare Co medication path)
- Dedup attach to existing opportunity works
- Workload lanes show Review / Recent
- Quick review modal exists (`SubmissionQuickReviewModal`)
- Default: submission does **not** create opportunity unless link metadata opts in

**Related:**

| Topic | Document |
|-------|----------|
| Runtime validation | [`docs/system/forms-intake-runtime-validation.md`](../../system/forms-intake-runtime-validation.md) |
| Operating phase | [`docs/system/forms-intake-runtime-phase.md`](../../system/forms-intake-runtime-phase.md) |
| Prefill / launch context | [`docs/system/forms-intake-prefill-doctrine.md`](../../system/forms-intake-prefill-doctrine.md) |
| Inbox operationalization (OI-4) | [`forms_intake_inbox_operationalization.md`](./forms_intake_inbox_operationalization.md) |
| Demo childcare test | [`forms_runtime_test_2d_demo_childcare_intake.md`](./forms_runtime_test_2d_demo_childcare_intake.md) |
| Product | [`docs/product/documents-and-forms.md`](../../product/documents-and-forms.md) |

---

## Executive summary

| Question | Answer |
|----------|--------|
| **Is there already an intake case concept?** | **Presentation-only.** `IntakeCaseFileLayout`, `SubmissionIntakeCaseFileContent`, and sprint UX docs use “case file” language. **No `intake_cases` table or server entity.** Operational truth today is scattered across `form_submissions`, `form_packet_sessions`, and CRM FKs (`opportunity_id`, etc.). |
| **First pass: derived or persisted?** | **Derived / presentation-first.** Anchor cases on **`opportunity_id`** (standalone + packet flows that stamp opportunity on session/submissions) or **`form_packet_session_id`** when no opportunity exists. Submissions remain evidence rows inside the case. |
| **Where should outcome configuration live?** | **Distribution layer first** (`form_public_links.metadata` — already authoritative at runtime). **Form-level defaults** in `form_definitions.metadata` (JSONB, no migration) as template for new links. **Admin UI** on `/adminV2/forms/[formId]` near distribution — not buried in scripts-only metadata. |
| **Safe without migration?** | Outcome config panel (read-only → editable), derived intake case view model, workload row regrouping (client-side), confidence-based review rule changes in `applyFormIntakeSafe`, additive workflow events, quick review modal UX, form definition default-outcome JSON in existing `metadata` column. |
| **Requires schema later?** | Persisted `intake_cases` row if we need case identity **independent of opportunity**, cross-org analytics on case lifecycle, or case-level permissions/audit separate from CRM. Until then, opportunity + packet session + submission grouping is sufficient. |

**Recommended first implementation card:** **IC-1 — Outcome Configuration Panel (read-only)** — **shipped** · next: IC-1b editable config, then IC-4 confidence routing.

---

# IC-0.5 — Operational Outcome Resolution (doctrine)

**Status:** Active doctrine (May 2026)  
**Scope:** How Alloy resolves “what happens on submit” across layers. **No new schema.**

## New runtime flow

```
create form → configure intake outcome → distribute → capture → create/update intake case → trigger workflow → operator acts
```

Forms are reusable artifacts. **Distribution carries operational context.** Submissions are evidence. Intake cases (derived) are what operators work from.

## Resolution precedence

When multiple layers define outcome behavior, effective config resolves in this order (highest wins):

| Priority | Layer | Storage today | Role |
|----------|-------|---------------|------|
| **1** | **Explicit runtime override** | Admin action, workflow mint, or audited API body at submit/mint time | Highest — must be explicit and auditable; not inferred from UI defaults |
| **2** | **Public link metadata** | `form_public_links.metadata` | **Authoritative for distribution** — location, work unit, status, source, auto-create flags |
| **3** | **Packet / session config** | `form_packet_sessions.launch_context`, packet link metadata | Journey-specific context; step submits inherit session stamps |
| **4** | **Form default metadata** | `form_definitions.metadata.intake_outcome` (JSONB) | Reusable base intent when minting links; overridden by link/session |
| **5** | **Org defaults** | Org config / vertical presets (future) | Fallback only when upper layers silent |

### Layer rules

- **Form defaults** express reusable base intent (“this form usually creates an inquiry and routes to enrollment”). They apply when creating a new public link unless the operator overrides at mint time.
- **Public link metadata** is distribution-specific and **must override** form defaults for routing and intake flags at runtime.
- **Packet / session config** may add journey-specific context (anchored opportunity, household snapshot). Standalone form submit does not read session config.
- **Runtime overrides** are highest priority and must be **explicit and auditable** (logged mint body, workflow action, or admin API — not silent client inference).
- **Org defaults** are fallback only — never override an explicit link or runtime stamp.

## Ownership boundaries

| Layer | Owns |
|-------|------|
| **Form definition** | Reusable structure (fields, composition, PDF mapping), default outcome **intent** (`intake_outcome` template) |
| **Distribution (public link)** | Location, work unit, department, status, source, auto-create toggles, embed context, existing-record launch binding |
| **Submission** | Captured evidence (`payload`, signatures, timestamps, intake trace meta) |
| **Opportunity** | Business lifecycle (CRM record, queue placement, pipeline status) |
| **Intake case (derived)** | Operator-facing situation — who, what happened, review state, next action |
| **Workflow** | Automation execution — reacts to events; does not own CRM truth |

## Review doctrine (exception-based)

Human review is **not** mandatory for every successful submit.

| Signal | Target routing |
|--------|----------------|
| High confidence + complete routing + policy allows | Auto-operationalize → Recent / queue |
| Medium confidence | Soft review / visible in Recent |
| Low confidence / ambiguous match | Needs review |
| Missing CRM links | Needs linking |
| Explicit `review_mode: always` or `review_required: true` | Needs review regardless of match |

**Current runtime (pre–IC-4):** new person create still flags review in `applyFormIntakeSafe` — IC-4 aligns code with this doctrine.

## IC-1 read-only panel (shipped)

**UI:** `/adminV2/forms/[formId]` → **Operational Outcome** panel (between Publish and Share intake).

**Files:**

- `web/components/forms/admin/FormOutcomeConfigPanel.tsx`
- `web/lib/forms/outcomeConfigPresentation.ts`
- Wired via `FormLifecycleWorkspaceLayout` / `FormDetailClient`

**Display precedence for panel:** representative active distribution link (most recent, non-preview) merged with `form_definitions.metadata.intake_outcome`; form defaults fill gaps only. Does **not** change runtime submit behavior.

**Not yet in panel:** entity name resolution for location/work unit UUIDs (shows “assigned on submit” until lookup API in IC-1b).

---

## IC-1b — Outcome label resolution + distribution summary (shipped)

**Status:** Shipped (May 2026)  
**Scope:** Display-only improvements to the Operational Outcome panel. **No runtime / submit changes.**

### What shipped

- **`GET /api/admin/forms/[formId]/outcome-labels`** — org-scoped batch resolve of routing UUIDs from form `intake_outcome` + all non-preview public links
- **Label catalog** resolves when possible:
  - **Location** — `locations.label` or address fallback
  - **Work unit** — `Department · Work unit` (via `work_units` + `departments`)
  - **Department** — department name
  - **Vertical** — vertical name or slug
  - **Inquiry status** — org opportunity status registry (`status_label`)
  - **Source** — humanized embed/public (unchanged from IC-1)
- **Unresolved UUIDs** show **“Configured, label not resolved”** — never raw UUID in primary copy; UUIDs remain in collapsed debug JSON only
- **Multiple active links** — clearer summary: which link is summarized, count of differing active links, note that distribution links may route differently

### Doctrine preserved

- **Public link metadata remains authoritative** for runtime routing (unchanged)
- Label resolution is **admin display only** — missing labels are not runtime errors
- Form `intake_outcome` defaults still **not merged at submit** (IC-1b editable + runtime merge is follow-on)

### Files

| File | Role |
|------|------|
| `web/lib/forms/outcomeConfigLabelCatalog.ts` | Catalog types + UUID collection |
| `web/lib/forms/resolveOutcomeConfigLabelCatalog.ts` | Server batch resolve |
| `web/app/api/admin/forms/[formId]/outcome-labels/route.ts` | Admin API |
| `web/lib/forms/outcomeConfigPresentation.ts` | Label-aware presentation |
| `web/components/forms/admin/FormOutcomeConfigPanel.tsx` | Fetches catalog on mount |

### Limitations

- Verticals query is not org-scoped (global `verticals` table) — slug shown when name missing
- Packet/session launch context labels not resolved on standalone form detail (packet-specific follow-on)

---

## IC-1c — Editable Operational Outcome Configuration (shipped)

**Status:** Shipped (May 2026)  
**Scope:** Admin can edit **distribution/public link** outcome metadata from form detail. **No schema. No public renderer changes. No runtime precedence changes.**

### What shipped

- **Edit mode** on Operational Outcome panel — select distribution link, edit, save
- **PATCH** ` /api/admin/forms/[formId]/public-links/[linkId]` — metadata **merged** with existing (unknown keys preserved)
- **`GET outcome-labels?include_picker_options=1`** — routing pickers for admin editor (admin role)
- **Form defaults** (`form_definitions.metadata.intake_outcome`) remain **read-only / separate** — not written by IC-1c

### Editable fields (link metadata)

| Area | Keys written |
|------|----------------|
| Intake | `lead_capture`, `intake`, `mode`, `auto_create_*` |
| Review (IC-4) | `review_mode`, `review_required`, `auto_operationalize` |
| Routing | `default_location_id`, `default_work_unit_id`, `default_department_id`, `default_vertical_id`, `default_opportunity_status_key`, `intake_opportunity_source`, `embed_mode` |

Review mode UI maps to runtime: `always` | `confidence` (exception-based) | `never`.

### Validation

- `review_required: true` disables auto-operationalize on save
- Auto-operationalize forces `review_mode: confidence` when unset
- Missing routing shows warning (auto-op may still require review at runtime)
- Lead capture disabled clears intake flags without deleting unrelated metadata

### Files

| File | Role |
|------|------|
| `web/lib/forms/outcomeConfigEditor.ts` | Parse/merge/validate edit form |
| `web/lib/forms/resolveOutcomeConfigPickerOptions.ts` | Org routing pickers |
| `web/components/forms/admin/FormOutcomeConfigPanel.tsx` | Edit UI |
| `web/app/api/admin/forms/[formId]/public-links/[linkId]/route.ts` | Metadata merge on PATCH |

---

# Phase 0 — Audit findings

## 1. Form public link metadata

**Storage:** `form_public_links.metadata` (JSONB, default `{}`).

**Typed contract:** `web/lib/public/forms/publicFormTypes.ts` → `FormPublicLinkMetadata`.

**Runtime intake keys (validated):**

| Key | Role |
|-----|------|
| `form_context_mode` | `lead_capture` \| `existing_record` \| `document_update` \| `packet` — stamped to `payload.meta` at draft create |
| `lead_capture` / `intake` / `mode` | Gate `applyFormIntakeSafe` on final submit |
| `default_vertical_id` | Required for opportunity create |
| `default_opportunity_status_key` | Opportunity `status_key` |
| `default_location_id` | Opportunity `location_id` |
| `default_work_unit_id` / `default_department_id` | Work unit routing; department mismatch omits work unit + flags review |
| `intake_opportunity_source` | `embed` \| `public_form` |
| `intake_field_paths` | Maps `payload.values` → guardian/child intake hints |
| `auto_create_person` / `auto_create_customer` / `auto_create_customer_member` / `auto_create_opportunity` | Fine-grained CRM toggles (default **false**) |
| `embed_mode` | Embed chrome; affects opportunity `source` |
| `source_entity_type` / `source_entity_id` | Existing-record launch binding |
| `prefill_enabled` / `prefill_field_map` | CRM hydration |
| `label` / `purpose` / `intake_purpose` | Operator-facing link labels (UI only) |

**API surfaces:**

- `POST /api/admin/forms/[formId]/public-links` — merges `intakeDefaultsForFormPublicLink` for demo form key only; accepts `launch_from_entity`, `prefill_field_map`, client `metadata`
- `PATCH /api/admin/forms/[formId]/public-links/[linkId]` — full metadata replace supported (admin-only); **no dedicated UI** for intake keys today
- Public draft create stamps subset via `stampFormContextFromLinkMetadata` / `mergePublicSubmissionMeta`

**Gap:** Outcome config is **real and runtime-authoritative** but **invisible in AdminV2** except indirect signals (`linkRequiresLeadCapture` → “lead capture configured” boolean on form detail).

---

## 2. Intake routing metadata

**Resolution order at submit** (`web/app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts`):

1. Link metadata from resolved public link
2. `buildFormIntakeMetaFromPayload` → structured `payload.meta.intake` hints (vertical, guardian, child, opportunity hints)
3. `applyFormIntakeSafe` → CRM FKs + outcome meta on submission

**Location / work unit / vertical / source** come from **link metadata**, not form definition. Doctrine confirmed in [`forms-intake-runtime-phase.md`](../../system/forms-intake-runtime-phase.md) §2.

**Demo path:** `scripts/prepareDemoChildcareMedicationIntakeTest.ts` patches link metadata for Demo Childcare Co — production operators today rely on scripts or manual JSON PATCH.

---

## 3. Submission → opportunity behavior

**Primary module:** `web/lib/forms/intake/applyFormIntakeSafe.ts`

| Path | Behavior |
|------|----------|
| Person match by email | High confidence; may create customer/opportunity if flags on |
| Person match by phone only | Medium confidence; **always flags review** when linked |
| New person created | `created_records`; **always flags review** today |
| Opportunity dedup match | `attached_existing`; **does not flag review** (Test 1D / 2D validated) |
| Ambiguous person/opportunity | No CRM FKs; `intake_needs_review: true` |
| Auto-create disabled | Partial FKs possible; review flagged with explicit reason |
| Work unit / department mismatch | Opportunity created without work unit; review flagged |

**Outcome meta** written to `form_submissions.payload.meta`:

- `intake_resolution_path`, `intake_match_strategy`, `intake_match_confidence`
- `intake_needs_review`, `intake_review_reason`
- `intake_opportunity_match`: `created` \| `attached_existing` \| `ambiguous`
- `intake_candidate_email_count`, `intake_candidate_phone_count`

**FK columns updated on submit:** `person_id`, `customer_id`, `customer_member_id`, `opportunity_id`.

**Doctrine tension (strategic vs current):** Product wants high-confidence cold leads to **auto-operationalize** without hard review. Current code **requires review for every new person** (`personCreated → intakeNeedsReview`). Dedup attach is already the happy path without review.

---

## 4. Review / confirm linkage behavior

**Review signal:** `payload.meta.intake_needs_review === true` (submission-scoped, not a separate table).

**Lane routing:** `web/lib/forms/submissionInboxPresentation.ts` → `resolveSubmissionInboxLane`:

- `needsReview` — intake flagged or ambiguous paths
- `needsLinking` — missing CRM attach parent for document generation
- `recentlySubmitted` — submitted, linked, not flagged
- `drafts` — in-progress

**Operator actions:**

| Action | Route | Effect |
|--------|-------|--------|
| Confirm linkage | `POST .../submissions/[id]/confirm-linkage` | Clears `intake_needs_review`; stamps `intake_reviewed_at`, `intake_reviewed_by`, `intake_review_result: confirmed` — **payload.meta only, no CRM mutation** |
| Manual link | `POST .../submissions/[id]/manual-link` | Sets FK columns + clears review flag |
| Packet review | `PATCH .../packet-sessions/[id]/review` | Session-level `operator_review_status` |

**Quick review:** `SubmissionQuickReviewModal` — confirm linkage inline; link to full case file.

**Packet parallel:** `form_packet_sessions.operator_review_status` (`needs_review`, `needs_correction`, `approved`, `rejected`) — separate from submission `intake_needs_review`.

---

## 5. Workload lane model

**Hub:** `FormsHubClient.tsx` → `IntakeWorkspaceHubView.tsx`

**Pills:** `needs_review` | `needs_linking` | `recent` | `waiting` | `forms` | `packets`  
(`web/lib/forms/intakeWorkspaceFilters.ts`)

**Row unit today:** **One submission** (or packet session for packet review pill count).

**Row copy:** `submissionOperationalNarrative.ts` — headline / detail / operatorAction from intake meta + lane.

**API:** `GET /api/admin/forms/submissions` — org-scoped list; sorted by `submitted_at` desc (OI-4 fix).

**Gap:** Multiple submissions for same opportunity appear as **separate workload rows** — not grouped as one operational case.

---

## 6. Workflow event emission

**Module:** `web/lib/forms/workflow/formSubmissionEvents.ts`

| Event | When | Entity |
|-------|------|--------|
| `form_submitted` | After successful public/admin submit | `form_submissions` |
| `form_signed` | Signature capture | `form_submissions` |
| `form_document_generated` | PDF/artifact create | `form_submissions` |
| `form_packet_completed` | Packet session completes (idempotent) | `form_packet_sessions` |

**Payload includes:** submission FKs, optional packet correlation (`is_packet_submission`, session ids).

**Not emitted today:** `intake_case_*`, `form_intake_reviewed`, `duplicate_intake_attached`, `intake_case_auto_operationalized`.

**Task creation:** Not implicit on submit — workflow subscriptions / admin actions only (documented in runtime validation doctrine).

---

## 7. Packet / session linkage model

**Tables:**

- `form_packet_sessions` — `launch_context`, `crm_snapshot`, `shared_values`, `operator_review_status`, `started_via_public_link_id`
- `form_packet_session_items` — step status, `form_submission_id` FK

**Workflow correlation:** `fetchPacketWorkflowCorrelationForSubmission` joins submission → session item → session.

**Intake case anchor for packets:** Session often carries `launch_context.opportunity_id` / CRM snapshot; step submissions inherit stamped meta. Packet-complete review is **session-scoped**, not submission-scoped.

**Case file UI:** `PacketReviewRollupView` + `IntakeCaseFileLayout` — multi-step operational view exists for packets; standalone submissions use `SubmissionIntakeCaseFileContent`.

---

## 8. CRM / opportunity / person / customer linkage

**On `form_submissions`:**

| Column | Role |
|--------|------|
| `person_id` | Guardian / submitter person |
| `customer_id` | Household / account |
| `customer_member_id` | Child / member when captured |
| `opportunity_id` | Business record / enrollment inquiry |
| `created_via_public_link_id` | Distribution provenance |

**Intake promotion:** Public values stay in `payload` until operator review / explicit sync paths — trust boundary per product doc.

**Opportunity as business record:** Created with `source`, `location_id`, `work_unit_id`, `status_key` from link metadata; appears in configured work unit queue (downstream org config).

**No intake_case FK** on any table today.

---

## 9. AdminV2 Forms authoring UI

**Routes:** `/adminV2/forms` → hub; `/adminV2/forms/[formId]` → `FormDetailClient` (shared with legacy admin path).

**Lifecycle workspace:** Design → Publish → Distribute → Intake preview (`FormLifecycleWorkspaceLayout`).

**Distribution:** `FormDistributionPanel` → `DistributionLinksPanel` — mint link, copy URL, list active links, preview badge. Shows link label + optional `purpose` line — **does not surface intake/outcome flags**.

**Form definition metadata:** `form_definitions.metadata.operator_context` — human prose (`purpose`, `who_completes`, `after_submission`) via `operatorFormGuidance.ts`. **Not machine-readable outcome config.**

**Composition editor:** Unchanged; document composition separate from outcome config.

**Gap:** Operator cannot answer “When this form is submitted, what happens?” from the UI without inspecting raw link JSON or running audit scripts.

---

## 10. Schema — Intake Case candidates

**No table named `intake_case*` in `docs/supabase/reference/supabase_schema_columns.csv`.**

| Existing artifact | Could represent case? |
|-------------------|----------------------|
| `opportunities` | **Best business anchor** for enrollment / lead intake — already receives routing |
| `form_packet_sessions` | **Best anchor** for multi-step packet journeys |
| `form_submissions` | **Evidence** — one case may have many |
| `form_public_links.metadata` | **Outcome config** per distribution |
| `form_definitions.metadata` | **Default outcome template** (unused for machine config today) |
| `form_submissions.payload.meta` | **Review state + intake trace** (per submission) |

**Conclusion:** Persisted intake case table is **not required** for first pass. Derived model grouping by `opportunity_id` (preferred) or `packet_session_id` (when no opportunity) is aligned with existing FKs.

---

# Phase 1 — Doctrine

## Strategic model

```
Form definition     = reusable field/composition artifact
Distribution link   = operational context + outcome config
Submission          = evidence of one capture event
Packet session      = multi-step intake journey instance
Opportunity         = business record (CRM)
Intake Case (derived)= operator-facing situation grouping evidence + record + review state
Workflow            = automation reacting to events
```

**Key rule:** Form definition is reusable. **Distribution / link / session carries operational context.**

## Term definitions

| Term | Definition |
|------|------------|
| **Intake case** | Operator-facing operational situation: who (person/household), what journey (form(s)/packet), linked business record, review state, next action. **Derived view** until persistence is justified. |
| **Submission** | Immutable-ish evidence row (`form_submissions`) with payload, signatures, CRM FKs, intake meta. |
| **Packet** | Multi-step intake definition + session instance (`form_packet_definitions` / `form_packet_sessions`). |
| **Opportunity** | CRM business record; primary anchor for lead/enrollment intake cases. |
| **Intake outcome** | Configured effects on successful submit: CRM creates/attach, review mode, workflow emit, task, document, packet send. |
| **Intake confidence** | Deterministic match quality from intake engine: `high` \| `medium` \| `low` \| `none` (already in `intake_match_confidence`). |
| **Review state** | Submission: `payload.meta.intake_needs_review` + review stamps. Packet: `operator_review_status`. Case-level review = rollup of child states. |
| **Workflow trigger** | Registered `workflow_events` row; intake should emit case-oriented events without breaking existing form events. |
| **Distribution context** | Metadata on public link (or session launch context) determining routing, prefill, and outcomes. |

## Location / context resolution

Location and routing may come from (combine only where metadata explicitly merges):

1. Public link metadata (`default_location_id`, work unit, department)
2. Operator-selected location at link mint time (future UI)
3. Parent portal session (future)
4. Workflow-created packet / campaign mint
5. Existing-record launch (`source_entity_*`)
6. Operator manual correction post-submit

See [`forms-intake-runtime-phase.md`](../../system/forms-intake-runtime-phase.md) §2.

## Review doctrine (target)

**Do not require human review for every successful new lead.**

| Confidence / signal | Routing |
|---------------------|---------|
| **High** — email match, clean dedup attach, complete routing, configured auto-operationalize | Auto-operationalize → **Recent** / queue; optional soft “new lead” badge |
| **Medium** — phone-only match, new member auto-created, partial ambiguity resolved | **Recent** with suggested review; document gen may stay gated |
| **Low / ambiguous** — multiple person/opportunity candidates, config errors | **Needs review** |
| **Missing links** — intake skipped or no CRM attach | **Needs linking** |

**Current vs target:** Today, **new person create always → Needs review**. Target (IC-4) narrows hard review to ambiguity, missing links, explicit form-level `review_required`, or medium/low confidence paths.

## Outcome configuration doctrine

**Surface:** `/adminV2/forms/[formId]` — form detail / distribution area.

**Operator question:** “When this form is submitted, what should happen?”

| Outcome | Config surface today | Runtime |
|---------|---------------------|---------|
| Store submission only | Default link (no intake flags) | ✓ |
| Create opportunity | Link: `auto_create_opportunity` + vertical | ✓ |
| Attach to existing record | Link: `form_context_mode: existing_record` or dedup | ✓ |
| Create/update intake case | N/A (derived) | Presentation-only first |
| Route location / work unit / status | Link metadata | ✓ |
| Emit workflow event | Implicit `form_submitted` | Partial — case events missing |
| Create task | Workflow subscription | ✓ (downstream) |
| Send packet | Admin / workflow action | Separate path |
| Generate document | Operator action post-review | ✓ |
| Require review | Implicit from intake rules | ✓ — needs confidence mode + explicit override |

**Layering:**

1. **Form default outcome** — `form_definitions.metadata.intake_outcome` (proposed JSON shape; no migration)
2. **Link override** — `form_public_links.metadata` (authoritative at runtime)
3. **Session inherit** — packet launch stamps session; steps inherit

## Product pipeline doctrine

Forms/Documents is not generic CRUD:

**compose → configure outcome → distribute → capture → review/resolve → operationalize**

Outcome configuration belongs **between compose and distribute**, visible on the same form workspace surface.

---

# Phase 2 — Proposed implementation cards

## IC-1 — Outcome Configuration Panel

**Status:** Read-only v1 **shipped** (May 2026)

**Goal:** Admin-side panel on form detail / distribution showing effective outcome config.

**Read-only v1 fields:**

- Intake enabled (lead_capture / intake flags)
- Create opportunity (auto_create_opportunity)
- Default vertical, location, department, work unit, status, source
- Auto-create person / customer / member toggles
- Review requirement mode (derived from current rules + proposed override when added)
- Duplicate strategy (document dedup behavior from `intakeOpportunityDedup`)
- Per-link breakdown when multiple links differ

**Data sources:** Existing `GET public-links` + form definition metadata; parse via `parseIntakeLinkDefaults`, `parseIntakeAutoCreateFlags`, `linkRequiresLeadCapture`.

**Editable v2 (follow-on):** PATCH link metadata through validated form; form-level defaults merged on `POST public-links`.

| Attribute | Value |
|-----------|-------|
| Migration | None |
| Runtime risk | None (read-only v1) |
| Depends on | Audit keys in `FormPublicLinkMetadata` |

---

## IC-2 — Intake Case Presentation Model

**Status:** Shipped (May 2026)

**Goal:** Derived view model for operator surfaces — groups submission evidence into intake situations.

**Module:** `web/lib/forms/intakeCasePresentation.ts`

**Exports:**

- `resolveIntakeCaseGroupKey` / `parseIntakeCaseGroupKey`
- `resolveSubmissionPacketSessionId`
- `groupSubmissionsByIntakeCaseKey`
- `buildIntakeCasePresentationRows`

### Grouping rules (deterministic, presentation-only)

| Priority | Anchor | `case_key` format |
|----------|--------|-------------------|
| 1 | `opportunity_id` on submission | `opportunity:{uuid}` |
| 2 | `packet_session_id` (field or `payload.meta`) | `packet_session:{uuid}` |
| 3 | Standalone submission | `submission:{uuid}` |

Opportunity wins when both opportunity and packet session are present on the same submission.

**No persisted `intake_cases` table.** Keys are not stored — recomputed from list payloads.

### `IntakeCasePresentationRow` shape

- `case_key`, `anchor_type`, `anchor_id`
- `display_title`, `subtitle`
- `status_bucket`: `needs_attention` \| `needs_linking` \| `review_required` \| `packet_in_progress` \| `auto_operationalized` \| `waiting` \| `recent`
- `latest_activity_at`, `review_state`, `operationalized_state`
- `opportunity_id`, `packet_session_id`, `submission_ids`, `submission_count`
- `has_signature`, `has_generated_document`
- `attention_reasons`, `recommended_next_action`, `href`, `sort_key`

### Runtime behavior

**Unchanged for submit/runtime.** IC-2 helper is presentation-only. **IC-3** wires it into workload UI (read/presentation path only).

---

## IC-3 — Workload Rows Become Intake Cases

**Status:** Shipped (May 2026)

**Goal:** Workload panel rows represent operational intake cases, not isolated submissions.

**Modules:**

- `web/lib/forms/intakeWorkspaceFilters.ts` — case-backed filter panels + counts
- `web/components/forms/workspace/IntakeWorkspaceFilterPanelView.tsx` — case-centric row UI

### Architecture

| Layer | Role |
|-------|------|
| Data source | Existing submission list + packet sessions (unchanged API) |
| Presentation | `buildIntakeCasePresentationRows` (IC-2) |
| Workload UI | One row per derived case; submissions remain evidence |

**No persisted `intake_cases` table.** Cases recomputed client-side on each render.

### Lane mapping (stable taxonomy)

Existing workload pills unchanged. Cases map via `status_bucket` + `review_state`:

| Filter pill | Case signals |
|-------------|--------------|
| Needs review | `review_required`, `needs_attention`, `packet_review_pending` |
| Needs linking | `needs_linking` |
| Recent intake | `recent`, `auto_operationalized` |
| Waiting | `waiting`, `packet_in_progress` + orphan in-progress sessions |

Submission lane counts preserved via `countIntakeWorkspaceSubmissionLanes` for diagnostics.

### Row behavior

- Multiple submissions → one case row with submission count
- Latest activity timestamp from case model
- Recommended next action from case model
- Quick review opens `SubmissionQuickReviewModal` with **most recent submission** in case
- Orphan packet sessions (no submissions in loaded list) still appear as session rows

### IC-4 follow-on

Runtime review routing shipped — configured links with `review_mode: confidence` + `auto_operationalize: true` auto-operationalize clean creates. **IC-5** emits workflow events.

---

## IC-4 — Confidence-Based Review Routing

**Status:** Shipped (May 2026)

**Goal:** Exception-based review — clean, high-confidence intake auto-operationalizes instead of always requiring human review.

**Module:** `web/lib/forms/intake/resolveIntakeReviewDecision.ts`  
**Runtime touch:** `web/lib/forms/intake/applyFormIntakeSafe.ts`

### Review decision helper

`resolveIntakeReviewDecision(input)` returns:

```typescript
{
  needsReview: boolean;
  reviewMode: "required" | "exception_only" | "never" | "legacy_default";
  confidence: "high" | "medium" | "low" | "unknown";
  reasons: string[];
  autoOperationalized: boolean;
  reviewReason?: string;
}
```

### Review mode (link metadata)

| `review_mode` | Behavior |
|---------------|----------|
| *(missing)* | **legacy_default** — new person create still requires review |
| `always` | Always review |
| `confidence` / `exception_only` | Review only on exceptions when `auto_operationalize: true` |
| `never` | Skip review (explicit opt-in) |

`review_required: true` overrides and forces review.

### Auto-operationalize eligibility (exception mode)

All required:

- `auto_operationalize: true`
- Email present for new person create
- Opportunity created or confident duplicate attach (`matched_email` + `attached_existing`)
- Complete routing: vertical + location + work unit on link
- No work unit / department mismatch
- No phone-only match, child auto-create, or ambiguous opportunity

### Metadata written on submit

| Field | Purpose |
|-------|---------|
| `intake_needs_review` | Workload lane signal (unchanged consumers) |
| `intake_review_reason` | Operator-facing primary reason |
| `intake_auto_operationalized` | High-confidence auto path marker |
| `intake_confidence` | Match/decision confidence |
| `intake_review_decision` | Structured `{ needs_review, review_mode, confidence, reasons, auto_operationalized }` |

### Safe defaults

Missing or legacy links **keep review on new person create**. Exception routing applies only when config explicitly sets `review_mode: confidence|exception_only` and `auto_operationalize: true`.

### Demo Childcare Co regression

Prepare script patches link with IC-4 fields:

- `review_mode: "confidence"`
- `auto_operationalize: true`

Unit tests validate Demo routing metadata via `DEMO_CHILDCARE_MED_INTAKE_LINK_METADATA` fixture. Re-run manual Test 2D after deploy.

| Attribute | Value |
|-----------|-------|
| Migration | None |
| Runtime risk | **Medium** — workload lane distribution changes for configured links |
| Preserve | Duplicate attach; ambiguous match still review; legacy links unchanged |

**IC-5** lifecycle events shipped — workflows can subscribe to operational intake outcomes.

---

## IC-5 — Additive Intake Lifecycle Workflow Events

**Status:** Shipped (May 2026)

**Goal:** Emit additive intake lifecycle events from the public submit path so workflow/BOS/automation can react to Intake Case outcomes.

**Module:** `web/lib/forms/workflow/intakeCaseLifecycleEvents.ts`  
**Emit site:** `web/app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts` (after `form_submitted`)

### Event names (additive)

| Event | When |
|-------|------|
| `intake_case_created` | Lead-capture intake ran and established a case anchor |
| `intake_case_operationalized` | Intake auto-operationalized (IC-4) — no review required |
| `intake_case_review_required` | Intake flagged for human review |
| `intake_case_linked` | Confident attach to existing opportunity/family (`attached_existing` + email match) |

**Unchanged:** `form_submitted`, `form_signed`, `form_document_generated`, `form_packet_completed`.

**Not in IC-5:** `intake_case_packet_completed` (deferred — `form_packet_completed` already exists), confirm-linkage events, persisted `intake_cases`.

### Payload contract

Each event payload includes:

- `org_id`, `form_id`, `form_submission_id`
- `case_key`, `case_anchor_type`, `case_anchor_id` (derived — same rules as IC-2)
- `opportunity_id`, `packet_session_id` (when available)
- `review_mode`, `intake_needs_review`, `intake_auto_operationalized`, `intake_confidence`
- `intake_review_reasons`, `source: "forms_intake"`
- CRM FK hints: `person_id`, `customer_id`, `customer_member_id`

Entity type: `form_submissions` · entity id: submission id.

### Emission rules

1. Only when lead-capture intake ran with a real outcome path (not `skipped_*`).
2. Always `intake_case_created` when eligible.
3. Then exactly one outcome event: `review_required` OR `operationalized` OR `linked`.
4. No duplicate event types within the same submit transaction.

| Attribute | Value |
|-----------|-------|
| Migration | None |
| Runtime risk | Low (additive) |
| Depends on | IC-2 case keys, IC-4 review metadata |

**Follow-on:** Workflow templates/BOS triggers can subscribe to new event types; confirm-linkage path may emit review-cleared events in a later card.

---

## IC-6 — Quick Review Modal Simplification (shipped)

**Status:** Shipped (May 2026)  
**Goal:** Operator-first quick review aligned with Intake Case doctrine — no runtime/submit changes.

### What shipped

- **`buildIntakeQuickReviewViewModel`** — structured modal copy from submission + derived case context
- **Modal sections:** Intake summary → Needs action → Recommended next step → Evidence (secondary)
- **Operator language:** “New inquiry created”, “Attached to existing family”, “Auto-operationalized”, “Review required before enrollment continues”, “No manual review required.”
- **Preserved:** confirm-linkage flow, open intake file, admin/ops gate, case-centric quick review open from workload rows

### Modal structure

| Section | Content |
|---------|---------|
| **Intake summary** | What was captured, operational record created/attached, routing hint, case status badge |
| **Needs action** | Action items when required; otherwise “No manual review required.” |
| **Recommended next step** | From derived intake case `recommended_next_action` |
| **Evidence** | Form name, timestamp, signatures, generated document, submission count |

| Attribute | Value |
|-----------|-------|
| Migration | None |
| Runtime | Unchanged |
| Public renderer | Unchanged |

### Files

| File | Change |
|------|--------|
| `web/lib/forms/intakeQuickReviewPresentation.ts` | **New** — view model |
| `web/components/forms/workspace/SubmissionQuickReviewModal.tsx` | IC-6 layout + copy |
| `web/components/forms/workspace/IntakeWorkspaceFilterPanelView.tsx` | Pass `submissionCount` to modal |
| `web/tests/forms/intakeQuickReviewPresentation.test.ts` | **New** |
| `web/tests/forms/submissionQuickReviewModal.test.tsx` | **New** |

---

## IC-7 — Rich Text Inline Tokens (backlog)

**Goal:** Document only — composition feature for inline canonical field tokens in rich text blocks.

- Tokens bind to existing field keys
- Preview/runtime render placeholders → values
- Status: **not built** — aligns with [`forms-intake-runtime-phase.md`](../../system/forms-intake-runtime-phase.md) §5

**Do not implement unless explicitly selected.**

---

## Recommended implementation order

| Order | Card | Rationale |
|-------|------|-----------|
| **1** | **IC-1 (read-only)** | Zero runtime risk; makes existing config visible; validates metadata shape before editable UI |
| 2 | IC-4 | Highest product impact; requires IC-1 review_mode field design |
| 3 | IC-5 | Automations hook for IC-4 outcomes |
| 4 | IC-2 + IC-3 | Operator model shift in workload |
| 5 | IC-6 | Polish after case grouping exists |
| — | IC-7 | Backlog |

---

# Risks / gaps

| Risk | Mitigation |
|------|------------|
| **New person auto-operationalize (IC-4)** may allow document gen before operator verifies identity | Keep document gen policy tied to review flags initially; gate `createGeneratedPdfForSubmission` on confidence mode |
| **Case grouping without persisted case** | Edge cases: multiple opportunities per household, submissions with no opportunity — fallback to submission-scoped case |
| **Link vs form default precedence** | Document in IC-1; test merge on POST public-links |
| **Packet vs standalone review duality** | Case view model must rollup `operator_review_status` + submission `intake_needs_review` |
| **Workflow event proliferation** | Register keys; idempotency for case_created vs updated |
| **Demo Childcare regression** | Re-run Test 2D scripts after IC-4 |
| **No form-level outcome UI history** | Accept JSONB audit gap until persisted case or link version history |

**Out of scope (explicit):** OCR, AI document recreation, packet runtime rewrite, full forms UI redesign, default opportunity creation for all forms, large schema migration without approval.

---

# Files likely touched (by card)

## IC-1 / IC-1b / IC-1c

| File | Change |
|------|--------|
| `web/lib/forms/outcomeConfigPresentation.ts` | Read-only view model |
| `web/lib/forms/outcomeConfigEditor.ts` | **IC-1c** parse/merge/validate |
| `web/lib/forms/resolveOutcomeConfigPickerOptions.ts` | **IC-1c** routing pickers |
| `web/components/forms/admin/FormOutcomeConfigPanel.tsx` | IC-1 read + **IC-1c edit** |
| `web/app/api/admin/forms/[formId]/outcome-labels/route.ts` | IC-1b labels + IC-1c pickers |
| `web/app/api/admin/forms/[formId]/public-links/[linkId]/route.ts` | IC-1c metadata merge |
| `web/tests/forms/outcomeConfigEditor.test.ts` | **New** |
| `web/tests/forms/formOutcomeConfigPanel.test.tsx` | **New** |

## IC-2

| File | Change |
|------|--------|
| `web/lib/forms/intakeCasePresentation.ts` | **New** — view model + grouping |
| `web/tests/forms/intakeCasePresentation.test.ts` | **New** |

## IC-3

| File | Change |
|------|--------|
| `web/lib/forms/intakeWorkspaceFilters.ts` | Case-backed panels + lane mapping |
| `web/components/forms/workspace/IntakeWorkspaceFilterPanelView.tsx` | Case-centric row UI |
| `web/tests/forms/intakeWorkspaceFilters.test.ts` | IC-3 grouping + empty states |
| `web/tests/forms/formsIntakeWorkspaceHub.test.tsx` | Case row assertions |

## IC-4

| File | Change |
|------|--------|
| `web/lib/forms/intake/resolveIntakeReviewDecision.ts` | **New** — review decision helper |
| `web/lib/forms/intake/applyFormIntakeSafe.ts` | Wire decision + metadata stamps |
| `web/lib/public/forms/publicFormTypes.ts` | `review_mode`, `auto_operationalize` types |
| `web/lib/forms/intakeRuntimeTestFixtures.ts` | Demo Childcare IC-4 metadata fixture |
| `web/scripts/prepareDemoChildcareMedicationIntakeTest.ts` | Patch link with IC-4 fields |
| `web/tests/forms/resolveIntakeReviewDecision.test.ts` | **New** |

## IC-5

| File | Change |
|------|--------|
| `web/lib/forms/workflow/intakeCaseLifecycleEvents.ts` | **New** — payload + emit helpers |
| `web/app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts` | Emit after `form_submitted` |
| `web/lib/workflowVocab.ts` | Register new event type keys |
| `web/tests/forms/intakeCaseLifecycleEvents.test.ts` | **New** |

## IC-6

| File | Change |
|------|--------|
| `web/lib/forms/intakeQuickReviewPresentation.ts` | **New** — operator-first view model |
| `web/components/forms/workspace/SubmissionQuickReviewModal.tsx` | IC-6 section layout + copy |
| `web/components/forms/workspace/IntakeWorkspaceFilterPanelView.tsx` | Pass case submission count |
| `web/tests/forms/intakeQuickReviewPresentation.test.ts` | **New** |
| `web/tests/forms/submissionQuickReviewModal.test.tsx` | **New** |
| `web/tests/forms/formsIntakeWorkspaceHub.test.tsx` | Quick review trigger preserved |

## Docs (all cards)

| File | Change |
|------|--------|
| `docs/product/documents-and-forms.md` | Intake case model paragraph when IC-2 ships |
| `docs/system/forms-intake-runtime-phase.md` | Review doctrine sync when IC-4 ships |

---

# Sprint closeout (May 2026)

> **Paused** — IC-5.6 comprehension + enrollment lead proof validation must pass before closeout is final.

## IC-5.6 — Intake Semantics + Enrollment Opportunity Proof

**Goal:** Make Forms/Intake UI understandable to operators and prove a configured enrollment lead form creates a real opportunity/lead.

**Not in scope:** schema changes, persisted `intake_cases`, full forms workspace redesign, loosening child/member review safety, removing Medication Authorization validation.

### Part 1 — Operational Outcome panel UX

- **When this form is submitted** story summary with checkmark-style bullets (create lead, attach family, route to pipeline, review when child created)
- Business labels: **Lead** / **Lead status** when configured status label resolves as lead (not hardcoded Inquiry)
- Prominent multi-link variance callout: “Different links can route this form differently”
- Distribution link selector copy: “Selected distribution link” + scope note
- **Copy outcome settings — coming soon** (disabled affordance; full copy-across-locations is follow-up)

### Part 2 — Share / distribution clarity

- Top action renamed **Create link** (was ambiguous “Share”)
- After create: scroll to distribute section; optimistic link append + quiet links refresh (no full workspace reload)
- Tooltip explains link is created and URL is copied from Share intake below

### Part 3 — Enrollment lead opportunity proof (canonical)

| Path | Role |
|------|------|
| **Enrollment Lead — Demo** (`enrollment_lead_capture_demo`) | **Canonical proof** that forms create real opportunities/leads |
| **Medication Authorization — Demo** | Review-required child/member path (IC-4); **not** the clean lead proof |

Guardian-only demo form — no `auto_create_customer_member`. Expect auto-operationalized Recent lane, “New lead created”, workflow events `form_submitted` + `intake_case_created` + `intake_case_operationalized`.

```bash
cd web && npx tsx --tsconfig tsconfig.json scripts/prepareDemoChildcareEnrollmentLeadIntakeTest.ts
cd web && npx tsx --tsconfig tsconfig.json scripts/qaEnrollmentLeadOpportunityProof.ts
```

Embed token: `alloy_demo_enrollment_lead_capture_v1__org_93667019-bd28-49b5-a688-acc9bb1e0a19`

### Intake semantics (operator-facing)

| Intake type | Primary outcome |
|-------------|-----------------|
| Enrollment lead intake | Opportunity-centric — new lead in enrollment pipeline |
| Existing record / document intake | Attach / evidence-centric |
| Packet step | Packet-centric |

### Follow-up

- Copy outcome settings across distribution links / locations (planned; not built in IC-5.6)

### IC-5.6 validation fixes (manual browser blockers)

**Closeout still paused** — manual UI validation must be rerun after fixes below.

| Blocker | Root cause | Fix |
|---------|------------|-----|
| **0 — Lead not visible / Open wrong target** | Case `href` always pointed at submission detail; opportunity drawer never opened; `opportunity_id` on list row sometimes missing while case had it | **Open lead** opens opportunity drawer; case row merges case `opportunity_id` onto submission for quick review; recommended action **Open lead** for auto-op cases |
| **1 — Quick review mismatch** | Modal used submission-only meta; stale `skipped_missing_config` path checked before `opportunity_id`; case operationalized state ignored | Pass `quickReviewCaseContext` from case row; quick review prefers case auto-op + opportunity over stale skipped path |
| **2 — Email validation flash** | Draft PATCH autosave surfaced pattern validation errors while typing; stale PATCH responses could race submit | Draft autosave no longer sets validation errors; submit-only error surfacing with seq guard |
| **3 — Outcome panel too flat** | Full-width list rows | Compact story card + 2–3 column detail cards |
| **4 — Create link refresh** | Background links refetch + outcome panel reloaded labels on `links.length` change | Optimistic link append only; removed quiet refetch; labels load once per form |

**Re-run manual checklist + gates after deploy:**

```bash
cd web && npx tsx scripts/qaEnrollmentLeadOpportunityProof.ts
cd web && npm run test -- tests/forms/intakeQuickReviewPresentation.test.ts tests/forms/formOutcomeConfigPanel.test.tsx
```

## IC-5.5 — Browser/UI Validation Pass

**Goal:** Validate operator flows in browser + live Demo Childcare Co before sprint closeout.

**Gate script:** `web/scripts/qaIntakeCaseOperationalModelGate.ts`

```bash
cd web && npx tsx --tsconfig tsconfig.json scripts/prepareDemoChildcareMedicationIntakeTest.ts
cd web && npx tsx --tsconfig tsconfig.json scripts/qaIntakeCaseOperationalModelGate.ts
```

**Test org / form / link:**

| Field | Value |
|-------|-------|
| Org | Demo Childcare Co `93667019-bd28-49b5-a688-acc9bb1e0a19` |
| Form | Medication Authorization — Demo `8432c527-8799-4a55-88c7-f860bd78e747` |
| Public link | `187ba369-78ab-4df1-99d9-ca8d3120379f` |
| Embed token | `alloy_demo_medication_authorization_v1__org_93667019-bd28-49b5-a688-acc9bb1e0a19` |
| Form detail | `/adminV2/forms/8432c527-8799-4a55-88c7-f860bd78e747` |
| Intake workspace | `/adminV2/forms` |

### Gate results (Option B aligned — 7/7 pass)

Last run: automated gate against Demo Childcare Co + `localhost:3000`.

| Flow | Expected |
|------|----------|
| **B — Demo medication first submit** | Review-required: `child_member_auto_created` + `new_person_created`; Needs Review lane; `intake_case_review_required` |
| **B2 — Lead-only auto-op** | Gate patches `auto_create_customer_member: false`; auto-operationalized; Recent lane; `intake_case_operationalized` |
| **C — Legacy review_required** | Explicit `review_required: true` on link |
| **D — Duplicate attach** | After Flow B (member on opportunity); second submit attaches; recent lane; grouped case stays **Needs Review** until first submission cleared |
| **E — Workflow events** | Separate assertions for review-required vs operationalized paths |

### IC-4 safety doctrine (Option B — no rule change)

Demo medication intake sets `auto_create_customer_member: true`. IC-4 **correctly** blocks auto-operationalization when `memberAutoCreated` / `child_member_auto_created` is true. First-time childcare intake that creates a child profile remains **review-required** even when `review_mode: confidence` and `auto_operationalize: true` are set on the link.

Auto-operationalization is proven separately via the **lead-only** gate path (`auto_create_customer_member: false`) — not by loosening IC-4.

### Manual browser checklist (remaining)

- [ ] Log into Demo Childcare Co
- [ ] Form detail → Operational Outcome panel labels (no raw UUIDs)
- [ ] Edit outcome → save → read-only refresh
- [ ] Intake workspace pills + case row copy
- [ ] Quick review modal from case row

---

# Sprint closeout (May 2026)

## What shipped

| Card | Deliverable |
|------|-------------|
| IC-0.5 | Outcome configuration doctrine + precedence |
| IC-1 / IC-1b | Read-only operational outcome panel + label resolution |
| IC-1c | Editable distribution link outcome config (PATCH merge) |
| IC-2 | Derived intake case presentation model (`buildIntakeCasePresentationRows`) |
| IC-3 | Case-centric intake workspace filter rows |
| IC-4 | Confidence-based review routing in `applyFormIntakeSafe` |
| IC-5 | Additive `intake_case_*` workflow lifecycle events |
| IC-6 | Operator-first quick review modal |

## Runtime behavior now supported

- Public link metadata drives intake outcome (lead capture, routing, review mode, auto-operationalize)
- Admin can edit link outcome config from form detail (IC-1c)
- Submit path stamps `intake_needs_review`, `intake_auto_operationalized`, `intake_review_decision`
- Workload groups submissions into derived intake cases (opportunity → packet session → submission)
- Workflow emits `intake_case_created`, `intake_case_operationalized`, `intake_case_review_required`, `intake_case_linked`
- Quick review modal answers: what happened, what needs action, is it operationalized, what next

## Deferred follow-ons

| Item | Notes |
|------|-------|
| Copy outcome settings across links/locations | IC-5.6 disabled “coming soon” affordance only |
| Form-level defaults merge/mint | `form_definitions.metadata.intake_outcome` read-only; runtime merge at submit not implemented |
| Workflow template trigger UI | Subscribe to `intake_case_*` events — no editor in this sprint |
| Automation section editor | Outcome panel placeholders only (workflow/task/packet/document) |
| Persisted `intake_cases` table | Only if case identity must be independent of opportunity |
| AI document recreation | Out of scope |
| Public renderer document composition | Out of scope |
| Rich text inline tokens | IC-7 backlog |
| Confirm-linkage workflow events | Deferred from IC-5 |
| Packet/session launch label resolution on form detail | IC-1b limitation |

## Regression checklist

- [ ] Enrollment Lead — Demo gate (`qaEnrollmentLeadOpportunityProof.ts`) passes
- [ ] Demo Childcare medication intake (Test 2D) — first submit Needs Review; lead-only auto-op via gate B2
- [ ] Public embed submit — no renderer changes in sprint
- [ ] Edit link outcome config — unknown metadata keys preserved
- [ ] Quick review from case row — confirm linkage + open intake file
- [ ] `cd web && npx tsc --noEmit`
- [ ] `cd web && npm run test -- tests/forms/intakeCasePresentation.test.ts tests/forms/intakeQuickReviewPresentation.test.ts tests/forms/submissionQuickReviewModal.test.ts tests/forms/resolveIntakeReviewDecision.test.ts tests/forms/intakeCaseLifecycleEvents.test.ts tests/forms/outcomeConfigEditor.test.ts`

## Recommended next sprint

1. **Workflow hooks for intake lifecycle** — template triggers for `intake_case_*` events (BOS/workflow editor minimal wiring)
2. **Form-level outcome defaults** — mint new links from form template; optional runtime merge at submit
3. **Automation outcome editor** — wire workflow/task/packet actions from outcome panel (config-driven, not full editor)
4. **Confirm-linkage events** — emit review-cleared lifecycle event after operator confirms match
5. **IC-7 rich text tokens** — only if document composition becomes active priority

---

# IC-5.7 — Intake Runtime Orchestration UX

**Goal:** Make runtime context, outcome configuration, and operational proof obvious — without new schema or distribution-link architecture changes.

## Shipped

| Area | Change |
|------|--------|
| Guided orchestration rail | `FormIntakeRuntimeOrchestrationPanel` — configure → outcome → runtime → test step rail on form detail |
| Active runtime card | Selected distribution link, intake type, embed token prefix, copy/open embed, refresh test |
| Runtime mismatch prevention | Warn when latest submission used a different link; one-click switch to that link |
| Runtime test confirmation | Latest submit outcome headline, lead created, Open lead drawer, View in pipeline link |
| Outcome panel sync | Link selector owned by orchestration panel; outcome editor follows active runtime |
| Intake workspace chips | Case rows show Lead linked / Auto-operationalized / Review required badges |
| Session persistence | Active runtime link + per-link embed URL in sessionStorage after link create |

## Key files

- `web/lib/forms/intakeRuntimeOrchestrationPresentation.ts`
- `web/lib/forms/intakeRuntimeOrchestrationStorage.ts`
- `web/components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx`
- `web/components/forms/workspace/FormLifecycleWorkspaceLayout.tsx`
- `web/tests/forms/intakeRuntimeOrchestrationPresentation.test.ts`

## Manual validation (pending)

- [ ] Enrollment Lead — Demo: “What this form does” panel shows intake process, test confirms lead, Open lead + New Leads pipeline link work
- [ ] Medication Authorization: review-required path visible; public-form mismatch warning when wrong embed used
- [ ] Intake workspace case rows show operational chips + Open lead

# IC-8 — Intake Experience Simplification

**Goal:** Shift operator UX from infrastructure configuration to business workflow setup. Architecture unchanged (form → distribution link → submission → opportunity → queue).

## Root cause — enrollment pipeline visibility

Form intake was creating opportunities with legacy status key **`new`**, while the enrollment pipeline **New Leads** queue filters on **`new_inquiry`** (and `open`). Leads were created and linkable in the drawer, but **invisible in the work unit queue**.

| Fix | Detail |
|-----|--------|
| Write path | `normalizeIntakeOpportunityStatusKey` maps `new` → `new_inquiry`; default fallback is `new_inquiry` |
| Queue compat | `new_leads` queue `filters_compat_v1` includes legacy `new` for existing rows |
| Demo fixtures | Enrollment lead link metadata uses `new_inquiry` |
| Proof gate | `qaEnrollmentLeadOpportunityProof.ts` asserts pipeline queue membership |

## Operator language (IC-8)

| Before | After |
|--------|-------|
| Intake runtime orchestration | **What this form does** |
| Runtime link / distribution context | **Public form** |
| Runtime test | **After submit** / test submission |
| Operational Outcome (panel) | **What happens after submit** |
| Share intake | **Share with families** |
| Design / Distribute / Intake (rail) | **Build form / Share / Responses** |

Infrastructure terms (embed token prefix, distribution links list) moved behind **Technical detail** disclosures.

## Process templates (inferred, no schema)

Intake process is inferred from link metadata + form key: enrollment lead, existing family update, waitlist, operational document, packet step, general intake. Shown as badges and step hints — not interactive preset cards yet.

## Existing-record / prefilled direction (IC-8 proof hook)

**Not built:** full packet runtime or persisted intake cases.

**Direction documented:**

- `form_context_mode: existing_record` on distribution link → **Existing family update** process (attach evidence, no duplicate lead)
- Prefill via launch context per [`docs/system/forms-intake-prefill-doctrine.md`](../../system/forms-intake-prefill-doctrine.md)
- Submissions stamp `opportunity_id` / session context when bound; intake dedup attaches instead of creating
- UX placement: same “What this form does” rail; process template switches copy from “Creates lead” to “Updates existing record”

**Follow-up:** interactive process picker, prefilled embed proof, outcome editor defaults per process template.

## Manual validation (IC-8)

```bash
cd web && npx tsx scripts/prepareDemoChildcareEnrollmentLeadIntakeTest.ts
cd web && npx tsx scripts/qaEnrollmentLeadOpportunityProof.ts
cd web && npm run test -- tests/forms/intakeRuntimeOrchestrationPresentation.test.ts tests/forms/parseIntakeLinkDefaults.test.ts tests/config/enrollmentPipelineQueueDefinitionV2.test.ts
```

Browser checklist:

1. Form detail → **What this form does** → open public form → submit → refresh → **Open lead** + **View in pipeline** (New Leads section)
2. Work unit enrollment pipeline shows the new lead row
3. Wrong public form submit shows mismatch warning with one-click switch
4. Outcome panel follows selected public form without duplicate link selector

# Stop line

**IC-8 code shipped · manual browser validation pending.**

**Suggested commit message:**

```
IC-8: simplify intake setup UX and fix enrollment pipeline lead visibility via status key alignment.
```
