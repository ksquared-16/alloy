# POS-F01 — Foundation Analysis

> **Status:** Foundation Gate artifact — conceptual. Draft.
> **Not** doctrine, UX, architecture, or implementation. **No schema, tables, columns, migrations, APIs, code, or package plans.** Those phases are complete or come later.
> **Immutable inputs:** POS-01/02/03/05 (product), POS-A01/A02/A03 (architecture), POS-13 (visual). Processing Case is the single primary object; BOS is the right-rail recommendation layer; the outcome framework and ownership boundaries are frozen.
> **Burden of proof:** the existing Forms, Packets, Documents, Workflow, Communications, Layout Runtime, and Business Process systems are assumed correct. Anything new must justify why no existing foundation serves.
> **Source of truth:** `configuration-system.md`, `entity-model.md`, `documents-and-forms.md`, `actions-and-workflows.md`, `bos-foundation.md`, `bos-identity-doctrine.md`, `action-workspace-foundation.md`, `work-unit-layout-doctrine.md`, `queue-record-doctrine.md`, `typography-and-presentation-doctrine.md`, `communications.md`, `crm-system.md`, `settings-v2-doctrine.md`.
> Branch: `pos-planning-v1`. Companions: **POS-F02** (Processing Case foundation), **POS-F03** (build sequence).

## Question answered

**Given the frozen architecture, what concrete existing Alloy systems become the implementation foundation for POS — reused, extended, or (only where proven necessary) newly built?**

## Locked Foundation-Gate decisions (carried into every analysis below)

1. **Shared data model required.** Fields, Layouts, Forms, Documents, Packets, Business Processes, and POS all use the **same underlying data model** — the existing `field_definitions` registry + Layout Runtime. No POS-specific, form-specific, document-specific, or packet-specific field definitions.
2. **Approval-only V1.** No auto-execution. BOS prepares/extracts/classifies/recommends/assembles; operators approve. The foundation must *support* future automation without *assuming* it.
3. **Multi-source Processing Cases.** One case may carry multiple sources (primary + related). Detailed in POS-F02.
4. **Confidence threshold model.** Platform defaults → organization overrides → recipe overrides → (future) field-level overrides. Placement detailed below and in POS-F02.
5. **Vocabulary.** User-facing: Sources, Processing Cases, Review, Resolution, Outcomes. No new user-facing concept around "intake." Internal legacy naming may persist until naturally migrated.
6. **Documents boundary.** Documents own storage/artifacts/templates/generated outputs; POS owns processing/review/linkage/outcomes/resolution.

## Verdict in one line

Every one of the seven foundations is **reuse or extension**; the only genuinely new foundations are the thin **Processing Case envelope**, **source on-ramps**, and the **outcome sequencer + approval gate** (POS-A01/A02). Nothing here overturns that. The burden of proof was applied to each foundation and no new parallel platform survived it.

---

## Foundation 1 — Unified Data Model

**Existing model.** Alloy already runs one data model that the locked decision requires POS to join:

- **`field_definitions`** is the single field registry — `field_key`, `field_type`, label/help, option-set binding, catalog section/sort, and **visibility flags for drawer / form / table**, plus `requirement_policy` / `interaction_policy`. Forms already have a *form* visibility dimension here — i.e. the platform already treats "a field shown on a form" as the *same* field, not a form-specific one.
- **Layout Runtime** renders every operator surface from that registry: drawer composition via `record_drawer_layouts` / `record_layouts` (`config_json`, `field_placements_v1`) and queue rows via `metadata.queue_record_layout` (v3). One renderer stack, one config plane (four-plane Settings: Fields, Layouts, Actions, Automations).
- **Entity model** holds canonical truth: `persons`, `customer_persons`, `opportunities` (`primary_person_id`), `customers`, `customer_members` (child roster), `opportunity_customer_members` (per-child lifecycle), `documents`, `communication_*`, `form_*`.

**How POS consumes it (reuse).**
- POS surfaces are **Layout Runtime surfaces.** The Processing Workspace queue uses the queue record renderer (`queue_record_layout`); the Processing Case uses drawer overview composition; both read the shared `field_definitions` registry. This is precisely the Alloyification POS-12/13 prescribed — POS doesn't get a parallel renderer.
- POS **extraction maps source values to existing `field_key`s**, not to a POS field store. A "Parent / guardian" or "Date of birth" read off a subsidy contract is the same field definition that lives on the Lead/Person drawer; the Processing Case carries a *proposed value* for that key, and an approved outcome promotes it through the normal field/policy path.
- POS **outcomes write canonical fields** governed by the same registry, policies, and Layout Runtime — never a POS-only field schema.

