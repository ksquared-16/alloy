# POS-07 — Visual Mockup Brief

> **Status:** Planning artifact (Doctrine Gate follow-up 1, draft). **Not implementation.**
> A generation brief for producing Alloy-native POS mockups from POS-04. No components, no code, no design tokens shipped — this is art direction.
> Inherits from **POS-01 … POS-06**. Branch: `pos-planning-v1`.

## Purpose

Give a mockup generator (human designer or image model) everything needed to produce **Alloy-native** POS visuals that look like Alloy 12–18 months from now — not generic SaaS. Each brief below is self-contained: shell, composition, the hero object, BOS rail treatment, sample content, and explicit do/avoid.

The **Processing Case is the hero object** across the whole set. Every screen should make it obvious that the operator is turning incoming information into an approved operational outcome — never filling out or building a survey.

## Global art direction (applies to every mockup)

**Visual language — Alloy current doctrine:**

- **Shell:** Midnight Forge — deep near-black/charcoal left nav and top bar; the app frame is dark, the work surface is light.
- **Canvas:** white workspace cards on a very light neutral background; soft operational borders (1px, low-contrast), gentle radius, subtle shadow. Premium and calm, not flashy.
- **Primary accent:** Bend Pine (deep green) — used for status pills, primary confirm actions, active nav, and selected states. Sparingly and deliberately.
- **Highlights:** Pine Mist (pale green) — for selected rows, success/ready states, BOS "good to go" affordances, subtle fills behind Bend Pine elements.
- **Left nav:** current Alloy pattern — POS pillar with its areas (Processing, Review, Linkage, Forms, Packets, Documents, Settings); org switcher and operator identity at the bottom.
- **Top shell:** search, New, filters/sort, breadcrumbs — current Alloy top bar.
- **BOS right rail:** the existing right-rail "operational intelligence" pattern — labeled header ("BOS Assistant — Operational Intelligence"), confidence, recommendation cards, suggested actions, approval prompts. Always right, never center.
- **Queue rows / cards:** consistent with Work Units — dense operational rows with a leading source-type glyph, title/source, "from," status pill, BOS confidence %, and a timestamp; selection uses Pine Mist.
- **Drawers / actions:** current Alloy drawer + action-menu patterns for case detail and row actions.

**Typography:** Inter / DM Sans family; tight, operational hierarchy; numbers and confidence legible at a glance.

**Avoid (hard constraints):**

- No generic SaaS analytics dashboard (no big KPI donut/line-chart hero, no widget-marketplace grid).
- No heavy blue CTAs or blue-dominant palette — Bend Pine is the action color; keep blue minimal.
- No marketing form-builder / survey-builder chrome (no Typeform/JotForm-style centered single-question canvas, no drag-a-widget palette as the hero metaphor).
- No excessive tables; prefer operational rows/cards.
- No emoji, no playful illustration; this is an operations tool.

**Recurring sample content (use consistently for realism):**

- Tenant: **Little Oaks Academy**. Operator: **Kelly Smith**.
- Hero family: **The Smith Family** — parent **Sarah Smith**, child **Emma Smith** (DOB 06/14/2020), case **#4455667**.
- Hero source: **CCDF Subsidy Contract (State of Illinois)**, received via email attachment ~2m ago; BOS confidence **94%**.
- Other inflight: Johnson Family — Enrollment Packet; Garcia Family — Subsidy Contract; Miller Family — Registration Form; Playground Incident Report.

## Screen group index

| # | Mockup | POS-04 screens it represents |
|---|--------|------------------------------|
| 1 | Processing Workspace | #1–4 (Command Center, Queue, Source Lens, Needs Resolution) |
| 2 | Processing Case — Subsidy Contract | #5–9 (Overview, Extracted Data, Source Preview, Proposed Outcomes, History) |
| 3 | Document Composer | #10–13 |
| 4 | Packet Builder | #14–16 |
| 5 | Submission Review | #17–18 |
| 6 | Linkage & Resolution | #19–21 |
| 7 | Outcome Configuration | #22–23 |
| 8 | BOS Right Rail states | rail behavior across all screens |

