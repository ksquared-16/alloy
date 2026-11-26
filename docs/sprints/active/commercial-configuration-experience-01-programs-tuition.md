# Commercial Configuration — Experience 01: Programs → Tuition

**Status:** ✅ **IMPLEMENTED & SHIPPED** in Commercial Platform V1 (2026-07-03) — Programs → Offerings → Variants → Tuition matrix are live. Retained as the UX rationale. Canonical: **[Commercial Platform V1](../../platform/commercial/commercial-platform-v1.md)**.
**Date:** 2026-06-30
**Builds on:** [Commercial Operating Model](../../platform/core/commercial-operating-model.md) · [Commercial Language Bible](commercial-language-bible.md) · [Operational ↔ Commercial Integration](../../platform/core/operational-commercial-integration.md)
**Methodology:** Architecture → **Product Spec → Operator Experience Spec → UX Blueprint → Mockups → Review** → Implementation → QA. *No implementation before mockups.*

> **The one principle:** the operator is configuring **their business**, not database records. Every interaction must answer *"what business decision is the operator making?"* If it feels like software, redesign it.

> **Words that must never appear in this experience:** Service, Rate Plan, Rate Rule, pricing matrix, dimension, charge template, obligation, GL. **Words that must:** Program, Tuition, per week/month, Full day / Half day, 5 days / 3 days / MWF, Drop-in, Private pay / Subsidy.

---

## 1. Product Specification

### Purpose
Let a childcare director define **the programs they run** and **the tuition for each** — the recurring price of a child's spot — by filling in the grid they already keep on a spreadsheet, so enrollment, attendance, and billing downstream "just work."

### Operator goal
> "Set up my programs and what they cost, so I can enroll families and have billing be correct."

### Business questions this experience answers (for the operator)
1. **What programs do I run?** — Infant, Toddler, Preschool, Pre-K (+ seasonal Camp).
2. **What schedules can families choose?** — 5/4/3/2-day, MWF, Tu/Th (and drop-in / punch pass / unlimited).
3. **What sessions?** — Full day, Half day, AM, PM.
4. **What's the price for each combination?** — the **Tuition Grid**.
5. **Do prices differ by who's paying?** — Private / Subsidy / Corporate (a *lens* here; configured in Experience 03 — Funding).
6. **When do prices change, and what did they used to be?** — effective dates, scheduled increases, history.

