# Operator Experience Specification — Rate Plans (the Pricing Matrix)

**Type:** Implementation-ready Operator Experience Specification (design only — no code, no mockups, no migrations, no runtime).
**Scope:** The deep expansion of "Screen 2 — Rate Plans (the Pricing Matrix)" from `financial_configuration_product_spec.md` (§3). That document is canonical; this one is almost mechanical underneath it.
**Author posture:** Principal Product Designer / UX Architect / Operator — not engineer.
**Date:** June 2026.

> **Governing principle (inherited):** Operators configure a business, not a database. A Rate Plan is *the price table a director would hand to a parent* — schedule shape down the side, age group across the top, a dollar amount in each cell. The rate rules underneath are a storage detail the operator never names. Every decision below is judged by one test: does this feel like setting our tuition, or like editing rate-rule rows? If it feels like rows, it is redesigned here.

This spec composes only frozen Alloy primitives. It invents no new design language, no new shell, no new nav. It inherits the global patterns **P1–P7** from the canonical spec (§0.1) and does not restate them except where a Rate-Plan-specific consequence needs spelling out.

---

## 1. Purpose

Define **how recurring services are priced** as a single readable pricing matrix per service per scope — weekly (or monthly) tuition by *how many days a child attends* and *which age group they're in* — at the organization level and, by exception, at each location.

The Rate Plan answers the recurring half of the financial graph. It is the thing the Financial Simulator reads to say *"$285 because Riley is on the 5-day Toddler schedule."* It is the screen the canonical build sequence (§10) ranks **highest operator value** — the one that "turns the weakest current screen into the strongest."

What this screen is **not**: it is not a list of Rate Rules, not a rule editor, not a place where the word "Hybrid", "Plan Key", or "billable source" appears. Those are rejected outright (canonical §11).

---

## 2. Operator mindset

The operator arriving here is a center director or org admin who already thinks in a table. Ask any director "what's your tuition?" and they say: *"Five days is $285 for toddlers, $265 for preschool; four days is $245…"* — rows and columns, in their head, already. The screen's entire job is to **render the table they already carry** and let them change a number in it.

Three things are true about this operator:

