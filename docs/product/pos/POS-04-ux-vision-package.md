# POS-04 — UX Vision Package

> **Status:** Planning artifact (UX vision, draft). **Not implementation.**
> No components, no routes, no code. These are *screen definitions* describing intent, layout, and behavior. They are the input to the **UX Gate**, not a build spec.
> Inherits from **POS-01 / POS-02 / POS-03**. Branch: `pos-planning-v1`. Author gate: **UX Gate**.

## Purpose

Define **26 Alloy-native screens** for POS so the team can see and accept the product before any code is written. Every screen is described with a fixed template so they can be compared and gated consistently.

## Visual direction (applies to every screen)

Future POS visuals must feel like **Alloy screenshots from 12–18 months in the future** — not generic SaaS. Use:

- **Midnight Forge** shell, **Bend Pine** primary accent, **Pine Mist** highlights, white workspace cards, soft operational borders.
- Current Alloy **left nav + top shell**, current **right BOS rail**, current **queue rows/cards** (consistent with Work Units), current **drawer/action** patterns.
- Minimal blue; **premium operational feel**.

Avoid: heavy blue CTAs, generic analytics dashboards, marketing form-builder UI, excessive tables, widget-marketplace feel, survey-builder feel.

## Screen template

Each screen below specifies:

- **Purpose** — why the screen exists
- **User goal** — what the operator (or recipient) is trying to do
- **Layout** — shell, center, right BOS rail
- **Primary actions** — the few real actions
- **BOS rail behavior** — what BOS shows and proposes here
- **Status states** — operational states the screen can be in
- **Empty states** — first-run / nothing-here
- **Error / conflict states** — failure and ambiguity
- **Doctrine inheritance** — which Alloy/POS doctrine the screen must obey

## Screen index

| # | Family | Screen |
|---|--------|--------|
| 1 | Processing Workspace | Processing Command Center |
| 2 | Processing Workspace | Processing Queue (filtered) |
| 3 | Processing Workspace | Source-Type Lens |
| 4 | Processing Workspace | Needs Resolution Lane |
| 5 | Processing Case | Case Overview |
| 6 | Processing Case | Extracted Data |
| 7 | Processing Case | Source / Document Preview |
| 8 | Processing Case | Proposed Outcomes |
| 9 | Processing Case | Case History |
| 10 | Document Composer | Composer Canvas |
| 11 | Document Composer | Field & Properties |
| 12 | Document Composer | Mappings |
| 13 | Document Composer | Preview & Publish |
| 14 | Packet Builder | Packet Contents |
| 15 | Packet Builder | Recipients |
| 16 | Packet Builder | Packet Settings & Share |
| 17 | Submission Review | Review Queue |
| 18 | Submission Review | Submission Review Detail |
| 19 | Linkage & Resolution | Linkage Workspace |
| 20 | Linkage & Resolution | Create New Record |
| 21 | Linkage & Resolution | Request Information |
| 22 | Outcome Configuration | Outcome Recipe |
| 23 | Outcome Configuration | Conditions & Mappings |
| 24 | Libraries | Forms Library |
| 25 | Libraries | Packet Library |
| 26 | Libraries | Documents Library |

---

## 1 — Processing Command Center

- **Purpose:** The POS landing; a command center for all active information work.
- **User goal:** See what needs me right now and open the most important case.
- **Layout:** Midnight Forge shell + left nav (POS pillar). Center: at-a-glance counts (Needs Review, Processing, Needs Resolution, Ready, Completed), then operational queue rows/cards of active Processing Cases with source-type glyphs, status pills, and confidence. Right: BOS rail.
- **Primary actions:** Open case; New (manual source/upload); filter; sort.
- **BOS rail behavior:** "At a glance" summary ("23 items need your review"), top recommendations (e.g. "Approve Smith Family Subsidy Contract"), and a short prioritized to-do. Recommend, never auto-act.
- **Status states:** Counts per lifecycle state; recent-activity feed; per-row state pills (Bend Pine for status).
- **Empty states:** "No active processing. New information will appear here as it enters Alloy." with a New action and a link to connect sources.
- **Error/conflict states:** Source ingestion failure banner ("3 sources failed to import — review"); BOS-unavailable degrades rail to static summary, workspace unaffected.
- **Doctrine inheritance:** Work-Unit feel; BOS right rail; queue-record doctrine; no dashboard look (POS-01, POS-03).