**How forms / documents / packets participate.** They bind their captured fields to the **same `field_definitions` keys**. The platform already moved this way (form visibility flag on the registry; "form-version required semantics vs field policies" is acknowledged roadmap convergence). POS *continues* the direction: a form field, a packet step field, a document-template field, and a POS extracted field are all the **same field** expressed on different surfaces (POS-01 "forms and documents share one foundation").

**Extensions required (minimal, conceptual — challenged).**
- **A "processing" surface in the existing field-visibility model.** Just as fields already declare drawer/form/table visibility, POS needs the *concept* of fields appearing on processing/extraction surfaces. This is an **extension of the existing visibility model**, not a new field store. *Burden-of-proof check:* a new POS field registry is rejected — it would violate the locked decision and re-create the very fragmentation Alloy is consolidating.
- **New Layout Runtime presentation surfaces** for the Processing Workspace queue and Processing Case (new layout *targets*, same renderer + registry). Extension, not replacement.
- **Confidence is not a field-model concern.** It belongs in a POS processing-policy layer (see below), keyed to `field_key` only at the future field-level tier — keeping `field_definitions` clean.

**Net:** Foundation 1 is **reuse of the field registry + Layout Runtime**, with a small **extension** to express processing as another surface. No new data model.

## Foundation 2 — Forms

**Existing.** `form_definitions` / `form_definition_versions` (draft/published/archived), `form_public_links`, `form_submissions` (canonical `payload`, values are **proposals until promoted**), three operator modes (standalone form, public lead/intake, multi-step packet), prefill (hydration ≠ truth).

**Reuse.** Forms are the **Source-capture foundation** for the form and public-lead source kinds. The Forms Library (POS-03) is the forms engine's published surface. The proposals-until-promoted boundary is already POS's records-own-truth doctrine in production.

**Extension.** Forms field config binds to the shared `field_definitions` registry (Foundation 1 convergence) so a form is a *surface* over shared fields, not a parallel field store. A form `submission` becomes a **Source referenced by a Processing Case** (POS-F02) rather than gaining a parallel review runtime.

**How POS builds on forms.** POS does not rebuild capture, versioning, or public links. It wraps a submission as Source evidence on a Processing Case and routes review/resolution/outcome through the POS spine. *Burden-of-proof check:* a POS-specific capture engine is rejected — the forms engine already captures.

## Foundation 3 — Packets

**Existing.** `form_packet_sessions` + `form_packet_session_items` (execution truth), per-step `form_submissions`, `operator_review_status` + mismatch hints, packet review rollup (`buildPacketReviewRollupV1`), review console, approval → idempotent `createGeneratedPdfForSubmission`, `form_submission_documents` junction, Communications delivery.

**Which packet concepts become POS concepts (extension/generalization).**
- **Packet session → the precedent for the Processing Case.** A session (items + per-step payloads + `operator_review_status` + rollup + approval-driven output) is a *single-source* Processing Case. POS **generalizes** this shape across all source kinds.
- **Packet review → POS Review** (Foundation analysis 7 / POS-F02).
- **Operator review states → Processing Case lifecycle** (Needs Review / Needs Resolution / Ready / Completed).
- **Approval-triggered generated PDF → a document Outcome** (one outcome type among the POS-05 taxonomy).

**Which remain packet-specific.** Multi-step **recipient completion sequencing**, packet share links, reminders, and the recipient-facing packet experience stay in the packet/forms engine. POS consumes the *completed packet* as a Source; it does not own packet delivery or step progression.

**Net:** packets are **reuse + generalization** — the strongest existing precedent for the Processing Case. *Burden-of-proof check:* a new POS "case" runtime built from scratch is rejected; generalize the proven packet shape.

## Foundation 4 — Documents

**Existing.** `documents` rows + Supabase Storage, `document_uploaded` event, signed URLs, generated-PDF provenance, document templates, `form_submission_documents`.

**What becomes POS source material.** **Uploaded documents** and **email-attachment documents** are Source evidence referenced by a Processing Case. The contract source, rate sheet, amendment, immunization record — all are `documents` referenced as evidence (opened in a drawer, never the hero — POS-13).

**What remains document-owned (locked boundary).** **Storage, artifacts, templates, generated outputs, signed URLs.** Documents own the file lifecycle; POS owns processing/review/linkage/outcomes/resolution. A document **Outcome** (generate PDF, completed state form, attach to record, create contract record) is *triggered by* POS but *executed and owned by* the Documents capability (via the existing generation path).

**Net:** Documents = **reuse**, with the boundary preserved exactly as locked. *Burden-of-proof check:* a POS document store is rejected.

## Foundation 5 — Workflow

