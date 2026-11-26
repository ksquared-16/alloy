# POS-08 — Visual Vision Package

> **Status:** Planning artifact — **final UX/experience definition before the Architecture Gate.** Draft.
> **Not implementation.** No schema, no migrations, no APIs, no implementation plans, no code.
> These are **future-state product definitions** — what POS looks and feels like when fully realized inside Alloy ~18 months out. They are not wireframes and not implementation designs.
> Inherits from **POS-01 … POS-07**. Branch: `pos-planning-v1`. Author gate: **UX Gate → Architecture Gate readiness**.

## How to read this document

POS-04 defined *what screens exist and how they behave*. POS-07 defined *how to generate Alloy-native mockups*. **POS-08 is the synthesis**: the canonical visual-and-experiential definition of POS at maturity, screen by screen, that the team accepts as the last UX artifact before architecture begins.

Each screen is specified with a fixed ten-part template:

- **Purpose** — why the screen exists
- **User goal** — the operator's job-to-be-done
- **Layout** — shell, canvas, right rail composition
- **Hierarchy** — what dominates, what recedes, reading order
- **BOS behavior** — what BOS does here, in the right rail
- **Primary actions** — the few real actions
- **Empty state** — first-run / nothing-here
- **Success state** — the "it worked" moment
- **Conflict state** — ambiguity / failure / blocked
- **Visual doctrine notes** — the Alloy-native rules this screen must obey

## The hero object

POS has one hero object, equivalent across the pillars:

| Pillar | Hero object |
|--------|-------------|
| CRM | Lead |
| Lifecycle | Work Unit |
| Communications | Conversation |
| **POS** | **Processing Case** |

Every screen in this package is, ultimately, in service of moving a Processing Case from *received information* to an *approved operational outcome*. When a layout decision is ambiguous, resolve it in favor of making the Processing Case and its forward motion clearer.

## Visual doctrine (binding on every screen)

- **Shell:** Midnight Forge — dark app frame (left nav + top bar); the work surface is light. Reuse the existing workspace shell and navigation model.
- **Canvas:** white workspace cards on a near-white neutral field; soft operational borders, gentle radius, restrained shadow. Calm and premium.
- **Accent:** **Bend Pine** (deep green) is the primary accent — primary confirm actions, active nav, selected state, status. **Pine Mist** (pale green) for selected rows, ready/good-to-go fills, BOS success ticks.
- **BOS:** the existing BOS right rail, existing BOS visual identity, existing BOS interaction model. BOS is always in the right rail; it never becomes the center and never a separate workspace.
- **Operational surfaces:** reuse Work Unit queues, Drawers, Action Workspace, and Lifecycle patterns — POS is assembled from Alloy's existing operational vocabulary, not a new design language.
- **Typography:** Inter / DM Sans; tight operational hierarchy; confidence and counts legible at a glance.

**Explicitly avoid:** heavy blue; generic analytics dashboards; marketing-software aesthetics; survey-builder aesthetics; widget marketplaces; drag-and-drop form-builder metaphors as the hero; CRM-style record tables everywhere. POS should feel like **Alloy 18 months in the future — not Atlassian, Monday, HubSpot, or Salesforce.**

**Recurring sample content** (use consistently): tenant **Little Oaks Academy**; operator **Kelly Smith**; hero family **The Smith Family** — **Sarah Smith** (parent), **Emma Smith** (child, DOB 06/14/2020), case **#4455667**; hero source **CCDF Subsidy Contract (State of Illinois)**, received via email attachment, BOS confidence **94%**; other inflight: Johnson — Enrollment Packet, Garcia — Subsidy Contract, Miller — Registration Form, Playground Incident Report.

---

## Screen 01 — Processing Workspace