## 2 — Processing Queue (filtered)

- **Purpose:** A focused queue scoped to one lifecycle state or saved filter.
- **User goal:** Work down a single bucket (e.g. only Needs Resolution) efficiently.
- **Layout:** Same shell; center is a dense operational queue with the active filter shown as removable chips; right BOS rail contextual to the filtered set.
- **Primary actions:** Open case; bulk-acknowledge (non-mutating); change filter; save view.
- **BOS rail behavior:** Summary of the filtered set and the highest-value next action within it.
- **Status states:** Filter chips active; per-row status; count of matches.
- **Empty states:** "Nothing matches this filter." with clear-filter affordance.
- **Error/conflict states:** Filter returns stale/over-large set → "Showing first N — refine filter."
- **Doctrine inheritance:** Queue-record doctrine; case-vs-candidate grain awareness.

## 3 — Source-Type Lens

- **Purpose:** View active work organized by where it came from (form, packet, email attachment, upload, contract, state form, OCR, import).
- **User goal:** Understand inflow by channel and triage a specific source type.
- **Layout:** Center grouped by source kind with counts and recency; right BOS rail summarizes inflow.
- **Primary actions:** Drill into a source kind; open case.
- **BOS rail behavior:** "Most inflow today came from email attachments; 4 need resolution."
- **Status states:** Per-source-kind counts and freshness.
- **Empty states:** "No sources of this type yet."
- **Error/conflict states:** A channel reporting ingestion errors is flagged with a count.
- **Doctrine inheritance:** Source is evidence/context (POS-02); workspace primary.

## 4 — Needs Resolution Lane

- **Purpose:** The triage surface for ambiguity, conflict, missing info, and possible duplicates.
- **User goal:** Resolve the cases that are blocked on a human decision.
- **Layout:** Center lists cases in Needs Resolution with the *reason* surfaced (conflict / missing / duplicate); right BOS rail explains and recommends per selected case.
- **Primary actions:** Open Linkage; request information; defer.
- **BOS rail behavior:** Per case: why it's blocked, candidate matches, recommended resolution with confidence.
- **Status states:** Reason tags; age in state; assignment.
- **Empty states:** "Nothing needs resolution. Nice."
- **Error/conflict states:** Conflicting extractions highlighted; duplicate-suspected cases paired.
- **Doctrine inheritance:** Resolution object (POS-02); BOS recommends, operator approves.

## 5 — Processing Case (Case Overview)

- **Purpose:** Single-case command surface (e.g. *Smith Family — Subsidy Contract*).
- **User goal:** Understand the case and move it forward to an approved outcome.
- **Layout:** Header (case title, source kind chips, received-via). Center tabs: Overview, Extracted Data, Documents, History. Overview shows source preview, matched records, confidence, and proposed outcomes. Right: BOS rail with recommendations and approve/review prompts.
- **Primary actions:** Approve all; review manually; reject; assign.
- **BOS rail behavior:** Confidence headline ("94% — high"), likely matches with view-match links, recommended actions, missing-info notes, "Approve" prompt.
- **Status states:** Lifecycle state badge (Received…Ready…Completed); per-field confidence.
- **Empty states:** N/A (a case always has a source); tabs may be individually empty.
- **Error/conflict states:** Low-confidence banner; conflict between source and existing record shown inline with both values.
- **Doctrine inheritance:** Records own truth; operator approval; BOS right rail (POS-01).

## 6 — Processing Case: Extracted Data

- **Purpose:** Review the structured Extraction detected from the source.
- **User goal:** Confirm or correct extracted fields before they can become outcomes.
- **Layout:** Center: labeled field list with extracted value, confidence, and source provenance (page/field); side-by-side with source preview optional. Right: BOS rail.
- **Primary actions:** Accept field; edit value; flag field; accept all high-confidence.
- **BOS rail behavior:** "BOS found 12 data points"; lists low-confidence fields needing eyes; offers "accept all ≥ threshold."
- **Status states:** Per-field accepted/edited/flagged; overall extraction confidence.
- **Empty states:** "No structured data extracted yet" (e.g. OCR pending) with a processing indicator.
- **Error/conflict states:** Unreadable field → "couldn't read — enter manually"; value conflicts with existing record value shown paired.
- **Doctrine inheritance:** Extractions are proposals (POS-02); no silent write.