---

## 1 — Processing Workspace (Command Center)

- **Hero:** the live queue of **Processing Cases** by lifecycle state. This is the POS landing.
- **Composition:** Midnight Forge shell + POS left nav (Processing active). Top: title "Processing", a thin row of at-a-glance counters — **Needs Review 23 · Processing 18 · Needs Resolution 12 · Completed 156** — as quiet stat chips, NOT dashboard tiles. Below: a single dense operational queue with filter tabs (All Items / Needs Review / Processing / Linkage / Completed) and Sort.
- **Queue row anatomy:** source-type glyph (contract, form, packet, upload, email-attachment) · Title/Source (e.g. "Smith Family — CCDF Contract") · From (Email Attachment / Web Form / Portal Upload) · Status pill (Bend Pine for state) · BOS confidence % · received timestamp.
- **BOS right rail:** "At a glance — I found 23 items that need your review," a short list (high-confidence matches, missing key info, ready to approve), then **Top recommendations** as cards ("Approve Smith Family Subsidy Contract", "Review Johnson Family Enrollment Packet") with a "View all (5)".
- **Color & material:** white queue card on light bg; selected row in Pine Mist with a Bend Pine left tick; status pills Bend Pine/neutral.
- **Sample data:** use the recurring families; show ~6 rows.
- **Do:** make it feel like a Work Unit queue. **Avoid:** charts, donuts, KPI hero, blue buttons.

## 2 — Processing Case — Subsidy Contract (hero screen)

