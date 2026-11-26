# POS-09 — Mockup Generation Prompts

> **Status:** Planning artifact (companion to POS-07 / POS-08). Draft. **Not implementation.**
> Ready-to-use prompts so future mockups can be generated **without reinterpreting doctrine.** No code, no schema, no APIs.
> Inherits from **POS-01 … POS-08**. Branch: `pos-planning-v1`.

## How to use this file

For each of the 11 POS-08 screens, this file provides a **GPT Image prompt**, a **Midjourney prompt**, and **Figma recreation notes.** Always prepend the **Shared style preamble** below to any image prompt — it encodes the Alloy visual doctrine and suppresses generic-SaaS defaults. Use the **Recurring sample content** verbatim so every artifact is internally consistent.

These prompts produce *visual studies*, not specs. They impose no implementation.

## Shared style preamble (prepend to every image prompt)

> High-fidelity product UI mockup of "Alloy," an operational software platform, shown as it would look 18 months in the future. **Midnight Forge shell:** dark near-black charcoal left navigation sidebar and top bar; the working area is a light, near-white canvas with white cards, soft 1px low-contrast borders, gentle corner radius, restrained shadows; calm, premium, dense-but-legible operational design. **Primary accent: Bend Pine (deep forest green)** used only for primary confirm buttons, active navigation, status pills, and selected states. **Pine Mist (pale sage green)** for selected rows, success/ready fills, and checkmarks. Right side: a narrow **BOS Assistant "Operational Intelligence" right rail** with confidence, recommendation cards, and an approval action. Typography is Inter / DM Sans, tight operational hierarchy. It must look like a serious operations tool — **NOT** a generic SaaS analytics dashboard, NOT Atlassian/Monday/HubSpot/Salesforce, NOT a survey/form builder, NOT a widget marketplace. **No charts or KPI donuts as heroes. No heavy blue anywhere. No drag-and-drop widget palette as the hero. No emoji.** Desktop, ~1440px wide, full shell + left nav + right rail visible.

## Recurring sample content (use verbatim)

- Tenant **Little Oaks Academy**; operator **Kelly Smith**.
- Family **The Smith Family** — **Sarah Smith** (parent), **Emma Smith** (child, DOB 06/14/2020), case **#4455667**.
- Source **CCDF Subsidy Contract (State of Illinois)**, received via email attachment ~2m ago, BOS confidence **94%**.
- Other inflight: Johnson — Enrollment Packet; Garcia — Subsidy Contract; Miller — Registration Form; Playground Incident Report.

## Global Figma setup (applies to all screens)

- **Frame:** 1440×1024 desktop. 8px grid; 24px outer canvas padding.
- **Color styles:** `Midnight/Forge` (shell bg), `Midnight/Bar`, `Canvas/White`, `Canvas/Field` (near-white), `Border/Soft`, `Accent/BendPine`, `Accent/BendPine-Pressed`, `Highlight/PineMist`, `Text/Primary`, `Text/Muted`, `Status/Attention` (amber-clay).
- **Text styles:** Inter/DM Sans — `Display/20`, `Title/16`, `Body/14`, `Meta/12`, `Mono/13` (numbers/IDs).
- **Core components:** `Shell/LeftNav` (POS pillar with Processing, Review, Linkage, Forms, Packets, Documents, Settings), `Shell/TopBar` (search, New, filter, sort, breadcrumb), `Queue/Row` (source glyph · title/source · from · status pill · confidence% · timestamp), `Card/Operational`, `Pill/Status`, `Drawer/Detail`, `Rail/BOS` (header, confidence, finding, recommendation card, approval button), `Tabs`, `Toggle`.
- **Reuse, don't reinvent:** base `Queue/Row`, `Drawer/Detail`, and `Rail/BOS` on existing Alloy Work Unit, Drawer, and BOS components.

---

## Screen 01 — Processing Workspace

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Processing Workspace** — the operational command center answering "what needs my attention?". Left nav shows POS with "Processing" active. Header "Processing" with a quiet row of state counters: Needs Review 23, Processing 18, Needs Resolution 12, Ready 9, Completed 156 (small stat chips, not dashboard tiles). Center is a single dense operational queue (Work-Unit style) with filter tabs (All, Needs Review, Processing, Linkage, Ready, Completed) and a Sort control; ~6 rows, each with a source-type glyph, a title like "Smith Family — CCDF Contract", a "from" label (Email Attachment / Web Form / Portal Upload), a Bend Pine status pill, a BOS confidence percentage, and a timestamp; one selected row filled Pine Mist with a Bend Pine left tick. Right rail "BOS Assistant — Operational Intelligence": "I found 23 items that need your review", a short list, and Top recommendations cards ("Approve Smith Family Subsidy Contract"), "View all (5)". Use Little Oaks Academy sample families.

