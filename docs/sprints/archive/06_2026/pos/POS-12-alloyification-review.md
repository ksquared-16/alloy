# POS-12 — Alloyification Review

> **Status:** Planning artifact — visual/experiential alignment review. Draft.
> **Not product, not architecture, not schema, not API.** No new concepts, no doctrine changes, no renamed objects, no redesigned workflows or navigation, no change to the Processing Case model. **Only visual language evolves.**
> **Source of truth:** actual Alloy doctrine — `docs/system/bos-identity-doctrine.md`, `action-workspace-foundation.md`, `work-unit-layout-doctrine.md`, `queue-record-doctrine.md`, `typography-and-presentation-doctrine.md`, `settings-v2-doctrine.md`, `drawer-operating-model-v1.md`, `docs/product/bos-foundation.md` — plus POS-01…11.
> Branch: `pos-planning-v1`.

## Why this sprint exists

The POS concepts (POS-07 → POS-10, and the rendered visual concepts) successfully validated the **product**: doctrine, Processing Case, outcome framework, BOS participation. But the visuals still read as **enterprise SaaS / case-management / document-review software**. They do not yet inherit the visual and experiential DNA of **Work Units, Drawers, BOS, and the Action Workspace**.

This review measures the three decisive screens against actual Alloy doctrine and prescribes the changes that make them indistinguishable from the rest of Alloy. The test: *if these screens appeared in Alloy tomorrow, would an operator immediately recognize them as Alloy?* Today: **not yet.** This document is how we get to yes.

## The Alloy DNA POS must inherit (extracted from current doctrine)

A compact reference the three screens are scored against:

- **Color (restrained).** Midnight/navy = structure + primary text. **Bend Pine = the emerald Alloy mark color `#00A283` / `alloy-juniper`** — used for BOS, positive/selected/active states, and primary action affordances **only**. Muted slate = secondary text. `alloy-stone` = neutral borders. Amber = *actual* attention only; red = severe/blocking only. Minimal blue (track/selection); soft green (saved/success). **Forbidden:** loud green everywhere, generic enterprise/plugin blue, **rainbow statuses**, heavy teal outlines, decorative colored icon circles. (`queue-record-doctrine.md` §Color, `work-unit-layout-doctrine.md` §Queue icon color, `settings-v2-doctrine.md` §Visual.)
- **Typography (six tiers, values win over labels).** Tier 1 record title (bold, midnight, ~14px in queue), tier 2 section header, tier 3 data value (**not** muted, medium, ≥90% midnight), tier 4 uppercase label, tier 5 supporting, tier 6 empty. No ad-hoc sizes/opacity. (`typography-and-presentation-doctrine.md`.)
- **Dates.** Compact display only — `Jun 14, 2020`, `Created Jun 11`, `May 20 · 2:30 PM`. **Never** `MM/DD/YYYY` or ISO on operator surfaces. (`typography-and-presentation-doctrine.md`, `queue-record-doctrine.md` §Date.)
- **Work Unit layout.** Two zones only — **Header → Queue**; nothing below the queue. Queue is the dominant surface and owns scroll (6–7 rows). Right **command rail** order is fixed: **Actions → Workflow Telemetry → BOS**, BOS a sticky dock that never shrinks. (`work-unit-layout-doctrine.md`.)
- **Queue row.** Compressed operational surface (not a table/form/cards): Identity · Related · Status/context · Attention/next-step · Date · **fixed action rail (Work with BOS + Actions)**. Neutral metadata icons; pine only on BOS/action affordances. (`queue-record-doctrine.md`.)
- **Drawer presentation.** Pure **white canvas**, depth from **section panels** — each a **pine left accent + white surface + soft shadow**, with a **soft emerald header band (`from-emerald-50/70`), icon badge, UPPERCASE eyebrow, semibold title**. Centerpiece sections get stronger radius/shadow. Empty ≠ disabled. (`typography-and-presentation-doctrine.md` §Drawer, `drawer-operating-model-v1.md`.)
- **Action Workspace.** **Gather → Review → Execute → Success/Continue** with a step rail; BOS suggestions are **confidence + inline edit + Apply** (not auto-applied); **fast path** skips Review when confidence is high, platform minimum met, and no edits; Execute is visible; Success (~1.4s) then opens the record/drawer. (`action-workspace-foundation.md`.)
- **BOS identity (FROZEN).** BOS = the **Alloy mark in Bend Pine** (`BosMark`), the **`BosHeader`** lockup for territory headers, **`BosNotification`** cards for insights. Motion = **smoke / working reveal** (cloud condensing into the mark) while BOS analyzes; **`BosExecutionLoader`** (numbered phases) for execution. **Rejected:** boxed/badged mark (dark rounded square with a letter), genie, star/sparkle/AI icons, spinning/pulsing mark. (`bos-identity-doctrine.md`.)

