# POS-A01 — Architecture Assessment

> **Status:** Architecture Gate artifact — conceptual architecture. Draft.
> **Not** product discovery, doctrine, UX, visual design, implementation, schema, migrations, or APIs. Architecture may **elaborate** the accepted product; it may **not contradict** it.
> **Immutable inputs:** POS-01 (doctrine), POS-02 (object model), POS-03 (platform map), POS-05 (outcome framework), POS-13 (visual direction). Processing Case remains the single primary object; BOS remains the right-rail recommendation layer.
> **Source of truth for reuse:** actual Alloy systems — `documents-and-forms.md`, `actions-and-workflows.md`, `bos-foundation.md`, `bos-identity-doctrine.md`, `action-workspace-foundation.md`, `work-unit-layout-doctrine.md`, `queue-record-doctrine.md`, `configuration-system.md`, `crm-system.md`, `communications.md`.
> Branch: `pos-planning-v1`. Companion docs: **POS-A02** (foundation), **POS-A03** (roadmap).

## Objective

Answer one question: **how do we implement the accepted POS model using Alloy's existing platform?** The architecture optimizes the operational spine **Information → Processing Case → Review → Resolution → Outcome → Workflow → Operational Result**, and it composes existing Alloy capabilities before creating new ones.

## Headline finding

**POS is mostly an act of composition, not new infrastructure.** Alloy already ships the hard parts: a forms/packet capture engine, a documents + storage layer, an operator review-and-promote flow that already treats submitted values as *proposals until an operator promotes them* (records-own-truth, in production), an event/workflow execution spine, a declarative admin-action executor, a canonical communications enqueue, an Action Workspace (Gather → Review → Execute → Continue) that is the Processing Case experience in miniature, and a layout runtime for queues and drawers. The **genuinely new** surface is small and well-bounded: the **Processing Case as a unifying operational envelope**, a thin **source-convergence on-ramp**, an **outcome sequencer + approval gate** over existing executors, and (deferrable) **document AI extraction**.

## Architecture principles

1. **Reuse before new.** Compose existing Alloy capabilities (Forms, Packets, Documents, Communications, Workflows, Lifecycle, BOS, Layout Runtime, Action Workspace) before proposing any new platform capability. New infrastructure must justify why no accepted capability already serves.
2. **Existing platform first.** Prefer assembling shipped primitives over building parallel ones. Explicitly: **do not** create a second enrollment subsystem, a second review console, a second execution chain, or a second AI participant.
3. **Operational outcome focus.** Every architectural choice serves the spine Information → Processing Case → Review → Resolution → Outcome → Workflow → Operational Result. If a choice doesn't move information toward an approved operational result, it's out of scope.
4. **Processing Case is the spine.** One primary object. Sources, Extractions, Matches, Resolutions, and Outcomes hang off the Processing Case; they never become competing primary objects.
5. **Records own truth; operators approve.** Sources stay proposals; canonical writes happen only through approved outcomes that call existing executors. No silent execution (V1).
6. **BOS recommends from the right rail.** BOS participates as a capability layer (extract, classify, match, recommend, prepare), never as a primary workspace.
7. **Don't bypass the spine.** Outcome execution goes through `emitEvent` → `executeWorkflowRun` and `executeAdminAction` (and Communications enqueue, document generation) for auditability and org parity — never a new side-effect chain that mutates records directly (`actions-and-workflows.md` guardrail).

---

## Architecture decisions

### Decision 1 — Reuse vs New Foundation

**Recommendation: build POS predominantly on the existing Forms, Packet, Documents, Workflow, and Action-execution foundations; add a thin Processing Case envelope and an outcome sequencer; treat document AI extraction as a deferrable new capability.**

What the platform already gives us, mapped to POS objects:

