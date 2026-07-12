# Forms/Documents Phase 2 — Step 0 Audit Report

**Date:** May 2026  
**Scope:** Audit only (STEP 0). No implementation, migrations, or refactor.  
**Aligns with:** `docs/product/documents-and-forms.md`, `docs/product/crm-system.md`, `docs/product/communications.md`, `docs/product/bos-foundation.md`, `docs/product/actions-and-workflows.md`, `docs/execution/roadmap-and-gaps.md`, `docs/sprints/05_2026/enrollment_packet_phase_2.md`, `docs/sprints/05_2026/enrollment_journey_packet_operations_v1.md`

**Evidence base:** Migrations under `supabase/migrations/20260506100000_forms_engine_v1_foundation.sql`, `20260510120000_forms_packet_foundation.sql`, `20260508150000_form_packet_session_operator_review.sql`; services in `web/lib/forms/**`, `web/lib/forms/packets/**`; admin/public routes; AdminV2 + opportunity drawer UI; ~45+ Vitest files touching forms/packets/public embed.

---

## 1. What is already shipped and working

### Forms engine (foundation)

| Capability | Evidence |
|------------|----------|
| **Definitions + versions** | `form_definitions`, `form_definition_versions` (draft / published / archived); admin CRUD under `/api/admin/forms/**`; Forms hub `/adminV2/forms`. |
| **Canonical submissions** | `form_submissions.payload` JSONB; migration explicitly: no automatic CRM `field_values` sync. |
| **Validation** | `validateSubmission.ts` — schema validation, field visibility (`visibility.all`), repeating groups, signatures. |
| **Public capture** | Tokenized routes `/api/public/forms/[token]/*`; `FormEmbedClient` + `FormEngineRenderer`; origin allowlist (`embedOrigin.ts`). |
| **PDF generation** | `createGeneratedPdfForSubmission` → `documents` + `form_submission_documents`; idempotency by submission/version/template. |
| **Tests** | Broad coverage: `web/tests/admin/formsAdminRoutes.test.ts`, `web/tests/forms/*.test.ts` (schema, intake, signatures, PDF mapping, public resolve). |

### Packet orchestration (execution truth)

| Capability | Evidence |
|------------|----------|
| **Schema** | `form_packet_definitions`, `form_packet_items`, `form_packet_sessions`, `form_packet_session_items`; session status `in_progress \| completed \| cancelled`; 1:1 session per `started_via_public_link_id`. |
| **Linear runner** | `formPacketService.ts` — `ensurePacketSessionForPublicLink`, `advancePacketSessionAfterSubmit`; shallow `shared_values` merge from `payload.values` only. |
| **Public packet UX** | `resolvePublicFormEmbedContext` — step X of Y, `packetTerminal` when completed; interstitial after step submit; `sessionStorage` draft pointer per token. |
| **CRM continuity (post–Card 0)** | On draft create: `mergeLaunchFksPreferringSessionCrmSnapshot` (`public/.../submissions/route.ts`). On step submit: `syncPacketSessionCrmSnapshotFromSubmission` (`submit/route.ts`). Tests: `packetCrmContinuity.test.ts`, `publicPacketDraftFks.test.ts`. |
| **Workflow correlation** | `fetchPacketWorkflowCorrelationForSubmission` + `PacketWorkflowCorrelation` on `form_submitted` / related events (`formSubmissionEvents.ts`) — addresses historical “no packet_session_id in payload” gap from Card 0 audit. |

### Enrollment packet E2E Phase 1 (CRM + comms + review)