---

## Focus Screen 01 — Processing Workspace

### Current State Assessment
The concept is a credible operational queue with a BOS rail, but it presents as a **case-management dashboard**: a standalone counter strip on top, a queue with decorative colored source-glyphs, multi-tone status pills, and a single floating BOS card as the entire right rail. It answers "how many cases exist?" before "what requires my attention?"

### What Still Feels Un-Alloy
- It reads as its own product's dashboard, not as a **`WorkUnitWorkspace`**. A current Alloy operator opening it would not feel "this is my work unit."
- The right side is a lone BOS card, not the canonical **command rail**.
- Color is doing decorative work (per-channel glyph colors, several status tones), which Alloy explicitly forbids.

### Specific Doctrine Violations
1. **Decorative colored icon circles** per row (green/blue/purple/amber by source type) — violates `work-unit-layout-doctrine.md` (neutral metadata icons; pine reserved for BOS/actions) and `queue-record-doctrine.md` §Color ("no rainbow statuses," "do not use decorative pine circles").
2. **Standalone counter chips** as a top strip — violates the Header→Queue two-zone rule; counts belong in the header KPI/lane context, not a SaaS metrics row.
3. **Right rail is BOS-only** — violates `work-unit-layout-doctrine.md` fixed rail order **Actions → Workflow Telemetry → BOS**; BOS is a sticky dock at the bottom of the rail, not the whole rail.
4. **BOS drawn as a dark circular "B" badge** — violates `bos-identity-doctrine.md` (rejected "dark rounded-square logo badges / boxed mark containers"; no generic letter mark). Must use `BosMark` / `BosHeader`.
5. **Multi-tone status pills** (Pine Mist "Ready," amber, clay) trend toward a rainbow status system — `queue-record-doctrine.md` restricts amber to attention, red to blocking, pine to positive/selected.
6. **No fixed per-row action rail** (Work with BOS + Actions) — required by `queue-record-doctrine.md` §Actions.

### Recommended Changes
- Rebuild on the **`WorkUnitWorkspace` two-zone frame**: a **Header** (lifecycle/lane title, filter pills, compact KPI/lane-context strip where the state counts live) → a **Queue** that dominates and owns scroll at 6–7 rows.
- Adopt the **queue-record row anatomy**: Identity (case title tier-1 bold midnight · primary family · muted detail) · Related (linked child) · Status/context · Attention/next-step · compact **Date** (`Received 2m ago`, `Tour Jun 22`) · **fixed action rail** with **Work with BOS** (Bend Pine) + Actions.
- **Neutralize iconography:** one neutral metadata glyph for source type; reserve Bend Pine for the Work-with-BOS control and selected/active state only.
- **Restrain status:** neutral by default; amber only for genuine attention; pine for ready/positive — no per-state palette.
- Add the **command rail**: collapsed **Actions (N)** and **Workflow Telemetry (n)** single-row modules above a **sticky BOS dock** rendered with `BosHeader` + `BosNotification` recommendation cards.

### Before / After Experience
- **Before:** "Here's a dashboard of all my cases and some stats." A reviewer thinks *case-management software.*
- **After:** "This is my processing work unit — the queue is the work, BOS rides in the rail, and attention is obvious." A reviewer thinks *another Alloy work unit.*