| POS object (POS-02) | Existing Alloy capability to compose |
|---------------------|--------------------------------------|
| **Source** (form, packet, upload, attachment) | `form_definitions`/`form_definition_versions`/`form_public_links`/`form_submissions`; `form_packet_sessions`/items; `documents` + Storage; Communications messages/attachments |
| **Extraction** (structured reading, proposals) | Form payloads + prefill (`web/lib/forms/prefill`), packet review rollup (`buildPacketReviewRollupV1`); deterministic paste parse (`ActionIntakePasteParser`, "Analyze with BOS"). **New for arbitrary documents:** OCR/AI extraction (deferrable) |
| **Match** (candidate links) | Existing intake/linkage operator flow (`linkage-review-operator-flow`, `buildFormIntakeMetaFromPayload`/`applyFormIntakeSafe`); CRM record resolution |
| **Resolution** (human decision) | Existing packet operator review (approve / reject / needs correction) + intake/linkage confirm |
| **Outcome** (operational result to execute) | `executeAdminAction` handlers (e.g. `create_lead`), `emitEvent` → `executeWorkflowRun`, Communications enqueue, `createGeneratedPdfForSubmission` |
| **Workflow** (downstream process) | The event/workflow spine (`workflow_events`, `workflowRun.ts`) |
| **Operational Result** (realized change) | Canonical records written by the above executors; case history |
| **Processing Case** (the envelope) | **Generalizes** the existing packet-session review pattern (`operator_review_status`, items, rollup) across *all* sources — the one genuinely-central new conceptual record |

**Rationale.** The packet flow is already a single-source "case": a session with items, per-step payloads, an `operator_review_status`, a review rollup, and an approval that triggers idempotent document generation. POS is the **generalization of that pattern to every source kind**, with outcomes broadened beyond PDF generation. That is an extension of a proven shape, not a greenfield build. New build is confined to the envelope, the on-ramps for non-form sources, the outcome sequencer, and (later) document extraction.

### Decision 2 — Processing Case Runtime (conceptual)

**A Processing Case is an operational envelope that references its sources rather than absorbing them.** Conceptually (no schema):

- **Ownership:** owned by POS. It is the single operational record for "information that entered Alloy and needs review/resolution/action." It is **not** a CRM record and never replaces `opportunities`/`persons`.
- **Lifecycle:** the POS-02 lifecycle (Received → Processing → Needs Review → Needs Resolution → Ready → Completed → Archived). This lifecycle is POS-internal and distinct from CRM status and Lifecycle stages.
- **Source relationships:** a case **references** one or more Sources as evidence (a `form_submission`, a `form_packet_session`, a `document`, a `communication_message` attachment). Sources keep their own identity and truth; the case points at them. One case may consolidate multiple sources (open product rule from POS-11 — carried here as a runtime capability, default one-source).
- **Outcome relationships:** a case holds **proposed outcomes** (the recipe, POS-05) and, after approval, the **operational results** produced. Outcomes are prepared (BOS) and approved (operator) on the case.
- **Workflow relationships:** the case **triggers** workflows through approved outcomes via the event spine; it does not own or run workflow definitions.

The Processing Case is the only new primary object, and it is deliberately thin: an envelope + lifecycle + references + proposed/realized outcomes. Everything substantive is reused.

### Decision 3 — Platform Ownership Boundaries (frozen)

| System | Owns | Consumes | Exposes to POS |
|--------|------|----------|----------------|
| **POS** | Processing Case runtime + its lifecycle; Source references; Extraction; Match candidates; Resolution; Outcome preparation + approval; the Processing/Review/Linkage surfaces; Forms/Packets/Documents libraries as POS presents them; POS Settings (outcome recipes) | Everything below | The Processing Case spine and operator approval surface |
| **CRM** | Canonical relationship records (`persons`, `customers`, `customer_persons`, `opportunities`, `opportunity_customer_members`) | Match results | Record resolution for matches; executors (`create_lead`, etc.) for record outcomes |
| **Lifecycle** | Work units, `queue_definition`, statuses, subject grain | Outcome-triggered progression | `WorkUnitWorkspace` shell + queue runtime for the Processing Workspace; lifecycle events for outcomes |
| **Communications** | `communication_threads`/`messages`, canonical enqueue → worker → provider | — | Inbound attachments/messages as Sources; outbound comms outcomes via enqueue |
| **Documents** | `documents` + Storage; generated PDFs; signed URLs | Approved document outcomes | Uploaded documents as Sources; generation path for document outcomes; evidence preview (drawer) |
| **BOS** | Capability registry, orchestrator routing, proposals, human-in-the-loop policy, BOS identity | Case context | Extraction/classification/matching/recommendation/outcome-prep **proposals** in the right rail |
| **Workflows (platform)** | `workflow_events`, `executeWorkflowRun`, `executeAdminAction`, `action_definitions` | Approved outcome triggers | The execution spine outcomes run on |
| **Forms engine** | `form_definitions`/versions/links/`form_submissions`, `form_packet_sessions` | — | Source capture + evidence for form/packet sources; published surfaces for the Forms/Packets libraries |