### Information hierarchy
- **L0 — Programs** (the spine): the short list a director enumerates first.
- **L1 — Program → Tuition Grid** (rows = Schedule, cols = Session) + program identity (age band, rooms it's delivered in, enrollment window if seasonal) + readiness.
- **L2 — Cell** → the price, its history, and any override.
- **Cross-cutting lens — Funding Source**: a selector that re-prices the grid *view* (Private / Subsidy / Corporate).

### Relationships (operator-facing)
- **Program owns its Tuition Grid.**
- **Schedule** (rows) and **Session** (columns) are the grid axes — defined once at the org level and reused across programs; a program can mark cells it doesn't offer.
- **Location** can override a program's grid (a scoped rate card) — progressive disclosure; single-site orgs never see it.
- **Rooms** are *where* a program is delivered — shown as capacity context, **never priced**.
- **Funding Source** is a lens over the grid (values swap); owned by Experience 03, referenced here.

### Configuration ownership (the doctrine's trichotomy, made concrete)
- **Commercial owner = Program** — carries the tuition.
- **Operational = Room** — capacity/placement; no price.
- **Configuration scope = Org → Location** — Org sets programs, axes, base grid; Location optionally overrides. Rooms never.

### Versioning
- Tuition grids are **effective-dated**. Editing a live grid creates a **new version** with an effective date (default: next billing cycle).
- **Scheduled future changes are first-class** ("Annual increase, effective Sep 1") — visible as a banner before they take effect.
- Per-cell and per-grid **history** ("what families currently pay" vs "what changed when").
- Whether an existing enrollment **locks or floats** to a new rate is a Policy (shown as context, set elsewhere).

### Progressive disclosure
- **Default:** one program, its grid, Private-pay lens.
- **Revealed only when relevant:** Funding lens (only if >1 funding source), Location overrides (only multi-site), non-recurring attendance (drop-in / punch pass / unlimited live in a secondary "Other ways to attend" panel), seasonal enrollment window (only seasonal programs).

### Validation (business-meaningful, never DB-shaped)
- Offered cell with no price → amber: *"Families can't enroll in 3-day Full-day until you set a price."*
- Program with zero priced cells → *"Not ready for enrollment."*
- Overlapping effective dates → flagged.
- A price **decrease** → confirm (unusual; guards typos).
- Soft sanity: room capacity vs program age band.

### Future extensibility
- The same grid model serves other verticals (fitness tier×term, education program×load) and other commitment types.
- **Funding, Discounts, Fees & Add-Ons** are sibling experiences that attach to the same **Program** object — this experience is the spine they hang on.
- The grid feeds the already-built resolver/Tuition pipeline; no new backend concepts are introduced by the UX.

---

## 2. Operator Experience Specification

**How a director actually thinks and works:**
- They begin from **"my programs"** — a short list of 4–6 (Toddler, Preschool…), not "service offerings."
- For each, they want to **"fill in the rates"** — they picture a **grid** (the rate sheet on the wall / the spreadsheet).
- **Terminology they expect:** Program · Tuition · per week / per month · Full day / Half day · 5 days / 3 days / MWF · Drop-in · Private pay / Subsidy / Corporate.
- **What they never want to see:** Services, Rate Plans, Rate Rules, matrices, dimensions, charge templates, GL, obligations.
- **Their flow:** pick a program → see the grid → type prices → save ("effective when?") → mark the program ready.
- **What they reach for:** *duplicate a grid* ("Preschool is Toddler minus $20"), *bulk-adjust* ("raise everything 5% in September"), *see what families currently pay*.
- **Their emotional test:** it should feel like updating their rate sheet — calm, recognizable, theirs. Not "filling out a database form."

---

## 3. UX Blueprint (implementation-ready)

**Shell & language:** Alloy Workspace shell; left configuration nav → **Commercial → Programs & Tuition**. Cards (`rounded-xl`, hairline `alloy-stone` borders, `white/60` surfaces), `alloy-midnight` type, Bend Pine accent for primary actions/active state. Reuse Queue/Card/Drawer interaction grammar.

**Two-pane layout:**

```
┌ Programs & Tuition ───────────────────────────────────────────────────────────┐
│ ┌ PROGRAMS (left rail) ─┐ ┌ PROGRAM WORKSPACE (main) ───────────────────────┐ │
│ │ • Toddler      ● ready │ │ Toddler  · ages 18–36mo · Rooms: 2A, 2B          │ │
│ │ • Preschool    ● ready │ │ Status: ● Ready for enrollment                    │ │
│ │ • Pre-K   ⚠ needs price │ │ ┌ Funding lens:  [Private] Subsidy Corporate ┐  │ │
│ │ • Summer Camp  seasonal │ │                                                  │ │
│ │ ── + Add program ──     │ │ ┌ TUITION (hero card) ───────────────────────┐ │ │
│ │                         │ │ │            Full day   Half day   AM    PM   │ │ │
│ │                         │ │ │ 5 days      $1,240     $980     $720  $720  │ │ │
│ │                         │ │ │ 4 days      $1,060     $850      —     —    │ │ │
│ │                         │ │ │ 3 days       $840      $690     $520  $520  │ │ │
│ │                         │ │ │ MWF          $840      $690      —     —    │ │ │
│ │                         │ │ │ 2 days       $620       —        —     —    │ │ │
│ │                         │ │ │  (— = not offered · amber = priced needed)  │ │ │
│ │                         │ │ └─────────────────────────────────────────────┘ │ │
│ │                         │ │ ▸ Other ways to attend (Drop-in · Punch · Unltd) │ │
│ │                         │ │ ▸ Effective dates & history                      │ │
│ │                         │ │ ▸ Location overrides (only if multi-site)        │ │
│ └───────────────────────┘ └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Cards / sections:**
- **Programs rail** — one card per program: name, age band, readiness dot, "N schedules priced." `+ Add program`.
- **Program header** — name, age band, room chips (capacity context only), readiness status.
- **Funding lens** — segmented control above the grid; shown only if >1 funding source; default Private.
- **Tuition (hero)** — the grid: rows = Schedules, cols = Sessions; cells = price; `—` = not offered (toggle per cell); amber = offered-but-unpriced. Row/column headers editable via "Edit schedules / sessions."
- **Other ways to attend** — collapsed: Drop-in (per day), Punch pass (pack of N), Unlimited (flat). Mirrors the doctrine's commitment types without the jargon.
- **Effective dates & history** — current rates, scheduled changes banner, per-cell history (opens a drawer).
- **Location overrides** — multi-site only: per-location grid deltas.

**Interaction model:**
- Inline cell edit → **Save changes** → effective-date modal (*Apply from: next billing cycle ▼ / specific date*) → creates a version.
- Row/column actions: add/rename/reorder/disable a Schedule or Session (org-wide, with "affects N programs" note).
- Bulk: *Duplicate this grid to…*, *Adjust all by % / $*.
- Cell history: click a cell's history dot → drawer with the price timeline + who changed it.

**Empty states:**
- **No programs** → "Add your first program," with vertical templates (Infant / Toddler / Preschool / Pre-K / Camp) that pre-seed age band + a starter schedule/session set.
- **Program, no grid** → "Set your schedules and sessions, then fill in tuition," with a starter grid pre-populated with `—`.
- **Unpriced cells** → amber inline prompts, and a header chip: "3 schedules still need pricing."

---

## 4. Three competing concepts

### Concept A — Spreadsheet-first (Tuition Grid as the hero)
- **Layout:** the grid dominates the screen; program is a top selector/tabs; minimal chrome.
- **Hierarchy:** Grid › Program › everything else.
- **Cards:** essentially one — the grid; funding lens + effective date as a thin toolbar.
- **Workflow:** pick program tab → type into grid → save.
- **Strengths:** matches the artifact directors already own; fastest data entry; instantly familiar.
- **Weaknesses:** under-surfaces relationships (rooms, funding, versioning, seasonal); risks feeling like *a spreadsheet = software* (violates the core principle); weak home for drop-in/punch/unlimited and for growth (Fees/Funding have nowhere to live).

### Concept B — Program Workspace (Program as the operational hub)
- **Layout:** left programs rail; main = a rich **program page** where the Tuition grid is the hero card among program identity, rooms, enrollment window, readiness.
- **Hierarchy:** Program › Tuition (hero) › supporting panels.
- **Cards:** Program header · Tuition (hero) · Other ways to attend · Effective dates/history · Location overrides.
- **Workflow:** pick program → read its identity → fill the grid → mark ready.
- **Strengths:** matches the operator's mental model ("set up my **Toddler program**"); teaches the business; the natural home for sibling experiences (Fees, Funding, capacity) to attach later; surfaces readiness and relationships.
- **Weaknesses:** more chrome than A; the grid is hero but not full-bleed; larger design surface to get right.

### Concept C — Guided Commercial Setup (question-first)
- **Layout:** a wizard — *What programs do you run? → What schedules? → What sessions? → Fill the grid → Different rates by funding? → Done* — producing the same grids.
- **Hierarchy:** Question › answer › derived config.
- **Cards:** one step per card; a running summary.
- **Workflow:** answer in sequence; land on a summary.
- **Strengths:** best onboarding; teaches the model fastest; enforces completeness; lowest cognitive load for a brand-new operator.
- **Weaknesses:** wizards age poorly for **ongoing edits** (operators return to tweak one cell, not re-run a wizard); still needs a steady-state editor underneath; feels slow for power users.

---

## 5. Converged experience — **Commercial Configuration V1**

**Decision:** **Program Workspace (B) as the steady state, with the Tuition Grid as a full-strength hero (A's energy), and a lightweight Guided Setup (C) for first-run / empty states.**

- **Steady state = B** — because it teaches the business and is the spine that Fees, Funding, and Discounts hang off in later experiences.
- **The grid is the hero (A)** — within the program page, Tuition is the dominant, full-width card that *feels like the rate sheet*.
- **First-run = C** — when there are no programs (or a program has no grid), a short guided flow seeds programs/schedules/sessions, then drops the operator into the workspace. Never a wizard for routine edits.

**Why this converges correctly:** it honors the core principle — the operator configures *their business* (programs), works in *their artifact* (the grid), and is *taught the model* exactly once (first run), never bothered by it again. The three failure modes are each avoided: A's "it's just a spreadsheet," C's "wizards age badly," B's "grid buried."

**This becomes the canonical implementation target.** See the high-fidelity mockup rendered alongside this spec.

---

## 6. Success criteria (acceptance)

When a director opens Commercial Configuration → Programs & Tuition, within seconds they understand:
- **What they offer** — their programs, listed as they'd name them.
- **How they price it** — the tuition grid, reading like their rate sheet.
- **How families pay** — the funding lens (private/subsidy/corporate).
- **What else is charged** — a clear path to Fees & Add-Ons (Experience 02).
- **How it connects** — program → grid → rooms → readiness, visible at a glance.

…without ever encountering Services, Rate Plans, Rate Rules, or anything backend. **It should feel like configuring a business — not configuring software.**

---

## 6b. V2 refinements — accounting separation, ownership modes, bulk operations

### Rate cell scope (frozen)
A tuition cell carries **exactly four things and nothing else**: **price · not offered · scheduled change · inherited-or-local.** No GL account, no funding logic, no policy. Those live in their own cards/experiences and inherit independently.

### Accounting is not on the grid
- **GL mapping never lives on a tuition cell.** Cells define commercial price + availability only.
- **Revenue mapping** is a separate, compact card owned by **Accounting (Experience 05)**, surfaced read-mostly here. It maps **charge categories / tuition types / offerings → revenue accounts**, with its **own inheritance**.
  - Example: *Tuition → Tuition Revenue (4000) · inherited from Accounting.* Override only at **Program / Offering / Location** when genuinely needed.
- **Why:** GL mapping changes ~never and is org-wide; pricing changes often and is per-program/location. Binding them per-cell would leak accounting into a commercial surface and create a 10× setup burden. **Map once by category; inherit everywhere.**

### Ownership modes (honest inheritance)
Tuition declares an **ownership mode** (per the [inheritance doctrine](../../platform/core/configuration-ownership-and-inheritance.md)):
- **Organization managed** — one tuition applies to all sites; per-site **overrides** are the exception (provenance + "Reset to default").
- **Location managed** — each location owns its own tuition; **no "default/override/inherited" language.** A location selector replaces the override model; the operator edits one site at a time.

### Bulk operations (no manual N× setup)
Especially in Location Managed mode, the operator must never hand-enter every cell × every location. Provide:
- **Copy organization grid to all locations** (seed every site from a baseline).
- **Apply adjustment to selected locations** (e.g., +5% at North & South).
- **Compare locations** (the matrix view).
- **Schedule change · effective date** (apply now or future-date any change).

### Bulk-edit pattern (canonical select → scope → apply)
1. **Select locations** (one / several / all).
2. **Select cells or rows** (all Full-day, the 5-day row, specific cells).
3. **Apply** one action: **set price · increase by amount · increase by % · mark not offered · offer this option.**
4. **Effective from** (now / a date) → creates a version.

### Compare locations (the matrix view)
The third Commercial Configuration state, reached from a **Compare locations** view toggle (alongside *Edit one location*). It is how an operator manages tuition across many sites without N× hand-entry.

- **Shape:** schedule·session combinations are **rows**; **locations are columns**. Scoped to one Program + one Payer (e.g., Toddler · Private pay). Selected location columns are tinted; the active program/payer use the standard pale-mint selected style.
- **Cell states (commercial only):** **price · Not offered (explicit) · scheduled change (calendar marker + future price) · local** (a pine dot where a site differs). **No GL codes in cells** — ever.
- **Selection model:** column checkboxes select **locations**; row checkboxes select **schedule·session rows**; a selection summary ("2 locations · 1 row selected") drives the bulk bar.
- **Bulk actions (operate on the selection):** Copy from organization grid · Copy from another location · Apply adjustment · Mark not offered · Offer selected · Schedule change (effective date).
- **Per-location readiness:** a readiness row/header per column — *North ready · South ready · Downtown needs funding · fees · pricing.*
- **Scale:** location **search** + **filter** (region), "**Showing 3 of 10 locations**", *Select locations*, *Show all*, and *+ Add location column*. The matrix shows a working subset; bulk actions can still target "All locations."
- **Accounting stays separate:** a compact **Revenue mapping** reference sits below the matrix (*Tuition → Tuition Revenue · 4000 · inherited from Accounting · not part of these cells*).
- **Language:** locations, schedules, sessions, prices, payers — never rate plan, rate rule, billable source, or IDs.

**How it solves 10-location setup:** seed every site at once (*Copy organization grid to all*), then express only the *differences* — select the sites that diverge, the rows that change, apply one adjustment, future-date it. A 10-site rollout becomes "copy once, adjust the exceptions," and the matrix makes every divergence (and every unfinished site) visible at a glance.

---

## 7. Next experiences (the series this opens)
- **02 — Fees & Add-Ons** (registration, supplies, meals, field trips, before/after care).
- **03 — Funding** (Private / Subsidy / Corporate; payers & splits) — turns the lens here into real rate cards.
- **04 — Financial Rules** (proration, deposit, late fees, vacation credit, withdrawal).
- **05 — Accounting** (hidden GL config; operators rarely touch).
- **06 — Simulator** ("if a Toddler enrolls 3-day Full-day on subsidy, what gets billed?").
