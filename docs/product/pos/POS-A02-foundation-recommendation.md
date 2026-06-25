# POS-A02 — Foundation Recommendation

> **Status:** Architecture Gate artifact — conceptual. Draft.
> **Not** schema, migrations, tables, columns, APIs, or code. Reuse/extension analysis only.
> Inherits POS-01/02/03/05/13 (immutable) and **POS-A01**. Companion: **POS-A03** (roadmap).
> Branch: `pos-planning-v1`.

## Question answered

**What existing Alloy systems become the foundation of POS — what do we reuse as-is, what do we extend, and what genuinely new capability must we add?**

The answer determines how much of POS is integration versus invention. Per POS-A01, the balance is heavily toward reuse: POS is composition over shipped systems, with a thin new envelope, thin on-ramps, and outcome glue.

## Foundation thesis

POS sits on **five load-bearing existing foundations** and adds **four small new things**.

Load-bearing reuse:

1. **Forms + Packet engine** — Source capture and the case precedent.
2. **Documents + Storage** — document sources and document outcomes.
3. **Workflow / Action execution spine** — outcome execution.
4. **Communications canonical enqueue** — inbound attachments and outbound comms outcomes.
5. **Operational UI runtime** — Work Unit Workspace, Layout Runtime, Action Workspace, BOS identity — the POS surfaces.

New (small, bounded):

1. **Processing Case envelope + lifecycle** — the one new primary object.
2. **Source on-ramps** — thin adapters that converge sources onto the case.
3. **Outcome sequencer + approval gate** — glue over existing executors.
4. **Document AI extraction** — deferrable, the only sizeable net-new capability.

---

## Reuse candidates (compose as-is or near-as-is)

### 1. Forms + Packet engine — *the foundation of Sources and the Processing Case shape*
- **What it is:** `form_definitions` / `form_definition_versions` (draft/published/archived), `form_public_links`, `form_submissions` (canonical `payload`); `form_packet_sessions` / `form_packet_session_items`; packet review rollup (`buildPacketReviewRollupV1`); operator review (approve/reject/needs correction); idempotent generated-PDF on approval.
- **POS role:** form and packet **Sources**; the **packet session is the architectural precedent for the Processing Case** (a session + items + `operator_review_status` + rollup + approval-triggers-output). The Forms/Packets libraries (POS-03) are this engine's published surfaces.
- **Why reuse:** it already implements capture, the proposals-until-promoted trust boundary, operator review, and approval-driven output. Rebuilding any of it would create the forbidden second enrollment/review subsystem.

### 2. Documents + Storage — *document sources and document outcomes*
- **What it is:** `documents` rows + Supabase Storage, `document_uploaded` event, signed URLs, normalization, generated-PDF provenance, `form_submission_documents` junction.
- **POS role:** **upload Source** capture; **document outcomes** (generate PDF, completed state form, attach to record); evidence preview (opened in a drawer, per POS-13).
- **Why reuse:** storage, provenance, and generation already exist; POS consumes and triggers them.

### 3. Workflow + Action execution spine — *the Outcome Engine's executors*
- **What it is:** `emitEvent` → `workflow_events`; `executeWorkflowRun` (`workflowRun.ts`); `executeAdminAction` + `action_definitions`/`action_placements`; preflight requirement guard (`ActionPreflightBlockedPanel`); status-change fan-out (`emitStatusChangedEvent`).
- **POS role:** every **Outcome** step resolves to one of these — record steps → `executeAdminAction` handlers (e.g. `create_lead`), workflow steps → `emitEvent`/`executeWorkflowRun`, status/lifecycle steps → status events.
- **Why reuse:** the guardrail is explicit — do not build new multi-table side-effect chains; route through the spine for auditability and org parity.

### 4. Communications canonical enqueue — *inbound attachments + outbound comms outcomes*
- **What it is:** `communication_threads` / `communication_messages`; canonical enqueue → worker → provider; packet-invite delivery precedent.
- **POS role:** **email-attachment Source** (Communications owns the email; POS creates a case from the attachment) and **communication Outcomes** (send packet, request information, send confirmation) via the enqueue.
- **Why reuse:** Communications owns email by doctrine (POS-01/03); POS must consume, never re-implement.

### 5. Operational UI runtime — *the POS surfaces*
- **What it is:** `WorkUnitWorkspace` + `WorkspaceShellLayout` + command rail (Actions → Telemetry → BOS); Layout Runtime queue record renderer (`OperationalQueueRecordRow`, `QueueRecordFieldRenderer`) and drawer overview composition (`DrawerOverviewPanelShell`); Action Workspace (`ActionWorkspaceShell`, step rail, BOS suggestions, execute/success); BOS identity primitives (`BosMark`/`BosHeader`/`BosNotification`, working reveal, `BosExecutionLoader`); presentation typography/date tokens.
- **POS role:** **Processing Workspace** = a Work Unit Workspace + queue renderer; **Processing Case** = drawer composition + Action Workspace approve flow; **BOS rail** = BOS identity primitives. This is exactly what POS-12/13 prescribe.
- **Why reuse:** it is the difference between "another Alloy workspace" and "a new product" (POS-12). Reuse is the Alloyification.