**Boundary doctrine:** POS **proposes**; the owning system **owns the result**. POS never writes a canonical CRM/billing field directly — it calls the owner's executor through an approved outcome.

### Decision 4 — Outcome Engine Architecture (conceptual)

**The Outcome Engine is a thin sequencer + approval gate over existing executors — not new execution infrastructure.**

- **Orchestration:** an approved outcome is an **ordered recipe** (POS-05) configured in POS Settings. Each step **resolves to an existing executor**: a record step → `executeAdminAction` handler; a workflow step → `emitEvent` → `executeWorkflowRun`; a communication step → Communications canonical enqueue; a document step → the generated-PDF/document path. The engine resolves and runs steps; it does not re-implement them.
- **Sequencing:** steps run in configured order; the engine respects step optionality and preconditions (reusing the existing preflight/requirement guard pattern, `ActionPreflightBlockedPanel`). Execution is **idempotent** (mirroring `createGeneratedPdfForSubmission`'s idempotency) so re-approval/retry does not double-apply.
- **Approval gate (V1):** the operator approves on the Processing Case (Action Workspace **Execute**). No step runs before approval. Auto-execute remains an open V1 decision (POS-11) and, if enabled, occurs only **inside** an approved recipe — never silent.
- **Workflow triggering / lifecycle integration:** via `emitEvent` only (never a bypass chain) — preserving auditability and org parity per `actions-and-workflows.md`.
- **Communication integration:** via the canonical enqueue only.
- **Result:** each executed step yields an **Operational Result** recorded in case history with human attribution; on completion the case opens the created record drawer (the Action Workspace `onCreated` handoff).

The new code here is **glue** (resolve recipe → executors, sequence, record results, gate on approval). The executors, the event spine, and the enqueue are all reused.

### Decision 5 — BOS Participation Architecture

BOS participates as **capabilities** (`bos-foundation.md` registry), in the **right rail**, as **proposals only** (Action Workspace contract: "BOS must not execute without explicit confirmation").

| Stage | BOS participation | Existing precedent |
|-------|-------------------|--------------------|
| **Extraction** | Parse/extract structured values from a source as suggestions with confidence | "Analyze with BOS" / `ActionIntakePasteParser` (deterministic today; AI later) |
| **Classification** | Suggest source/case type and routing | BOS orchestrator routing |
| **Matching** | Recommend record links with confidence + evidence | Intake/linkage review |
| **Review assistance** | Summarize a case / flag missing info | Packet insight (P2-5 deterministic), review summaries |
| **Outcome preparation** | Propose the outcome recipe, readiness checklist, estimated impact | Action Workspace BOS suggestions (confidence + inline edit + Apply) |

Doctrine held: **BOS recommends, operators approve**; right-rail only; never a primary workspace. BOS identity uses the frozen primitives (`BosMark`/`BosHeader`/`BosNotification`, working reveal for "analyzing," `BosExecutionLoader` for execution).

### Decision 6 — Processing Sources (convergence)

**All sources converge into one Processing Case via thin per-source on-ramps; there is exactly one runtime.**

- Each source kind has a small **on-ramp** whose only job is to open or attach to a Processing Case and reference the source as evidence:
  - **Form / packet** → reuse `form_submissions` / `form_packet_sessions` capture; the on-ramp wraps the existing session as a case (the packet session is the precedent shape).
  - **Upload** → reuse `documents` upload + `document_uploaded` event; on-ramp opens a case referencing the document.
  - **Email attachment** → Communications owns the email; the on-ramp creates a case from the attachment (consumes, does not re-implement email).
  - **Imported file / recreated document** → later on-ramps onto the same case runtime.
- **No competing runtimes:** there is one Processing Case lifecycle and one review/approve surface. Sources differ only at the on-ramp and in evidence presentation; they share the case, the review, the resolution, and the outcome engine. This directly satisfies "all sources converge into Processing Case without multiple competing runtimes."

### Decision 7 — Architecture Sequencing

Recommended order (detailed in POS-A03), mapped to POS-06 named gates:

1. **Foundation** — Processing Case runtime envelope + lifecycle + source references; reuse forms/packet capture as the first Source on-ramp. → *Foundation Gate*
2. **Processing Case Runtime + Processing Workspace** — render the Processing queue through `WorkUnitWorkspace` + the queue record renderer; the case surface through drawer + Action Workspace composition. → *Workspace Gate*
3. **Review** — generalize the packet review console into the POS Review surface across sources. → *Review Gate*
4. **Linkage** — generalize the intake/linkage operator flow into Match/Resolution across sources. → *(Review Gate cont.)*
5. **Outcome Engine** — the sequencer + approval gate over existing executors.
6. **BOS Integration** — wire BOS capabilities into the rail (extraction/matching/recommendation/outcome prep). → *BOS Gate*
7. **Advanced Automation** — additional source on-ramps (email attachment, import, recreate), document AI extraction, and (pending decision) auto-execute. → *Final QA Gate*

**Rationale:** the spine must exist before surfaces; surfaces before review; review before resolution; resolution before outcomes; outcomes before BOS preparation has anything to prepare; advanced automation last because it is the most net-new and the most deferrable. Each phase is mostly reuse, so early phases are integration-shaped, not greenfield.

---

## Reuse analysis (summary)

| Capability | Verdict | Note |
|-----------|---------|------|
| Forms engine (definitions/versions/links/submissions) | **Reuse** | Source capture + evidence for form/packet sources |
| Packet sessions (sessions/items/rollup/review) | **Reuse + generalize** | The precedent shape for the Processing Case |
| Documents + Storage + generated PDFs | **Reuse** | Document sources and document outcomes |
| Communications canonical enqueue | **Reuse** | Inbound attachments as sources; outbound comms outcomes |
| Workflow event spine (`emitEvent`/`executeWorkflowRun`) | **Reuse** | Workflow outcomes; never bypass |
| `executeAdminAction` + `action_definitions` | **Reuse** | Record outcomes; outcome steps resolve to handlers |
| Action Workspace (Gather→Review→Execute→Continue) | **Reuse** | The Processing Case review/approve experience |
| Layout Runtime (queue renderer, drawer composition) | **Reuse** | Processing Workspace + Processing Case surfaces |
| Work Unit Workspace + command rail | **Reuse** | Processing Workspace shell (POS-12/13) |
| BOS capability registry + identity | **Reuse** | BOS participation + right-rail identity |
| Intake / linkage operator flow | **Reuse + generalize** | Match / Resolution across all sources |
| Processing Case envelope + lifecycle | **New (thin)** | The one new primary object |
| Source on-ramps (upload/email/import/recreate) | **New (thin)** | Forms/packets already captured; others are small on-ramps |
| Outcome sequencer + approval gate | **New (glue)** | Sequences existing executors; reuses preflight + idempotency |
| Document AI extraction (OCR) | **New (deferrable)** | Not implemented today; BOS AI expansion paused; V1 leans on mapped/manual extraction |

Full candidate breakdown: **POS-A02**.

## Risks

1. **Processing Case scope creep into CRM.** The envelope must stay an envelope; if it starts holding canonical truth it violates records-own-truth. *Mitigation:* references-not-absorption; canonical writes only via approved outcomes calling owners' executors.
2. **Outcome Engine reinventing the workflow spine.** Tempting to build a new orchestrator. *Mitigation:* engine resolves steps to `executeAdminAction`/`emitEvent`/enqueue/doc-gen; the guardrail against new side-effect chains is binding.
3. **Source divergence into competing runtimes.** Per-source special-casing could fork the runtime. *Mitigation:* one Processing Case lifecycle; sources differ only at on-ramp + evidence.
4. **BOS overreach.** Pressure to let BOS auto-apply or become a workspace. *Mitigation:* frozen BOS doctrine; approval gate is structural; right-rail only.
5. **Document extraction over-commitment.** OCR/AI is the most net-new and is paused platform-wide. *Mitigation:* defer to Advanced Automation; V1 forms/packets use mapped extraction, documents use manual/assisted extraction.
6. **"Intake" vocabulary collision.** Existing intake rules/code persist beneath POS language (POS-01). *Mitigation:* reuse intake/linkage mechanics; rename at the product layer only; no behavior change in this gate.
7. **Auto-execute ambiguity (open).** Unresolved V1 decision (POS-11). *Mitigation:* default approval-only; carry as an explicit Foundation-Gate decision.
8. **Shared-checkout / toolchain limits (program).** Architecture/build must run from a clean dedicated checkout; real toolchain runs are host-side (POS-06).

## Recommendations

1. **Approve a reuse-first architecture:** POS is composition over Forms, Packets, Documents, Communications, Workflows, Lifecycle, BOS, Layout Runtime, and Action Workspace, plus a thin Processing Case envelope, thin source on-ramps, and an outcome sequencer.
2. **Model the Processing Case on the packet-session precedent** and generalize it; do not invent a novel case model.
3. **Build the Outcome Engine as a sequencer over existing executors;** never a new side-effect chain.
4. **Keep BOS in the rail as proposals;** reuse the Action Workspace approve flow as the structural approval gate.
5. **Converge sources via thin on-ramps to one runtime;** forms/packets first, email/upload/import/recreate later.
6. **Defer document AI extraction** to Advanced Automation; lean on mapped/manual extraction for V1.
7. **Resolve the open items as Foundation-Gate decisions:** auto-execute in V1, multi-source consolidation rules, confidence thresholds, intake-rename scope.

## Success-criteria answers

1. **What POS is** — Alloy's operating layer that turns incoming information into approved operational outcomes; primary object the Processing Case (POS-01/02).
2. **How POS fits into Alloy** — a pillar that composes existing systems behind the Processing Case spine, with frozen ownership boundaries (Decision 3).
3. **What POS reuses** — Forms, Packets, Documents, Communications, Workflows, `executeAdminAction`, Action Workspace, Layout Runtime, Work Unit Workspace, BOS, intake/linkage (reuse table).
4. **What is genuinely new** — the Processing Case envelope, thin source on-ramps, the outcome sequencer + approval gate, and deferrable document AI extraction.
5. **How Processing Cases operate** — an envelope referencing sources, moving through the POS lifecycle, accruing extractions/matches/resolutions and proposed/realized outcomes (Decision 2).
6. **How Outcomes execute** — a sequencer resolves recipe steps to existing executors, gated by operator approval, via the event spine and enqueue, idempotently (Decision 4).
7. **How BOS participates** — capability-based proposals (extract/classify/match/review/prepare) in the right rail; recommends, never executes (Decision 5).
8. **What gets built first** — Foundation (Processing Case runtime + first source on-ramp), then Workspace, Review, Linkage, Outcome Engine, BOS, Advanced Automation (Decision 7 / POS-A03).

**Verdict:** POS is **architecturally ready to enter the Foundation Gate** on a reuse-first basis, conditional on resolving the open Foundation-Gate decisions above. No doctrine, object-model, or visual contradiction is introduced; this assessment only elaborates.