### Confidence Rating
**Medium → High after changes.** The structure exists; the work is conforming it to `WorkUnitWorkspace` + queue-record + command-rail doctrine and de-coloring it. No product change required.

---

## Focus Screen 02 — Processing Case (the decisive screen)

### Current State Assessment
The concept is **document-centric**: a source-PDF preview shares the top of the canvas with extracted fields, then linked records, then proposed outcomes, then a BOS rail. It reads like a **document-review tool with an approval sidebar** rather than an Alloy operational work object.

### What Still Feels Un-Alloy
- Opening it feels like **opening a PDF review tool**, not **opening a Work Unit record (Drawer)** or stepping into an **Action Workspace**.
- The hierarchy leads with the document and its extraction; the **Processing Case** and its **Proposed Outcome** are not the visual hero.
- Section chrome is generic white cards, not the Alloy drawer panel system; BOS is a boxed badge; dates are mis-formatted.

### Specific Doctrine Violations
1. **Hierarchy inverted.** Current reads Document → Extracted Information → Outcome. Target (and product intent, POS-02/08) is **Processing Case → Proposed Outcome → Supporting Evidence.** The document is supporting evidence — it belongs in a peeking **Drawer**, not a co-equal canvas column (`drawer-operating-model-v1.md`: the drawer is where records/detail live).
2. **Generic card chrome** — violates `typography-and-presentation-doctrine.md` §Drawer: sections must use the **pine-left-accent white panel + soft emerald header band + UPPERCASE eyebrow + icon badge**; the Proposed Outcome should be a **centerpiece** panel (stronger radius/shadow).
3. **`MM/DD/YYYY` dates** ("06/14/2020", "06/01/2026") — explicitly forbidden on operator surfaces; must be `Jun 14, 2020`.
4. **Extraction shown as static document read** — should be the **Action Workspace BOS-suggestions** pattern: confidence + inline edit + **Apply** (`action-workspace-foundation.md`), so values read as BOS proposals an operator confirms, reinforcing records-own-truth.
5. **No Gather → Review → Execute step rail / fast path** — the approval moment should inherit the Action Workspace contract (BOS has *gathered* from the source → operator **Reviews** → **Approve all** is **Execute** → **Success ~1.4s** opens the created record drawer). Fast path applies when confidence is high and the operator made no edits.
6. **BOS "B" badge + "Operational intelligence"** — boxed-mark violation; use `BosHeader` lockup; execution uses `BosExecutionLoader` numbered phases, not identity smoke.
7. **Typography not tiered** — extracted values must be tier-3 (medium, ≥90% midnight) with tier-4 uppercase labels; values must win over labels.

### Recommended Changes
- **Re-rank the canvas to the product hierarchy.** Tier-1 case title (`Lead — Smith Family · Subsidy contract`) → **Proposed Outcome as the centerpiece panel** (the operative decision) → **Supporting Evidence** panel that shows the source compactly and **opens the document in a Drawer** on demand. The document supports the case; it never co-headlines.
- **Adopt drawer section chrome** for every panel: pine left accent, white surface, soft emerald header band, icon badge, uppercase eyebrow, semibold title; empty sections keep full chrome (Empty ≠ disabled).
- **Make extraction an Action Workspace review.** Present extracted values as **BOS suggestions** with confidence and inline edit; the weak field (case number) sits in a `bos-results` review state; **Apply** promotes them into the case. A **step rail** (Gather → Review → Execute → Continue) frames the screen; high-confidence cases get the **fast path** straight to Execute.
- **Execute like Create Lead.** **Approve all** is the Execute affordance (Bend Pine); show a visible execute state via `BosExecutionLoader` (Create subsidy profile → Create billing setup → Link to child → Start reimbursement workflow → Send confirmation); on Success (~1.4s) open the resulting subsidy/billing record **Drawer** — the same `onCreated` handoff Alloy actions already use.
- **Fix dates and tiers** to the presentation tokens throughout.
- **Rebuild BOS** as `BosHeader` + `BosNotification`; confidence as a tier value, not a boxed score.