- **They quote price by schedule and age.** Days-per-week and age group are their real pricing axes. Nothing else is primary.
- **They price once for the org and tweak by exception per location.** They do not maintain twelve independent tables. They maintain *one*, and remember "North Campus is a bit more for toddlers."
- **They are interrupted and under pressure** (Visual Language #8). The matrix must be scannable in two seconds: where are the prices, which ones differ, is anything missing.

The wrong mindset to design for is the engineer's: "a rate plan is a set of rate rules keyed by schedule-shape × age-band × location with effective dates." True underneath, fatal on the surface.

---

## 3. The primary question being answered

Every screen in Alloy is a card-shaped answer to one operational question. The Rate Plan workspace answers:

> **"How much do we charge for this service, by how many days a child attends and how old they are — here, and at each location?"**

Every card on the screen is a narrower answer that rolls up into that one. If a surface does not help answer it, it does not belong on this screen (it belongs in Services, Policies, Accounting, or the Simulator).

---

## 4. The Pricing Matrix (rows · columns · cells)

The matrix is the heart of the screen and the literal embodiment of "configure the business, not the schema" (canonical §3.16). It is rendered as a `ConfigurationDetailCard` titled with its question — **"The price table"** — containing the grid.

### 4.1 What the matrix looks like (reference shape, from canonical §3.3)

```
The price table          Standard Tuition · Full-Time Care · North Campus

                  Toddler (18–36mo)   Preschool (3–5yr)   Pre-K (5yr+)
  5 days / week        $285               $265               $250
  4 days / week        $245               $230               $220
  3 days / week        $195               $185               $175
  2 days / week        $145               $140               $135
  Half day             $165               $155               $150
  Hourly               $12 / hr           $11 / hr           $10 / hr

  Charges for:  ◉ Scheduled days   ○ Attended days   ○ Flat weekly
```

### 4.2 Rows — schedule shape

Rows are the operator's pricing axis: **how much of the week a child is here.** The row set is fixed vocabulary, not free-form:

| Row | Meaning to operator | Appears when |
|---|---|---|
| 5 days / week | Full week | Always (for a recurring, day-based service) |
| 4 days / week | Four days | Always |
| 3 days / week | Three days | Always |
| 2 days / week | Two days | Always |
| Half day | Partial-day enrollment | Only if the service supports half-day delivery |
| Hourly | Drop-in / hourly care | Only if the service supports hourly delivery |

**How the row set is determined:** the *recurring, day-based* rows (5/4/3/2 days) are the default backbone for any day-based service. **Half day** and **Hourly** are progressive rows — they appear only when the priced Service has the corresponding delivery turned on (canonical §3.14: "Hourly/Half-day rows appear only if the service supports them"). This is meaning-driven disclosure (Visual Language #1): the row exists because the business offers that shape, not because the schema has a slot.

A 1-day row is intentionally **not** a default. If an org sells 1-day enrollment, that is a future row the model absorbs without a new screen (§16) — but it is not shipped noise for the 99% who don't.

The Hourly row is dimensionally different from the day rows (its cell is a *per-hour* rate, not a *per-week* price). The matrix labels its cells `$12 / hr` so the operator never confuses an hourly rate with a weekly price. This is the one place the matrix shows a unit suffix inline.

### 4.3 Columns — age groups

Columns are **age groups**, and they are **not authored on this screen.** They are driven by the organization's configured age bands (canonical §3.14: "Age columns follow the org's configured bands"). This is a hard ownership rule:

- The org's age bands (Toddler 18–36mo, Preschool 3–5yr, Pre-K 5yr+, etc.) are owned upstream (Locations/Programs configuration, per Configuration Ownership Doctrine).
- The Rate Plan **reads** them as columns. Each column header shows the **operator name + the age range** (`Toddler (18–36mo)`) so the director reads meaning, not a band id.
- The operator cannot add, rename, reorder, or delete a column here. If they need a new age group, the screen tells them where that lives (a quiet "Age groups are set in Programs" line under the table, deep-linking out) rather than letting them author a column that the rest of the platform won't recognize.

**Why columns ≠ rows in authorability:** rows are pricing *intent* the operator owns ("we sell 2-, 3-, 4-, 5-day"). Columns are operational *facts* owned elsewhere ("these are our age groups"). Conflating them would let an operator invent a column the scheduling/enrollment engine has never heard of — a record the rest of the system can't honor. One authoring home per concept (Interaction Grammar).

### 4.4 Cells — the price

Each cell is **a money amount** — the price for that schedule-shape × age-group combination. Underneath, a cell *is* a rate rule; the operator never sees that word. Editing a cell *is* superseding a rule (§12), but the verb the operator experiences is "type a new price."

**Reading a cell (Summary mode):** a cell renders as plain money typography (`config-typo-*` numeric), right-aligned within its column, calm and scannable. The day-row cells read as bare amounts (`$285`); the Hourly row reads with its unit (`$12 / hr`). A cell that has no value reads as a muted, unmistakable **"—"** with an attention treatment (§17), never as `$0` (zero is a real price; empty is a missing price — they must look different).

**Editing a cell (intentional, P3):** the operator clicks a cell; it becomes a focused **money input** rendered by `ConfigNumberInput` in its money configuration (the platform money primitive, Visual Language #7). Editing is one cell at a time; the rest of the table stays readable around it (no full-table form mode — that would betray P3 and Visual Language #4). On commit, the cell returns to read typography. Tab/Enter advance to the next editable cell so a director filling a fresh table can move fast without reaching for the mouse — but each commit is still a discrete, intentional value, not a bulk form submit.

**What a cell is NOT:** it is not selectable as an object, has no detail drawer, no "open rule", no id. There is nothing "inside" a cell to navigate to. The cell is the leaf. (If a director ever needs to know *why* a cell is the price it is — e.g. inherited vs overridden — that answer lives in the override visualization §9 and the Simulator's resolution explanation, not in a cell drill-down.)

### 4.5 Which component renders the matrix

The matrix lives inside a `ConfigurationDetailCard{title:"The price table"}`. Row labels and column headers use `ConfigFieldLabel` typography. Cells in read state are money-formatted text; cells in edit state are `ConfigNumberInput` (money). The whole card sits inside `ConfigurationWorkspace` (the flex column). The matrix is **not** a `ConfigFieldGrid` of generic fields — it is a purpose-shaped grid; `ConfigFieldGrid` is reserved for the metadata cards around it (§8).

---

## 5. "Charges for" — the calculation strategy (no "Hybrid")

Directly beneath the matrix sits the **"Charges for"** control — the calculation strategy in plain language. **"Hybrid" is removed entirely** (canonical §3.3, §9 translation layer). The three options, as a single `ConfigSelectInput` (or an equivalent three-way control inside the "How does it charge?" card §8):

| Option | What it means to the operator | What it does |
|---|---|---|
| **Scheduled days** | "We charge for the days they're signed up for, whether or not they show." | Price reads the row matching the child's *scheduled* days-per-week. |
| **Attended days** | "We charge for the days they actually attended." | Price reads the row matching *attended* days in the period. |
| **Flat weekly** | "We charge one weekly rate regardless of which specific days." | Uses the schedule-shape row but does not vary by which days; the week is the unit. |

These three replace the old `hybrid` enum literal with three honest business choices. The operator picks the *billing philosophy* their business actually runs on. Each option is one short sentence the director would say aloud.

**Where "Charges for" is rendered and read:** as a labeled choice in the **"How does it charge?"** card (§8), echoed as a one-line caption under the matrix so the table is self-explaining ("Charges for: Scheduled days"). It is effective-dated like everything else (§12): changing it is a scheduled change, because it alters how every future invoice computes.

**The relationship to rows:** "Charges for" decides *which row of the matrix the runtime reads for a given child.* The matrix supplies the prices; "Charges for" decides which price applies. This is worth stating in the spec because it is the one place row semantics and strategy intersect — and the Simulator's resolution explanation (canonical §7.6) names both.

---

## 6. Setup journey (the screen's three doors)

An operator reaches Rate Plans three ways, and the screen behaves differently for each. The section opens in **Summary mode** (P3) — never a blank form.

1. **From the Section Queue → Rate Plans.** The Object Queue (320px) fills with the org's rate plans, one `ConfigurationQueueItem` each (title = plan name, subtitle = service it prices, trailing = effective badge / scope badge). Selecting one fills the Workspace with its detail (§7). Selecting none shows the section empty/first-run state (§18, §19).
2. **From a Service ("How is it priced?", canonical §2.4).** Deep-links straight into that service's plan(s) — context already narrowed to one service.
3. **From the Simulator's dead-end fix** ("no price for a 4-day Toddler schedule" → Rate Plans, canonical §7.9) — lands on the exact plan and ideally scrolls the offending cell into view with its attention state lit.

The shared per-section workspace anatomy (canonical §1.3) applies: **Context band** (`ConfigurationContext` — the operator question + one-line purpose) → **`ConfigReadonlyNotice`** (P2: *"This is configuration. It does not post money."*) → **Summary-mode body** (the cards) → **Object Queue** for lineage selection → inline / effective-dated editing only, never a modal form.

---

## 7. Information hierarchy

Top to bottom, the Rate Plan detail answers in this order (canonical §3.4), because it mirrors how a director reasons: *what is this for → what are the prices → how does it charge → where does it apply → how has it changed.*

1. **Which service & where** — plan name, the Service it prices, and the scope (`ConfigScopeBadge`: "Organization default" or "North Campus override"). **Plan Key hidden** (P1).
2. **The matrix** — the price points (§4). The visual center of gravity.
3. **How it charges** — "Charges for" strategy + billing basis (weekly / monthly) + currency, in words (§5).
4. **Where it applies** — the multi-location consumption card (§10).
5. **When it's effective** — current vs scheduled vs historical (§13).

Hierarchy = visual weight. The matrix gets the most space and the calmest, largest typography. Scope and strategy are supporting chips/sentences. History is a rail, not a wall.

---

## 8. Cards (the answer set)

Each card is a `ConfigurationDetailCard` titled with the operator's question (P5). One question per card; no field-group-with-a-noun.

| Card (question) | Component | Content | Family |
|---|---|---|---|
| **"What does this price?"** | `ConfigurationDetailCard` + `ConfigScopeBadge` + `ConfigEffectiveBadge` | Plan name, the Service it prices, scope badge (org default / location override), current-effective badge. Plan Key hidden. | Identity / Financial |
| **"The price table"** | `ConfigurationDetailCard` containing the matrix (§4) | Rows × age columns × money cells + "Charges for" caption. | Financial |
| **"How does it charge?"** | `ConfigurationDetailCard` + `ConfigSelectInput` | "Charges for" (Scheduled/Attended/Flat weekly), billing basis (weekly/monthly), currency. Plain language. | Financial |
| **"Where does this apply?"** | `ConfigurationDetailCard` (§10) | Inheriting locations + overriding locations, each linking to its effective table. | Process / Financial |
| **"Pricing history"** | `EffectiveDatedConfigurationEditor` timeline (§13) | Current / Scheduled / Superseded / Retired rail; "as of" viewing; schedule-a-change entry. | Activity |

Metadata inside the "What does this price?" and "How does it charge?" cards may use `ConfigField` / `ConfigFieldGrid` / `ConfigFieldLabel`. The matrix card does **not** — it owns its purpose-built grid.

---

## 9. Location overrides & override visualization (the diff)

This is the screen's most distinctive interaction and the one most easily ruined by a naïve "edit twelve tables" approach.

### 9.1 The model

- **One plan is the Organization default.** Every location **inherits** it unless explicitly overridden (canonical §3.7).
- **An override is a diff, never a fresh table.** It is presented as **"Same as organization, except…"**. The operator changes the one or two numbers that differ — not all twelve.

### 9.2 What the diff looks like

When viewing a **location override**, the matrix is the *same grid* as the org default, but every cell carries one of two visual states:

- **Inherited cell** — the value is shown in **muted text** (stone, lower contrast). It is the org default value, displayed for context, read-only-feeling. The operator sees the full table so the price is legible end to end — but the muting says "this isn't your number, it's the org's."
- **Overridden cell** — the value is shown in **Bend Pine `#00a283`** (the active/changed color), at full contrast, optionally with a tiny "was $285" ghost so the director sees both the new and the inherited value. The Bend Pine says "you changed this; this is North Campus's own number."

So the canonical example reads at a glance: *"North Campus 5-day Toddler is $295 (Bend Pine) instead of $285; everything else inherited (muted)."* (canonical §3.7).

### 9.3 Editing in the diff

- Clicking a **muted (inherited) cell** opens the money input pre-filled with the inherited value; committing a *different* number promotes it to an **override** (turns Bend Pine).
- Each overridden cell offers a quiet **"Match organization"** affordance that drops the override and returns the cell to inherited/muted — the inverse of creating one. This is how an operator un-does a single override without nuking the whole location override.
- Committing the *same* number as the inherited value is caught by validation as a redundant override (§17) — the operator is nudged to leave it inherited.

### 9.4 Why the diff, not a copy

A copied table goes stale: the org raises 5-day Toddler to $290 and the location's untouched copy silently keeps $285. The diff *binds* inherited cells to the org default, so an org-level change flows to every location except the cells they deliberately pinned. This is the difference between "a location's price" and "a location's *difference* from the price" — and only the latter stays correct over time. (This is also why §17 surfaces "redundant override": a pinned-but-identical cell is a stale-bomb waiting to happen.)

### 9.5 Component

The override matrix is the same matrix card (§4.5); the muted/Bend-Pine cell states are presentation states of the same cells. The scope is carried by `ConfigScopeBadge{label:"North Campus", override:true}`. Creating/voiding an override version runs through `EffectiveDatedConfigurationEditor` like any other versioned change (§12).

---

## 10. How multiple locations consume one plan

The **"Where does this apply?"** card (`ConfigurationDetailCard`) is the operator's answer to *"who uses this price, and who's different?"* (canonical §3.7).

It renders as two short, scannable groups — not a node graph, not a map (calm under pressure, Visual Language #8):

- **Inherited by** — the locations using the org default unchanged, as a count + chip list: *"Inherited by 3 locations: Bend Pine, Cedar Hollow, Maple Court."*
- **Overridden at** — the locations that differ, each with a one-line summary of *what* differs: *"North Campus — 5-day Toddler is $295 (1 cell differs)."*

Each location is clickable. Clicking shows **that location's effective table** (the §9 diff view for an overridden location; the plain org table, scope-badged to the location, for an inheriting one). This is how an operator audits "what does Cedar Hollow actually charge?" without leaving the plan.

**Create-an-override entry point lives here.** An inheriting location row carries a quiet **"Price differently here"** action → opens the diff editor (§9) pre-seeded with the org default, effective-date prompted. The operator changes one number and saves; the location moves from "Inherited by" to "Overridden at."

**Why one plan, many consumers (not many plans):** the org default is the single source of truth; locations are *consumers with optional, bound exceptions.* This keeps "what's our tuition?" a one-table answer with a clearly enumerated list of deviations — exactly how a director holds it in their head.

---

## 11. Resolved pricing ("as of")

Operators sometimes need not "what's the org table and the diff" but the **flat, final answer**: *"What does a child at North Campus actually pay today?"* — inheritance already resolved.

The **Resolved pricing** view is a presentation mode of the matrix that:

- Takes a **location** (or "Organization") and an **as-of date** (`ConfigDateInput`, defaulting to today).
- Renders **one flat table** with the *effective* number in every cell — inherited and overridden cells both shown at full contrast in a single neutral treatment (no muting, no Bend Pine), because this view answers "what's the price," not "what differs." Overridden cells may carry a small dot so a careful reader can still see which were pinned, but the table reads as one settled price list.
- Carries a caption: *"This is what North Campus charges as of June 29, 2026."*

This is the table a director would screenshot for a parent. It is **read-only** (a projection — Interaction Grammar: projections never own truth; you cannot edit a resolved table, you edit the org default or an override). It uses the same `EffectiveDatedConfigurationEditor` "as of" machinery (canonical §3.8) so changing the date re-resolves both inheritance *and* effective-dating in one move (e.g. "as of Sep 1" shows next term's scheduled prices, resolved through the override).

**Relationship to the Simulator:** Resolved pricing answers "what's the *price*"; the Simulator answers "what would *this child* be charged and *why*" (canonical §7). Resolved pricing is the static table; the Simulator is the per-child trace that reads it. The "Why this result?" resolution explanation in the Simulator (§7.6) names the exact cell this view would show.

---

## 12. Editing workflow (the three flows, step by step)

All editing is inline or via the shared effective-dated editor — never a separate route, never a modal form (canonical §1.3). The verb is **"Schedule a price change"**, never "Edit" (P4).

### 12.1 New rate plan

1. Operator triggers "Add rate plan" (from the Object Queue empty/first-run, or from a Service's "How is it priced?").
2. **Intent first:** "What service does this price?" → pick the Service. (The Service's delivery shapes determine whether Half-day / Hourly rows appear.)
3. **Scope:** "Where does this apply?" → Organization default (the normal answer) or a specific Location.
4. The matrix appears with the correct rows (from the Service) and columns (from org age bands), **empty** if a fresh org default, or **pre-seeded from the org default as muted-inherited** if this is a location override (canonical §3.9).
5. Operator fills cells (money inputs, Tab to advance).
6. Choose **"Charges for"** (Scheduled / Attended / Flat weekly) and billing basis.
7. Set the **effective date** (`ConfigDateInput`).
8. Save → the plan becomes **Current** (if effective today) or **Scheduled** (if future-dated), badged accordingly.

### 12.2 Change a price (schedule a price change)

1. Open the plan.
2. **"Schedule a price change"** → pick an effective date.
3. The matrix opens in edit on a **new future version** seeded from the current values (so the operator edits a copy of today's prices, not a blank table).
4. Edit the cells that change.
5. Save → a **Scheduled** version appears on the timeline ("Takes effect Sep 1"); the current table is untouched and will close the day before the new one starts (P4 — supersede, never overwrite).

### 12.3 Create a location override

1. From **"Where does this apply?"** (§10) on an inheriting location → **"Price differently here."**
2. The **diff editor** opens (§9): the org default rendered as muted-inherited cells, effective date prompted.
3. Operator changes the one or two cells that differ → they turn Bend Pine.
4. Save → the location moves to "Overridden at"; the override is itself an effective-dated version (it can be scheduled for the future and voided before it starts, §13).

**Bulk affordance (BOS, propose-and-approve only):** "Raise all by %" is offered as a BOS proposal (canonical §3.11, §8.3) that *fills a Scheduled table for the operator to review*, never an auto-apply. The operator sees the proposed new table, can adjust any cell, then approves — at which point it becomes a normal Scheduled version. (§20.)

---

## 13. Rate history, version timeline & future versions (scheduled, void)

Powered by `EffectiveDatedConfigurationEditor` — the same machinery every versioned financial entity uses (canonical §8.2), so operators learn it once.

### 13.1 The timeline ("Pricing history")

The matrix header shows the active **`ConfigVersionBadge`** state and a **"Pricing history"** rail listing versions chronologically with their canonical states:

- **Current** — effective today (the default view).
- **Scheduled** — future-dated, pending; labeled with its start ("Takes effect Sep 1").
- **Superseded** — a past table that was replaced.
- **Retired** — pricing that was ended (the plan no longer applies).

### 13.2 "As of" viewing

The operator can view the table **as of any date** (canonical §3.8) via the editor's date control. Setting the date to the past shows the Superseded table that was live then; setting it to the future shows the Scheduled table that will be. This is read-only time travel — it never edits, it reveals (Interaction Grammar). Combined with location selection, this is exactly the Resolved pricing view (§11).

### 13.3 Future (scheduled) versions and voiding

- A **Scheduled** future table is **visible and clearly labeled** ("Takes effect Sep 1"). It does not disturb the Current table.
- Before it starts, a Scheduled version can be **voided** — `EffectiveDatedConfigurationEditor`'s void/retire affordance — which removes the pending change with a plain confirmation describing the consequence (*"This cancels the Sep 1 price increase. Current prices stay in effect."*), not a generic "are you sure?" (P7).
- A Scheduled version that has *started* cannot be voided (it's now history); it can only be **superseded** by a new scheduled change. History is never rewritten (P4).

### 13.4 Component mapping

The header badge is `ConfigVersionBadge{current|scheduled|superseded|retired}`. The rail, the create-future-version flow, and the void/retire actions are all `EffectiveDatedConfigurationEditor`. The "as of" control is its date picker (`ConfigDateInput` underneath).

---

## 14. Rate comparisons (org vs location)

A director auditing pricing wants to ask *"how does North Campus differ from the org default — across the whole table?"* The **Rate comparison** view answers it as a single side-by-side read.

- Triggered from an overridden location (in "Where does this apply?" §10, or from the override diff).
- Renders the **same grid twice, aligned**: the **Organization default** column-set and the **Location effective** column-set, cell by cell, with only the **differing cells highlighted** (the differing location cell in Bend Pine, the org value shown as the muted baseline beside/under it).
- Carries a one-line summary: *"North Campus differs in 1 of 18 cells: 5-day Toddler ($295 vs $285)."*
- Read-only (a projection). To change a difference, the operator edits the override (§9); to remove one, "Match organization" (§9.3).

This is distinct from Resolved pricing (§11): Resolved pricing flattens to *the* price; Rate comparison *contrasts* two scopes to surface deltas. Both are read-only views of the same underlying versions; neither is an authoring surface. (Future extension §16: comparing two *dates* — "this term vs next term" — uses the same side-by-side frame.)

---

## 15. Relationships, schedule basis, programs/age groups, and the Service relationship

### 15.1 Service relationship

A Rate Plan **prices exactly one Service** (canonical §3.12). The Service is the revenue home and the source of *delivery shapes* (which determine whether Half-day/Hourly rows appear, §4.2). The plan is reached from the Service's "How is it priced?" card and reflected back there as a price-range summary ("$145–$285/week"). A Service with **Tuition on but no Rate Plan** is the canonical attention case (canonical §2.12): the plan's absence is surfaced *on the Service*, and the Rate Plans empty state (§18) is the fix.

### 15.2 Programs & age groups

Age-group **columns** come from the org's age bands, which are operational groupings owned by Programs/Locations, not by Financials (canonical §3.14; Configuration Ownership Doctrine). The Rate Plan **references** them, never owns them (§4.3). If the org reconfigures its age bands, the matrix columns follow; a quiet line under the table points to where age groups are managed.

### 15.3 Schedule basis

The **rows** are schedule shapes; the **"Charges for"** strategy (§5) decides whether the runtime reads the row by *scheduled* days, *attended* days, or a *flat* week. "Schedule basis" therefore lives at the intersection of rows (the shapes) and strategy (which shape-count to read). This is named explicitly because the Simulator's resolution explanation (canonical §7.6) cites it: *"$285 because Riley is on the 5-day Toddler schedule under Standard Tuition (North Campus override)."*

### 15.4 Full relationship set

Rate Plan → **Service** (prices, one), → **Location** (scoped: org default + overrides), → **Age groups** (columns, referenced), → **Agreements** (consumed-by, read-only here), → **Charge Resolution / Simulator** (read by). It drives the recurring half of the financial graph (canonical §3.12).

---

## 16. Future extensibility

The matrix is a frame that grows by adding dimensions and vocabulary, never new screens (canonical §3.15):

- **New rows** — 1-day, extended-day, overnight: new schedule shapes slot in as rows when a Service supports them.
- **New pricing axes** — sibling tier, income tier, seasonal term: extend the matrix's dimensions (a tier becomes a second column-group, or a switchable matrix variant) without leaving the table metaphor.
- **New "Charges for" strategies** — e.g. "Enrolled days," "Contracted hours": extend the three-option set; still one plain sentence each.
- **The diff-override pattern generalizes** — any scoped, versioned config (policies already do, canonical §4) reuses the muted-inherited / Bend-Pine-override visualization.
- **Comparisons extend to time** — Rate comparison's side-by-side frame (§14) absorbs "this term vs next term" by swapping the second scope for a second date.

The promise (Operational UX Doctrine): a new way to price is a *new instance in the model*, not a new product surface.

---

## 17. Validation (every message in operator words)

Validation speaks **operational consequence** and routes to the fix (P7; canonical §3.13, §8.1). Three severities render consistently (Attention = ember, Advisory = gold, Info = stone). Rate-Plan-specific messages:

| Condition | Severity | Message (operator words) | Routes to |
|---|---|---|---|
| **Empty cell** (no price for a shape × age in use) | Attention (ember) | *"4-day Preschool has no price. A family enrolling at that schedule would have no tuition."* | The empty cell, attention-lit; cell turns to money input on click. |
| **Multiple empty cells** | Attention | *"3 price cells are empty — enrollments at those schedules would have no tuition."* | Aggregates onto the section queue glyph + Overview readiness card. |
| **Redundant override** (a location override equals the org default in every cell) | Advisory (gold) | *"This override matches the organization price exactly — it has no effect. Remove it?"* | One-click "Remove override" → location returns to Inherited. |
| **Redundant single cell** (an overridden cell equals the inherited value) | Advisory | *"This cell matches the organization price — leave it inherited so org changes still flow here."* | "Match organization" on the cell. |
| **Hourly strategy / row without an hourly rate** (service supports hourly, but the Hourly row cell is empty) | Attention | *"Hourly care is offered but has no hourly rate — an hourly enrollment would have no price."* | The empty Hourly cell. |
| **No price at all** (a recurring service's plan has an entirely empty matrix) | Attention | *"This plan has no prices yet. A family enrolling in [Service] today would have no tuition."* | First empty cell / empty state. |
| **Scheduled change with empty new cells** | Attention | *"The Sep 1 price change leaves 2 cells empty — those schedules would lose their price on Sep 1."* | The scheduled table's empty cells. |
| **Zero-priced cell** (a real $0, not empty) | Info (stone) | *"4-day Pre-K is set to $0 — free for that schedule. (Leave it empty instead if you don't offer it.)"* | The cell (confirms intent; distinguishes $0 from "—"). |

Empty (`—`) and `$0` are deliberately different states with different severities (§4.4): empty is a *missing* price (Attention); zero is a *chosen* free price (Info). Conflating them would either nag operators who mean "free" or hide a real gap.

---

## 18. Empty states

`ConfigurationEmptyState`, business-concept-first, one primary action (canonical §3.10, §8.4):

- **No plan for a service yet:** *"No pricing yet for [Service]. Build a price table by days-per-week and age group — the way you'd quote it to a parent."* → primary **"Build price table."**
- **No rate plans at all (section-level):** *"No pricing set up yet. Rate Plans are how you price recurring services — weekly tuition by how many days a child attends and how old they are."* → primary **"Build your first price table."**
- **A location with no override (inside "Where this applies"):** not an error — reads *"Cedar Hollow uses the organization price."* with a quiet "Price differently here."

No empty state dead-ends; each explains the concept and offers the next move (Visual Language #8: empty states feel intentional, not broken).

---

## 19. First-run

The first time an operator opens Rate Plans for an org with Services defined but no pricing:

- The section opens in Summary mode showing the **section-level empty state** (§18), *not* a blank matrix.
- If Services exist with Tuition on but no plan, the empty state names them: *"Full-Time Care and Before Care are set to be priced but have no price table yet."* — turning the empty screen into a worklist.
- A **BOS proposal** (propose-and-approve, P6) may offer to scaffold: *"Want a starter price table for Full-Time Care? You'll set the numbers."* — it seeds an empty matrix with the right rows/columns as a **draft** the operator fills, never prefilled prices (BOS proposes structure, the human owns the money).
- The org remains coherent: a missing price is surfaced as Attention (§17), but the operator is guided to it, not blocked at a wall (calm under pressure).

---

## 20. How BOS assists (propose-and-approve only)

Per BOS Foundation and P6, every assist is a **proposal chip** the operator approves; BOS never auto-writes a price, never posts, never patches truth (canonical §8.3):

- **"Raise all by %"** — fills a **Scheduled** table for review (§12.3); operator adjusts and approves. Never auto-applied.
- **Stale-price nudge** — *"5-day Toddler hasn't changed in 2 years — review for next term?"* (Intelligence). A prompt, not a change.
- **Gap detection** — *"Hourly care is offered for this service but has no hourly rate"* surfaced as a proposal to add the missing row's prices (mirrors §17 attention, framed as an offer to fix).
- **Override hygiene** — *"North Campus's override matches the org price — remove it?"* (Advisory §17, BOS-surfaced).
- **First-run scaffold** — seed an empty matrix with correct rows/columns (§19), prices left to the human.

Every BOS output lands as a reviewable draft/Scheduled version inside `EffectiveDatedConfigurationEditor`, so the operator sees exactly what would change before approving.

---

## 21. What belongs / what should disappear

**Belongs on this screen:**
- The price matrix (rows × age columns × money cells) and "Charges for."
- Scope (org default / location override) and the override diff.
- "Where does this apply?", Resolved pricing, Rate comparison.
- Effective-dated history, scheduled/void, "as of."
- Operator-worded validation routing to the offending cell.

**Should disappear (rejected — canonical §3.6, §11, §9):**
- ❌ **Rate Rule lists** — rules are cells; the operator never sees "rule."
- ❌ **"Plan Key"** — hidden, internal, never shown (P1).
- ❌ **"Hybrid"** — removed; replaced by Scheduled days / Attended days / Flat weekly (§5).
- ❌ **Any id / key / enum literal / "billable source"** — translation layer (canonical §9) forbids them.
- ❌ **Column authoring** — age groups are owned by Programs; this screen references, never creates.
- ❌ **A copy-the-table override** — replaced by the bound diff (§9.4).
- ❌ **"Edit" as a verb** — it is always "Schedule a price change" (P4).
- ❌ **A modal price form / full-table form mode** — editing is cell-inline and intentional (P3).

---

## 22. Versioning grammar

One grammar, identical to every versioned financial entity (canonical §8.2):
- **Verb:** "Schedule a price change" (never "Edit").
- **States:** Current / Scheduled / Superseded / Retired (`ConfigVersionBadge`).
- **Operations:** create-future-version (seeded from current), void-before-start, retire, "as of" viewing — all `EffectiveDatedConfigurationEditor`.
- **Invariant:** history is never overwritten; a change supersedes (P4). A started version can only be superseded, never voided (§13.3).
- **Scope × version compose:** an override is itself versioned (a location can have a Scheduled override voidable before its start) — scope and effective-dating are orthogonal and both run through the same editor.

---

## 23. Progressive disclosure

Calm by default, depth on demand (Visual Language #8; canonical §3.14):
- **Rows:** day rows always; Half-day and Hourly only when the Service supports them (§4.2).
- **Columns:** exactly the org's age bands — no more, no less (§4.3).
- **Override diff:** inherited cells muted (recede), overridden cells Bend Pine (advance) — the *differences* are what surface (§9).
- **History:** the timeline is a collapsed rail; "as of" and Scheduled tables are revealed on demand, not always-on (§13).
- **Advanced:** currency and tax treatment sit under an "Advanced" disclosure, collapsed by default (canonical §3.14).
- **"Why" depth:** the resolution trace for a price lives in the Simulator, not on every cell — pulled, not pushed.

---

## 24. Operator mistakes (and how the screen prevents or recovers them)

| Mistake | What the screen does |
|---|---|
| Leaves a cell empty for a schedule families actually use | Attention validation names the operational consequence and lights the cell (§17). |
| Creates a location override identical to the org default | Advisory "no effect — remove it?" with one-click revert (§17). |
| Pins a location cell to the same number as the org, then the org price changes | Advisory nudges "leave it inherited so org changes flow" (§17, §9.4) — prevents the silent-stale trap. |
| Confuses a $0 (free) cell with a missing price | Distinct visual states (`$0` vs `—`) + an Info confirmation for $0 (§4.4, §17). |
| Tries to "edit" a past price | The verb is "Schedule a price change"; past versions are read-only history; the change supersedes from a future date (§13, §22). |
| Schedules a future change but leaves new cells empty | Attention flags the Scheduled table's gaps before they take effect (§17). |
| Sets an hourly-charging service with no hourly rate | Attention ties the strategy to the empty Hourly cell (§5, §17). |
| Voids a price change after it has started | Disallowed; the screen explains it's now history and offers "schedule a new change" instead (§13.3). |

---

## 25. Questions answered, introduced, and intentionally deferred

### 25.1 Questions this screen answers (for the operator)
- *How much do we charge for this service, by days and age, here and at each location?* (the primary question, §3.)
- *What does a child at this location actually pay today / as of any date?* (Resolved pricing, §11.)
- *How does this location differ from the org default?* (Rate comparison, §14.)
- *What's missing or broken in our pricing?* (Validation/attention, §17.)
- *How has this price changed, and what's coming?* (History + Scheduled, §13.)
- *Who uses this price?* ("Where does this apply?", §10.)

### 25.2 Questions this screen newly introduces (and resolves here)
- *Rows vs columns — which does the operator author?* → Rows (schedule shapes) yes; columns (age groups) no, they're referenced from Programs (§4.2–4.3).
- *Override = copy or diff?* → Diff, bound to the org default so changes flow (§9.4).
- *Empty vs $0?* → Different states, different severities (§4.4, §17).
- *Where does "Charges for" live now that "Hybrid" is gone?* → Three honest options in "How does it charge?" (§5).
- *Resolved pricing vs Rate comparison vs the override diff — three views, why?* → Flatten / contrast / author, respectively; only the diff edits (§9, §11, §14).

### 25.3 Questions intentionally deferred (named, not solved here)
- **Live consumption / posting** — the Rate Plan is read by the Simulator now; *firing real invoices* from it is the Posting/Operational-Consumption phase (canonical defers Posting/Payments). This screen configures price; it never posts money (P2).
- **Agreement-scoped pricing** — per-agreement price exceptions (a negotiated family rate) are a future scope dimension that slots into the same resolver, not designed here.
- **Additional pricing axes** (sibling/income/seasonal tiers) — named as extensibility (§16), not shipped now.
- **Mapping a plan's revenue home** — *where* tuition lands is Accounting's job (canonical §6); this screen references the Service's category, it doesn't author the account.
- **Multi-currency / tax computation** — present as an "Advanced" disclosure stub (§23); full tax engine deferred.

---

*This specification expands canonical §3 only. Where this document and the canonical product spec conflict, the canonical spec governs; everything here is its mechanical detailing.*
