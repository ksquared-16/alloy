# POS-02 — Object Model (Product-Level)

> **Status:** Planning artifact (frozen object language v1, draft). **Not implementation.**
> **No database design. No schema. No tables. No columns. No APIs.** This is *product object language* only — the words we use to talk about POS work.
> Inherits from **POS-01**. Branch: `pos-planning-v1`. Author gate: **Doctrine Gate**.

## Purpose

Freeze the product-level objects so that everyone — operators, product, BOS, and engineering — uses the same nouns. These are conceptual objects, not entities. Mapping them to Supabase tables happens later, at the Foundation Gate, and is explicitly out of scope here.

## The objects

POS has eight product-level objects:

1. **Source**
2. **Processing Case**
3. **Extraction**
4. **Match**
5. **Resolution**
6. **Outcome**
7. **Workflow**
8. **Operational Result**

One sentence each:

| Object | One-line meaning |
|--------|------------------|
| **Source** | Where the information came from (the evidence). |
| **Processing Case** | The unit of operational work created from a source. |
| **Extraction** | The structured information detected or entered from the source. |
| **Match** | A potential link between extracted information and an existing record. |
| **Resolution** | The human decision that settles ambiguity. |
| **Outcome** | The operational result to execute once approved. |
| **Workflow** | The downstream process started by an approved outcome. |
| **Operational Result** | The realized, recorded change after an outcome executes. |

## Source

**Where the information came from.** A Source carries evidence and context; it does not carry truth.

Source kinds (V1 product taxonomy):

- form submission
- packet submission
- email attachment
- uploaded PDF
- uploaded image
- contract
- state form
- OCR result
- imported file
- BOS-recreated form

The source kind matters for **evidence, provenance, and review affordances** (e.g. an email attachment shows the originating thread; a scanned PDF shows the page preview and OCR confidence). It does **not** change the shape of the work — that is the Processing Case's job.

Doctrine: *the source matters for evidence and context; the Processing Case matters for work.*

## Processing Case

**The operational case created from a source.** This is the central POS object and the unit operators act on.

A Processing Case represents information that has entered Alloy and requires review, resolution, or operational action. It holds:

- a reference to its **Source(s)** (one case may consolidate evidence from more than one source)
- the current **lifecycle state** (see below)
- the **Extraction(s)** detected or entered
- candidate **Match(es)**
- pending and settled **Resolution(s)**
- proposed and approved **Outcome(s)**
- a **history** of what happened and who did it

A Processing Case is *subject-aware*: it knows whether the work is about a family/case or about a specific child/person/customer, consistent with Alloy's case-vs-candidate grain.

### Processing Case lifecycle

This is the **planning lifecycle** for POS work. It is internal to POS and is **not** a CRM status or a Lifecycle stage.

| State | Meaning |
|-------|---------|
| **Received** | Information entered Alloy. A Source exists; a Processing Case has been opened. |
| **Processing** | BOS and/or deterministic processors are extracting, classifying, validating, or matching. |
| **Needs Review** | Human review required (e.g. confirm extraction, confirm a high-confidence match). |
| **Needs Resolution** | Ambiguity, conflict, missing information, or a possible duplicate/linkage issue requires a human decision. |
| **Ready** | BOS has prepared a proposed outcome; the operator can approve. |
| **Completed** | An approved outcome has executed; an Operational Result exists. |
| **Archived** | Historical; no active work. |

States are operational, not strictly linear: a case in **Ready** can drop back to **Needs Resolution** if new conflict appears; a **Completed** case can spawn follow-on cases. The lifecycle describes *where the work is*, not a rigid pipeline.

## Extraction

**Structured information detected or entered.** An Extraction is the machine- or human-produced structured reading of a Source: fields, values, and the confidence attached to each.

- Extractions are **proposals**, never truth (POS-01 trust boundary).
- An Extraction may be produced deterministically (known form mapping), by BOS (OCR/parse on an arbitrary PDF), or by a human typing values during review.
- Extractions carry **confidence** and **provenance** (which source, which page/field) so review and linkage can reason about them.

## Match

**Potential record linkage.** A Match is a candidate connection between an Extraction and an existing canonical record.

Match targets (V1):

- family / household
- person
- child
- customer
- provider
- vendor

A Match carries confidence and **evidence** (why this match — shared name, address, recent activity, prior linkage). A Processing Case may have several candidate Matches per target; choosing among them is a Resolution.

## Resolution

**The human decision.** A Resolution settles ambiguity on a Processing Case. Resolution choices (V1):

- **confirm match** — link to an existing record
- **create new record** — no acceptable match; create the canonical record
- **request missing information** — the source is incomplete; ask the family/contact (via Communications)
- **reject source** — the source is invalid/irrelevant; do not process
- **defer** — postpone the decision

A Resolution is the gate between *understanding* the information (Extraction, Match) and *acting* on it (Outcome). Resolutions are always attributed to a human operator in V1.

## Outcome

**The operational result to execute.** An Outcome is the concrete change POS will make once approved — create a record, start a workflow, send a packet, generate a document, etc. The full taxonomy and recipes live in **POS-05**.

Doctrine: *a source has value only if it can produce an operational result.* An Outcome is BOS-prepared and operator-approved (V1). Approving an Outcome is the act that moves a case toward **Completed**.

## Workflow

**The downstream process started by an approved outcome.** When an Outcome executes, it may start or advance an Alloy Workflow (the platform's existing event/workflow spine) — e.g. an enrollment workflow, a reimbursement workflow, a lifecycle progression. POS **starts** workflows through approved outcomes; it does not own workflow definitions or execution semantics (those belong to the platform).

## Operational Result

**The realized change.** Once an Outcome executes, the resulting record creation/update, workflow start, communication send, or document generation is the Operational Result. It is what makes the work *real* and is the thing the Processing Case's history points at. Operational Results live on canonical records — *records own truth* (POS-01).

## Object relationships (conceptual)

```
Source ──(opens)──▶ Processing Case
                        │
                        ├── Extraction(s)        (structured reading; proposals + confidence)
                        ├── Match(es)            (candidate links to canonical records)
                        ├── Resolution(s)        (human decisions that settle ambiguity)
                        └── Outcome(s)           (BOS-prepared, operator-approved)
                                  │
                                  ├──▶ Workflow            (downstream process started)
                                  └──▶ Operational Result  (realized change on a record)
```

Read as: a Source opens a Processing Case; the case accrues Extractions and Matches; humans settle them with Resolutions; approved Outcomes execute, starting Workflows and producing Operational Results against canonical records.

## Explicitly out of scope (here)

- Table names, columns, foreign keys, JSON shapes.
- Whether a Processing Case is one table or several.
- How Sources map to existing `form_submissions`, `documents`, `communication_messages`, or `form_packet_sessions`.
- API routes or event types.

All of the above is decided later, at the **Foundation Gate**, against this object language — not the other way around.