### Before / After Experience
- **Before:** "I'm reviewing a PDF; there's an approval panel on the side." A reviewer thinks *document-review software.*
- **After:** "I opened a Processing Case the way I open a Work Unit record; BOS already gathered the facts; I review its suggestions and approve, and it opens the record it created — just like Create Lead." A reviewer thinks *this is an Alloy work object.*

### Confidence Rating
**Medium today → High after changes — and this is the screen that determines the initiative.** The product is right; the visual/experiential inheritance (drawer chrome + Action Workspace flow + correct hierarchy) is what's missing. No change to the Processing Case model.

---

## Focus Screen 07 — Outcome Configuration

### Current State Assessment
Structurally strong — a readable, ordered recipe in Settings — but the rendering (numbered step cards, per-step toggles, colored category tags) still leans **workflow-builder / automation software**.

### What Still Feels Un-Alloy
- It resembles an automation tool's step editor more than an **Alloy Settings V2 / Business Processes** configuration surface.
- Category color tags (Record/Billing/Workflow/Communication in blue/purple/amber) reintroduce a rainbow the rest of Alloy avoids.

### Specific Doctrine Violations
1. **Colored category tags** (blue/purple/amber) — violates restrained-color doctrine (`settings-v2-doctrine.md`: minimal blue, avoid generic enterprise blue; `queue-record-doctrine.md`: no rainbow). Category should be neutral/text, with pine reserved for active/affordance.
2. **Per-step toggles on every row** read as an automation builder — `settings-v2-doctrine.md` prefers **config sections** and **one Save per workspace**, not per-row control panels (and warns against "dense control panels").
3. **BOS "B" badge** — boxed-mark violation again.
4. **Generic card chrome** — should inherit the **Settings V2 / Business Processes** stage-config chrome (white canvas, pine-accent section panel, premium spacing, soft-green saved state) used at `/admin/settings/lifecycle`.

### Recommended Changes
- **Reskin as Settings V2 / Business Processes config.** White canvas; a single pine-accent section panel titled "When approved" containing the recipe as a calm **configured list** (the same read as the case's Proposed Outcome), not numbered builder cards with handles.
- **Neutralize category** to a quiet text/eyebrow ("Record", "Workflow", "Communication") — no per-type color; pine only for the active/affordance.
- **One Save.** A single "Save outcome" (soft-green confirmation on save), no per-section/per-row save or toggle clutter; auto-execute, if shown at all, is a single subordinate setting consistent with the open V1 decision (POS-11).
- **Mirror the runtime.** The configured steps should visually match the Processing Case's Proposed Outcome panel one-to-one, so config and runtime read as one system.
- **BOS** via `BosHeader`/`BosNotification` validity card.

### Before / After Experience
- **Before:** "This is a workflow/automation builder." A reviewer thinks *automation software.*
- **After:** "This is Alloy Settings — I configure what a subsidy contract should do the same way I configure a business process." A reviewer thinks *Alloy operational configuration.*

### Confidence Rating
**Medium-High → High after changes.** The structure is already close; this is a reskin to Settings V2 chrome and a de-coloring, not a redesign.

---

## Verdict

All three screens are **fixable by visual inheritance alone** — no product, doctrine, object, workflow, or navigation change. The recurring root causes are consistent and narrow:

1. **BOS rendered as a boxed "B" badge** instead of the frozen `BosMark`/`BosHeader` identity. (All three.)
2. **Color doing decorative work** (rainbow glyphs, multi-tone statuses, category colors) instead of Alloy's restrained palette. (All three.)
3. **Generic card chrome** instead of the **pine-left-accent + emerald-header-band drawer/section panel** system. (Cases 02, 07.)
4. **Missing structural inheritance** — Work Unit two-zone + command rail (01), drawer hierarchy + Action Workspace flow (02), Settings V2 chrome (07).
5. **Mis-formatted dates** and **un-tiered typography.** (01, 02.)

Fix these and POS stops looking like "new software" and starts looking like "the next Alloy module." The concrete, generation-ready prescription is **POS-13**.

**Readiness:** with POS-13 applied, POS clears the visual-inheritance bar and is ready to move into the **Architecture Gate** (POS-11 verdict stands).