## 7 — Processing Case: Source / Document Preview

- **Purpose:** Show the original evidence (PDF, image, email attachment, form payload).
- **User goal:** Verify the system's reading against the actual document.
- **Layout:** Center: document/image viewer with page controls and zoom; extracted-field highlights overlay onto the source where possible. Right: BOS rail can point to the page region behind a value.
- **Primary actions:** Page nav; zoom; download; open originating thread (if email).
- **BOS rail behavior:** "This value came from page 1, Section 2"; provenance links.
- **Status states:** Page X of N; OCR overlay on/off.
- **Empty states:** "No preview available for this source type" (e.g. pure import).
- **Error/conflict states:** Corrupt/unreadable file → preview fallback + "open original."
- **Doctrine inheritance:** Source as evidence; Communications owns the email (preview links out, POS-03).

## 8 — Processing Case: Proposed Outcomes

- **Purpose:** Show the BOS-prepared outcome(s) the operator will approve.
- **User goal:** Approve, adjust, or reject what will actually happen.
- **Layout:** Center: ordered list of proposed outcome steps (create subsidy profile → create billing setup → link to child → start reimbursement workflow → send confirmation), each with target record and effect. Right: BOS rail with the readiness check.
- **Primary actions:** Approve all; approve subset; edit a step; reject.
- **BOS rail behavior:** "This outcome looks good" checklist (required steps included, steps in logical order, mappings valid, conditions set correctly), estimated impact ("creates 2 records, starts 1 workflow, sends 1 email").
- **Status states:** Per-step optional/required, auto-execute on/off; case → Ready when steps valid.
- **Empty states:** "No outcome proposed yet — resolve open items first."
- **Error/conflict states:** A step's mapping invalid or precondition unmet → step blocked with reason; cannot approve until cleared.
- **Doctrine inheritance:** Outcomes require approval (POS-01); outcome taxonomy (POS-05).

## 9 — Processing Case: History

- **Purpose:** Audit trail of everything that happened to the case.
- **User goal:** See who did what, when, and what BOS proposed vs. what was approved.
- **Layout:** Center: chronological timeline (received, processed, reviewed, resolved, approved, executed) with actor attribution; right rail summarizes.
- **Primary actions:** Filter timeline; open a referenced record/outcome.
- **BOS rail behavior:** Plain-language recap of the case's journey.
- **Status states:** Entry types; actor (human vs BOS-proposed).
- **Empty states:** Minimal (a case always has at least a received event).
- **Error/conflict states:** Failed execution entries flagged with retry context.
- **Doctrine inheritance:** Human attribution on mutations; auditability (POS-01, bos-foundation doctrine).

## 10 — Document Composer: Composer Canvas

- **Purpose:** Unified authoring surface for forms, documents, state forms, public forms, internal forms.
- **User goal:** Author a source/document surface document-first.
- **Layout:** Notion/Google-Docs mental model, Alloy-native: a document canvas in the center (not a drag-and-drop widget palette as the primary metaphor), structural sections, an "Add field" affordance inline. Right: BOS rail with composition help.
- **Primary actions:** Add section/field; reorder; save draft; open Settings/Mappings/Preview tabs.
- **BOS rail behavior:** "This form looks complete" checklist; suggestions ("Add field: Capacity — recommended for state reporting").
- **Status states:** Draft / Published / Archived; required-field validity.
- **Empty states:** Blank document with a starting prompt and template picker.
- **Error/conflict states:** Invalid structure (e.g. signature field missing where required) flagged inline.
- **Doctrine inheritance:** Document-first, not form-builder-first (POS-01); shared forms/documents foundation.

## 11 — Document Composer: Field & Properties