- **Purpose:** The operational command center for POS. It answers **"What needs my attention?"** — never "What forms exist?"
- **User goal:** Walk in, see the most important Processing Cases, and open the right one without thinking about channels or file types.
- **Layout:** Midnight Forge shell, POS left nav (Processing active). Top: "Processing" title with a quiet row of state counters — **Needs Review 23 · Processing 18 · Needs Resolution 12 · Ready 9 · Completed 156**. Center: one dense operational queue (Work Unit feel) with filter tabs (All · Needs Review · Processing · Linkage · Ready · Completed) and Sort. Right: BOS rail with an at-a-glance summary and top recommendations.
- **Hierarchy:** The **queue is the hero**, not the counters. Counters are orientation, not a dashboard. Each row leads with a source-type glyph and case title; status pill and BOS confidence are secondary; timestamp is tertiary. Reading order: counters → active filter → top rows → BOS summary.
- **BOS behavior:** Rail header "BOS Assistant — Operational Intelligence"; "I found 23 items that need your review," a short prioritized list (high-confidence matches, missing key info, ready to approve), then **Top recommendations** cards ("Approve Smith Family Subsidy Contract") with "View all (5)." Recommends; never auto-acts.
- **Primary actions:** Open case · New (manual upload/source) · filter · sort · save view.
- **Empty state:** "No active processing. New information will appear here as it enters Alloy." with a New action and a quiet link to connect sources. No illustration.
- **Success state:** A case just approved drops out of the active queue with a brief Pine Mist confirmation row ("Smith Family — Subsidy Contract · Completed") and the BOS rail posts a one-line receipt.
- **Conflict state:** An ingestion failure surfaces as a restrained banner above the queue ("3 sources failed to import — review"), not a red wall; affected rows carry an attention dot.
- **Visual doctrine notes:** Reads as a Work Unit workspace. No charts, no KPI donuts, no blue CTAs. Status in Bend Pine; selection in Pine Mist.

## Screen 02 — Processing Case (Smith Family — Subsidy Contract)

> The most important screen in POS. It must make the doctrine visible: **records own truth; BOS recommends; the operator approves.**

- **Purpose:** Single-case command surface — understand the case and move it to an approved outcome.
- **User goal:** Verify what came in, confirm who it's about, and approve (or adjust) what will happen.
- **Layout:** Back-link "Back to Processing." Header: "Smith Family — CCDF Contract" with **Subsidy Contract** + **Needs Review** chips and "Received 2m ago via Email." Tabs: **Overview · Extracted Data · Documents · History.** Center canvas carries, in order: **source preview** (CCDF PDF, page 1/2, zoom), **extracted information** (Family Information + Authorization sections with per-field confidence), **linked records** (matched Smith Family, Emma Smith chips), **proposed outcomes** (ordered steps), and an **activity timeline.** Right rail: BOS confidence, findings, recommendations, approval actions.
- **Hierarchy:** Source preview and extracted information share the top of the canvas (evidence beside reading). Proposed outcomes sit directly beneath, because the operator's decision is about *what will happen*. The right rail's **Approve All** is the single strongest element on the screen. Reading order: header state → preview/extraction → linked records → proposed outcomes → BOS confidence/approve.
- **BOS behavior:** "**Confidence 94% — High.** BOS has extracted the key information and found likely matches." **Likely matches:** Family → The Smith Family (95%), Child → Emma Smith — each with "view match." **Recommended actions / proposed outcome:** Create Subsidy Profile → Create Billing Setup → Link to Emma Smith → Start Reimbursement Workflow → Send Confirmation, with a "This outcome looks good" readiness check and estimated impact ("creates 2 records, starts 1 workflow, sends 1 email"). **Approve All** (Bend Pine) / **Review Manually** (quiet) / Reject.
- **Primary actions:** Approve all · approve subset · edit a value/step · reject · assign.
- **Empty state:** Not applicable (a case always has a source); individual tabs may be empty (e.g. Documents: "No documents attached yet").
- **Success state — Ready for approval:** All open items cleared; proposed-outcome steps validate green (Pine Mist ticks); the case badge reads **Ready**; **Approve All** is fully enabled and is the visual focus. On approval, the rail flips to a receipt of created records/started workflow and the case moves to **Completed.**
- **Conflict states:**
  - **Low confidence:** confidence chip reads, e.g., **61% — Review needed**; low-confidence fields are flagged inline ("couldn't read — enter manually"); Approve All is de-emphasized in favor of Review Manually.
  - **Conflict:** an extracted value disagrees with the existing record (e.g. address) — both values shown paired inline with a "which is correct?" affordance; the case sits in **Needs Resolution** and outcomes are blocked until resolved.
