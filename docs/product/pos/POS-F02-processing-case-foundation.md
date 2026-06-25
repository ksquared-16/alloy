# POS-F02 — Processing Case Foundation

> **Status:** Foundation Gate artifact — conceptual. Draft.
> **No schema, tables, columns, migrations, APIs, or code.** This defines the *conceptual foundation* of the five POS objects on top of existing Alloy systems.
> **Immutable inputs:** POS-02 (object model), POS-05 (outcome framework), POS-A01/A02 (architecture), POS-F01 (foundation analysis). Processing Case is the single primary object.
> Branch: `pos-planning-v1`. Companions: **POS-F01**, **POS-F03**.

## Purpose

Define how **Source, Processing Case, Review, Resolution, and Outcome** exist conceptually on the existing platform — including the locked decisions on multi-source cases, the confidence model, vocabulary, and approval-only V1. This is the bridge from the frozen object model (POS-02) to future package planning, expressed entirely in terms of existing Alloy foundations (POS-F01). No new data model.

## Grounding principle

Each POS object is **an operational role played on top of existing platform records**, not a new storehouse of truth. Sources are existing capture/file/message records; the Processing Case is an envelope referencing them; Review/Resolution/Outcome are operator-gated transitions that promote proposals into canonical records via existing executors. Truth always lives where it already lives (records-own-truth, POS-01).

---

## Source

**Concept.** A Source is *where information entered Alloy* — evidence and context, never truth.

**Foundation.** A Source is a **reference to an existing platform record**, by kind:

| Source kind | Existing record it references |
|-------------|-------------------------------|
| Form submission | `form_submissions` |
| Packet submission | `form_packet_sessions` (+ items, per-step submissions) |
| Uploaded document | `documents` (+ Storage) |
| Email attachment | `documents` reached via `communication_messages` (Communications owns the email) |
| Contract / rate sheet / amendment | `documents` |
| Recreated / state form | a form/document artifact (Documents- or Forms-owned) |
| Imported file | `documents` (later on-ramp) |

**Behavior.**
- A Source keeps its **own identity and truth** in its owning system; the Processing Case points at it. Removing the case never destroys the source record, and vice versa.
- The **source kind** drives evidence presentation (a form renders as fields; a document opens in a drawer per POS-13) but **not** the work — the Processing Case standardizes the work regardless of kind.
- Captured/extracted values bind to the **shared `field_definitions` registry** (POS-F01 Foundation 1) — a source value is a *proposed value for an existing field*, not a source-specific field.

## Processing Case

**Concept.** The Processing Case is the single primary operational object: *information that has entered Alloy and needs review, resolution, or action.*

**Foundation.** A Processing Case is a **thin envelope** that **generalizes the existing packet-session pattern** (POS-F01 Foundation 3) across all source kinds. Conceptually it carries:
- one or more **Source references** (multi-source below);
- a **lifecycle** (POS-02): Received → Processing → Needs Review → Needs Resolution → Ready → Completed → Archived — this is POS-internal, distinct from CRM status and Lifecycle stages, and is the generalization of the packet `operator_review_status`;
- **Extractions** (proposed values keyed to `field_definitions`, with confidence);
- **Match candidates** and settled **Resolutions**;
- **proposed Outcomes** (the recipe) and, after approval, **Operational Results**;
- a **history** with human attribution.

**Why an envelope, not a new record of truth.** The case references; it does not absorb. Canonical identity stays in CRM (`persons`/`customer_persons`/`opportunities`/`customer_members`/`opportunity_customer_members`); files stay in Documents; messages stay in Communications; capture stays in Forms/Packets. The case is the *work*, the sources are the *evidence*, the canonical records are the *truth*.

**Surfaces (POS-F01 Foundation 1).** The Processing Workspace renders cases through the queue record renderer; the Processing Case view renders through drawer overview composition + the Action Workspace flow. Same Layout Runtime, same field registry.

### Multi-source Processing Cases (locked)

One Processing Case may contain multiple Sources. Examples: subsidy contract **+** rate sheet; packet **+** supplemental upload; contract **+** amendment.

**Conceptual relationships.**
- **Primary source** — the source that defines the case's *type and intent* (e.g. the subsidy contract). It anchors which outcome recipe applies and the case's classification. Exactly one primary at a time.
- **Related sources** — additional evidence that informs the same case (the rate sheet, the amendment, the supplemental upload). They contribute extractions and evidence but do not change the case's identity.
- **One case, one lifecycle, one review, one resolution, one outcome set.** Related sources converge *into* the primary case rather than spawning competing runtimes (POS-A01 Decision 6). Adding a related source enriches the case; it does not fork it.
- **Extraction merge.** Values from related sources are additional proposals against the same `field_definitions` keys; conflicts between sources surface in Review as paired values for operator resolution (never silent overwrite).
- **Evidence set.** All sources remain individually viewable (each opens its own document/drawer); provenance records which source a given proposed value came from.

**Behavioral rule.** Primary vs related is a **role on the case**, not a new object — it determines anchoring and recipe selection, nothing more. A related source may be *promoted* to primary by an operator if the case's intent changes, but there is always exactly one primary.

## Review

**Concept.** Review is *confirming what the system understood* before anything becomes truth.

**Foundation.** Review **generalizes the existing packet review** (rollup + operator review states: approve / reject / needs correction) to all source kinds (POS-F01 Foundation 3). It presents:
- the case's **extractions** as proposals with confidence (the Action Workspace BOS-suggestions pattern: confidence + inline edit + Apply);
- **record impact** — which canonical fields an approval would change (submitted vs current), surfaced for explicit operator choice;
- **missing information** and blockers (e.g. a missing signature), with the corrective action (request via Communications).

