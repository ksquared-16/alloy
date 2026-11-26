# POS-01 — Doctrine Lock

> **Status:** Planning artifact (frozen doctrine v1, draft). **Not implementation.**
> No schema, no migrations, no APIs, no runtime behavior. This document freezes *product doctrine* for the Process Operating System (POS).
> Branch: `pos-planning-v1`. Sprint: POS Planning. Author gate: **Doctrine Gate**.

## Purpose

Freeze what POS **is**, what POS **is not**, and how POS relates to the rest of the Alloy platform. Every later POS document (object model, platform map, UX, outcomes, execution) inherits from this lock. If a downstream decision contradicts this file, this file wins until it is explicitly amended at the Doctrine Gate.

## Program name

**POS = Process Operating System.**

POS is **not** "Forms V2." Forms are one input channel among many. POS is Alloy's operating layer for turning information into operational outcomes.

## One-line doctrine

> Information enters Alloy once; POS does as much work as possible; operators approve outcomes; records own truth.

This mirrors the existing platform split (see `docs/product/bos-foundation.md`): **the platform owns truth, authorization, workflows, ledger semantics, and execution; assistive intelligence proposes within guardrails.** POS is where that split is exercised on *incoming information*.

## What POS is

POS is Alloy's operating layer that manages **information becoming operational outcomes**. It owns the lifecycle of incoming information from the moment it enters Alloy to the moment an approved outcome has executed.

POS owns, as product surfaces:

- forms, packets, documents, contracts, email attachments, uploads
- OCR, extraction, classification, validation
- review, linkage, resolution
- outcome approval and workflow triggering

The central object is the **Processing Case**: information that has entered Alloy and requires review, resolution, or operational action. The source (a form, a PDF, an email attachment) is *evidence and context*; the Processing Case is *the work*.

## What POS is not

- **POS is not a form builder.** Do not design around "responses." Do not imitate JotForm, Typeform, Google Forms, Cognito Forms, SurveyMonkey, or HubSpot lead capture. Alloy POS is operational, not survey software.
- **POS is not a separate AI workspace.** BOS stays in the right rail (see below). The workspace remains primary.
- **POS does not own truth.** Forms, packets, PDFs, contracts, and emails are *sources of information*. Records own truth.
- **POS does not own email.** Communications owns email. POS consumes information from Communications when an attachment or message needs processing.
- **POS is not an "intake" product.** See the no-intake-language doctrine below.

## Records own truth

Forms and documents do not own truth. **Records own truth.**

Forms, packets, PDFs, and emails are *sources of information*. A Processing Case turns those sources into operational changes against canonical records (`persons`, `customers`, `customer_persons`, `opportunities`, child enrollment members, billing/subsidy profiles, and the like). Until an operator approves an outcome, source-provided values are **proposals**, not truth — consistent with the existing trust boundary in `docs/product/documents-and-forms.md` (public values are proposals in submission payloads until promoted).

POS never silently overwrites a canonical field from an arbitrary source. Promotion of a value into a record is an **outcome**, and outcomes require approval (V1).

## Operator approval doctrine

V1 approval doctrine: **BOS recommends, operators approve.**

BOS may summarize, classify, extract, match, recommend, prepare actions, explain, and surface missing information. BOS **may not** silently execute operational changes in V1. Every prepared outcome requires operator approval before execution. This is the same human-in-the-loop, configuration-not-execution posture already locked for BOS in `docs/product/bos-foundation.md`, applied to incoming information.

## No-intake-language doctrine

Do **not** use "intake" as the product name or the main organizing concept of POS.

- The organizing concept is the **Processing Case**, not "an intake."
- Existing code, rules, and docs use "intake" (e.g. forms intake outcome rules). Those remain valid as *implementation details and legacy rules* until they are migrated under POS language. POS-01 does not delete them; it reframes the product vocabulary above them.
- New POS surfaces, navigation, and copy use **Processing**, **Processing Case**, **Source**, **Review**, **Linkage**, **Resolution**, **Outcome** — never "intake" as a top-level product concept.

This is a deliberate divergence from current doc vocabulary and is the single most likely place for drift. It is called out again in the open-questions section of the package README.

## Relationship to platform pillars

Alloy has major operating pillars. POS is one of them, and its boundaries with the others are doctrine.

### CRM — manages relationships

CRM owns families, people, organizations, leads, customers — the canonical relationship records. POS **reads** CRM records to find matches and **proposes** changes to them via outcomes. POS never owns CRM identity; it proposes against it. Confirming a match or creating a new record is a POS resolution that results in a CRM-owned record.

### Lifecycle — manages progression

Lifecycle owns stages, work units, statuses, and subject grain (case vs child/candidate). POS **triggers** lifecycle progression as an outcome ("start enrollment lifecycle," "move work unit") but does not own stage definitions. The Processing Case lifecycle (Received → … → Completed) is POS-internal and is **not** a CRM/Lifecycle stage field.

### Communications — manages conversations

Communications owns email receipt, threads, messages, delivery, and conversation context. When an email arrives with, say, a subsidy PDF, **Communications owns the email**; POS creates a Processing Case **from the attachment**. POS consumes from Communications; it never re-implements email. Communication outcomes (send packet, request missing information, send confirmation) are *executed through* Communications' canonical enqueue, not a parallel mailer.

### BOS — orchestration intelligence

BOS (Business Orchestration System) is Alloy's orchestration intelligence layer. In POS, **BOS is the canonical right-side operational intelligence rail.** BOS participates through recommendations, confidence, suggested actions, explanations, missing-information detection, approval prompts, and summaries. BOS is not merely a chat sidebar and is not a separate workspace — it is an operational participant that lives in the right rail while the workspace stays primary.

### Forms — one input channel

Forms are a *source* type, not the product. A form submission becomes a Processing Case like any other source. Forms share one foundation with documents (below).

### Documents — generated and processed artifacts

Documents owns file records and generated artifacts (generated PDFs, completed state forms, contract records). POS *produces* document outcomes and *consumes* uploaded documents as sources. The Documents library surfaces generated, template, and processed documents; POS governs the processing that creates or consumes them.

## Forms and documents share one foundation

A field should not be duplicated because it appears in a form, a packet, a state form, a generated document, a subsidy contract, or a PDF recreation. **Forms and documents are surfaces over shared operational information.** POS treats "form fields" and "document fields" as the same underlying operational information expressed on different surfaces. (Schema realization of this is explicitly out of scope here — see POS-02 for object language only.)

## Doctrine summary (freeze table)

| Doctrine | Statement |
|----------|-----------|
| **Program** | POS = Process Operating System; not Forms V2 |
| **Primary object** | Processing Case |
| **Enter once** | Information enters Alloy once; the system then does as much work as possible |
| **Truth** | Records own truth; sources are proposals until promoted |
| **Approval** | BOS recommends; operators approve; no silent execution in V1 |
| **BOS placement** | Right rail, always; workspace stays primary |
| **Email** | Communications owns email; POS consumes attachments/messages |
| **Forms** | One input channel; share one foundation with documents |
| **Language** | No "intake" as product name or main concept |
| **Not** | Not a form builder; not survey software; not a separate AI workspace |

## Change control

This doctrine is frozen at the **Doctrine Gate**. During later implementation, doctrine does not change without explicit escalation and re-acceptance at the gate (see POS-06). Downstream documents may *elaborate* but may not *contradict* this lock.