**Existing.** `emitEvent` → `workflow_events`; `executeWorkflowRun` (`workflowRun.ts`); `executeAdminAction` + `action_definitions`/`action_placements`; preflight requirement guard (`ActionPreflightBlockedPanel`); status fan-out (`emitStatusChangedEvent`). Explicit guardrail: **do not build new multi-table side-effect chains; route through the spine.**

**How outcomes become executable (reuse, no second engine).** Each Outcome step **resolves to an existing executor**: record step → `executeAdminAction` handler (e.g. `create_lead`); workflow/lifecycle step → `emitEvent` → `executeWorkflowRun`; status step → status event. The **outcome sequencer** (the one new piece of glue, POS-A01 Decision 4) orders steps, gates on operator approval (approval-only V1), runs idempotently with the existing preflight guard, and records Operational Results. It **does not execute** anything itself — it delegates to the spine.

**Approval-only V1 in the foundation.** The approval gate is structural (the Action Workspace Execute step). Auto-execution is *not assumed*: the sequencer's contract is "execute approved recipe," and a future automation layer can supply approval programmatically without changing the foundation. The foundation supports future automation by separating "what runs" (recipe) from "who approved" (gate).

**Net:** Workflow = **reuse**; the sequencer is **thin new glue**, not a new engine. *Burden-of-proof check:* a second execution engine is rejected by the platform's own guardrail.

## Foundation 6 — Communications

**Existing.** `communication_threads` / `communication_messages`, canonical enqueue → worker → provider, provider bindings, packet-invite delivery precedent.

**How communications become sources.** Communications **owns the email**; when a message/attachment needs processing, a thin **on-ramp** creates a Processing Case **from the attachment**, referencing the message as evidence. POS consumes; it never re-implements receipt, threading, or delivery.

**How outcomes trigger communications.** Communication Outcomes (send packet, request information, send confirmation, notify) execute **only through the canonical enqueue**. POS supplies recipient + intent + a synthesized draft; Communications owns delivery and receipts. (Announcements ride the same canonical path where applicable.)

**Net:** Communications = **reuse** on both the inbound (source) and outbound (outcome) sides. *Burden-of-proof check:* a POS mailer is rejected by doctrine and by the enqueue's existence.

## Foundation 7 — BOS

**Existing.** `bosCapabilityRegistry`, orchestrator routing, Task/Workflow/Config Assist, proposal/apply with human-in-the-loop, deterministic-first posture, paste-parse precedent; Action Workspace (Gather→Review→Execute→Continue, BOS suggestions with confidence + Apply, fast path, `onCreated`); review surfaces; frozen BOS identity primitives (`BosMark`/`BosHeader`/`BosNotification`, working reveal, `BosExecutionLoader`); the command-rail BOS dock.

**How BOS participates across the Processing Case lifecycle (reuse, doctrine-safe).**
- **Received/Processing:** extraction + classification (parse source → proposed values + confidence; suggest case/source type) — the "Analyze with BOS" precedent.
- **Needs Review / Needs Resolution:** matching recommendations (record links + evidence + confidence) and review assistance (summaries, missing-info flags).
- **Ready:** outcome preparation (assemble the recipe, readiness checklist, estimated impact) — the Action Workspace BOS-suggestions pattern.
- **Execute/Completed:** BOS does **not** execute; it shows execution progress via `BosExecutionLoader` and reports Operational Results.

All as **proposals in the right rail**; operators approve; BOS never becomes a primary workspace. *Burden-of-proof check:* a new POS AI participant is rejected — capabilities register in the existing BOS.

**Net:** BOS = **reuse** of the capability registry, the Action Workspace approve flow, and the identity primitives.

---

## Reuse analysis (summary)

| Foundation | Verdict | Reuses | New/extension |
|-----------|---------|--------|---------------|
| 1 Unified Data Model | **Reuse + small extension** | `field_definitions`, Layout Runtime, four-plane Settings, entity model | "Processing" as an additional field-visibility surface; new layout *targets* (same renderer) |
| 2 Forms | **Reuse** | Definitions/versions/links/submissions, proposals-until-promoted | Submission becomes Source reference |
| 3 Packets | **Reuse + generalize** | Sessions/items/rollup/review/approval-output | Generalize session shape → Processing Case |
| 4 Documents | **Reuse** | `documents` + Storage + templates + generated outputs | Document referenced as Source; document Outcome trigger |
| 5 Workflow | **Reuse** | `emitEvent`/`executeWorkflowRun`/`executeAdminAction`/preflight | Thin outcome sequencer + approval gate |
| 6 Communications | **Reuse** | Canonical enqueue, threads/messages, bindings | Thin email-attachment on-ramp |
| 7 BOS | **Reuse** | Capability registry, Action Workspace, identity primitives | BOS capabilities wired across case lifecycle |