- **Hero:** a single **Processing Case**: *Smith Family — CCDF Contract*. This is the screen that must most clearly express "records own truth; BOS recommends; operator approves."
- **Composition:** back-link "Back to Processing"; case header with title, **Subsidy Contract** + **Needs Review** chips, "Received 2m ago via Email." Tabs: **Overview · Extracted Data · Documents · History**. Center splits into a **document preview** (the CCDF contract PDF, page 1 of 2, zoom controls) and an **extracted-data panel** (Section 1 — Family Information: Parent/Guardian "Sarah Smith", Child "Emma Smith", DOB 06/14/2020, Case # 4455667; Section 2 — Authorization: start/end dates, monthly reimbursement $850.00). Footer strip: "BOS found 12 data points · View extracted data."
- **BOS right rail:** big **Confidence 94% — High**; "BOS has extracted the key information and found likely matches." **Likely matches**: Family → The Smith Family (95%, view match), Child → Emma Smith (view match). **Recommended actions**: Create Subsidy Profile · Create Billing Setup · Link to Emma Smith · Start Reimbursement Workflow. Primary buttons: **Approve All** (Bend Pine) and **Review Manually** (quiet).
- **Proposed Outcomes view (same screen, outcomes emphasis):** ordered steps card — Create Subsidy Profile → Create Billing Setup → Link to Child → Start Reimbursement Workflow → Send Confirmation — each with target + optional/auto toggles; BOS "This outcome looks good" checklist + estimated impact ("creates 2 records, starts 1 workflow, sends 1 email").
- **Color & material:** white case canvas; the PDF preview framed in a soft-bordered viewer; confidence in Bend Pine; matched-record chips link out.
- **Do:** make extracted values visibly *proposals* (subtle, editable, with confidence). **Avoid:** making it look like a filled web form; no blue CTA.

## 3 — Document Composer

- **Hero:** a **document-first authoring canvas** (Notion/Google-Docs mental model), Alloy-native — authoring a form/state form/document, NOT a drag-and-drop widget builder.
- **Composition:** back-link "Back to Documents"; title "New State Registration Form" + **Draft** chip; tabs **Builder · Settings · Mappings · Preview · History**; Save / Actions / **Publish**. Center: a structured document with sections ("Child Care Facility Registration", "Section 1 — Facility Information", "Section 2 — Director Information") and inline fields (Facility Name, License Number, License Type, Address, Director Name, Email). Left helper: an "Add Fields" list grouped Basic/Advanced (Short/Long Text, Number, Date, Dropdown, Checkbox; Section, Table, File Upload, Signature, Divider) — a *palette in support of the document*, not the hero. Right: a **Form Properties** panel (title, description, category, version, status, Requires Signature toggle).
- **BOS right rail:** "This form looks complete" checklist (all required fields present, section flow correct, data mappings valid, signature field included); **Suggestions**: "Add field: Capacity — recommended for state reporting", "Add field: License Expiration — helps with renewal tracking"; "Apply Suggestions."
- **Color & material:** white document on light bg, generous margins, document typography; Bend Pine Publish.
- **Do:** read as a real document being composed. **Avoid:** survey-builder centered-question UI; widget marketplace.

## 4 — Packet Builder

- **Hero:** assembling a **multi-step packet experience** with a live recipient preview.
- **Composition:** back-link "Back to Packets"; title "New Enrollment Packet" + **Draft**; tabs **Builder · Settings · Recipients · Preview · History**; Save / Actions / **Publish**. Three columns: **Packet Contents** (drag-to-reorder list: Welcome Letter, Enrollment Form, Health Information Form, Immunization Record, Parent Agreement, Tuition Agreement — each with a small type label + "Add Item") · **Packet Preview** (a warm "Welcome to Little Oaks Academy!" cover with pine-tree mark and intro copy) · **Packet Settings** (Name, Description, Visibility=Public, Requires Signature=Yes, Validity=14 days, Reminders=2).
- **BOS right rail:** "This packet is ready" checklist (recommended documents included, recommended order applied, signature required, due date set); **Recommendations**: "Add: Emergency Contact Form — recommended by best practices", "Add: Photo Release Form — commonly used by providers"; "Add Recommended Items."
- **Color & material:** white builder; the preview cover uses Pine Mist/Bend Pine and the Little Oaks tree mark; Bend Pine Publish.
- **Do:** show it as a recipient-facing experience being curated. **Avoid:** generic email-template editor look.

## 5 — Submission Review

- **Hero:** reviewing a **completed packet** and the record changes it proposes, with an operator approve/send-back flow.
- **Composition:** back-link "Back to Review"; title "Johnson Family — Enrollment Packet" + **Needs Review**; "Submitted 3 days ago." Center: a **Review Steps** checklist (Check Completeness ✓, Review Documents ✓, Verify Data ◐ in progress, Confirm Signatures ✗ missing, Approve or Send Back) and a **Documents** table (Welcome Letter — Viewed; Health Information — Complete; Immunization Record — Complete; Parent Agreement — **Missing Signature**; Tuition Agreement — Complete) with submitter + date columns. A **Submission Summary** panel (Family: The Johnson Family; Children: Mason Johnson, DOB …; key submitted values).
- **BOS right rail:** "1 item requires attention — **Parent Agreement needs signature.**" Next suggested action: "Request signature for Parent Agreement." Buttons: **Send Request** (Bend Pine) and **Approve Packet** (disabled until signature resolved).
- **Color & material:** white review canvas; missing items in a restrained alert treatment (amber text/clay dot, not red-heavy, no blue); complete items neutral/Pine Mist.
- **Do:** make the blocked-on-signature state unmistakable. **Avoid:** loud red banners; blue CTAs.

## 6 — Linkage & Resolution

- **Hero:** matching an **incoming source** to existing records and resolving ambiguity — the Match/Resolution moment.
- **Composition:** title "Linkage & Resolution" with a "Linkage Needed — 1 item requires resolution." Left: **Incoming Source** (Subsidy Contract, received 2m ago: Parent/Guardian Sarah Smith, Child Emma Smith, DOB 06/14/2020, address 123 Oak St, Naperville, IL 60540). Center: **Potential Matches** as ranked cards — **The Smith Family 95%** (123 Oak St … last activity 1 day ago), Sarah Smith 88%, The Smith Family 72% — with a **Selected Match** panel on the right showing the chosen Smith Family record. Tabs across targets: Family / Child / Provider / Other.
- **BOS right rail:** "**Strong match found. Confidence 95%.** I recommend linking to The Smith Family." "**Why this match?**" — same address, same name, recent activity. Buttons: **Confirm Link** (Bend Pine) and **Create New Family Instead** (quiet).
- **Color & material:** white; the recommended match card carries a Pine Mist fill + Bend Pine confidence; lower matches neutral.
- **Do:** show confidence + evidence as the basis for a human decision. **Avoid:** auto-confirm styling that implies the system already linked it.

## 7 — Outcome Configuration

- **Hero:** configuring **what happens after approval** for a source type — clearly a **Settings** surface, not a separate workspace.
- **Composition:** Settings context (left nav Settings active, or POS Settings breadcrumb); title "Subsidy Contract — Outcomes" with an **Active** toggle and Save / Test Outcome. Tabs **Outcomes · Conditions · Mappings · History**. Center: **Outcome Steps** ordered list — Create Subsidy Profile, Create Billing Setup, Link to Child, Start Reimbursement Workflow, Send Confirmation Email — each row with Trigger ("When item is approved"), Applies To, optional/auto toggles. Right detail: **Outcome Details** (Trigger, Applies To, Auto Execute) and **Estimated Impact** ("Creates 2 records, Starts 1 workflow, Sends 1 email").
- **BOS right rail:** "This outcome looks good" checklist (all required steps added, steps in logical order, mappings are valid, conditions set correctly). Primary: **Save Outcome** (Bend Pine).
- **Color & material:** white config canvas, toggles in Bend Pine when on; reads like Alloy Settings, not a builder canvas.
- **Do:** make it obvious this is configuration that drives the Proposed Outcomes operators later approve. **Avoid:** implying outcomes fire without approval.

## 8 — BOS Right Rail states

A focused sheet showing the **same right rail in its key states**, so the rail's behavior is consistent everywhere. One narrow rail card per state, header "BOS Assistant — Operational Intelligence."

1. **Summary / idle (Processing Workspace):** "23 items need review" + Top recommendations list. Calm, neutral.
2. **High confidence (Processing Case):** "Confidence 94% — High", likely matches, recommended actions, **Approve All**.
3. **Attention / missing info (Submission Review):** "1 item requires attention — Parent Agreement needs signature", **Send Request**. Restrained amber/clay accent.
4. **Strong match (Linkage):** "Strong match found — 95%. I recommend linking to The Smith Family", "Why this match?", **Confirm Link**.
5. **Ready to approve (Outcome / Case):** "This outcome looks good" checklist all green (Pine Mist ticks), estimated impact, **Save/Approve**.
6. **Post-approval receipt:** "Done — created 2 records, started reimbursement workflow, sent confirmation" with links to the created records (BOS reports the executed Operational Result).
7. **Degraded / unavailable:** rail collapses to a quiet static summary — "BOS is unavailable; workspace is fully usable" — proving the workspace never depends on the rail.

- **Across all states:** BOS **recommends, explains, and prompts for approval** — it never shows a "did it automatically" state in V1 except the post-approval receipt (which follows an operator approval). Bend Pine for confirm; Pine Mist for good-to-go; minimal blue; never moves to center.

---

## Generation notes

- Produce each group at desktop width (≈1440px) with the full Midnight Forge shell + POS left nav + BOS right rail visible, so composition reads correctly.
- Keep copy realistic using the recurring sample content; confidence numbers and counts should look like real operations.
- If generating with an image model, lead the prompt with the Global art-direction constraints, then the per-screen composition, and end with the Avoid list to suppress generic-SaaS/blue/survey-builder defaults.
- These briefs describe intent and composition only. They are not a component spec and impose no implementation.