- **Purpose:** Configure a single field's behavior and the document's properties.
- **User goal:** Set field type, label, requirement, and form-level metadata.
- **Layout:** Center: field list + a properties panel (general, category, version, status, requires-signature toggle); right BOS rail advises.
- **Primary actions:** Set field type/label/required; set form properties; toggle signature.
- **BOS rail behavior:** Recommends field semantics and flags missing required properties.
- **Status states:** Per-field required/optional; version + status.
- **Empty states:** "Select a field to edit its properties."
- **Error/conflict states:** Duplicate field semantics across surfaces → "this field already exists in the shared foundation — reuse?"
- **Doctrine inheritance:** No field duplication across surfaces (POS-01).

## 12 — Document Composer: Mappings

- **Purpose:** Map document fields to operational information / target records.
- **User goal:** Define how captured values relate to canonical fields (for later outcomes).
- **Layout:** Center: field → target mapping list with validity indicators; right BOS rail proposes mappings.
- **Primary actions:** Map field; clear mapping; validate.
- **BOS rail behavior:** "Data mappings valid" check; suggests likely targets.
- **Status states:** Mapped / unmapped / invalid per field.
- **Empty states:** "No mappings yet — BOS can suggest a starting set."
- **Error/conflict states:** Mapping to an incompatible target flagged; unmapped required fields warned.
- **Doctrine inheritance:** Mappings feed outcomes, not auto-writes (POS-01, POS-05).

## 13 — Document Composer: Preview & Publish

- **Purpose:** Preview the surface and publish a version.
- **User goal:** Confirm it looks/flows right, then publish.
- **Layout:** Center: rendered preview (public/internal); publish controls; right BOS rail readiness.
- **Primary actions:** Preview as recipient; publish; create new version.
- **BOS rail behavior:** Pre-publish checklist (required fields present, section flow correct, mappings valid, signature included).
- **Status states:** Draft → Published; version number.
- **Empty states:** N/A.
- **Error/conflict states:** Publish blocked while checklist incomplete, with the failing items listed.
- **Doctrine inheritance:** Published versions immutable except archive (inherits forms engine doctrine, documents-and-forms.md).

## 14 — Packet Builder: Packet Contents

- **Purpose:** Specialized composer mode for multi-step packet experiences.
- **User goal:** Assemble the documents/forms a recipient will complete.
- **Layout:** Center: ordered packet contents (welcome letter, enrollment form, health info, immunization record, agreements) with drag-to-reorder; live packet preview; right BOS rail.
- **Primary actions:** Add item; reorder; remove; open Recipients/Settings.
- **BOS rail behavior:** "This packet is ready" checklist; "Add: Emergency Contact Form — recommended by best practices."
- **Status states:** Draft / Published; per-item required documents.
- **Empty states:** "Add the first item to your packet."
- **Error/conflict states:** Missing a required document for the packet's purpose → flagged.
- **Doctrine inheritance:** Packets are sources; delivered via Communications (POS-03).

## 15 — Packet Builder: Recipients

- **Purpose:** Define who receives the packet and per-recipient context.
- **User goal:** Target the right family/household with the right pre-fill.
- **Layout:** Center: recipient list + per-person preferences/preview; right BOS rail.
- **Primary actions:** Add recipient; set per-person options; preview as recipient.
- **BOS rail behavior:** Flags missing recipient contact info; suggests household-aware multi-child launch.
- **Status states:** Per-recipient ready/incomplete.
- **Empty states:** "No recipients yet."
- **Error/conflict states:** Recipient missing a deliverable channel → "no email/phone on file — resolve via CRM."
- **Doctrine inheritance:** CRM owns identity; Communications owns delivery (POS-03).

## 16 — Packet Builder: Settings & Share

- **Purpose:** Configure packet validity, visibility, signatures, due dates, reminders, then publish/share.
- **User goal:** Set the rules and mint the share link.
- **Layout:** Center: settings (name, description, visibility, validity, requires-signature, due date, reminders); publish/share controls; right BOS rail.
- **Primary actions:** Set due date/reminders; require signature; publish; copy share link.
- **BOS rail behavior:** Recommends due-date/reminder defaults; readiness check.
- **Status states:** Draft → Published; share link active/expired.
- **Empty states:** N/A.
- **Error/conflict states:** Publish blocked if required settings missing; expired link surfaced with re-mint.
- **Doctrine inheritance:** Config-driven launch metadata (documents-and-forms.md); delivery through Communications.