**Midjourney prompt:**
> Alloy operational software, Processing Workspace command center, dark Midnight Forge left nav and top bar, light near-white work canvas, dense operational queue of processing cases with source glyphs, deep forest green (Bend Pine) status pills and one pale sage (Pine Mist) selected row, narrow right-side BOS Operational Intelligence rail with confidence and recommendation cards, Inter typography, premium enterprise operations tool, no charts, no blue, not a dashboard, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. `Shell/LeftNav` + `Shell/TopBar`. Counter row = 5× small `Pill/Status` ghost chips (Meta/12). Center = `Tabs` + list of `Queue/Row` (instance per family); selected row fill `Highlight/PineMist`, 2px `Accent/BendPine` left bar. Right = `Rail/BOS` with summary text + 2× recommendation `Card/Operational` + text button "View all (5)". No chart components.

## Screen 02 — Processing Case (Smith Family — Subsidy Contract)

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Processing Case** — the hero screen. Back-link "Back to Processing". Header "Smith Family — CCDF Contract" with chips "Subsidy Contract" and "Needs Review", subtext "Received 2m ago via Email". Tabs: Overview, Extracted Data, Documents, History. Center canvas split: left a **PDF document preview** of a "CCDF Subsidy Contract — State of Illinois" (page 1 of 2, zoom controls, soft-bordered viewer); right an **extracted information** panel with Section 1 Family Information (Parent/Guardian "Sarah Smith", Child "Emma Smith", Date of Birth 06/14/2020, Case # 4455667) and Section 2 Authorization (start/end dates, Monthly Reimbursement $850.00) — each value small, editable-looking, with a faint confidence tag. Below: linked-record chips (The Smith Family, Emma Smith) and a "Proposed Outcomes" ordered list (Create Subsidy Profile → Create Billing Setup → Link to Emma Smith → Start Reimbursement Workflow → Send Confirmation). Right rail: big "Confidence 94% — High", Likely matches (Family → The Smith Family 95%, Child → Emma Smith), Recommended actions, and primary buttons "Approve All" (Bend Pine) and "Review Manually". Footer strip "BOS found 12 data points · View extracted data".

**Midjourney prompt:**
> Alloy Processing Case detail screen, dark Midnight Forge shell, white canvas, left side a subsidy contract PDF preview in a soft-bordered viewer, right side extracted form fields shown as editable proposals with confidence tags, linked record chips, an ordered proposed-outcomes list, narrow BOS right rail showing 94% confidence and a deep forest green Approve All button, pale sage success accents, Inter type, premium operations tool, no blue, not a web form, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. Header with 2× `Pill/Status`. `Tabs`. Center = two columns: `Drawer/Detail`-style PDF viewer (image placeholder + page/zoom controls) and an extraction panel (label/value rows with `Meta/12` confidence). Linked records = chip row. Proposed Outcomes = numbered list component (5 steps). `Rail/BOS`: `Display/20` confidence, matches list, `Accent/BendPine` "Approve All" + ghost "Review Manually". Build **3 variants** of the right rail + case badge: Low-confidence (61%, Status/Attention), Conflict (paired value rows + Needs Resolution badge), Ready (Pine Mist green checklist, Approve All emphasized).

## Screen 03 — Document Composer

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Document Composer**, document-first authoring (Notion/Google-Docs feel, NOT a form builder). Back-link "Back to Documents". Title "New State Registration Form" with a "Draft" chip; tabs Builder, Settings, Mappings, Preview, History; Save / Actions / Publish (Publish in Bend Pine). Center is a real document canvas with generous margins and document typography: heading "Child Care Facility Registration", "Section 1 — Facility Information" with inline fields (Facility Name, License Number, License Type, Address), "Section 2 — Director Information" (Director Name, Email). A quiet lateral "Add Fields" list (Basic: Short Text, Long Text, Number, Date, Dropdown, Checkbox; Advanced: Section, Table, File Upload, Signature, Divider) supports the document but is not the hero. Right: a "Form Properties" panel (title, description, category, version, status, Requires Signature toggle) and a BOS rail with "This form looks complete" checklist and suggestions ("Add field: Capacity — recommended for state reporting").

**Midjourney prompt:**
> Alloy Document Composer, document-first authoring surface like a Notion/Google-Docs page but enterprise-operational, dark Midnight Forge shell, white document canvas with sections and inline fields, quiet lateral field list (not a drag widget palette), right-side properties panel and BOS suggestions rail, deep forest green Publish button, Inter typography, premium, no survey-builder look, no blue, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. Center document = `Canvas/White` page (max-width column, large margins) with `Title/16` section headers and label+input field rows. Left helper = simple list (Body/14), de-emphasized, NOT a card grid. Right = `Card/Operational` Form Properties (inputs + `Toggle`) + `Rail/BOS` checklist. `Accent/BendPine` Publish in top bar. Empty-state variant = blank page + template picker modal.

## Screen 04 — Packet Builder

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Packet Builder** (enrollment-focused). Back-link "Back to Packets". Title "New Enrollment Packet" + "Draft"; tabs Builder, Settings, Recipients, Preview, History; Save / Actions / Publish (Bend Pine). Three columns: (1) "Packet Contents" reorderable list — Welcome Letter, Enrollment Form, Health Information Form, Immunization Record, Parent Agreement, Tuition Agreement, each with a small type label and an "Add Item" affordance; (2) "Packet Preview" — a warm recipient cover "Welcome to Little Oaks Academy!" with a simple pine-tree mark and intro copy; (3) "Packet Settings" — Name, Description, Visibility (Public), Validity (14 days), Requires Signature (Yes), Reminders (2). Right rail: "This packet is ready" checklist and recommendations ("Add: Emergency Contact Form — recommended by best practices").

**Midjourney prompt:**
> Alloy Packet Builder, three-column enrollment packet composer, dark Midnight Forge shell, left reorderable packet contents list, center a warm branded recipient preview cover "Welcome to Little Oaks Academy" with a pine tree mark in sage and forest green, right packet settings panel, narrow BOS recommendations rail, deep forest green Publish, premium operations tool, not a marketing email editor, no blue, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. Three columns at ~1/3 each. Left = reorderable list rows (drag handle, type tag). Center = `Canvas/White` preview card with Pine Mist header band, pine-mark glyph, recipient copy. Right = settings `Card/Operational` (inputs, `Toggle`, steppers) + `Rail/BOS`. Completion/recipient states live on the Recipients tab (separate frame): per-recipient ready/incomplete rows.

## Screen 05 — Submission Review

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Submission Review**. Back-link "Back to Review". Title "Johnson Family — Enrollment Packet" + "Needs Review", subtext "Submitted 3 days ago". Center: a "Review Steps" vertical checklist — Check Completeness (done), Review Documents (done), Verify Data (in progress), Confirm Signatures (missing), Approve or Send Back; a "Documents" list with per-row status (Welcome Letter — Viewed; Health Information — Complete; Immunization Record — Complete; Parent Agreement — Missing Signature in restrained amber-clay; Tuition Agreement — Complete) with submitter + date; and a "Record Impact" panel listing exactly which record fields this submission would change (submitted vs current). Right rail: "1 item requires attention — Parent Agreement needs signature", "Send Request" (Bend Pine), and "Approve Packet" shown disabled.

**Midjourney prompt:**
> Alloy Submission Review screen, dark Midnight Forge shell, white canvas, vertical review-steps checklist with pale sage done states and one amber-clay "missing signature" attention item, a documents status list, a record-impact panel showing proposed field changes, right-side BOS rail with a Send Request button in deep forest green and a disabled Approve button, premium operations tool, no red walls, no blue, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. Center two-column: `Card/Operational` review-steps checklist (state icons: Pine Mist check, Status/Attention dot) + Documents list rows. Second card = Record Impact (two-column "Submitted | Current" rows). `Rail/BOS` attention variant (Status/Attention header) + `Accent/BendPine` Send Request + disabled Approve. Success-state variant = all steps green, Approve enabled.

## Screen 06 — Linkage & Resolution

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Linkage & Resolution**. Title "Linkage & Resolution" with "Linkage Needed — 1 item requires resolution". Left "Incoming Source" panel: Subsidy Contract — Parent/Guardian Sarah Smith, Child Emma Smith, DOB 06/14/2020, 123 Oak St, Naperville, IL 60540. Center "Potential Matches" as ranked cards with target tabs (Family, Child, Customer, Provider): "The Smith Family — 95%" (123 Oak St, last activity 1 day ago) highlighted with a Pine Mist fill and Bend Pine confidence, then "Sarah Smith — 88%", "The Smith Family — 72%". Right "Selected Match" detail panel (the chosen Smith Family record) and a BOS rail: "Strong match found. Confidence 95%. I recommend linking to The Smith Family", a "Why this match?" list (same address, same name, recent activity), buttons "Confirm Link" (Bend Pine) and "Create New Family Instead".

**Midjourney prompt:**
> Alloy Linkage and Resolution screen, dark Midnight Forge shell, white canvas, left incoming-source summary, center ranked record-match cards with confidence percentages, the top match highlighted in pale sage with deep forest green confidence, right selected-match detail and a BOS rail explaining "why this match" with a Confirm Link button in forest green, premium operations tool, evidence-based human decision UI, no blue, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. Three columns: Incoming Source `Card/Operational`; center `Tabs` (Family/Child/Customer/Provider) + ranked match cards (top card `Highlight/PineMist` fill, `Accent/BendPine` confidence, evidence meta); right `Drawer/Detail` selected match + `Rail/BOS` with "Why this match?" list + `Accent/BendPine` Confirm Link + ghost Create New. Conflict variant = two top cards both high-confidence with a "possible duplicate" banner.

## Screen 07 — Outcome Configuration

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Outcome Configuration** — a Settings surface (not a separate workspace). Settings breadcrumb. Title "Subsidy Contract — Outcomes" with an Active toggle (on, Bend Pine) and Save / Test Outcome; tabs Outcomes, Conditions, Mappings, History. Center "Outcome Steps" ordered list: Create Subsidy Profile, Create Billing Setup, Link to Child, Start Reimbursement Workflow, Send Confirmation Email — each row with a trigger ("When item is approved"), an "Applies To" label, and optional/auto toggles. Right "Outcome Details" panel (Trigger, Applies To, Auto Execute) and "Estimated Impact" (Creates 2 records, Starts 1 workflow, Sends 1 email), plus a BOS "This outcome looks good" checklist and a Bend Pine "Save Outcome" button. Convey that outcomes are proposed and operator-approved, never fired silently.

**Midjourney prompt:**
> Alloy Outcome Configuration settings screen, dark Midnight Forge shell, white canvas, a clean top-to-bottom ordered list of outcome steps (create record, start workflow, send communication) with small toggles, right-side detail and estimated-impact panel, deep forest green Active toggle and Save button, narrow BOS validity checklist rail, premium configuration UI like enterprise settings not a flowchart builder, no blue, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. Center = ordered `Card/Operational` step rows (index number, label, trigger meta, 2× `Toggle`). Right = Outcome Details card + Estimated Impact card + `Rail/BOS` checklist. Top bar: `Toggle` Active (`Accent/BendPine`), ghost "Test Outcome", `Accent/BendPine` "Save Outcome". Empty-state variant = "Start from a recommended recipe" with the Enrollment Form recipe (Create Lead → Create Child → Start Lifecycle → Send Packet).

## Screen 08 — Forms Library

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Forms Library**. Left nav POS with "Forms" active. Top: search, filter, and "New from template". Center: a library of published forms and templates shown as operational cards/rows (not a dense spreadsheet): each with name, owner, status pill (Published / Draft / Archived in Bend Pine or neutral), version (v1, v2), and last-used. Include "Enrollment Form", "CCDF Subsidy Contract", "Child Care Facility Registration". Right: a light BOS rail with usage insight and a suggested template. One row flagged with a small attention chip for a broken mapping.

**Midjourney prompt:**
> Alloy Forms Library, dark Midnight Forge shell, white canvas, operational cards of published forms with status pills and version labels, deep forest green status accents, light BOS insight rail, premium operations tool not survey software, minimal table density, no blue, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. `Shell` + top toolbar (search/filter/New). Center = grid/list of `Card/Operational` form entries (name `Title/16`, owner/last-used `Meta/12`, `Pill/Status`, version `Mono/13`). Right = light `Rail/BOS`. Variants: Empty ("create your first"), Archived filter, attention chip on a card.

## Screen 09 — Packet Library

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Packet Library** with completion visibility. Left nav POS with "Packets" active. Top: search, filter, "New from template". Center: packet cards/rows — name, status, recipients out, and a completion progress indicator (e.g. "4 of 6 families complete") shown as a calm Pine Mist progress treatment (not an analytics chart); include "Enrollment Packet 2026", "Returning Family Packet". Right: light BOS rail with recommended packet structures. One packet flagged for a missing required document.

**Midjourney prompt:**
> Alloy Packet Library, dark Midnight Forge shell, white canvas, packet cards showing completion progress in pale sage, status pills in forest green, light BOS rail, premium operations tool, completion shown operationally not as charts, no blue, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. Center = `Card/Operational` packet entries with a slim progress bar (`Highlight/PineMist` fill, `Accent/BendPine` for complete) + "x of y complete" `Meta/12`. Templates section below. Right = light `Rail/BOS`. Variant: expired-link / missing-document attention chip.

## Screen 10 — Documents Library

**GPT Image prompt:**
> [Shared preamble] Screen: **POS Documents Library**. Left nav POS with "Documents" active. Center: documents grouped by kind — Generated, Templates, State Forms, Recreated, Processed — each entry showing provenance (which Processing Case or record produced it) as a small linkage chip; include a generated "Smith Family — Subsidy Confirmation.pdf" linked to case #4455667. Top: search/filter, "Create Template", "Recreate State Form". Right: a light BOS rail flagging an orphaned generated document and an unmapped recreation. Provenance-first, not a bare file table.

**Midjourney prompt:**
> Alloy Documents Library, dark Midnight Forge shell, white canvas, documents grouped by kind with provenance linkage chips back to cases and records, status pills in forest green, light BOS rail flagging attention items, premium operations tool, provenance-first not a file table, no blue, 1440px desktop UI --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> Frame 1440×1024. Center = grouped sections (section header + `Card/Operational` rows) with a `Pill/Status` kind tag and a provenance chip (links to case/record). Right = light `Rail/BOS` with attention items. Variant: orphaned-document attention state.

## Screen 11 — BOS Right Rail States

**GPT Image prompt:**
> [Shared preamble] Study sheet: **eight states of the BOS right rail**, shown as a row of narrow rail cards against a faint implied workspace, each labeled with its state. Header on each "BOS Assistant — Operational Intelligence". States: (1) Idle — calm summary "23 items need review"; (2) Reviewing — "Reviewing source…" with a subtle progress indicator; (3) Matching — "Searching for matches…" with forming candidates; (4) Recommending — a recommendation card "Link to The Smith Family — 95%, Why?"; (5) Needs Attention — amber-clay accent "Parent Agreement needs signature" with Send Request; (6) Ready — a green checklist "This outcome looks good" with estimated impact and an "Approve All" button in Bend Pine; (7) Approved — the button resolved with a brief confirmation; (8) Completed — a receipt "Done — created 2 records, started reimbursement workflow, sent confirmation" with links. Plus a faded ninth "degraded" rail "BOS is unavailable; workspace is fully usable". Consistent BOS identity throughout; never in the center.

**Midjourney prompt:**
> Eight UI states of an operational AI assistant right rail named "BOS Operational Intelligence", shown side by side as narrow vertical cards, dark Midnight Forge context, white rail cards, pale sage success checklists and deep forest green approval buttons, one amber-clay attention state, one completion receipt state, one faded unavailable state, consistent identity, Inter typography, premium enterprise operations tool, no blue, design study sheet --ar 16:9 --v 6 --style raw

**Figma recreation notes:**
> One frame, 8–9 `Rail/BOS` instances in a row as a state study. Build `Rail/BOS` as a component with a `state` variant property: Idle, Reviewing, Matching, Recommending, NeedsAttention, Ready, Approved, Completed, Degraded. Shared anatomy: header, state/confidence, finding/explanation, recommendation card, approval control (foot). Color: `Highlight/PineMist` checks, `Accent/BendPine` approve, `Status/Attention` for NeedsAttention, muted for Degraded. This component is reused by every other screen frame.

---

## Generation guidance

- Always prepend the **Shared style preamble**; end image prompts by repeating the key "avoid" terms (no blue, no dashboard, no survey builder) — generators drift toward those defaults.
- Generate at 16:9 desktop; for the hero screen (02) and the BOS study (11), also generate the listed **variants** so reviewers see low-confidence/conflict/ready and all rail states.
- In Figma, build `Shell/LeftNav`, `Shell/TopBar`, `Queue/Row`, `Drawer/Detail`, and `Rail/BOS` once as components and reuse them across all frames so the package stays internally consistent and visibly Alloy-native.
- These prompts are visual studies only. They define no schema, API, or implementation and must not be read as a build spec.
