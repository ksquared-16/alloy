# Financial Experience — Screen 6: The Financial Simulator

**Type:** Implementation-ready Operator Experience Specification (design sprint, no code).
**Status:** Deep expansion of *Financial Configuration Product Spec* §7 — "Screen 6: Charge Preview → Financial Simulator."
**Author posture:** Principal Product Designer / UX Architect / Operator — not engineer.
**Date:** June 2026.
**Canonical parent:** [`financial_configuration_product_spec.md`](./financial_configuration_product_spec.md). This document honors every decision there and adds the mechanical detail a developer needs to build the surface without making a single product decision.

> **One sentence governs this surface:** *"Show me what Riley would be charged, when, and why — so I trust the setup."* The Simulator is the proof that all five configuration screens above it are correct. It begins with **intent** (a child, an agreement), resolves the rest **automatically and visibly**, and answers in plain language — never asking the operator to think in records, IDs, or "billable sources."

---

## Purpose

Let an operator **see the charges a child would generate** — recurring tuition and one-time charges — and **understand why**, end to end, before any money moves. The Simulator reads the entire financial graph (Services, Rate Plans, Policies, Charges, Accounting) plus the child's Agreement/Schedule/Attendance, and renders a single legible answer to *"What would be charged?"* with three on-demand explanations. It is the integration test made into a product surface: the one place where the operator confirms that what they configured is what would actually happen.

Per Global Pattern **P2**, the Simulator carries the persistent boundary line at all times: **"Preview only — no invoice, no AR, no posting."** Its only write to the system is the explicit, gated **"Create draft charge"** action, which is idempotent and recomputable, never authoritative.

---

## Why a Simulator, not a Preview

"Charge Preview" implied a passive readout — *here is a number, trust it.* That is not what an operator needs. An operator needs to **interrogate** the setup: not just *what* the number is, but *which price cell won, which policies applied, and why it bills three weeks after the event.* The difference is legibility.

| "Charge Preview" (rejected) | "Financial Simulator" (this spec) |
|---|---|
| Shows a number. | Shows a number **and the reasoning chain that produced it.** |
| Operator must trust blindly. | Operator can verify each link — rate, policy, timing — and find the broken one. |
| A dead end when something is wrong. | A guided fix: every gap names the consequence and links to the screen that resolves it. |
| Single point in time ("today"). | "As of" any date — preview *next term's* scheduled prices before they take effect. |
| Read-only and inert. | Read-only by nature, but offers one gated, idempotent write ("Create draft charge"). |

The three collapsible **"Why?"** explanations are the entire reason this is a *simulator*. Without them, it is a calculator. With them, it is the operator's permanent financial truth-checker — and a teaching surface for the one concept operators consistently miss: **a charge occurs on one date and bills on another.**

---

## Operator mindset

The operator arriving here is not exploring data. They have a specific anxiety and a specific subject:

- *"We just changed Toddler tuition at North Campus. Did it take? Show me Riley."*
- *"A parent disputes the field-trip charge timing. When does it actually bill?"*
- *"We onboarded a new family. Before I tell them their first invoice, let me see it."*
- *"Next month our rates go up. What will the Garcias pay in September?"*

The operator thinks in **a child and an enrollment**, not in plans and rules. They want a sentence back, not a spreadsheet. They want to be able to **stop trusting** — to see the seam where it breaks — and then go fix it. The Simulator must feel like asking a knowledgeable colleague "what would Riley be charged?" and getting a clear answer plus, on request, the colleague's reasoning.

---

## Primary question being answered

> **"What would this child be charged, when, and why?"**

