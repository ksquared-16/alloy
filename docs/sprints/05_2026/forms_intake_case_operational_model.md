# Forms / Intake — Intake Case Operational Model + Outcome Configuration

**Path:** `docs/sprints/05_2026/forms_intake_case_operational_model.md`  
**Date:** May 2026  
**Status:** Phase 0 audit + doctrine + cards — **awaiting review before implementation**  
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

**Recommended first implementation card:** **IC-1 — Outcome Configuration Panel (read-only)** — surfaces existing link metadata and form operator context without changing runtime behavior; unblocks operator trust and sets up editable config in IC-1b.

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

**Goal:** Derived view model for operator surfaces.

**Proposed shape (`IntakeCaseViewModel`):**

```typescript
{
  caseKey: string;                    // `opp:${id}` | `session:${id}` | `submission:${id}` fallback
  anchorType: "opportunity" | "packet_session" | "submission";
  anchorId: string;
  title: string;                      // e.g. "Donald Duck — Enrollment intake"
  primaryPerson?: { id, label };
  primaryCustomer?: { id, label };
  opportunity?: { id, label, status_key, location_id };
  submissions: SubmissionSummary[];   // count, latest, form names
  packetSession?: { id, status, operator_review_status };
  reviewState: "needs_review" | "needs_linking" | "auto_operationalized" | "in_progress" | "complete";
  confidence: "high" | "medium" | "low" | "none";
  latestActivityAt: string;
  nextAction: string;
  href: string;                       // primary deep link (opportunity drawer or case file)
}
```

**Grouping key priority:** `opportunity_id` → `packet_session_id` (from item join) → standalone `submission_id`.

| Attribute | Value |
|-----------|-------|
| Migration | None |
| Runtime risk | None (read/presentation) |

---

## IC-3 — Workload Rows Become Intake Cases

**Goal:** Workload panel rows represent operational cases, not isolated submissions.

**Example row:**

> **Donald Duck — Enrollment intake**  
> 2 submissions received · Latest 2h ago · Auto-operationalized · Open opportunity

Submissions accessible inside expanded row or case detail.

**Implementation:** Client-side group in `intakeWorkspaceFilters.ts` using IC-2 helper; optional server-side group later for pagination.

| Attribute | Value |
|-----------|-------|
| Migration | None |
| Depends on | IC-2 |

---

## IC-4 — Confidence-Based Review Routing

**Goal:** Change default happy path — clean new lead with complete routing does not require hard review.

**Code touch:** `applyFormIntakeSafe.ts` — revise `intakeNeedsReview` computation:

- Add link/form override: `review_mode: always | confidence | never` (metadata)
- High-confidence cold create (email present, all auto-create succeeded, routing complete, no ambiguity) → `intake_needs_review: false`, stamp `intake_auto_operationalized: true`
- Preserve review for: ambiguity, phone-only match, work unit mismatch, explicit `review_required`, disabled auto-create partial paths

**Emit:** pairs with IC-5 `intake_case_auto_operationalized`.

| Attribute | Value |
|-----------|-------|
| Migration | None (meta flags in payload + link metadata) |
| Runtime risk | **Medium** — changes workload lane distribution; requires Test 2D regression |
| Preserve | Demo Childcare path; dedup attach behavior |

---

## IC-5 — Workflow Event Emission

**Goal:** Additive case-oriented events without breaking existing consumers.

| New event | When |
|-----------|------|
| `intake_case_created` | First submission operationalizes new opportunity (or case anchor) |
| `intake_case_updated` | Subsequent submission attached to same anchor |
| `intake_case_needs_review` | Review flag set |
| `intake_case_auto_operationalized` | High-confidence auto path (IC-4) |
| `form_intake_reviewed` | Confirm linkage or manual link clears review |
| `duplicate_intake_attached` | Dedup attach to existing opportunity |

**Preserve:** `form_submitted`, `form_signed`, `form_document_generated`, `form_packet_completed`.

**Implementation:** extend `formSubmissionEvents.ts` + call sites in submit / confirm-linkage routes; register event keys in workflow config docs.

| Attribute | Value |
|-----------|-------|
| Migration | None |
| Runtime risk | Low (additive) |

---

## IC-6 — Quick Review Modal Simplification

**Goal:** Action-first modal — reduce prose density.

**Sections:**

1. Who submitted?
2. What happened? (one line)
3. What was created/linked? (CRM chips)
4. What needs action?
5. Primary action (confirm / open case / generate)
6. Secondary deep link

**Preserve:** Modal pattern (centered), confirm-linkage API, admin/ops gate.

| Attribute | Value |
|-----------|-------|
| Migration | None |

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

## IC-1

| File | Change |
|------|--------|
| `web/components/forms/workspace/FormOutcomeConfigPanel.tsx` | **New** — read-only panel |
| `web/app/admin/forms/[formId]/FormDetailClient.tsx` | Mount panel in lifecycle / distribution region |
| `web/lib/forms/intake/parseIntakeLinkDefaults.ts` | Export human labels / summary helper |
| `web/lib/forms/intake/parseIntakeAutoCreateFlags.ts` | Summary helper |
| `web/lib/forms/intake/outcomeConfigPresentation.ts` | **New** — parse + display model |
| `web/tests/forms/outcomeConfigPresentation.test.ts` | **New** |

## IC-2 / IC-3

| File | Change |
|------|--------|
| `web/lib/forms/intakeCasePresentation.ts` | **New** — view model + grouping |
| `web/lib/forms/intakeWorkspaceFilters.ts` | Group rows by case |
| `web/components/forms/workspace/IntakeWorkspaceHubView.tsx` | Case row UI |
| `web/tests/forms/intakeCasePresentation.test.ts` | **New** |

## IC-4

| File | Change |
|------|--------|
| `web/lib/forms/intake/applyFormIntakeSafe.ts` | Confidence review rules |
| `web/lib/public/forms/publicFormTypes.ts` | `review_mode` type |
| `web/tests/forms/applyFormIntakeSafe.test.ts` | **New or extend** |

## IC-5

| File | Change |
|------|--------|
| `web/lib/forms/workflow/formSubmissionEvents.ts` | New emit helpers |
| `web/app/api/public/forms/.../submit/route.ts` | Emit case events |
| `web/app/api/admin/forms/submissions/.../confirm-linkage/route.ts` | `form_intake_reviewed` |
| `docs/system/forms-intake-runtime-validation.md` | Event catalog update |

## IC-6

| File | Change |
|------|--------|
| `web/components/forms/workspace/SubmissionQuickReviewModal.tsx` | Layout simplification |
| `web/tests/forms/formsIntakeWorkspaceHub.test.tsx` | Modal assertions |

## Docs (all cards)

| File | Change |
|------|--------|
| `docs/product/documents-and-forms.md` | Intake case model paragraph when IC-2 ships |
| `docs/system/forms-intake-runtime-phase.md` | Review doctrine sync when IC-4 ships |

---

# Stop line

**No implementation in this sprint doc pass.** Review IC-1 read-only scope and IC-4 doctrine alignment before coding.

**Suggested commit message (doc only):**

```
Add intake case operational model sprint doc (audit, doctrine, cards).
```