| Capability | Evidence |
|------------|----------|
| **Launch from opportunity** | `POST /api/admin/opportunities/[id]/enrollment-packet-launch`; `OpportunityEnrollmentPacketModal.tsx`; multi-child via `customer_member_ids`; templates from packet `metadata` (`enrollmentPacketEmailTemplate.ts`). |
| **Communications delivery** | Canonical `enqueueCanonicalOutboundMessage` when `delivery: send_email`; launch modal surfaces `delivery_state` (queued / provider_accepted / failed / bounced). |
| **Opportunity projections** | `opportunityEnrollmentPacketProjections.ts` — created, opened, step_completed, completed, sent, submitted_for_review, review_decision; Activity timeline labels in `opportunityActivityTimelineFormat.ts`. |
| **Operator review gate** | Migration `20260508150000_form_packet_session_operator_review.sql`; auto `operator_review_status: needs_review` on packet completion; `PATCH .../packet-sessions/[id]/review` (approve / reject / needs_correction); **no CRM mutation** in review route. |
| **Mismatch hints** | `computePacketOperatorReviewWarnings` — name-like `shared_values` vs CRM person/member names (warnings only). |
| **Approval → PDFs** | `ensureGeneratedPdfsForApprovedPacketSession` — idempotent per submitted step with `pdf_mapping_json`. |
| **Drawer review UX** | `OpportunityPacketReviewOverview.tsx` — pending banner, modal with warnings, step list + doc names, deep links to packet session + submissions. |
| **Documents tab** | `GET /api/admin/related/opportunity/:id` merges opportunity `documents` + packet submission junction graph; `normalizeDocumentRow` enrichment (`source_form_submission_*`, `source_packet_session_*`). |
| **Packet admin detail** | `/adminV2/forms/packets/[packetSessionId]` — launch context, CRM snapshot, shared values, per-step intake badges, linkage to submission detail. |
| **Tests** | `packetSessionReviewRoute.test.ts`, `enrollmentPacketLaunchRoute.test.ts`, `formPacketCompletionWorkflow.test.ts`, `opportunityEnrollmentPacketProjections.test.ts`, `enrollmentPacketSummaryPresentation.test.ts`. |

### Documents (platform)

| Capability | Evidence |
|------------|----------|
| **Upload + storage** | `POST /api/admin/documents/upload` → Supabase Storage + `documents` row; `document_uploaded` event. |
| **Signed URLs** | Admin signed-url routes; entity hydration via `normalizeDocumentRow`. |
| **Linkage to forms** | `form_submission_documents` junction; role check constraint in foundation migration. |

### BOS (adjacent, not packet-specific)

| Capability | Evidence |
|------------|----------|
| **Registry + envelope** | `web/lib/bos/bosCapabilityRegistry.ts`, `bosProposalEnvelope.ts` — Task Assist, Config/Layout Assist, Workflow Assist; **no enrollment/packet capability registered**. |
| **Human-in-the-loop apply** | Task Assist → `executeCommunicationsSend`; config proposals → dedicated tables (`task_assist_proposals`, `config_layout_assist_proposals`). |
| **Doctrine** | `docs/product/bos-foundation.md` — no direct DB writes from browser; no silent operational truth changes. |

---

## 2. What is partially present

| Area | Shipped part | Gap |
|------|----------------|-----|
| **Packet review readability** | Drawer modal lists steps, warnings, PDF doc names; packet detail shows JSON panels + intake chips. | No human-readable **field-level** answers rollup; reviewers still open N submission detail pages; `shared_values` not diffed against CRM fields. |
| **Correction loop** | `needs_correction` status + notes; can re-decide from `needs_review` or `needs_correction`. | **No** parent re-open of embed (session stays `completed`, `packetTerminal`); **no** auto correction-request email; operator must manually resend link/comms. |
| **Non-PDF steps** | Submissions exist in DB; review modal links to submission admin. | No “submitted record” artifact in Documents when `pdf_mapping_json` absent; drawer doc list empty for those steps. |
| **Document provenance** | Junction + admin paths on opportunity related docs. | No UI for “published version X produced this file”; no `superseded` / `void` lifecycle on `documents`. |
| **CRM linkage** | Per-submission confirm/manual-link on `FormSubmissionDetailClient`; packet detail rollup banner if any step `intake_needs_review`. | No packet-level linkage **workflow**; repeated linkage review per step; linkage panel cannot create-new CRM rows (`docs/forms/linkage-review-operator-flow.md`). |
| **Communications visibility** | Send at launch + delivery_state in launch modal. | Ongoing packet review does **not** surface thread/message delivery state; no reminder/resend product path. |
| **Email templates** | Placeholders in packet metadata + defaults; multi-link body for multi-child. | Not a versioned template product; ad hoc composer text per launch. |
| **Queues / workspace** | Enrollment pipeline + Needs Attention for **opportunities**. | **No** first-class queue rows for `form_packet_sessions` (completed-needs-review, stale, correction). |
| **Public UX** | Step progress, validation errors, packet complete message. | Branding/themes **explicitly deferred** (`docs/forms/deferred_public_ux_e2_7.md`); resume is browser `sessionStorage` only. |
| **Schema reference exports** | Migrations are source of truth in repo. | `docs/supabase/reference/*.csv` did not list `form_*` tables at audit time — reference export may be stale vs migrations. |