### 6. Intake / linkage operator flow — *Match and Resolution*
- **What it is:** linkage-review operator flow; `buildFormIntakeMetaFromPayload` / `applyFormIntakeSafe`; CRM record resolution; submitted-values-are-proposals boundary.
- **POS role:** **Match** (candidate record links) and **Resolution** (confirm / create new / request info / reject / defer), generalized across sources.
- **Why reuse:** the promote-on-approval mechanics already encode records-own-truth; POS generalizes the surface, not the mechanics.

### 7. BOS capability registry — *BOS participation*
- **What it is:** `bosCapabilityRegistry`, orchestrator routing, Task/Workflow/Config Assist, proposal/apply with human-in-the-loop; deterministic-first posture; paste-parse precedent.
- **POS role:** extraction, classification, matching, review assistance, outcome preparation — as **proposals** in the rail.
- **Why reuse:** doctrine requires one BOS; new AI surfaces must register here, not fork.

## Extension candidates (reuse the mechanism, broaden the scope)

| Candidate | Existing mechanism | Extension for POS |
|-----------|--------------------|-------------------|
| **Processing Case from packet session** | `form_packet_sessions` review pattern | Generalize the session+review+approval shape into a **source-agnostic** Processing Case envelope (references sources rather than being packet-specific) |
| **Review console** | Packet review rollup + `/adminV2/forms/packets/[id]` review console | Generalize into the POS **Review** surface for all sources (forms, packets, uploads, attachments) |
| **Match/Resolution** | Intake/linkage operator flow (form-scoped) | Generalize into source-agnostic **Linkage** (family/person/child/customer/provider) |
| **Outcome recipes** | `action_definitions` + workflow config + Settings V2 control plane | Add **outcome-recipe configuration** (ordered steps per source type) composed from existing action/event executors — config, not a new engine |
| **Extraction** | Prefill + packet rollup + deterministic paste parse | Generalize into a **structured-reading layer** that yields proposals with confidence across source kinds (document OCR is the *new* part, below) |
| **Action Workspace** | Create Lead reference (Gather→Review→Execute→Continue, fast path, `onCreated`) | Apply the same flow to **outcome approval** on a Processing Case |

Extensions are deliberately "same mechanism, wider aperture" — they avoid parallel systems.

## New capabilities required (justified)

| New capability | Why it can't be pure reuse | Size / risk | Timing |
|----------------|----------------------------|-------------|--------|
| **Processing Case envelope + lifecycle** | No existing object spans *all* sources as one operational record; the packet session is single-source | Small (thin envelope; models on packet precedent) | Foundation |
| **Source on-ramps** (upload / email attachment / import / recreated doc) | Forms/packets are captured already; other sources need a thin adapter to open/attach a case and reference evidence | Small per on-ramp | Foundation (forms/packets) → Advanced (email/upload/import/recreate) |
| **Outcome sequencer + approval gate** | Existing executors run single actions; nothing sequences an ordered recipe behind one approval with idempotency + preflight | Small–medium (glue; reuses executors, preflight, idempotency) | Outcome Engine phase |
| **Document AI extraction (OCR)** | Not implemented; BOS AI expansion paused; arbitrary documents need structured reading | Medium–large; **deferrable** | Advanced Automation |

**Explicitly not new:** no new review console, no new mailer, no new workflow engine, no new document store, no new AI participant, no new queue/drawer runtime, no second enrollment subsystem.

## Foundation recommendation (summary)

1. **Adopt the five reuse foundations** (Forms+Packets, Documents, Workflow/Action spine, Communications enqueue, Operational UI runtime) as the platform POS is assembled from.
2. **Generalize three existing patterns** (packet session → Processing Case; packet review → POS Review; intake/linkage → Match/Resolution) rather than building new equivalents.
3. **Add four small new things** (Processing Case envelope, source on-ramps, outcome sequencer + approval gate, deferrable document extraction).
4. **Sequence reuse-heavy phases first** (Foundation → Workspace → Review → Linkage → Outcome → BOS → Advanced) per POS-A03.

**Rationale in one line:** POS already mostly exists inside Alloy as the packet/forms/review/workflow stack; the architecture's job is to **generalize and wire**, not to build — which is also exactly what keeps POS feeling like Alloy.