## 17 — Submission Review: Review Queue

- **Purpose:** Queue of completed forms/packets/documents awaiting operator review.
- **User goal:** Pick the next submission to review and approve.
- **Layout:** Center: review queue rows with submitter, packet/form, completeness, missing-info flags; right BOS rail summary.
- **Primary actions:** Open submission; filter; assign.
- **BOS rail behavior:** "1 item requires attention — Parent Agreement needs signature."
- **Status states:** Submitted / In review / Needs correction / Approved.
- **Empty states:** "No submissions waiting for review."
- **Error/conflict states:** Submission with missing required steps flagged before opening.
- **Doctrine inheritance:** Inherits packet review UX (documents-and-forms.md), reframed under POS.

## 18 — Submission Review: Detail

- **Purpose:** Review a single completed submission and its proposed record changes.
- **User goal:** Confirm submitted data, see changes to records, approve or send back.
- **Layout:** Center: review steps (check completeness, review documents, verify data, confirm signatures, approve/send back), submitted data, documents included, and the changes-to-records summary; right BOS rail.
- **Primary actions:** Approve packet; request correction; send back; send request (e.g. signature).
- **BOS rail behavior:** Submission summary; "Parent Agreement needs signature — Send Request."
- **Status states:** Per-step complete/incomplete; overall review status.
- **Empty states:** N/A.
- **Error/conflict states:** Missing signature/document blocks approval; data mismatch vs existing record shown paired.
- **Doctrine inheritance:** Records own truth; values are proposals until approved (POS-01).

## 19 — Linkage & Resolution: Linkage Workspace

- **Purpose:** Match an incoming source to existing records and resolve ambiguity.
- **User goal:** Confirm the right family/person/child/customer link.
- **Layout:** Center: incoming source summary + potential matches with confidence and evidence; a selected-match panel; right BOS rail explains.
- **Primary actions:** Confirm link; create new record; request information; defer.
- **BOS rail behavior:** "Strong match found — I recommend linking to The Smith Family (95%)" with "Why this match?" (same address, same name, recent activity).
- **Status states:** Match candidates ranked; selected/confirmed.
- **Empty states:** "No candidate matches — create a new record?"
- **Error/conflict states:** Multiple high-confidence matches (possible duplicate) → "two strong matches — review both"; conflicting evidence surfaced.
- **Doctrine inheritance:** Match + Resolution objects (POS-02); CRM owns resulting record.

## 20 — Linkage & Resolution: Create New Record

- **Purpose:** Create a canonical record when no acceptable match exists.
- **User goal:** Spin up the right CRM record from the source, cleanly.
- **Layout:** Center: pre-filled record draft (from extraction) with field-level provenance; right BOS rail flags gaps.
- **Primary actions:** Create record; edit fields; cancel back to matching.
- **BOS rail behavior:** Pre-fills from extraction; flags missing required identity fields; warns of near-duplicates one more time.
- **Status states:** Draft record; required-field completeness.
- **Empty states:** N/A.
- **Error/conflict states:** Late duplicate detection → "this looks like an existing family — link instead?"; required field missing blocks create.
- **Doctrine inheritance:** Creating a record is a CRM-owned outcome (POS-03).

## 21 — Linkage & Resolution: Request Information

- **Purpose:** Ask the family/contact for missing information instead of guessing.
- **User goal:** Send a targeted request and park the case until it returns.
- **Layout:** Center: what's missing + a drafted request; right BOS rail drafts the message.
- **Primary actions:** Send request (via Communications); edit draft; defer.
- **BOS rail behavior:** Drafts a channel-aware request body (separate from internal recommendation copy); names exactly what's missing.
- **Status states:** Case → Needs Resolution (awaiting info); request sent/pending.
- **Empty states:** N/A.
- **Error/conflict states:** No deliverable channel on file → resolve via CRM first; send failure surfaced from Communications.
- **Doctrine inheritance:** Recommendation ≠ customer communication; send through Communications (POS-03, bos-foundation.md).