---

## 3. What is documented as Phase 2 but NOT implemented

Cross-reference: `docs/sprints/05_2026/enrollment_packet_phase_2.md` sections A–G.

| Phase 2 item | Doc section | Implementation status |
|--------------|-------------|------------------------|
| **Data change proposals (DCP)** | A | **Not implemented** — no `data_change_proposals` (or equivalent) table; no field_path keyed approve/reject; no diff UI vs CRM snapshot. |
| **Field-level review / batch approve** | A, B | **Not implemented** — only packet-level `operator_review_status`. |
| **Rich correction-request messaging** | B, D | **Not implemented** — status flag only. |
| **Configurable versioned packet templates (comms)** | D | **Partial** — metadata templates at launch only. |
| **Reminders / SMS packet links** | D | **Not implemented**. |
| **Deliverability dashboard / checklist** | D | **Not implemented** (comms V1 webhooks exist; no packet-specific ops UI). |
| **Packet builder UX** | E | **Not implemented** — admin packet definition editing exists; no non-engineering builder. |
| **Branded public packet UX** | E | **Deferred** per `deferred_public_ux_e2_7.md`. |
| **BOS summarize / mismatch / correction drafts** | F | **Not implemented** for packets (no capability_key; Orchestrator has no packet hooks). |
| **Operational queues (packet triage)** | G | **Not implemented**. |
| **Document lifecycle (draft/superseded/void)** | C | **Not implemented**. |
| **Bundle PDF across steps** | C | **Not implemented**. |
| **Richer session lifecycle** (under_review, archived, cancel product flow) | B, v1 §3 | **Not implemented** — DB has `cancelled` but no audited admin/public path to set it. |
| **Packet-level conditional steps** | v1 §4 | **Not implemented** — linear only; `skipped` status unused in progression code. |
| **Repeating groups in shared_values** | v1 §3 | **Not implemented** — still scalar shallow merge only. |

**Doc accuracy note:** `enrollment_journey_packet_operations_v1.md` Card 0 gaps on CRM FK continuity and workflow payload correlation are **partially superseded** by shipped `syncPacketSessionCrmSnapshotFromSubmission`, draft FK merge, and `PacketWorkflowCorrelation`. Treat Card 0 as historical; this audit reflects current code.

---

## 4. Current UX friction

### Operator trust and review

- **Distributed truth:** Enrollment answers live across N `form_submissions` rows; packet review modal is a **index**, not a consolidated answer sheet.
- **JSON-forward admin:** Packet session detail still exposes raw `launch_context`, `crm_snapshot`, `shared_values` — useful for engineers, weak for front-office trust.
- **Per-step navigation cost:** Approve/reject in drawer without seeing full payload unless operator opens each submission (legacy `FormSubmissionDetailClient`).
- **Warnings are heuristic:** Name mismatches in `shared_values` only; no DOB/address/program diff vs CRM or between steps.

### Packet visibility

- **Single pending head:** `OpportunityPacketReviewOverview` prioritizes first pending session in list order — multi-packet opportunities may hide later sessions until first is cleared.
- **Minted-but-not-opened links:** API returns `minted_links_pending_open` when no session yet — easy to miss vs in-progress sessions.

### Correction loops

- **`needs_correction` is administrative only:** Parent sees static “packet complete” on embed; no guided “fix these fields” return path.
- **No wired comms** for correction requests (Task Assist could draft, but not integrated into packet review).

### Document clarity

- Steps without PDF mapping: **no document row** — operators may think submission failed.
- Related docs show submission/packet admin links but not **field-level** provenance or mapping version.

### Mobile / public