- **Visual doctrine notes:** Extracted values must read as **proposals** — editable, confidence-tagged — never as a saved web form. Bend Pine reserved for Approve. PDF preview in a soft-bordered viewer. No blue.

## Screen 03 — Document Composer

- **Purpose:** Unified authoring for forms, documents, state forms, public forms, and internal forms — **document-first, not form-builder-first.**
- **User goal:** Author a source/document the way you'd write a structured document, with help, not by assembling widgets.
- **Layout:** Back-link "Back to Documents." Title "New State Registration Form" + **Draft**; tabs **Builder · Settings · Mappings · Preview · History**; Save / Actions / **Publish.** Center: a real document canvas with named sections ("Child Care Facility Registration," "Section 1 — Facility Information," "Section 2 — Director Information") and inline fields. A supporting **Add Fields** rail (Basic: Short/Long Text, Number, Date, Dropdown, Checkbox; Advanced: Section, Table, File Upload, Signature, Divider) assists the document; it is not the hero. Right: **Form Properties** (title, description, category, version, status, Requires Signature) and the BOS rail.
- **Hierarchy:** The **document** dominates the center with generous margins and document typography. The field palette is quiet and lateral. Properties and BOS sit right. Reading order: document title → sections/fields → properties → BOS suggestions.
- **BOS behavior:** "This form looks complete" checklist (all required fields present, section flow correct, data mappings valid, signature field included); **Suggestions** ("Add field: Capacity — recommended for state reporting," "Add field: License Expiration — helps with renewal tracking") with "Apply Suggestions."
- **Primary actions:** Add section/field · reorder · set properties · toggle signature · save draft · publish.
- **Empty state:** A blank document with a single prompt ("Start your document — or pick a template") and a template picker. No widget grid.
- **Success state:** On Publish, a quiet confirmation ("Published v1") and a status flip Draft → Published; the document is now available in Forms Library.
- **Conflict state:** Invalid structure (e.g., a required signature missing where the form kind needs one, or a duplicate field that already exists in the shared foundation) flagged inline with a "reuse existing field?" affordance; Publish is blocked until cleared, with the failing items listed in the BOS checklist.
- **Visual doctrine notes:** Notion/Google-Docs mental model, Alloy-native — not JotForm/Cognito. No drag-a-widget hero, no survey chrome. Bend Pine Publish.

## Screen 04 — Packet Builder

- **Purpose:** Compose multi-step **packet experiences** (enrollment-focused) that recipients complete.
- **User goal:** Assemble the right documents in the right order, set completion rules, preview as the family, and publish/share.
- **Layout:** Back-link "Back to Packets." Title "New Enrollment Packet" + **Draft**; tabs **Builder · Settings · Recipients · Preview · History**; Save / Actions / **Publish.** Three columns: **Packet Contents** (reorderable: Welcome Letter, Enrollment Form, Health Information Form, Immunization Record, Parent Agreement, Tuition Agreement) · **Packet Preview** (a warm "Welcome to Little Oaks Academy!" cover with the pine-tree mark) · **Packet Settings** (Name, Description, Visibility, Validity, Requires Signature, Due Date, Reminders).
- **Hierarchy:** The **contents list** and the **live recipient preview** share focus — the operator curates on the left, sees the family's experience in the middle. Settings and BOS recede right. Reading order: contents → preview → settings/requirements → BOS.
- **BOS behavior:** "This packet is ready" checklist (recommended documents included, recommended order applied, signature required, due date set); **Recommendations** ("Add: Emergency Contact Form — recommended by best practices," "Add: Photo Release Form — commonly used by providers") with "Add Recommended Items."
- **Primary actions:** Add/remove item · reorder · set completion + document requirements · set recipients · set due date/reminders · preview as recipient · publish · copy share link.
- **Empty state:** "Add the first item to your packet" with a quiet template option; the preview shows the branded cover awaiting content.
- **Success state:** On Publish, the share link activates with a confirmation; Recipients tab shows ready/incomplete per person.
- **Conflict state:** A required document missing for the packet's purpose, or a recipient with no deliverable channel ("no email/phone on file — resolve via CRM"), is flagged; Publish blocked until resolved.
- **Visual doctrine notes:** The preview is a real recipient experience, warm but operational (Pine Mist / Bend Pine, pine mark). Not a marketing email-template editor. Delivered through Communications.