**Foundation reuse.** Review is a Layout Runtime surface over the shared field registry; it adds no new field model and no second review console.

## Resolution

**Concept.** Resolution is the *human decision that settles ambiguity* — the gate between understanding and acting.

**Foundation.** Resolution **generalizes the existing intake/linkage operator flow** (POS-F01 Foundation 7 of A02 / intake-linkage mechanics) across all sources. Its choices (POS-02): **confirm match · create new record · request missing information · reject source · defer.**

**Match targets → existing canonical records:**

| POS Match target | Canonical record |
|------------------|------------------|
| Family / household | `customers` |
| Person | `persons` + `customer_persons` |
| Child | `customer_members` / `opportunity_customer_members` |
| Customer | `customers` |
| Provider / vendor | vendor records |

- **Confirm match** links the case's subject to an existing canonical record (CRM owns the result).
- **Create new record** produces a canonical record via the appropriate executor (an Outcome).
- **Request information** sends through Communications and parks the case in Needs Resolution.
- **Reject / defer** are case-routing states.

**Foundation reuse.** Matching/promotion reuse the existing record-resolution + promote-on-approval mechanics; POS generalizes the *surface*, not the mechanics. Confidence + evidence drive the recommendation; the operator decides (BOS recommends, operator approves).

## Outcome

**Concept.** An Outcome is *the operational result to execute once approved* — the answer to "what happens when approved?" (POS-05).

**Foundation.** An Outcome is an **ordered recipe** whose steps **resolve to existing executors** (POS-F01 Foundation 5): record steps → `executeAdminAction` handlers; workflow/lifecycle steps → `emitEvent` → `executeWorkflowRun`; communication steps → Communications enqueue; document steps → the Documents generation path. The **outcome sequencer** orders and runs steps; it executes nothing itself.

**Outcome taxonomy (POS-05) → foundation:**

| Outcome category | Executor foundation |
|------------------|---------------------|
| Record (create lead, create child, update person, create subsidy/billing profile) | `executeAdminAction` handlers; CRM/Billing own results |
| Workflow (start lifecycle, move work unit, start reimbursement/enrollment workflow, create task) | `emitEvent` → `executeWorkflowRun` |
| Communication (send packet, request info, send confirmation, notify) | Communications canonical enqueue |
| Document (generate PDF, completed state form, attach to record, create contract record) | Documents generation path (Documents own the artifact) |
| Review (assign, escalate, request resolution, defer) | POS-internal case routing |

**Approval-only V1 (locked, in the foundation).**
- Every recipe produces **proposed** outcomes; **nothing executes before operator approval** (the Action Workspace Execute step is the structural gate).
- The sequencer's contract is "**execute an approved recipe**," separating *what runs* (recipe) from *who approved* (gate). A future automation layer can supply approval programmatically **without changing the foundation** — that is how the foundation "supports future automation without assuming it."
- Execution is **idempotent** (mirroring `createGeneratedPdfForSubmission`) and honors the existing **preflight requirement guard**; each executed step yields an **Operational Result** in case history; on completion the case opens the created record drawer (`onCreated`).

### Confidence threshold model (locked) — where confidence belongs

Confidence is a **POS processing-policy concern**, layered *above* the shared data model — never inside `field_definitions`.

Resolution order (most general → most specific):

1. **Platform defaults** — baseline thresholds separating high-confidence / needs-review / needs-resolution.
2. **Organization overrides** — an org tightens/loosens thresholds (sits with org configuration, alongside other org policies).
3. **Recipe overrides** — a specific outcome recipe / source type sets its own thresholds (e.g. subsidy contracts demand higher confidence than a simple form).
4. **Field-level overrides (future)** — a threshold keyed to a specific `field_key` (e.g. always confirm "Case number"). This is the only tier that touches the field identity, and only by reference (`field_key`), keeping the registry clean.

Conceptually, confidence drives **case lifecycle routing** (whether a case lands in Needs Review vs Needs Resolution vs Ready) and **per-field review emphasis** (which extracted values get flagged), not field structure. The model is a resolution chain, not a new store.

## Vocabulary (locked)

User-facing POS vocabulary is fixed: **Sources, Processing Cases, Review, Resolution, Outcomes.** No new user-facing concept is built around "intake." Existing internal/legacy naming (intake rules, linkage helpers) may persist beneath POS language and migrate naturally; this gate renames nothing in code and changes no behavior.

## How the five objects compose (foundation view)

```
Source(s)  ──reference──▶  Processing Case  (envelope on shared data model)
 (existing records)             │  lifecycle: Received → … → Archived
                                ├── Extraction   → proposed values on field_definitions (+ confidence)
                                ├── Review        → confirm understanding (generalized packet review)
                                ├── Resolution    → Match against canonical CRM records (generalized intake/linkage)
                                └── Outcome (recipe) ─approval gate─▶ existing executors
                                        ├─ executeAdminAction        (record)
                                        ├─ emitEvent/executeWorkflowRun (workflow/lifecycle)
                                        ├─ Communications enqueue     (communication)
                                        └─ Documents generation       (document)
                                                    └──▶ Operational Results on canonical records
```

## Foundation guarantees

- **One primary object** (Processing Case); related sources never become competing primaries.
- **Records own truth**; the case references and proposes; canonical writes only via approved outcomes.
- **Shared data model**; all fields are `field_definitions`; no POS field store.
- **Approval-only V1**; the gate is structural; automation is a future layer above the same foundation.
- **Documents boundary preserved**; POS triggers document outcomes, Documents own the artifacts.
- **BOS recommends across the lifecycle**, right-rail only (POS-F01 Foundation 7).

These guarantees are exactly the frozen doctrine and architecture, expressed as a foundation — nothing here contradicts; it only grounds.