- **sessionStorage resume** — poor cross-device experience.
- **No branded header/footer** — pilot/demo looks generic.
- After completion, terminal state blocks further edits (by design) even when staff requested corrections.

---

## 5. Current trust / audit gaps

| Gap | Detail |
|-----|--------|
| **Provenance** | `form_submission_documents` links submission → document; opportunity list enriches paths — but operators cannot see **which published `form_definition_version`** generated a PDF without opening submission/version admin. |
| **Proposed vs canonical** | Doctrine states public `payload` is untrusted; **no persisted proposal layer** — only intake meta flags (`intake_needs_review`) and packet warnings JSON. |
| **Explainability** | Review decisions persist `operator_review_notes` + `operator_reviewed_by_user_id` + workflow event — good. **No** structured record of *which fields* drove approve/reject. |
| **Delivery state** | Canonical `communication_messages` lifecycle exists; packet review surfaces **do not** join sent/queued/delivered for the invitation email. |
| **Currentness / versioning** | Regenerating PDF is idempotent per key — good. **No** product semantics for “this PDF is stale after resubmit” or superseding prior `documents` rows. |
| **Audit trail for CRM promotion** | Intake/linkage paths audit via submission meta + events; **no** unified audit if operator later edits CRM in drawer (separate from packet review). |

---

## 6. Current data model gaps

| Need | Current state |
|------|----------------|
| **Field-level review / DCP** | No table for `(org, submission/step, target_entity, field_path, proposed_value, status)`. |
| **Review snapshots** | No immutable snapshot of CRM at review time (only live `crm_snapshot` updated on submit). |
| **Provenance tracking** | `documents` lacks `source_form_definition_version_id` or generation run id (only junction + idempotency inside generator). |
| **Packet review lineage** | `operator_review_*` columns on session — sufficient for gate, insufficient for per-field history. |
| **Correction reopen semantics** | Would require explicit design: reopen session item vs new session vs new link — **not modeled**. |
| **Queue indexability** | No materialized “needs_review_since” queue row; queries must scan `form_packet_sessions` by `operator_review_status` + opportunity FK in JSON. |

**Existing proposal infrastructure (not reusable as-is for DCP):**

- `task_assist_proposals` — comms/tasks drafts.
- `config_layout_assist_proposals` — layout/field policy.
- `agent_v0_proposals` — queue definitions.
- BOS `bosProposalEnvelope` — normalization only; **explicit non-goal: no table merge** (`bos_registry_proposal_envelope_phase_2.md`).

DCP should be a **new bounded table + apply path**, or a carefully scoped extension of linkage-review — not an ad hoc reuse of config-assist proposals.

---

## 7. Current BOS / AI integration opportunities

### Reusable patterns (safe)

| Pattern | Reuse for packets |
|---------|-------------------|
| **Proposal → validate → human approve → canonical API** | Task Assist / Config Assist lifecycle maps to **draft correction email** or **review summary** without new execution plane. |
| **`bosProposalEnvelope` + capability registry** | Register read-only `insight` capability e.g. `enrollment_packet_review_assist` with `proposal_mode: ephemeral`, `apply_policy: none`. |
| **Orchestrator routing** | Route intents like “summarize this packet” to read-only handler that loads `enrollment-packets` GET + submission payloads server-side. |
| **Deterministic first** | Extend `computePacketOperatorReviewWarnings` pattern (rules before LLM) — aligns with needs-attention enrich doctrine. |

### Safe assist boundaries

- **May:** Summarize submitted values; highlight mismatch vs `crm_snapshot` + `persons`/`customer_members`; draft correction **email text** as Task Assist proposal; list stalled sessions (`completed` + `needs_review` + age).
- **Must not:** PATCH `persons`/`customers`/`opportunities` from AI routes; auto-approve packets; write `operator_review_status` without operator PATCH; create parallel packet state.

### Gaps today

- **No** `capability_key` for forms/packets in `BOS_CAPABILITY_REGISTRY`.
- **No** references to `form_packet` / `enrollment` in `AICommandSurfaceShell.tsx` (grep empty).
- **Task Assist** does not load packet context from opportunity drawer automatically.

---

## 8. Risks if DCP / Phase 2 is implemented too broadly too soon