Decomposed into the four operational questions each card answers (Law #2 — one question per card):

1. *"Who are we simulating?"* — the child, the agreement, and the auto-resolved context (Identity / Process).
2. *"What would be charged?"* — the result card: what, how much, when, where it lands, who pays, needs review (Financial).
3. *"Why this result?"* — the three explanations: resolution, policy, timing (Intelligence).
4. *(Conditional) "Do I want to make this real as a draft?"* — the gated write (Financial / action).

Everything on this surface exists to answer one of these four. If a field does not help answer its card's question, it does not appear.

---

## The intent-first workflow (Child → Agreement → auto-context → date → Preview)

The canonical flow, formalized from the parent spec §7.4:

```
Child  →  Agreement  →  (auto-resolved & shown: Services · Schedule · Attendance)  →  What to simulate (Period or Charge)  →  Preview
```

The defining principle (Operational Grammar Law #3): **intent precedes data, and downstream context is resolved automatically and shown — never asked for.** The operator names *who*; the system figures out *what they're enrolled in, on what schedule, with what attendance.* The operator never picks a service, never picks a schedule, never types an ID.

### Step-by-step interaction

**Step 1 — Pick a child (by name).**
- Component: `ConfigSelectInput` labeled **"Which child?"**, placeholder *"Search by name…"*.
- Options are children, displayed as **plain name** ("Riley Chen"), optionally with a disambiguating secondary line (program + primary location: "Toddler · North Campus") when names collide. No IDs shown.
- On selection, the "Who are we simulating?" card materializes with the child's name and begins resolving the agreement picker.

**Step 2 — Pick an agreement (by plain label).**
- Component: `ConfigSelectInput` labeled **"Which enrollment?"**.
- Options are the child's agreements rendered as **plain labels with an effective range**, e.g. *"Standard Enrollment · from May 5"* or *"Summer Camp · May 5 – Aug 29."* Never an agreement ID, never "billable_source."
- If the child has exactly one agreement, it is **pre-selected** and shown as resolved (the operator may change it). If none, see *Warnings → No agreement.*
- On selection, the auto-context resolves and renders (next section) — instantly and read-only.

**Step 3 — Auto-resolved context appears (shown, never asked).**
- The system resolves the **Services** on that agreement, the **Schedule** shape, and the **Attendance** stance, and renders them as read-only context chips inside the "Who are we simulating?" card. The operator confirms by reading, not by selecting. See *Auto-resolved context.*

**Step 4 — Choose what to simulate.**
- A segmented choice (rendered as two `ConfigurationDetailCard`-headed options or a simple toggle): **"A recurring tuition period"** vs **"A specific charge."** See *What to simulate.*
- Selecting one reveals exactly the inputs that mode needs (a period selector, or a charge picker + occurs-date / usage-qty). Progressive disclosure by business meaning.

**Step 5 — Preview.**
- Component: `ConfigPrimaryButton` labeled **"Preview charge"** in a `ConfigButtonRow`.
- Enabled only when the minimum inputs for the chosen mode are present (child + agreement + period, OR child + agreement + charge + its required occurs-date/usage). Otherwise disabled with helper text naming the missing input (see *Warnings*).
- On click, the **result card** and the three **"Why?"** explanations render in the Workspace. The Simulator never navigates away; everything resolves in place.

### Shell placement (frozen Configuration Runtime V1)

- **Section Queue (260px):** the Simulator is the **Tools** group item, labeled **"Financial Simulator."** No new nav.
- **Object Queue (320px):** **not used as a lineage list here.** The Simulator has no list of saved simulations in V1. The 320px column is suppressed (or reserved for the future "recent simulations" rail — see *Future extensibility*). The Workspace runs full flex width.
- **Workspace (flex):** holds the entire experience — context band, `ConfigReadonlyNotice`, the input cards, the result card, and the explanations.
- **`ConfigurationContext`** band: title **"Financial Simulator"** + purpose line *"Check what a child would be charged — and why — before any money moves."*
- White canvas, stone borders, `1rem` card radius, Bend Pine `#00a283` for resolved/complete states, `config-typo-*` tokens throughout. The surface invents nothing.

---

## Auto-resolved context (what's shown, never asked)

Once child + agreement are chosen, the "Who are we simulating?" card (`ConfigurationDetailCard`, title *"Who are we simulating?"*) renders the resolved downstream context as **read-only chips** — the operator's proof that the system understands the enrollment. This is the heart of intent-first: *the operator stated intent; the system surfaced the implications.*

Rendered with `ConfigField`/`ConfigFieldGrid` and a `ConfigReadonlyNotice`-style muted treatment (these are derived, not editable):

| Context chip | Label | Example value | Source (hidden from operator) | Component |
|---|---|---|---|---|
| Child | (header line) | **Riley Chen** | child | card title region |
| Enrollment | "Enrollment" | **Standard Enrollment · from May 5** | the agreement | `ConfigField` |
| Services | "Enrolled in" | **Full-Time Care** (chip), **+ Field Trips** (chip) | services on the agreement | chip row |
| Schedule | "Schedule" | **5 days / week · Toddler (18–36mo)** | resolved schedule shape + age band | `ConfigField` |
| Attendance | "Attendance basis" | **Charges on scheduled days** | rate plan's "Charges for" + attendance policy | `ConfigField` |
| Location | "Location" | **North Campus** | agreement location | `ConfigField` |

Rules:
- These chips are **read-only and visibly derived** — muted text, no edit affordance, no hover-to-edit. They answer "did the system understand my child correctly?" not "configure this."
- If any context **cannot resolve** (no schedule, no service price, ambiguous location), the chip shows the gap in operator language and links to the fix — e.g. Schedule chip reads *"No schedule on this enrollment"* with a link, rather than rendering blank. See *Warnings & fix-paths.*
- The operator **never picks** services, schedule, or attendance here. If they want a different service/schedule, they change the *agreement* (Step 2), which re-resolves everything. One source of truth.

---

## What to simulate (tuition period vs charge)

After context resolves, the operator chooses the **shape** of the simulation. Two modes, mutually exclusive per run, each revealing only its own inputs (progressive disclosure):

### Mode A — A recurring tuition period

*"What does Riley's regular tuition look like for a given billing period?"*

- Selector: `ConfigSelectInput` or `ConfigDateInput` pair labeled **"Which period?"** — offering the agreement's billing cadence in plain terms: *"Week of May 5"*, *"Week of May 12"*, or a custom range via two `ConfigDateInput`s ("From" / "To"). The cadence (weekly/monthly) is read from the resolved Billing-rhythm policy, so the period options match how the org actually bills.
- No usage quantity, no occurs-date — recurring tuition derives entirely from schedule + rate plan + period.
- Result: the tuition charge for that period (e.g. *"Full-Time Care — $285 for week of May 5"*).

### Mode B — A specific charge

*"What happens when this one thing is charged?"*

- Picker: `ConfigSelectInput` labeled **"Which charge?"** — options are the **Charges** that apply to this child's services, by plain name (*"Field Trip"*, *"Registration"*, *"Late Pickup"*). No template IDs.
- Reveals exactly the inputs that charge's pattern requires:
  - **Event-triggered charge** (e.g. Field Trip) → `ConfigDateInput` labeled **"When does it happen?"** (the occurs date). Required.
  - **Usage charge** (e.g. extra meals, late-pickup minutes) → `ConfigNumberInput` labeled **"How many?"** (usage quantity) + occurs-date if event-bound. Required.
  - **Fixed one-time fee** (e.g. Registration) → no extra input; occurs "now" or on a chosen date.
- Result: the one charge with its occurs/bills split fully annotated (the worked example below).

Both modes feed the **same result card** and the **same three explanations** — only the inputs differ. The Preview button computes whichever mode is active.

---

## The result card (field-by-field)

The single **"What would be charged?"** card (`ConfigurationDetailCard`, title *"What would be charged?"*) is the answer. It is rendered with `ConfigFieldGrid` of `ConfigField{label,value}` rows, topped by a lifecycle badge and the preview-only notice. Worked example throughout: **Riley Chen, Field Trip, occurs May 5, North Campus.**

| # | Field (label) | Example value | Component / treatment | Notes |
|---|---|---|---|---|
| 0 | **Lifecycle badge** | **Scheduled draft** | `ConfigEffectiveBadge` (Bend Pine) | "Scheduled draft" when the bill date is in the future; "Draft" when it would bill today/now. This is the operator translation of `status=draft` (future-billable) — never the raw status. |
| — | **Preview boundary** | *"Preview only — no invoice, no AR, no posting."* | `ConfigReadonlyNotice` | Persistent. Non-negotiable (P2). |
| 1 | **What** | **Full-Time Care · Field Trip** | `ConfigField` "What" | Service + charge category in plain labels. No enum literals (P1). |
| 2 | **How much** | **$45.00** | `ConfigField` "How much" | Amount + currency. Money-typed display. |
| 3 | **When** | **Occurs on** May 5 · **Bills on** May 26 — *21 days after the event* | `ConfigField` "When", two sub-values + a muted gap annotation | The occurs/bills split is **always shown with the gap named in words.** This is the most distinctive field. For a recurring tuition period, "Occurs on" = the period; "Bills on" = the invoice date per Billing-rhythm policy. |
| 4 | **Where it lands** | **4000 Program Fees** | `ConfigField` "Where it lands" | The income account (operator language for the GL mapping). If unmapped → attention state + link to Accounting. |
| 5 | **Who pays** | **Family** | `ConfigField` "Who pays" | Responsibility default in plain terms. |
| 6 | **Needs review?** | **No review needed** (or **Needs review before posting**) | `ConfigField` "Needs review?" | Translation of the posting-review setting/policy. |

Rules:
- Every value is **operator language**. No `plan_key`, no `*_id`, no `occurs_on`/`billable_on` literals, no "Hybrid," no "billable source." The right-hand column of the §9 translation layer always; the left never.
- When the simulation is a **recurring tuition period**, "What" reads *"Full-Time Care · Tuition"*, "How much" is the period price ("$285 / week"), and "When" shows the period as occurs and the policy-driven invoice date as bills (often the same week → annotated *"bills the same week"* or *"bills on Monday"*).
- If the result is **unresolvable** (no rate cell, unmapped category), the card does **not** show a fake number — it shows the gap in operator language with a fix-path (see *Warnings*). A simulator that invents a price is worse than one that says "no price yet, here's where to set it."

---

## Resolution explanation (worked copy)

Collapsible panel #1, title **"Why this amount?"** — collapsed by default (calm by default; depth on demand). Traces **which rate-matrix cell won and why.**

Worked example — **Riley, 5-day Toddler, Standard Tuition with North Campus override:**

> **Why this amount?**
> **$285** comes from the **Standard Tuition** price table — the **North Campus** version.
>
> Riley is enrolled **5 days a week** in the **Toddler (18–36mo)** age group. On North Campus's price table, the **5-day / Toddler** cell is **$285 per week**.
>
> North Campus prices Toddler care **$10 higher** than the organization default ($275) — this is a North Campus override. Everything else on Riley's plan is inherited from the organization default.
>
> *Charges for: scheduled days* — so the price reflects Riley's **5 scheduled days**, regardless of how many she actually attends.

What this copy must always contain (mechanical requirements):
1. The **amount** and the **plan name** ("Standard Tuition").
2. The **scope that won**, named ("the North Campus version" / "the organization default"), and — if an override — **what differs and by how much** vs the default.
3. The **two axes that selected the cell**: schedule shape (5-day) and age group (Toddler), stated in operator terms.
4. The **"Charges for" strategy** in plain words (Scheduled days / Attended days / Flat weekly — never "Hybrid").
5. For a **specific charge** priced by a flat amount, the panel instead reads: *"$45 is the fixed price set on the Field Trip charge"* — no matrix trace needed. For a **usage-priced** charge: *"$45 = 3 meals × $15 each."*

This panel is the literal embodiment of "configure the business, not the schema" — it names cells and overrides, never rate rules or keys.

---

## Policy explanation (worked copy)

Collapsible panel #2, title **"Which rules applied?"** — collapsed by default. Names **which financial policies applied and how their scope resolved** (most-specific-wins, shown as the resolved winner).

Worked example — **Riley, North Campus, full week scheduled:**

> **Which rules applied?**
> **Billing rhythm — North Campus.** Tuition bills **weekly**, invoiced **on Monday**, due **on receipt**, with a **3-day grace period.** North Campus uses its own billing rhythm; the organization default (monthly) doesn't apply here.
>
> **Proration — not applied.** Riley is scheduled the **full week**, so there's nothing to prorate. (If she'd enrolled mid-week, the proration policy would have charged only her scheduled days.)
>
> **Review — none required.** Tuition charges at North Campus post without review. (The Field Trip charge, separately, also needs no review.)

What this copy must always contain:
1. Each **policy that materially shaped the result**, named by its operator-group ("Billing rhythm", "Proration", "Review") — never the policy table or enum.
2. The **scope that won** for each, stated as a resolution ("North Campus uses its own… the organization default doesn't apply here") — teaching most-specific-wins without the phrase.
3. The **counterfactual** where it clarifies ("If she'd enrolled mid-week, proration would…") — this is what makes it a *simulator*: it shows the rule's reach.
4. Only policies that **applied or were meaningfully bypassed** appear. A wall of every policy violates Law #2; this panel answers "which rules touched *this* charge?"

---

## Timing explanation (worked copy)

Collapsible panel #3, title **"When does it bill, and why?"** — collapsed by default. Teaches **occurs-vs-bills**, the single concept operators miss.

Worked example — **Field Trip, occurs May 5, bills +21 days:**

> **When does it bill, and why?**
> This charge **occurs** on **May 5** — the day of the field trip.
> It **bills** on **May 26** — **21 days later.**
>
> That gap is set on the **Field Trip charge**: it's configured to bill **21 days after the event.** So the trip happens first, and the charge lands on the family's account three weeks later.
>
> Because May 26 is in the future, this shows as a **Scheduled draft** — it isn't a charge yet, and nothing has posted.

What this copy must always contain:
1. The **occurs date** with its plain meaning ("the day of the field trip" / "the billing week").
2. The **bills date** and the **gap in words** ("21 days later").
3. **Where the gap comes from** — the charge's own timing setting, stated as a promise ("configured to bill 21 days after the event").
4. The **lifecycle consequence** — why it reads "Scheduled draft" vs "Draft" (future bill date vs today), reinforcing P2 ("nothing has posted").
5. For **recurring tuition**, the panel teaches the invoice cadence instead: *"This week occurs May 5–11. It bills on Monday May 5 because North Campus invoices weekly, on Mondays."*

---

## "Write a draft" (gated, not posting)

The Simulator's **only** write. An explicit, operator-initiated action that materializes the simulated charge as a **draft** — recomputable, idempotent, and emphatically **not a posting.**

- Component: `ConfigSecondaryButton` labeled **"Create draft charge"**, placed in the `ConfigButtonRow` beneath the result card, **secondary** to the still-present primary "Preview charge."
- **Gating (all must be true for the button to appear/enable):**
  1. An **agreement is selected** (a draft must attach to a real enrollment — hypotheticals can't be drafted).
  2. The amount is **fully resolvable** (no empty rate cell, no missing required input).
  3. The category is **mapped** (a draft with no revenue home is a future posting failure — block it here).
  - If any condition fails, the button is **hidden** (not a dead disabled control), and the relevant warning explains why no draft is possible yet, with its fix-path.
- **Behavior on click:**
  - Creates (or, idempotently, finds the existing) draft charge from the exact resolution shown. Re-clicking with identical inputs does **not** create a duplicate — it surfaces *"This draft already exists"* and links to it. Idempotent by resolution identity (the operator never sees the idempotency key — P1).
  - The lifecycle badge confirms: **"Draft created · Scheduled draft."**
  - A `ConfigReadonlyNotice` reaffirms: *"This is a draft. It does not post money. Posting is a separate, controlled process."*
- **What it is NOT:** not an invoice, not an AR entry, not a posting, not authoritative. It is a recomputable projection the platform may regenerate. The copy never implies money moved.

This action is deferred to Slice D in the build sequence; the Simulator ships read-only first, and the button appears when drafting lands. The spec defines its gating now so the surface is built to accommodate it.

---

## "As of date" simulation

The Simulator can run **"as of"** any date, exercising the effective-dated config so an operator previews **future scheduled prices and policies** before they take effect.

- Control: a `ConfigDateInput` labeled **"As of"**, defaulting to **today**, placed in the input region near "What to simulate."
- Setting it to a future date (e.g. **Sep 1**) causes the resolution to use **whatever rate plan and policies are effective on that date** — including Scheduled (future-dated) versions not yet current.
- The result card and all three explanations recompute against that date. The Resolution explanation names it: *"As of Sep 1, the 5-day Toddler cell is $295 — the price change scheduled to take effect September 1."* The Policy explanation does likewise for scheduled policy changes.
- A muted banner on the result card states the lens: *"Simulated as of Sep 1 — using scheduled prices and rules."* So the operator never confuses a future preview for today's reality.
- Setting "As of" to a **past** date previews historical (Superseded) config — useful for *"what would this have charged in April?"*
- This is the literal proof that effective-dating works: the operator sees next term's prices on this term's screen, without any data having changed.

---

## Warnings & fix-paths

Every warning speaks an **operational consequence** and offers a **path to fix** (P7). Severity uses the cross-cutting model (ember = breaks billing; gold = advisory; stone = info). No warning is a bare form error. The Simulator never invents a number to paper over a gap.

| Condition | Severity | Copy (operator language) | Fix-path |
|---|---|---|---|
| **No rate for the schedule** (empty matrix cell) | Ember | *"There's no price for a 4-day Toddler schedule. Riley would have no tuition."* | Link: **"Set this price in Rate Plans →"** (deep-links to the exact plan + cell). BOS may propose: *"Riley has no price for her schedule — fix in Rate Plans."* |
| **Unmapped charge category** | Ember | *"Field-trip revenue has no income account — this charge couldn't post."* | Link: **"Map it in Accounting →"** (deep-links to the unmapped category row). |
| **Missing event date** (event charge, no occurs date) | Gold → blocks Preview | *"This charge needs an event date. When does the field trip happen?"* | Inline: focuses the **"When does it happen?"** `ConfigDateInput`. Preview button disabled until provided. |
| **Missing usage quantity** (usage charge) | Gold → blocks Preview | *"This charge is priced by usage. How many meals?"* | Inline: focuses the **"How many?"** `ConfigNumberInput`. |
| **No agreement on the child** | Gold | *"Riley has no enrollment yet — there's nothing to simulate. Enroll her, or pick another child."* | Links to enrollment; or change the child picker. |
| **No schedule on the agreement** | Ember | *"This enrollment has no schedule, so tuition can't be priced."* | Link to the enrollment's schedule. Shown on the Schedule context chip. |
| **Org not billable yet** (no rate plan for the service) | Ember (empty-state variant) | *"Set up a price for Full-Time Care first — there's nothing to simulate until it has a rate."* | Link: **"Go to Rate Plans →"**. Turns the dead end into a guided first step. |
| **Usage charge, no per-unit price** | Gold | *"This charge is priced by usage but has no per-unit amount — it would need a price at billing time."* | Link to the Charge definition. |
| **Draft would duplicate** (idempotency) | Stone | *"This draft already exists."* | Link to the existing draft. |

When multiple gaps exist, they aggregate into a single attention region above the result card; each is independently fixable. The operator is never told "error" without being told **what it breaks** and **where to fix it.**

---

## What is hidden vs surfaced

| Surfaced (always shown, operator language) | Hidden (never shown — P1 / §9 translation layer) |
|---|---|
| Child name, enrollment plain label, services, schedule shape, age band, location | Any `*_id`, `plan_key`, `resolution_key`, agreement/child UUIDs |
| The amount, currency, and which price cell won | Rate **rules** as objects (cells, not rules); the matrix internals |
| Occurs date, bills date, the gap **in words** | `occurs_on` / `billable_on` literals; raw date fields |
| Lifecycle badge ("Scheduled draft" / "Draft") | `status = draft` and any status enum |
| Income account name + number ("4000 Program Fees") | GL / chart-of-accounts / debit-credit / journal terms |
| "Who pays: Family" | `billable_source_type`, `responsibility` enums |
| "Needs review before posting" / "No review needed" | `posting_review` policy key; enum literals |
| Which policies applied + their resolved scope | Policy table names, scope-resolution mechanics, keys |
| "Charges for: scheduled days" | calculation strategy `hybrid` (removed entirely) |
| The "as of" lens and scheduled-price annotations | effective-date row internals, version keys |
| Idempotent draft confirmation | the idempotency key itself |

If any hidden term reaches the screen, the surface fails P1 acceptance. The §9 translation layer is the test.

---

## Information hierarchy

Top to bottom in the Workspace, the operator's eye should travel:

1. **Context band** — "Financial Simulator" + purpose. (Where am I?)
2. **`ConfigReadonlyNotice`** — "Preview only…" (Can this hurt anything? No.)
3. **Inputs** — "Which child?" → "Which enrollment?" → auto-context chips → "What to simulate" → "As of" → **Preview charge.** (State intent.)
4. **Result card — "What would be charged?"** — the answer, scannable in one glance: badge, what, how much, when (with the gap), where, who, review. (The answer.)
5. **Three "Why?" panels** — collapsed, in order: amount → rules → timing. (The reasoning, on demand.)
6. **"Create draft charge"** — secondary, gated, only when resolvable. (Optional act.)
7. **Warnings** — inline at the point of failure, aggregated above the result when blocking. (What's broken and where to fix it.)

Scan before read (Visual Language #2): the badge + amount + occurs/bills line must be legible at a glance; the explanations reward a deliberate click. Calm by default; depth on demand.

---

## Cards

| Card (question = title) | Family | Component | Content |
|---|---|---|---|
| *Who are we simulating?* | Identity / Process | `ConfigurationDetailCard` | Child header; enrollment, services, schedule, attendance, location as read-only derived chips. |
| *What would you like to simulate?* | Process | `ConfigurationDetailCard` | Mode A / Mode B selector + the inputs each reveals; "As of" control. |
| *What would be charged?* | Financial | `ConfigurationDetailCard` | The result: badge + `ConfigFieldGrid` (what / how much / when / where / who / review) + preview notice. |
| *Why this amount?* | Intelligence | collapsible panel | Resolution explanation (worked copy above). |
| *Which rules applied?* | Intelligence | collapsible panel | Policy explanation (worked copy above). |
| *When does it bill, and why?* | Intelligence | collapsible panel | Timing explanation (worked copy above). |
| *Create a draft?* | Financial / action | `ConfigSecondaryButton` in `ConfigButtonRow` | The gated write (appears only when resolvable + agreement present). |

Each card answers exactly one question (Law #2). The three explanations are distinct cards, not one "details" dump — each answers its own "why."

---

## Empty / first-run

- **First run (nothing selected):** `ConfigurationEmptyState` —
  *"Pick a child and an enrollment to see what they'd be charged — and why. Nothing here posts money."*
  Primary affordance: the **"Which child?"** picker, foregrounded. No fake numbers, no demo data.
- **Org not billable yet (no rate plan for the service):** the empty state becomes a **guided fix**, not a dead end —
  *"Set up a price for Full-Time Care first — there's nothing to simulate until it has a rate."* + **"Go to Rate Plans →."** (Turns absence into a next step — empty-state philosophy.)
- **Child picked, no agreement:** *"Riley has no enrollment yet — there's nothing to simulate. Enroll her, or pick another child."*
- **Child + agreement picked, nothing to simulate chosen:** the result region shows a quiet prompt — *"Choose a tuition period or a specific charge, then Preview."* — not an error.
- **Resolvable but un-previewed:** Preview button enabled, result region holds a calm placeholder, not a spinner-forever or a blank.

Every empty state explains the **business concept**, offers **one primary action**, and never dead-ends (calm under pressure; intentional, not broken).

---

## How BOS assists

BOS proposes; humans approve (P6 / BOS Foundation). Every assist is a proposal chip, never an auto-write, and BOS never posts or patches truth.

- **Gap-to-fix proposal:** when the Simulator hits an unresolvable cell, BOS surfaces *"Riley has no price for her schedule — fix in Rate Plans"* as a proposal chip linking to the exact cell. (Parent spec §8.3.)
- **Mapping proposal:** on an unmapped category, *"Field-trip revenue → 4000 Program Fees?"* — approve to map (executes in Accounting, not here).
- **Sanity proposal (advisory, gold):** *"This is the first charge that's ever simulated for North Campus's new $295 Toddler rate — looks right?"* — informational reassurance, dismissible.
- BOS never auto-creates the draft, never changes the resolution, never bypasses the authoring screens. It points; the operator acts on the correct surface.

---

## Future extensibility (what-will-bill / what-did-post / parent-view modes)

The Simulator is built to deepen into the operator's **permanent financial truth-checker** as Operational Consumption and Posting land. Same surface, more modes — no new screen:

- **"What will bill this cycle"** — once charges fire from live facts, the Simulator aggregates *all* charges a child (or a location, or the org) will generate next cycle. The single-charge result generalizes to a list, same cards.
- **"What did post"** — after Posting exists, a mode reconciles simulated vs actually-posted, so the operator can answer *"did what I expected actually happen?"* The "Why?" panels become a diff: expected resolution vs posted reality.
- **"What a parent will see"** — render the same result in the parent's language (no internal categories), so the operator previews the family-facing statement before it sends.
- **Recent simulations rail** — the suppressed 320px Object Queue can later hold recent/saved simulations, so an operator returns to a prior check. (V1 leaves it empty; the slot exists.)
- **Batch / cohort simulation** — "show me every Toddler at North Campus under the new rate" — the same resolution engine, fanned out.

Each is additive to the frozen shell and the existing card grammar. None requires a new design language.

---

## Operator mistakes

What the operator might get wrong, and how the surface prevents or recovers it:

- **Thinking a preview is a charge.** Prevented by the persistent P2 notice and the lifecycle badge wording ("Scheduled draft," not "Charge"). The Timing panel reinforces "nothing has posted."
- **Thinking "Create draft charge" posts money.** Prevented by the secondary placement, the explicit "draft" wording, and the reaffirming notice on creation. Never the verb "post."
- **Trusting a number that's actually a gap.** Prevented by never inventing a number — an unresolvable result shows the gap, not a guess.
- **Confusing occurs and bills** (and disputing the gap). Resolved by the always-shown occurs/bills split with the gap in words, plus the Timing explanation.
- **Mistaking an override for the default** (or vice versa). Resolved by the Resolution explanation naming the scope that won and what differs.
- **Previewing future prices and thinking they're live.** Prevented by the "Simulated as of Sep 1" banner whenever "As of" ≠ today.
- **Creating duplicate drafts.** Prevented by idempotent resolution — re-clicking surfaces the existing draft, doesn't duplicate.
- **Picking the wrong child/agreement.** Recoverable instantly — changing either re-resolves everything in place; no committed state to undo.

---

## Questions answered

- *What would this child be charged?* — the result card.
- *When does it occur, and when does it bill?* — the "When" field + Timing explanation.
- *Why is the amount what it is?* — Resolution explanation.
- *Which rules shaped it?* — Policy explanation.
- *Where does the money land, and who pays?* — result card fields 4–5.
- *Does it need review?* — result card field 6.
- *What will next term's prices charge?* — "As of" simulation.
- *Is my whole financial setup actually correct?* — the Simulator as integration test; gaps surface with fix-paths.
- *Can I make this real without posting?* — the gated "Create draft charge."

## Questions introduced

- *How does the Simulator behave for a child on multiple concurrent agreements?* — V1 simulates one selected agreement at a time; multi-agreement aggregation is a "what will bill this cycle" concern (deferred).
- *Should a saved/named simulation be shareable* (e.g. to send a director the reasoning)? — points to the future "recent simulations" rail and a possible export; out of V1 scope.
- *How does "as of" interact with a child whose enrollment itself changes over time* (mid-window schedule change)? — needs a resolution rule for agreement effective-dating vs config effective-dating; flagged for the Operational Consumption phase.
- *When drafts exist, where does the operator manage/void them* — on this surface or a separate drafts queue? — deferred to Slice D drafting design.

## Questions intentionally deferred

- **Live-fact triggering** (charges firing automatically from real attendance/schedule events) — Operational Consumption phase; the Simulator fires manually/simulated in V1 (parent §5.6).
- **Actual posting / reconciliation** ("what did post") — Posting is deferred; the Simulator's "what did post" mode waits on it.
- **Parent-facing view mode** — deferred until the family-language layer exists.
- **Batch/cohort simulation** — deferred; single-subject in V1.
- **Subsidy / third-party split previews** — deferred with Subsidy (parent IA "Who pays" group).
- **The drafts management surface** (list, void, supersede drafts) — deferred to Slice D; this spec defines only draft *creation* gating.