## Screen 05 — Submission Review

- **Purpose:** Review completed information (forms/packets/documents), see the record impact, and approve or request more.
- **User goal:** Confirm a submission is complete and correct, understand what it will change, and approve — or send a precise request back.
- **Layout:** Back-link "Back to Review." Title "Johnson Family — Enrollment Packet" + **Needs Review**; "Submitted 3 days ago." Center: a **Review Steps** checklist (Check Completeness · Review Documents · Verify Data · Confirm Signatures · Approve or Send Back), a **Documents** list with per-item status (Parent Agreement — **Missing Signature**), and a **Change Review / Record Impact** panel showing exactly which record fields this submission proposes to change. Right: BOS summary + request flow.
- **Hierarchy:** The **review-steps checklist** leads (it's the workflow), the **record-impact panel** is the consequential second focus (what truth changes), documents support. Reading order: steps → record impact → documents → BOS attention.
- **BOS behavior:** "1 item requires attention — **Parent Agreement needs signature.**" Next suggested action: "Request signature for Parent Agreement." **Send Request** (Bend Pine, via Communications); **Approve Packet** disabled until the blocker clears.
- **Primary actions:** Approve packet · request correction · send back · send request (signature/info) · open submitted document.
- **Empty state:** "No submissions waiting for review."
- **Success state:** On approval, the record-impact changes are promoted (records own truth), the case moves to Completed, and BOS posts a receipt of what changed.
- **Conflict state:** Missing required step/signature blocks approval; data that disagrees with the existing record is shown paired ("submitted vs current") for an explicit operator choice rather than silent overwrite.
- **Visual doctrine notes:** Missing/blocked uses a restrained amber/clay treatment (not a red wall, no blue). Record impact reads as proposals until approved. Inherits packet review UX, reframed under POS.

## Screen 06 — Linkage & Resolution

- **Purpose:** Resolve who an incoming source is about — family, child, customer, or provider matches — and settle ambiguity.
- **User goal:** Confirm the correct link with confidence and evidence, or create a new record when there's no real match.
- **Layout:** Title "Linkage & Resolution" with "Linkage Needed — 1 item requires resolution." Left: **Incoming Source** (Subsidy Contract: Sarah Smith, Emma Smith, DOB 06/14/2020, 123 Oak St, Naperville IL). Center: **Potential Matches** ranked cards — **The Smith Family 95%**, Sarah Smith 88%, The Smith Family 72% — with target tabs (Family · Child · Customer · Provider). Right: **Selected Match** detail + BOS explanation.
- **Hierarchy:** The **ranked match cards** are the hero; the top recommended match carries a Pine Mist fill and Bend Pine confidence so the eye lands on it first, with evidence one glance away. Reading order: incoming source → ranked matches → selected match + why → decision.
- **BOS behavior:** "**Strong match found. Confidence 95%.** I recommend linking to The Smith Family." "**Why this match?**" — same address, same name, recent activity. **Confirm Link** (Bend Pine) / **Create New Family Instead** (quiet) / Request Information / Defer.
- **Primary actions:** Confirm link · create new record · request information · defer.
- **Empty state:** "No candidate matches — create a new record?" with the create path ready and pre-filled from extraction.
- **Success state:** On Confirm, the source links to the canonical record (CRM-owned), the case advances, and BOS confirms the link with a path back to the record.
- **Conflict state:** **Possible duplicate** — two high-confidence matches ("two strong matches — review both"); conflicting evidence surfaced side by side; the operator must choose, with a late duplicate warning if they instead create new.
- **Visual doctrine notes:** Confidence + evidence presented as the *basis for a human decision*, never as an auto-link. No blue. Drawer-style record detail for the selected match.

## Screen 07 — Outcome Configuration

> Potentially the strategic moat: where information becomes records, workflows, communications, documents, and lifecycle progression. **This is a Settings surface, not a separate workspace.**

- **Purpose:** Configure **what happens after approval** for a source type, as ordered **outcome recipes.**
- **User goal:** Define, for e.g. an Enrollment Form, the chain: Create Lead → Create Child → Start Lifecycle → Send Packet — and trust it will be proposed (and operator-approved) on every matching case.
- **Layout:** Settings context (Settings nav / POS Settings breadcrumb). Title "Subsidy Contract — Outcomes" + **Active** toggle, Save / Test Outcome; tabs **Outcomes · Conditions · Mappings · History.** Center: **Outcome Steps** ordered list (Create Subsidy Profile, Create Billing Setup, Link to Child, Start Reimbursement Workflow, Send Confirmation Email) each with Trigger, Applies To, optional/auto toggles. Right: **Outcome Details** + **Estimated Impact** and the BOS validity check.
- **Hierarchy:** The **ordered recipe** is the hero — a readable top-to-bottom chain that mirrors what operators later approve on the case. Step detail and impact recede right. Reading order: source type + active → recipe steps → step detail/impact → BOS validity.
- **BOS behavior:** "This outcome looks good" checklist (all required steps added, steps in logical order, mappings valid, conditions set correctly); estimated impact per recipe. **Save Outcome** (Bend Pine).
- **Primary actions:** Add step · reorder · set trigger/conditions · map fields · toggle optional/auto · test · save.
- **Empty state:** "No outcome configured for this source type yet" with a "Start from a recommended recipe" option (e.g., the Enrollment Form recipe).
- **Success state:** A saved, **Active** recipe shows a clean validated chain; "Test Outcome" produces a dry-run preview of the impact without executing.
- **Conflict state:** Contradictory/invalid step order, unmapped required target, or conflicting conditions flagged; Save blocked until valid.
- **Visual doctrine notes:** Reads like Alloy Settings (config-not-code), not a builder canvas. Must make clear outcomes are **proposed and operator-approved**, never fired silently. Bend Pine toggles/Save.

## Screen 08 — Forms Library

- **Purpose:** Manage published forms and form templates — ownership, versioning, status.
- **User goal:** Find, open, version, or create a form.
- **Layout:** POS left nav (Forms active). Center: a library of forms/templates as operational cards/rows (name, owner, status, version, last used). Top: New (from template) and search/filter. Right: light BOS (usage insights).
- **Hierarchy:** Library content leads; status and version are the key secondary signals. Not a spreadsheet — operational cards, not a CRM table. Reading order: search/new → form cards → status/version.
- **BOS behavior:** Light — surfaces usage insight and suggested templates; flags a published form with a broken mapping.
- **Primary actions:** Open in Composer · new from template · duplicate · archive · view versions.
- **Empty state:** "No forms yet — create your first" with the Composer entry.
- **Success state:** A newly published form appears with a **Published** status and v1; archived forms move to a quiet Archived filter.
- **Conflict state:** A form with an invalid/broken mapping carries an attention chip in-list and a "fix mappings" path to the Composer.
- **Visual doctrine notes:** Library of operational surfaces, not survey software; minimal table density; Bend Pine for status. No blue.

## Screen 09 — Packet Library

- **Purpose:** Manage published packets and packet templates, with **completion visibility.**
- **User goal:** Find or create a packet and see how outstanding packets are progressing.
- **Layout:** POS left nav (Packets active). Center: packet cards/rows (name, status, recipients out, completion progress) plus templates. Top: New (from template), search/filter. Right: light BOS (recommended structures).
- **Hierarchy:** Packets with **outstanding completion** lead (operational urgency); templates are secondary. Completion progress is the distinctive signal here. Reading order: active packets + completion → templates → BOS.
- **BOS behavior:** Light — recommended packet structures; flags a packet missing a required document or with stalled completions.
- **Primary actions:** Open in Packet Builder · new from template · view completions · archive.
- **Empty state:** "No packets yet — build your first."
- **Success state:** A published packet shows live completion progress (e.g., "4 of 6 families complete") with a Pine Mist progress treatment.
- **Conflict state:** A packet missing a required document, or with expired share links, flagged in-list with a re-mint/fix path.
- **Visual doctrine notes:** Completion shown operationally (progress, not analytics charts). Cards, not tables. Bend Pine/Pine Mist.

## Screen 10 — Documents Library

- **Purpose:** Manage generated documents, document templates, state forms, recreated documents, and processed documents.
- **User goal:** Find a generated/processed document, a template, or a recreated state form — with provenance.
- **Layout:** POS left nav (Documents active). Center: documents grouped (Generated · Templates · State Forms · Recreated · Processed) with provenance (which case/record produced it). Top: search/filter, Create Template, Recreate State Form. Right: light BOS.
- **Hierarchy:** Grouping by kind leads; provenance (linkage to a case/record) is the key secondary signal that distinguishes POS documents from a generic file list. Reading order: group → document + provenance → actions.
- **BOS behavior:** Light — flags documents needing attention (e.g., an orphaned generated document, an unmapped recreation).
- **Primary actions:** Open · download · create template · recreate state form · attach to record.
- **Empty state:** "No documents yet" with the recreate/template entries.
- **Success state:** A document generated from an approved outcome appears under Generated with a link back to its Processing Case and the record it was attached to.
- **Conflict state:** An orphaned generated document (no parent record) or a recreation with unmapped fields is flagged with a resolve path.
- **Visual doctrine notes:** Provenance-first, not a bare file table. Cards/rows with linkage chips. Bend Pine for status.

## Screen 11 — BOS Right Rail States

> A dedicated study of the canonical BOS right rail across the operational lifecycle. Shows how BOS **participates** in the work while never leaving the right rail.

- **Purpose:** Define BOS's visual and interaction states so the rail behaves consistently on every POS screen.
- **User goal:** Always know what BOS is doing, what it recommends, and what it needs from me — without BOS ever taking over the workspace.
- **Layout:** A single narrow right-rail column shown in each state, header "BOS Assistant — Operational Intelligence." The workspace to its left is implied and always primary.
- **Hierarchy:** Within the rail: state label/confidence at top → findings/explanation → recommended action(s) → approval control at the foot. The approval control is the rail's strongest element when present.
- **BOS behavior — the eight states:**
  1. **Idle** — quiet summary of the queue/context ("23 items need review"), no pending recommendation. Neutral.
  2. **Reviewing** — "Reviewing source…" with a calm progress indicator while extracting/classifying.
  3. **Matching** — "Searching for matches…" then ranked candidates forming, confidence emerging.
  4. **Recommending** — a concrete recommendation card with confidence and rationale ("Link to The Smith Family — 95%, Why?").
  5. **Needs Attention** — restrained amber/clay accent; "1 item requires attention — Parent Agreement needs signature," with **Send Request.**
  6. **Ready** — "This outcome looks good" checklist all green (Pine Mist ticks), estimated impact, **Approve All** (Bend Pine).
  7. **Approved** — the moment of approval: button resolves, a brief confirmation pulse.
  8. **Completed** — a **receipt**: "Done — created 2 records, started reimbursement workflow, sent confirmation," with links to the created records.
  - Plus a **degraded** note: when BOS is unavailable the rail collapses to a static summary ("BOS is unavailable; workspace is fully usable") — proving the workspace never depends on the rail.
- **Primary actions:** Per state — open match, send request, approve all/subset, view created records.
- **Empty state:** Idle (above) is effectively the empty state — a calm summary, never a blank rail.
- **Success state:** Ready → Approved → Completed reads as a continuous, legible arc; the receipt is the proof of an Operational Result.
- **Conflict state:** Needs Attention and low-confidence variants use restrained accenting and always offer the corrective action; BOS never blocks the workspace.
- **Visual doctrine notes:** Existing BOS identity and interaction model only — no reinvention. BOS recommends, explains, and prompts for approval; the only "it happened" state (Completed receipt) always follows an operator approval. Never center, never a separate workspace, never silent execution.

---

## Architecture Readiness Assessment

> **This is an assessment, not architecture.** No schema, APIs, migrations, or implementation design appear here. The question answered is narrow: *is POS ready to enter the Architecture Gate?*

### What is frozen (stable inputs to architecture)

- **Doctrine (POS-01):** what POS is/is not; records-own-truth; operator-approval; BOS-in-right-rail; Communications-owns-email; no-intake-language; forms/documents shared foundation.
- **Object language (POS-02):** Source, Processing Case, Extraction, Match, Resolution, Outcome, Workflow, Operational Result — and the Processing Case lifecycle (Received → Processing → Needs Review → Needs Resolution → Ready → Completed → Archived).
- **Navigation + ownership boundaries (POS-03):** the seven POS areas and the precise POS/Communications/CRM/Lifecycle/Documents/BOS ownership table.
- **Outcome taxonomy + approval model (POS-05):** five outcome categories, illustrative recipes, operator-approval-before-execution.
- **UX + experience (POS-04, POS-07, POS-08):** 26 behavioral screens, the mockup brief, and this canonical visual-vision package with hero-object framing and per-screen states.
- **Execution model (POS-06):** branch model, package-by-package loop, substitute vs real gates, two-failed-repair pause, named gates.

### What remains open (must be answered, but are not blockers to *entering* architecture)

1. **"Intake" retirement scope** — how aggressively to rename existing intake surfaces/rules vs. retain as implementation detail.
2. **Auto-execute in V1** — any auto-execute steps within an approved recipe, or approval-only end-to-end for the first release.
3. **Pillar placement confirmation** — POS as a peer top-level pillar (assumed) vs. nested.
4. **Documents boundary** — Documents library inside POS navigation vs. a separate Documents pillar surfaced through POS.
5. **Source consolidation** — whether one Processing Case may consolidate multiple sources, and the product rules for that (conceptually allowed in POS-02; product rules not yet frozen).
6. **Confidence thresholds** — the product thresholds that separate high-confidence / needs-review / needs-resolution (named conceptually; values not set).
7. **Reuse vs. new** — the degree to which POS reuses existing forms-engine/packet/documents foundations vs. introduces new concepts (an *architecture* decision, deliberately left open here).

### Readiness verdict

**POS is ready to enter the Architecture Gate**, conditional on the Doctrine and UX Gates being accepted (POS-06). The doctrine, object language, boundaries, outcomes, and full visual/experience definition are frozen and internally consistent; the hero object is unambiguous; and the open items above are **scoping decisions and architecture trade-offs**, not missing product definition. None of them require more UX work to begin architecture — they should be carried *into* the Architecture Gate as explicit decisions.

**Recommended gate sequence:** Doctrine Gate → UX Gate (accept POS-04 + POS-07 + POS-08, generate mockups from POS-09) → **Architecture Gate** (resolve the open items as architecture decisions; still no code until the Foundation Gate per POS-06).

### Guardrails carried into architecture

Architecture must *elaborate* this package, not contradict it (POS-06). The lines most likely to be eroded by implementation convenience — **records own truth, operator approval, BOS in the right rail, no-intake-as-concept, document-first composer** — are explicitly protected and may only change via escalation back to the Doctrine Gate.