| Risk | Why |
|------|-----|
| **Generalized mutation system** | A generic “apply proposal to any entity/field” engine duplicates `executeAdminAction`, intake, and drawer PATCH — high regression risk across CRM. |
| **Autonomous AI writebacks** | Violates BOS doctrine and enrollment trust model; conflates `form_submissions.payload` with canonical persons/members. |
| **Duplicate lifecycle logic** | Adding `under_review` / `submitted` alongside `completed` + `operator_review_status` without migration discipline breaks embed terminal checks and projections. |
| **Second state engine** | Workflow_events must remain projections only — DCP state must not become execution truth for packet steps. |
| **Duplicate proposal systems** | Merging DCP into `config_layout_assist_proposals` or Task Assist tables blurs audit and RBAC. |
| **Bypassing intake/linkage** | Field-level approve must route through **one** auditable apply path (new or extended linkage), not silent CRM updates. |
| **Premature queues** | Indexing unstable review objects before UX stabilizes → churn in queue definitions and false SLAs. |
| **Repeating-group DCP** | JSON pointer semantics for `payload.groups` are hard; scalar DCP first avoids data corruption. |

---

## 9. Recommended THIN SLICE for this sprint

**Align with Phase 2 doc sequencing (B + C before A):** harden review readability and artifact visibility **without** DCP schema or generalized apply.

### Recommended slice (narrowest high-value, lowest doctrine risk)

1. **Packet review rollup (read-only)**  
   - On packet session detail + drawer review modal: render **submitted field answers** per step (from `form_submissions.payload`, schema labels from published version) — not raw JSON only.  
   - Surface **linkage summary** (worst-case `intake_needs_review` + FK presence) in one strip — extends existing packet detail chips.

2. **Non-PDF submission visibility (C)**  
   - When step has no `pdf_mapping_json` but `status === submitted'`, show **“Submitted form record”** row in review modal + opportunity Documents merge (deep link to submission; optional lightweight HTML/JSON export later — not required v1).  

3. **Document provenance labels (thin C)**  
   - On generated docs: display **form name + submission id + generated timestamp** in drawer/related list (data mostly already present via junction enrichment).  

4. **BOS assist — read-only pilot (F-minimal)**  
   - Ephemeral server endpoint or Orchestrator card: **deterministic** packet summary + existing warnings + step checklist — **no** LLM required for MVP; optional enrich behind `ai.enrichment.use`.  
   - **Optional:** Task Assist **draft** correction email from template when operator clicks “Request correction” — human must send via existing comms apply.

### Explicitly wait

| Defer | Reason |
|-------|--------|
| **DCP tables + per-field approve → CRM** | Requires field_path contract, apply path, legal/audit policy — largest architectural commitment. |
| **Packet operational queues (G)** | Depends on stable review object + query patterns. |
| **Reminders / SMS / template versioning (D)** | Comms complexity; deliverability not blocking review trust. |
| **Packet builder / branding (E)** | UX still moving; deferred docs already exist. |
| **Bundle PDF / document superseded semantics** | Compliance packaging, not pilot blocker. |
| **Session lifecycle enum expansion** | Migration + embed + projection ripple; use `operator_review_status` until pain proves insufficient. |
| **Parent reopen for corrections** | Needs product decision on session/item reopen vs new link — do not half-ship. |
| **Autonomous agents / new BOS capabilities with apply** | Roadmap explicitly paused. |

### Demo / operator impact

- Reviewers can **complete common approve/reject in one surface** without SQL or five tabs.  
- Pilots see **all steps accounted for** (PDF or not).  
- AI demo shows **assist, not autonomy** — summary card only.

---

## 10. DO NOT TOUCH / DO NOT REFACTOR boundaries

### Protected systems (execution truth)