## 22 — Outcome Configuration: Outcome Recipe

- **Purpose:** Configure what happens after approval for a given source type. **This is Settings, not a separate workspace.**
- **User goal:** Define the ordered outcome steps for, e.g., an enrollment form or a subsidy contract.
- **Layout:** Center: outcome steps list with type, target, trigger, optional/auto-execute toggles; right BOS rail validates.
- **Primary actions:** Add step; reorder; set trigger; save outcome.
- **BOS rail behavior:** "This outcome looks good" checklist (required steps included, logical order, mappings valid, conditions correct); estimated impact.
- **Status states:** Active/inactive; per-step optional/required/auto.
- **Empty states:** "No outcome configured for this source type yet."
- **Error/conflict states:** Invalid/contradictory step order or mapping flagged; cannot save until valid.
- **Doctrine inheritance:** Configuration not code (configuration-system.md); approval before execute (POS-01); taxonomy (POS-05).

## 23 — Outcome Configuration: Conditions & Mappings

- **Purpose:** Define when an outcome/step applies and how fields map into it.
- **User goal:** Set conditions and field mappings that drive outcomes.
- **Layout:** Center: conditions builder + field→target mappings; right BOS rail proposes.
- **Primary actions:** Add condition; map field; validate; save.
- **BOS rail behavior:** Suggests conditions and mappings; flags unmapped required targets.
- **Status states:** Conditions valid/invalid; mappings valid/invalid.
- **Empty states:** "No conditions — outcome applies to all sources of this type."
- **Error/conflict states:** Conflicting conditions or invalid mapping flagged.
- **Doctrine inheritance:** Mappings feed outcomes (POS-05); no auto-write without approval.

## 24 — Forms Library

- **Purpose:** Manage published forms and form templates.
- **User goal:** Find, open, or create a form.
- **Layout:** Center: library of forms/templates (status, version, usage); right BOS rail optional.
- **Primary actions:** Open in Composer; new from template; archive.
- **BOS rail behavior:** Light — usage insights, suggested templates.
- **Status states:** Draft / Published / Archived; version.
- **Empty states:** "No forms yet — create your first."
- **Error/conflict states:** Broken mapping on a published form flagged in-list.
- **Doctrine inheritance:** Library, not survey builder (POS-01, POS-03).

## 25 — Packet Library

- **Purpose:** Manage published packets and packet templates.
- **User goal:** Find, open, or create a packet.
- **Layout:** Center: library of packets/templates; right BOS rail optional.
- **Primary actions:** Open in Packet Builder; new from template; archive.
- **BOS rail behavior:** Light — recommended packet structures.
- **Status states:** Draft / Published / Archived.
- **Empty states:** "No packets yet — build your first."
- **Error/conflict states:** Packet missing a required document flagged in-list.
- **Doctrine inheritance:** Packets delivered via Communications (POS-03).

## 26 — Documents Library

- **Purpose:** Manage generated documents, document templates, recreated state forms, and processed documents.
- **User goal:** Find a generated/processed document or a template.
- **Layout:** Center: documents grouped (generated, templates, state forms, processed) with provenance; right BOS rail optional.
- **Primary actions:** Open; download; create template; recreate state form.
- **BOS rail behavior:** Light — flags documents needing attention (e.g. unmapped recreations).
- **Status states:** Generated / template / processed; linkage to a record/case.
- **Empty states:** "No documents yet."
- **Error/conflict states:** Orphaned generated document (no parent record) flagged.
- **Doctrine inheritance:** Documents own artifacts; POS produces/consumes (POS-03).

---

## BOS right-rail consistency (all screens)

Across every screen the BOS rail follows one model (consistent with the mockup's "BOS is the operational intelligence layer"): it **analyzes, recommends, guides, explains, surfaces missing information, and prompts for approval** — and is **always in the right rail, never the center, never a separate workspace**. Where BOS is unavailable, the rail degrades to a static summary and the workspace remains fully usable.

## What this package is not

It is not a component spec, not a route list, not a design-token sheet, and not a build order. It is the artifact the team accepts (or revises) at the **UX Gate** before the Foundation Gate begins.
