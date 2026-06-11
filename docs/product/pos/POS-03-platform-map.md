# POS-03 — Platform Map

> **Status:** Planning artifact (frozen navigation + ownership v1, draft). **Not implementation.**
> No routes, no code, no schema. This freezes *what POS navigation areas exist* and *who owns what* across pillars.
> Inherits from **POS-01** and **POS-02**. Branch: `pos-planning-v1`. Author gate: **Doctrine Gate**.

## Purpose

Freeze the POS navigation areas and, more importantly, the **ownership boundaries** between POS and the other pillars (Communications, CRM, Lifecycle, Documents, BOS). Boundaries are the load-bearing part of this document — they prevent POS from re-implementing email, owning CRM identity, or absorbing BOS.

## POS navigation areas

POS is presented as a pillar in the Alloy left nav, with these areas. (Names are product navigation labels, not routes.)

| Area | What it is |
|------|-----------|
| **Processing** | Command center for active information work. The default POS landing. |
| **Review** | Human review queue for submissions, packets, documents, and extraction results. |
| **Linkage** | Workspace for matching records and resolving ambiguity. |
| **Forms** | Library of published forms and form templates. |
| **Packets** | Library and builder for packet experiences. |
| **Documents** | Generated documents, document templates, recreated state forms, and processed documents. |
| **Settings** | Rules, mappings, outcomes, routing, requirement policies, and approval behavior. |

### Processing

The command center for active Processing Cases. It must feel like Alloy **Work Units**, not a generic SaaS dashboard: operational queues, operational cards, clear statuses, the BOS right rail, Bend Pine status accents, and the Midnight Forge shell. Processing surfaces cases by lifecycle state (Needs Review, Needs Resolution, Ready, Completed), by source type, and by recent activity. It is where operators spend their day.

### Review

The human review queue for completed forms, packets, documents, and extraction results. Review is about *confirming what the system understood* — submitted data, changes to records, missing information, included documents — and approving or sending back. Review inherits the packet review UX already shipping in Forms (see `docs/product/documents-and-forms.md`), reframed under POS.

### Linkage

The workspace for **Match** and **Resolution**. Given an incoming source, Linkage shows candidate family/person/child/customer/provider/vendor matches with confidence and evidence, and lets the operator confirm a link, create a new record, request information, or defer. BOS explains its matches in the right rail.

### Forms

Library of published forms and form templates. Forms are *sources*, authored in the Document Composer (POS-04). This area is a library/management surface, not a survey builder.

### Packets

Library and builder for **packet experiences** — multi-step, multi-document recipient flows. Packets are authored in the Packet Builder (POS-04) and delivered through Communications.

### Documents

Library of generated documents, document templates, recreated state forms, and processed documents. This is the *artifact* side of the forms/documents shared foundation (POS-01).

### Settings

Configuration for POS behavior: rules, field/document mappings, outcome recipes, routing, requirement policies, and approval behavior. This is **configuration, not a separate workspace** — it follows Alloy's config-not-code, four-plane Settings model (`docs/system/configuration-system.md`). Outcome Configuration (POS-04, POS-05) lives here, not as a standalone "outcomes workspace."

## Ownership boundaries (the important part)

Each row states the boundary precisely. "Owns" = canonical authority. "Consumes/Proposes" = reads or proposes against, never owns.

### What POS owns

- The **Processing Case** and its lifecycle (Received → Archived).
- **Sources** as evidence: forms, packets, uploads, attachments-as-sources, OCR/extraction results, contracts, recreated state forms.
- **Extraction**, **Match candidates**, **Resolution**, and **Outcome preparation/approval** surfaces.
- The **Processing**, **Review**, **Linkage** workspaces and the **Forms / Packets / Documents** libraries as POS presents them.
- POS **Settings**: processing rules, mappings, outcome recipes, routing, requirement policies, approval behavior.

### What Communications owns (POS consumes)

- Email **receipt, threads, messages, delivery, conversation context**.
- The canonical outbound enqueue → worker → provider path.

POS **consumes** information from Communications: when a message/attachment needs processing, POS opens a Processing Case from it. POS **executes communication outcomes** (send packet, request missing info, send confirmation) *through* Communications' canonical enqueue — never a parallel mailer. Example: email arrives with a subsidy PDF → **Communications owns the email** → **POS creates a Processing Case from the attachment**.

### What CRM owns (POS proposes)

- Canonical relationship records: families/households, `persons`, `customers`, `customer_persons`, leads, organizations, opportunities, child enrollment members.

POS **reads** these to build Matches and **proposes** changes via Outcomes (create lead, create child, update person, etc.). Confirming a Match or creating a new record produces a **CRM-owned** record. POS never owns CRM identity.

### What Lifecycle owns (POS triggers)

- Lifecycles, **work units**, queue definitions, stages, statuses, and subject grain (case vs candidate).

POS **triggers** progression via Outcomes (start enrollment lifecycle, move work unit, create task). The **Processing Case lifecycle is POS-internal** and is not a Lifecycle stage or CRM status.

### What Documents owns (POS produces/consumes)

- File records and generated artifacts (generated PDFs, completed state forms, contract records, document templates).

POS **consumes** uploaded documents as Sources and **produces** document Outcomes (generate PDF, attach to record, create completed state form, create contract record). The Documents library surfaces these; POS governs the processing around them.

### What BOS owns (POS hosts in the right rail)

- The orchestration intelligence itself: summaries, classification, extraction assists, match recommendations, confidence, suggested actions, explanations, missing-information detection, approval prompts.

POS **hosts** BOS in the **right rail** of every POS workspace. BOS **proposes**; operators approve; BOS never silently executes (POS-01). BOS is not moved to the center and is not a separate workspace.

## Boundary table (freeze)

| Concern | Owner | POS relationship |
|---------|-------|------------------|
| Processing Case + its lifecycle | **POS** | Owns |
| Source evidence (forms, uploads, attachments-as-sources, OCR, contracts, state forms) | **POS** | Owns |
| Extraction / Match / Resolution / Outcome surfaces | **POS** | Owns |
| Email receipt, threads, delivery | **Communications** | Consumes; executes comms outcomes through it |
| Canonical people/customers/opportunities/children | **CRM** | Reads; proposes changes via outcomes |
| Lifecycles, work units, stages, queues, grain | **Lifecycle** | Triggers progression via outcomes |
| Document records + generated artifacts | **Documents** | Consumes as source; produces as outcome |
| Orchestration intelligence (recommend/explain/prepare) | **BOS** | Hosts in right rail; approves before execute |
| Workflow definitions + execution | **Platform** | Starts via approved outcomes |

## Navigation doctrine inheritance

POS adopts existing Alloy navigation doctrine without inventing a parallel one:

- **Left nav**: POS appears as a pillar with the seven areas above, consistent with current nav patterns.
- **Workspace primary, BOS right rail**: every POS area keeps the workspace center and BOS on the right (POS-01).
- **Settings is config, not workspace**: POS Settings follows the four-plane Settings model; Outcome Configuration is a Settings surface.
- **No duplication of locked doctrine**: routing, navigation, drawer, work-unit-layout, and queue-record doctrines are inherited from `docs/system/*`, not restated here.