## Extension analysis (what "extension" means here)

Extensions are deliberately **"same mechanism, wider aperture"** — never a parallel system:
- Field model → add a processing/extraction visibility surface (mechanism: existing visibility flags).
- Layout Runtime → add Processing Workspace + Processing Case targets (mechanism: existing renderer + config).
- Packet review → generalize to POS Review across sources (mechanism: existing rollup/review states).
- Intake/linkage → generalize to Match/Resolution across sources (mechanism: existing promote-on-approval).
- Action/workflow execution → sequence recipes behind one approval (mechanism: existing executors + preflight + idempotency).

## Dependency map

```
Unified Data Model (field_definitions + Layout Runtime)   ← everything renders/binds here
        │
        ├── Forms ──┐
        ├── Packets ┤── Sources ──▶ Processing Case (envelope; generalizes packet session)
        ├── Documents┤                     │
        └── Comms ───┘                     ├── Review (generalizes packet review)
                                           ├── Resolution / Linkage (generalizes intake/linkage → CRM records)
                                           └── Outcome sequencer ──▶ Workflow spine (executeAdminAction / emitEvent)
                                                                  ──▶ Communications enqueue
                                                                  ──▶ Documents generation
        BOS (capability registry + Action Workspace + identity) ── participates in the right rail across all of the above
```

- **Unified Data Model is the deepest dependency** — Processing Workspace, Processing Case, Review, and Outcome promotion all bind to `field_definitions` + Layout Runtime.
- **Sources depend on Forms/Packets/Documents/Communications** for capture/evidence.
- **Outcomes depend on the Workflow spine, Communications enqueue, and Documents generation.**
- **BOS depends on case context** at every stage but owns none of the truth.

## Risk assessment

1. **Field-model fork (highest).** Pressure to give POS/forms/packets their own field config would break the locked shared-data-model decision. *Mitigation:* bind all source/extraction/outcome fields to `field_definitions`; processing is a new *surface*, not a new registry.
2. **Forms↔field-registry convergence is incomplete today.** Form versions still carry field config in JSON; full binding to `field_definitions` is acknowledged roadmap. *Mitigation:* treat convergence as a foundation dependency, sequenced early; do not let POS deepen the fork.
3. **Processing Case absorbing canonical truth.** *Mitigation:* envelope references sources; canonical writes only via approved outcomes (POS-F02).
4. **Outcome sequencer drifting into a second engine.** *Mitigation:* resolve steps to existing executors; platform guardrail binding.
5. **Multi-source ambiguity.** Primary vs related must be unambiguous to avoid competing runtimes. *Mitigation:* POS-F02 defines primary/related conceptually; one case lifecycle.
6. **Confidence sprawl.** Confidence policy could leak into the field registry. *Mitigation:* confidence lives in a POS processing-policy layer (platform→org→recipe→future field-level), keyed to `field_key` only at the future tier.
7. **Documents boundary erosion.** POS could start "owning" generated artifacts. *Mitigation:* locked boundary — Documents own storage/artifacts/templates/outputs; POS triggers, Documents executes/owns.
8. **Vocabulary drift back to "intake."** *Mitigation:* user-facing POS vocabulary fixed (Sources/Processing Cases/Review/Resolution/Outcomes); legacy internal naming migrates naturally.

## Success-criteria answers (Foundation Gate)

1. **Reused foundations:** the field registry + Layout Runtime, Forms, Packets, Documents, the Workflow/Action spine, Communications enqueue, BOS capability registry + Action Workspace.
2. **Extended foundations:** field-visibility model (processing surface), Layout Runtime (new targets), packet review (→ POS Review), intake/linkage (→ Match/Resolution), action/workflow execution (→ recipe sequencing).
3. **Minimal new foundations:** Processing Case envelope, source on-ramps, outcome sequencer + approval gate. (Document AI extraction remains deferred per POS-A03.)
4. **How Processing Cases fit:** an envelope on top of the shared data model, referencing Sources and promoting values through the existing field/policy/Layout Runtime path (POS-F02).
5. **How outcomes become executable:** the sequencer resolves recipe steps to existing executors behind an approval gate; no second engine.
6. **How BOS participates:** capability-based proposals across the case lifecycle, right-rail only.
7. **What gets built first:** POS-F03 (Unified-model binding + Processing Case envelope first).

**Verdict:** POS's implementation foundation is **overwhelmingly reuse**, with one small extension theme (processing as a new surface on the shared model) and three thin new pieces. POS is ready to advance to **Package Planning and Execution Design**, conditional on sequencing the forms↔field-registry convergence early (Risk 2).