| System | Rule |
|--------|------|
| **`form_packet_sessions` / `form_packet_session_items`** | Only mutate through `formPacketService`, public submit/advance, admin review PATCH, tested mint paths — **no** parallel state machine. |
| **`form_submissions.payload`** | Canonical capture; no auto-sync to CRM columns (migration doctrine). |
| **`workflow_events`** | Append-only projections; opportunity packet events via `opportunityEnrollmentPacketProjections.ts` — **not** driver for step advancement. |
| **Communications** | All outbound via `enqueueCanonicalOutboundMessage` / worker — no SendGrid-in-drawer forks. |
| **`documents` + Storage** | Upload/generate through existing admin routes; no client service-role. |
| **QueueService / opportunity queues** | Do not conflate opportunity preview rows with packet session truth. |
| **Intake / linkage** | `applyFormIntakeSafe`, `confirm-linkage`, `manual-link` — extend, don’t bypass with packet-specific CRM PATCH. |

### Protected architecture (no refactor in Phase 2 slice)

- **Forms hub / version publish pipeline** — no redesign of `form_definition_versions` immutability.  
- **Public embed security model** — token + origin allowlist + service role server-only.  
- **BOS registry merge / `web/lib/agent` mass rename** — out of scope per BOS Phase 2 non-goals.  
- **RLS / org scoping patterns** — keep `assertRowOrg`, `getAdminContextCached`, access scope on opportunity routes.  
- **Enrollment pipeline / Needs Attention resolver** — separate concern; don’t encode packet review into attention reason codes without config design.

### Safe extension surfaces (prefer touch here)

- `OpportunityPacketReviewOverview.tsx`  
- `/adminV2/forms/packets/[packetSessionId]/page.tsx`  
- `GET .../enrollment-packets` response shaping (read models only)  
- `loadPacketSubmissionDocumentRowsForOpportunity` / `normalizeDocumentRow` presentation fields  
- New **read-only** admin route under `/api/admin/forms/packet-sessions/.../review-summary`  
- Ephemeral BOS insight route (no apply)  
- Tests colocated with above

---

## Testing audit (summary)

| Area | Coverage | Gaps |
|------|----------|------|
| **Admin forms routes** | `formsAdminRoutes.test.ts` — broad | Packet-specific routes thinner than core forms CRUD |
| **Packet lifecycle** | `formPacketAdvance`, `formPacketCompletionWorkflow`, `packetSessionReviewRoute` | No E2E for drawer review modal UI |
| **Public packet** | `resolvePublicFormEmbedContext`, `publicPacketDraftFks`, `publicFormLib` | No Playwright embed journey in repo |
| **Review** | Review route + presentation unit tests | No field rollup tests |
| **Comms** | `enrollmentPacketLaunchRoute`, template tests | No webhook→packet correlation test |
| **AI/BOS** | `tests/bos/**`, Task Assist tests | **Zero** packet/BOS tests |
| **Queues** | Opportunity scoping tests | **No** packet session queue tests |

---

## Audit conclusion

Alloy has a **credible Phase 1 enrollment packet loop**: launch, comms, public completion, operator review gate, approval PDFs, opportunity Activity/Documents, and improved CRM snapshot continuity. Phase 2 doc ambitions (DCP, queues, branding, reminders, AI writebacks) are **mostly unbuilt**.

The **thinnest high-value Phase 2 slice** is **review + documents readability (B/C)** with **read-only BOS assist**, explicitly **deferring DCP** until operators have a trustworthy single-pane review experience and provenance labels — reducing support load and pilot risk without new canonical mutation planes.

**Next methodology step:** STEP 2 sprint doc → [`forms_documents_phase_2_packet_review_mvp.md`](./forms_documents_phase_2_packet_review_mvp.md) (complete). STEP 3+ implement P2-1 … P2-5.

---

## Related files (quick index)

| Concern | Path |
|---------|------|
| Packet service | `web/lib/forms/packets/formPacketService.ts` |
| Review warnings | `web/lib/forms/packets/packetOperatorReviewWarnings.ts` |
| Review API | `web/app/api/admin/forms/packet-sessions/[packetSessionId]/review/route.ts` |
| Opportunity packets API | `web/app/api/admin/opportunities/[id]/enrollment-packets/route.ts` |
| Drawer review UI | `web/components/admin/opportunity/OpportunityPacketReviewOverview.tsx` |
| Projections | `web/lib/forms/workflow/opportunityEnrollmentPacketProjections.ts` |
| Phase 2 plan | `docs/sprints/05_2026/enrollment_packet_phase_2.md` |
