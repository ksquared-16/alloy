# Financial Experience — Screen 4: Charges

**Type:** Implementation-ready Operator Experience Specification (design sprint, no code).
**Status:** Deep expansion of §5 ("Screen 4 — Charges, was Charge Templates") of `financial_configuration_product_spec.md`. That spec is canonical; this document specifies the Charges experience precisely enough that a developer makes no product decisions.
**Author posture:** Principal Product Designer / UX Architect / Operator — not engineer.
**Date:** June 2026.

> **Read first:** `financial_configuration_product_spec.md` (canonical). This document honors every decision in its §5 and inherits its global patterns P1–P7, the frozen Configuration Runtime V1 shell, the `config-typo-*` tokens, Bend Pine `#00a283`, and the named component library. It invents no new design language.

> **The persistent frame for this entire screen (P2):** every surface carries the `ConfigReadonlyNotice` — *"This is configuration. It does not post money. Posting is a separate, controlled process."* A Charge Definition is a **rule for creating a future charge**, never a charge. Authoring here changes nothing in any ledger.

---

## 1. Purpose

Define **how non-tuition charges come into being** — registration, field trips, late pickup, meals, transportation, camp, supplies/consumables — including *when each one occurs* and *when it bills*, expressed as a plain-language sentence an operator could say out loud. The screen exists so these charges *happen correctly without the operator remembering to create them*, and so the operator can *see what would happen* before any money moves.

A Charge here is everything you charge a family for **beyond recurring tuition**. Tuition is priced in Rate Plans; Charges is the home for the extras.

This screen does **not** post money, does not generate invoices, and does not touch AR. It authors definitions. The Financial Simulator (§7 of the canonical spec) is where the operator *sees the result*; the downstream draft-charge / posting lifecycle is where money actually moves, and that lifecycle is deliberately **not configured on this screen** (see §8, the lifecycle ribbon).

---

## 2. Do operators think in "templates"? (the reframe)

**No.** "Template" is a database word. An operator does not think *"I will author a charge template with a billable_source and an offset."* They think:

> *"When a child goes on a field trip, we charge the family $45."*

So the surface is named **Charges**. The word "template" survives only in code and internal docs — **it never appears in the UI** (P1; canonical §9 translation: `financial_charge_templates` → "Charges").

Three reframes carry the screen:

1. **From row to sentence.** A Charge Definition is authored and read as a single plain-language sentence with inline editable values. The sentence *is* the form. There is no field grid.
2. **From "template" to "the things we charge for."** The Object Queue (§ below) is labeled by what the operator charges for (Registration, Field Trip, Late Pickup, Meals…), not by template type.
3. **From "configure a record" to "state a rule."** The mental model is *"state out loud how this charge works, and Alloy will make it happen."* The distinction between *a rule for a future charge* and *an actual charge* becomes intuitive once it reads as a sentence in future tense ("bills 21 days after the event").

The canonical concept name is **Charge Definition** (each item) under the surface name **Charges**. "Billable Items" is an acceptable secondary gloss in empty-state copy only; the primary noun everywhere is **Charges** / **a charge**.

---

## 3. Operator mindset

The operator arriving here is a childcare director or billing administrator who has already (or will) set up Services and Rate Plans. Their mindset:

- *"Tuition is handled. What are the **extra** things we bill for, and how do I make each one just happen?"*
- They think in **occasions**, not strategies: *a field trip happens*, *a child is picked up late*, *we serve lunch*, *a new family registers*. Each occasion is a charge.
- They are nervous about money moving when they didn't intend it. The screen must reassure, continuously, that **nothing here posts** (P2).
- They do not distinguish "when it happens" from "when it bills" — and **this is the single concept they most often miss**. The screen's central teaching job is to make *occurs ≠ bills* obvious and safe (see §7, §8).
- They want to **test it immediately**: "did I set that up right?" — answered by the per-charge **Simulate** affordance (§13).

They are not thinking about idempotency, resolution keys, billable-source enums, or posting mechanics. Those never appear (P1).

---

## 4. Primary question being answered

Every card on this screen serves one screen-level question, phrased as the operator would ask it:

> **"What else do we charge for beyond tuition, and — for each one — when does it happen, how much is it, and when does it bill?"**

The per-charge detail answers the same question for one charge, decomposed into the six card-questions in §11.

---

## 5. The charge sentence (full clause-by-clause spec)

Each Charge Definition is authored and read as one sentence. The canonical example:

> **"When a child goes on a field trip, charge $45 to the family, billed 21 days after the event, as Program Fees, needing no review."**

The sentence is a **sentence-builder**: each underlined value is an inline editable slot. In **Summary mode** the sentence reads as a calm statement (values shown as Bend-Pine emphasized text, not input chrome). When the operator clicks a value (intentional edit, P3), that slot — and only that slot — becomes an input drawn from the named component library. Clicking elsewhere or pressing Enter commits and returns to the calm sentence.

The sentence has **six clauses**. They always render in this reading order. Clauses whose controls are irrelevant to the chosen pattern are hidden, not greyed (P12 / progressive disclosure, §16).

### Clause 1 — WHEN (trigger + occurs)

Reads: *"When a child goes on a field trip,"* / *"When a child enrolls,"* / *"On the 1st of each month,"* / *"Whenever I add it,"*

This clause sets **the trigger** (what causes the charge to come into being) and **the occurs moment** (the operational date the charge is anchored to). Control: `ConfigSelectInput` for the trigger; trigger choice reveals a follow-on control for the occurs anchor.

**Trigger options (operator language — the left/enum value never shows):**

| Operator label | Reads in sentence as | Occurs anchor revealed |
|---|---|---|
| **Manually — when I add it** | "Whenever I add it," | none (occurs = the day it's added) |
| **When a child enrolls** | "When a child enrolls," | none (occurs = enrollment date) |
| **On a date** | "On {date}," | `ConfigDateInput` — a fixed calendar date |
| **When an attendance event happens** | "When {attendance event} happens," | `ConfigSelectInput` of attendance event types (e.g. late pickup, early dropoff, absence) — see §15 |
| **On a schedule** | "On {recurrence}," | `ConfigSelectInput` of recurrences (each cycle / weekly / monthly / each enrolled day) — see §16 |

Notes:
- The **occurs moment** is always expressed as an *operational* date ("the trip date", "enrollment date", "the day of the late pickup"), never `occurs_on` (P1; canonical §9: `occurs_on` → "Occurs on").
- For **attendance** and **schedule** triggers, the wiring to *live* facts is the next phase (Operational Consumption). In this slice the trigger is **authored** and **fired manually or in the Simulator** — the screen says so plainly where relevant (§14, §15, §16, §19).

### Clause 2 — WHAT & HOW MUCH (amount)

Reads: *"charge $45"* / *"charge the camp rate"* / *"charge for each meal"*

Control: `ConfigSelectInput` for the amount strategy; choice reveals the amount control.

| Operator label | Reads in sentence as | Revealed control |
|---|---|---|
| **A fixed amount** | "charge **$45**" | `ConfigNumberInput` (money) |
| **Priced from a rate** | "charge **the {rate plan} rate**" | `ConfigSelectInput` of applicable Rate Plans — see §14. The amount resolves at simulation/billing time from Rate Resolution; the sentence shows the *source*, not a frozen number. |
| **By usage quantity** | "charge **{$/unit} per {unit}**" | `ConfigNumberInput` (money, per-unit) + the unit label drawn from the revenue-home Service's unit of sale ("per meal", "per mile", "per session"). Quantity is supplied at the occurring event / in the Simulator. |

"$/unit", "rate", and "fixed" are operator words; no enum (`fixed`/`rate`/`usage`) ever shows (P1).

### Clause 3 — WHO PAYS (responsibility)

Reads: *"to the family,"* / *"to {third party},"*

Control: `ConfigSelectInput`. Default **the family** (the responsibility default for the agreement). Options: **the family** · **a third party** (e.g. subsidy/agency — the specific party is resolved per-agreement downstream, not chosen here). This clause is in the **Advanced** disclosure by default unless the operator has any non-family responsibility configured anywhere (§16). Most charges read "to the family," and the operator never has to touch it.

### Clause 4 — BILLED WHEN (bills moment)

Reads: *"billed 21 days after the event,"* / *"billed right away,"* / *"billed on the next bill,"*

Control: `ConfigSelectInput` for the timing rule; "a number of days later" reveals a small `ConfigNumberInput`.

| Operator label | Reads in sentence as | Revealed control |
|---|---|---|
| **Right away** | "billed **right away**," | none (bills = occurs) |
| **A number of days later** | "billed **{N} days after** {the occurs anchor}," | `ConfigNumberInput` (whole days). The "after the event / after enrollment / after the date" phrasing mirrors the trigger so the gap is concrete. |
| **On the next billing cycle** | "billed **on the next bill**," | none (bills = the family's next invoice date, per Billing-rhythm Policy — §13.4) |

This clause is the one that creates the **occurs-vs-bills gap**, made explicit in the Timing card (§7, §11).

### Clause 5 — REVENUE HOME (Service + category)

Reads: *"as Program Fees,"*

Control: two linked `ConfigSelectInput`s — **which Service** this charge belongs to, then **which Charge Category** under it. The category is what determines where revenue lands in Accounting (read-through). The sentence shows the category label ("as Program Fees,"); the Service is shown in the "What is this charge?" card and as context, not repeated mid-sentence unless ambiguous. See §12 (Service) and §17 (Accounting read-through, owned by the Accounting screen).

Charge Categories are **code-owned** (platform invariants; canonical §6.6). The operator picks from the existing category list; they cannot author categories here.

### Clause 6 — NEEDS REVIEW (control)

Reads: *"needing no review."* / *"with a review before it bills."*

Control: `ConfigSelectInput` with three states:

| Operator label | Reads in sentence as |
|---|---|
| **No review needed** | "needing **no review**." |
| **Review before it bills** | "with a **review before it bills**." |
| **Follow our policy** (default) | "following our **review policy**." |

When set to **Follow our policy**, the effect is resolved from the org's Posting-review Financial Policy (§13). The card (§11) shows the *resolved* effect in plain words so the operator sees what actually applies, not just "inherited."

### The assembled sentence — reading vs editing

- **Reading (Summary, default):** one flowing sentence, values emphasized in Bend Pine, no input chrome. Calm. Scannable (Visual Language #2).
- **Editing (intentional):** click a value → that slot becomes the named input → commit on Enter/blur → returns to sentence. The sentence never collapses into a form; the operator edits one idea at a time.
- **Punctuation and connective words** ("When", "charge", "to", "billed", "as", "needing") are static sentence scaffolding, never editable.

---

## 6. Authoring patterns (One-time / Event / Attendance / Usage)

Authoring is **pattern-first, not field-first** (canonical §5.7). Adding a charge starts with *"What are you charging for?"* (a name) and then a **pattern picker** that pre-fills the entire sentence with sensible defaults. The operator then adjusts values. This means an operator never faces a blank six-clause builder.

Four patterns, each rendered as a selectable card in the pattern picker with a one-line description and a **preview of the sentence it will create** (with placeholder values):

### Pattern A — One-time fee
*For things charged once, when something happens that you trigger.* Examples: Registration, Deposit, Materials fee.

Pre-filled sentence:
> *"When a child enrolls, charge $X to the family, billed right away, as Registration, following our review policy."*

Defaults: trigger = **When a child enrolls**; amount = **a fixed amount** (blank, needs a price); bills = **right away**; revenue home = nearest matching category; review = **follow our policy**.

### Pattern B — Event charge
*For things tied to a specific occasion, often billed later.* Examples: Field Trip, Camp, Photo day.

Pre-filled sentence:
> *"When a child goes on an event, charge $X to the family, billed 21 days after the event, as Program Fees, needing no review."*

Defaults: trigger = **On a date** (the event date; operator renames the occasion); amount = **a fixed amount**; bills = **a number of days later** (default **21**); review = **no review needed**. This pattern is where occurs-vs-bills first appears, so the Timing card (§7) is prominent here.

### Pattern C — Attendance charge
*For things that fire from something that happens during care.* Examples: Late Pickup, Early Dropoff, Drop-in day.

Pre-filled sentence:
> *"When a late pickup happens, charge $25 to the family, billed on the next bill, as Late Fees, following our review policy."*

Defaults: trigger = **When an attendance event happens** (default event: late pickup); amount = **a fixed amount** (default $25, mirroring the Late-fee Policy if set); bills = **on the next billing cycle**; review = **follow our policy**. Carries the "fires manually/simulated for now" note (§15).

### Pattern D — Usage charge
*For things billed by how many / how much.* Examples: Meals, Transportation/mileage, Diapers & consumables.

Pre-filled sentence:
> *"On each billing cycle, charge $X per meal to the family, billed on the next bill, as Meals, following our review policy."*

Defaults: trigger = **On a schedule** (each cycle); amount = **by usage quantity** (per-unit, unit from the Service); bills = **on the next billing cycle**; review = **follow our policy**. Carries the "quantity supplied at billing/simulation" note (§16).

After a pattern is chosen the operator lands directly on the new charge's **Summary-mode sentence**, with the price (or per-unit) slot focused if blank. No separate "create" route or modal form (P3).

---

## 7. The Occurs → Bills → Posts → Collects → Settles lifecycle (taught without accounting)

This screen's second central job (alongside the sentence) is to teach the operator **where a charge sits in its life** — without making them learn accounting. The lifecycle has five moments:

> **Occurs → Bills → Posts → Collects → Settles**

In operator words:

| Moment | Operator meaning | Who controls it |
|---|---|---|
| **Occurs** | The thing happened (the trip date, the late pickup, enrollment). | **This screen** (Clause 1). |
| **Bills** | The charge lands on a family's bill. | **This screen** (Clause 4) — the gap from Occurs. |
| **Posts** | The charge is written to the books as money owed. | Downstream — controlled, not configured here. |
| **Collects** | The family pays. | Downstream — Payments. |
| **Settles** | The money is reconciled / closed. | Downstream — Accounting/Posting. |

### How the UI conveys this — the lifecycle ribbon

At the top of every Charge Definition detail (below the Context band, above the cards) renders a **lifecycle ribbon**: a calm horizontal legend of the five moments, left to right, with connecting lines.

- The **first two segments (Occurs, Bills)** are rendered **active** — Bend Pine, with a small label under each showing *this charge's* configured value: under **Occurs**, the trigger phrase ("On the trip date"); under **Bills**, the bills phrase ("21 days later"). A subtle bracket or tint spans Occurs→Bills with the caption **"You configure this."**
- The **last three segments (Posts, Collects, Settles)** are rendered **downstream** — muted stone, no values, spanned by the caption **"Handled later — controlled, not set here."**
- A persistent one-line legend sits beneath the ribbon: *"This charge controls when it happens and when it bills. What happens after a bill — posting, collecting, settling — is a separate, controlled process."* This is the P2 truth boundary expressed as a lifecycle, not a warning banner.
- No accounting words appear in the ribbon. "Posts" is labeled with its operator gloss on hover: *"written to the books"*; "Settles": *"reconciled and closed."* The words debit, credit, journal, ledger, GL **never appear** (P1).

The ribbon is **read-only**. Clicking the downstream segments does nothing destructive; an optional tooltip explains *"This happens in Posting / Payments / Accounting — not configured on this charge."* The ribbon teaches by showing the operator that their authoring power **stops at Bills**, and that everything after is safe and handled — which is exactly the reassurance an operator nervous about money needs.

### Why a ribbon, not a stepper

A stepper implies the operator advances the charge through the stages. They do not. The ribbon is a **legend / map**, not a progress control — it orients without inviting action, consistent with "understanding is ambient; editing is intentional" (Visual Language #4) and the projection-never-mutates rule (Interaction Grammar).

---

## 8. Timing: occurs vs bills

Because *occurs ≠ bills* is the concept operators most often miss, it gets its own dedicated card and its own ribbon segment.

### The Timing card — "When does it happen, and when does it bill?"

The single most distinctive card on the screen (canonical §5.5). It renders the two moments side by side with the gap called out:

- **Left:** **Occurs** — the trigger phrase + the anchor in plain words. E.g. *"On the trip date."*
- **Right:** **Bills** — the bills phrase. E.g. *"21 days later."*
- **Between them:** the gap, annotated. E.g. *"There's a 21-day gap: the charge happens on the trip, but the family isn't billed until 21 days after."*

Exact copy patterns by configuration:

| Occurs | Bills | Gap caption |
|---|---|---|
| On the trip date | Right away | *"Happens and bills the same day — no gap."* |
| On the trip date | 21 days later | *"21-day gap — happens on the trip, bills 21 days after."* |
| On the trip date | On the next bill | *"Bills on the family's next invoice after the trip — the gap depends on where the trip falls in the billing cycle."* |
| When a child enrolls | Right away | *"Happens and bills the same day — no gap."* |
| When a late pickup happens | On the next bill | *"Happens at pickup, bills on the family's next invoice."* |

When **bills = right away**, the card collapses to a single calm line (*"Happens and bills the same day."*) — no false drama. When a gap exists, the gap line is the emphasized element of the card, because that is the thing the operator must understand.

The Timing card is the human-readable companion to the lifecycle ribbon's Occurs→Bills span. Component: `ConfigurationDetailCard{title:"When does it happen, and when does it bill?"}`.

---

## 9. Setup journey

The operator's journey through the Charges section, end to end:

1. **Arrive** (from the Section Queue "Charges" item, or the Overview journey rail "Charges" step). Land in **Summary mode**: the section Context band + `ConfigReadonlyNotice` + the **Object Queue (320px)** of existing charges + an empty Workspace prompt *"Select a charge to see how it works, or add one."* If there are no charges → first-run empty state (§18).
2. **Scan** the queue. Each row (`ConfigurationQueueItem`) shows the charge name (title), a one-line subtitle of its sentence essence ("$45 · bills 21 days after the event"), and trailing badges: `ConfigVersionBadge` (Current/Scheduled) and, where relevant, a "Review required" chip and an attention glyph (ember) if something's incomplete (§19).
3. **Open** a charge → Workspace fills with: lifecycle ribbon (§7), the **sentence** (§5) in Summary mode, then the cards (§11).
4. **Add** a charge → *"What are you charging for?"* (name) → **pattern picker** (§6) → adjust the pre-filled sentence → it saves as Current (effective today) or the operator schedules a future start (§15 versioning).
5. **Test** → the per-charge **Simulate** button (§13) opens the Financial Simulator pre-loaded with this charge.
6. **Change later** → "Schedule a change" (effective-dated supersede, §15).

No step opens a blank form; no step is a mandatory wizard.

---

## 10. Information hierarchy

Within a single Charge Definition, information is ordered by what the operator most needs to understand first:

1. **Lifecycle ribbon** (§7) — *where in life this charge sits; what you control.* Orienting, read-only.
2. **The sentence** (§5) — *the whole rule in one line.* The primary object.
3. **What is this charge?** — name, category, revenue-home Service, status. Identity.
4. **When does it happen, and when does it bill?** — the Timing card (§8). The distinctive concept.
5. **How much?** — amount strategy in plain words.
6. **Where does its revenue land?** — category → account (read-through to Accounting).
7. **Does it need review before it bills?** — the control, showing resolved effect.
8. **Pricing & timing history** — effective-dated timeline (Activity-mode; §15).

The sentence is the headline; the cards are the **evidence and the edit surfaces** for each clause. A clause and its card stay consistent: editing the sentence updates the card and vice-versa (one truth, two presentations).

---

## 11. Cards

Each card answers one operator question (Law #2, P5). Component for each is `ConfigurationDetailCard{title}` unless noted. Fields use the named inputs.

### Card 1 — "What is this charge?" (Identity)
- **Question/title:** *"What is this charge?"*
- **Fields:** name (`ConfigTextInput`); Charge Category (read of Clause 5, `ConfigSelectInput` to change); revenue-home Service (read of Clause 5); status (Active / Scheduled / Retired via `ConfigVersionBadge`); a **"Review required"** chip when review is on (mirrors the canonical mockup).
- **Example values:** *"Field Trip · Program Fees · Full-Time Care · Active."*
- **States:** Active (Bend-Pine check), Scheduled (future start), Retired (muted), Draft (incomplete — has an attention glyph).
- **Component:** `ConfigurationDetailCard{title:"What is this charge?"}`.

### Card 2 — "When does it happen, and when does it bill?" (Timing — §8)
- **Question/title:** *"When does it happen, and when does it bill?"*
- **Fields:** Occurs (read of Clause 1 + anchor); Bills (read of Clause 4); the gap caption (computed, §8).
- **Example values:** *"Occurs: on the trip date. Bills: 21 days later. 21-day gap."*
- **States:** no-gap (collapsed single line) · gap (emphasized gap line) · cycle-dependent gap (the "depends where it falls" copy).
- **Component:** `ConfigurationDetailCard{title:"When does it happen, and when does it bill?"}`.

### Card 3 — "How much?" (Financial)
- **Question/title:** *"How much?"*
- **Fields:** amount strategy (read of Clause 2) + the value: Fixed → "$45"; Priced from a rate → "the {Rate Plan} rate" with a link to that Rate Plan (§14); By usage → "$X per {unit}".
- **Example values:** *"Fixed — $45."* / *"Priced from the Camp rate."* / *"$3.50 per meal."*
- **States:** priced · **needs a price** (fixed strategy, no amount — ember attention, §19) · rate-linked (shows the linked plan, or attention if the rate is unresolvable) · per-unit set / per-unit missing.
- **Component:** `ConfigurationDetailCard{title:"How much?"}`.

### Card 4 — "Where does its revenue land?" (Financial, read-through)
- **Question/title:** *"Where does its revenue land?"*
- **Fields:** Charge Category → income account, read from Accounting; an inline **"change in Accounting"** link (deep-link, §17). The mapping is *owned* by the Accounting screen; this card reads it.
- **Example values:** *"Program Fees → 4000 Program Fees Revenue."*
- **States:** mapped (Bend-Pine check) · **unmapped** (ember attention: *"Program Fees has no revenue home — this charge couldn't post."* → routes to Accounting, §19).
- **Component:** `ConfigurationDetailCard{title:"Where does its revenue land?"}`.

### Card 5 — "Does it need review before it bills?" (Controls)
- **Question/title:** *"Does it need review before it bills?"*
- **Fields:** the resolved review state (read of Clause 6), and **the source of that state**: the charge's own setting, or *"following our review policy (currently: review required)"* when inheriting (§13).
- **Example values:** *"No review needed."* / *"Review before it bills — following our review policy."*
- **States:** no review · review on (own) · review on (inherited) · review off (inherited).
- **Component:** `ConfigurationDetailCard{title:"Does it need review before it bills?"}`.

### Card 6 — "What changed?" (Activity)
- **Question/title:** *"What changed?"*
- Renders the effective-dated timeline (§15): Current / Scheduled / Superseded / Retired entries with effective dates and a one-line diff ("Price $40 → $45, effective Sep 1"). Activity mode.
- **Component:** `ConfigurationDetailCard{title:"What changed?"}` driven by `EffectiveDatedConfigurationEditor`'s history rail.

> **Card-question discipline:** no card titled "Details" or "Settings". Every title is a question the operator would ask (P5). The sentence is not a card — it sits above the cards as the primary object.

---

## 12. Service relationship

- **A Service is the charge's revenue home.** Every Charge Definition belongs to exactly one Service, and posts to that Service's Charge Category (Clause 5). This is set in the charge, not in the Service (one authoring home per concept — canonical §2.7).
- **On this screen:** the revenue-home Service appears in Card 1 (identity) and is the first half of Clause 5. The operator picks it from existing Services (`ConfigSelectInput`); they do not create Services here.
- **On the Service screen:** the Service detail shows a **read-through "Charges" relationship** ("3 charges post to this service") — *authoring lives here, in Charges; the Service only reads.*
- **Unit of sale:** for **usage** charges (Clause 2 = by usage quantity), the per-unit's unit label is read from the revenue-home Service's unit of sale ("per meal", "per session"). Changing the Service can change the available unit — the sentence updates accordingly.
- **One-time/Usage services** are the natural home for most charges; **Recurring** services (priced by Rate Plans) can still own charges (e.g. a Field Trip charge homing to Full-Time Care).

---

## 13. Financial Policy relationship

Two policy interactions, both **read/resolve** here (policies are authored on the Financial Policies screen):

1. **Posting-review policy** (Controls group, canonical §4.3). When Clause 6 = **Follow our policy**, the review state resolves from this policy. Card 5 shows the *resolved* effect with its source named: *"Review before it bills — following our review policy."* If the operator overrides at the charge (No review / Review), Card 5 says so and offers *"reset to follow policy."*
2. **Billing-rhythm policy** (Billing rhythm group, canonical §4.3). When Clause 4 = **on the next billing cycle**, the "next bill" date is determined by the org's (or scope's) billing rhythm and invoice date. The Timing card's cycle-dependent copy (§8) reflects this. The Simulator (§13/§7-canonical) names the exact resolved date and which policy/scope produced it.
3. **Future cadence/proration policies** may inform timing as the model grows (canonical §5.6); they slot into the same resolve-and-show pattern without re-authoring charges.

Policies are never edited from this screen; Card 5 and the Timing card link out to Financial Policies for the source rule.

---

## 14. Rate Plan relationship

- A charge with **Clause 2 = Priced from a rate** reads its amount from **Rate Resolution** (the same engine the Simulator uses). The sentence shows *"charge the {Rate Plan} rate"* — the source, not a frozen number — because the rate can change over time and by scope.
- **On this screen:** Card 3 ("How much?") shows the linked Rate Plan with a link to it. If the rate is **unresolvable** for a given context (e.g. no cell for the schedule), the card shows ember attention (*"This rate has no price for that schedule"*) and the Simulator explains why (canonical §7.6).
- **Selection:** the rate picker (`ConfigSelectInput`) lists Rate Plans applicable to the revenue-home Service. Choosing a Service first narrows the rate options.
- Most charges are **fixed** or **usage**; rate-priced is the less common path (e.g. a Camp charge that mirrors a seasonal rate). The control lives inline in Clause 2, not under Advanced, but only shows the rate picker once "Priced from a rate" is chosen.

---

## 15. Attendance relationship

- The **attendance trigger** (Clause 1 = "When an attendance event happens") is how charges like **Late Pickup** and **Early Dropoff** come into being. The operator picks the attendance event type from `ConfigSelectInput` (late pickup, early dropoff, absence, drop-in, etc. — labels owned by Attendance).
- **Truth boundary for this slice:** the trigger is **authored** here, but in this slice it **fires manually or in the Simulator** — the live wiring to attendance facts is the next phase (Operational Consumption; canonical §5.6, §5.13). The charge detail states this plainly under the sentence when an attendance trigger is set: *"This charge is set to fire when a late pickup happens. For now you can simulate it or add it manually; automatic firing from attendance comes next."* No alarm — it's a forward-looking note, not an error.
- **No re-authoring later:** when Operational Consumption lands, the *same* definitions begin firing from live attendance facts. The sentence does not change.
- Attendance is **referenced**, never configured here.

## 16. Scheduling relationship

- The **schedule trigger** (Clause 1 = "On a schedule") is how recurring/usage charges (Meals, Consumables, per-enrolled-day fees) come into being. The recurrence picker offers: **each billing cycle · weekly · monthly · each enrolled day**.
- **Per-enrolled-day** and **each cycle** read the child's schedule (from the Agreement/Schedule) to know *how many* — relevant for usage charges where quantity = scheduled days/meals. As with attendance, in this slice the **quantity is supplied in the Simulator or manually**; live firing from schedules is Operational Consumption. The note: *"This charge is set to happen on each billing cycle. For now, simulate it or add it manually; automatic firing from schedules comes next."*
- Scheduling is **referenced**, never configured here.

> **Advanced disclosure (Who pays):** the responsibility clause (Clause 3) lives under "Advanced" because most charges are "to the family." It surfaces inline when the org has any third-party/subsidy responsibility configured, or when the operator opens Advanced.

---

## 17. Accounting relationship (read-through)

- Every charge posts to its Charge Category's **revenue home** (income account), owned by the **Accounting** screen ("Where money lands", canonical §6). Card 4 ("Where does its revenue land?") **reads** this mapping and shows it in plain words ("Program Fees → 4000 Program Fees Revenue").
- **Unmapped category** is the highest-attention state on this screen that the operator can't fix *here*: Card 4 shows ember attention and **routes to Accounting** (*"Program Fees has no revenue home — fix in Accounting"*). The charge is still authorable; it just can't post until mapped (and this screen doesn't post anyway, P2).
- **Charge Categories are code-owned** (canonical §6.6); the operator selects from the existing list in Clause 5 and cannot author categories on this screen.

---

## 18. Future billing visualization

- The sentence already reads as a **promise about the future** ("bills 21 days after the event"). The Timing card (§8) makes the gap concrete in words.
- The **exact future date** is shown by the **Simulator** (§19), not invented on this screen — because the real date depends on a real child/event/agreement. On the charge detail, the future is shown **qualitatively** (the gap caption); the Simulator turns it **quantitative** ("Occurs May 5 · Bills May 26").
- A small **"see this on a timeline"** affordance on the Timing card opens the Simulator pre-loaded (same handoff as Simulate, §13), where Occurs and Bills render on a date axis with the gap annotated. This screen does not draw a standalone calendar — future dates are a Simulator concern (single source of computed truth).

---

## 19. The "Simulate" handoff

Every Charge Definition has a **Simulate** affordance — the loop-closer between authoring and seeing the result (canonical §5.7, §7).

- **Placement:** a `ConfigSecondaryButton` labeled **"Simulate"** in the charge detail's `ConfigButtonRow` (alongside "Schedule a change"), and a compact "Simulate" affordance on the Timing card and on each queue row's hover.
- **Behavior:** opens the **Financial Simulator** (Tools section) **pre-loaded with this charge** — the charge is preselected; the operator then picks the Child → Agreement (the Simulator's intent-first flow, canonical §7.4) and, for event/usage charges, supplies the **event date / usage quantity** the charge needs.
- **What it returns (in the Simulator, not here):** the "What would be charged?" result card — amount, **Occurs on / Billable on with the gap annotated**, revenue home, who pays, needs-review — plus the three "Why?" explanations (resolution, policy, **timing** — which teaches occurs-vs-bills end to end). Carries the preview-only notice: *"Preview only — no invoice, no AR, no posting."*
- **Truth boundary:** Simulate **never** posts (P2). It is a projection (Interaction Grammar). The only write the Simulator can do is the explicit, gated "Write a draft" (Slice D), which is *not* posting and is not on this screen.
- **Validation handoffs:** if the charge is missing a price/date/quantity, the Simulator asks for it in plain words (*"This charge needs an event date to simulate"*) rather than failing — turning incompleteness into a guided next step.

---

## 20. Validation

All validation speaks **operational consequence** and routes to a fix (P7). Messages, in operator words:

| Condition | Message | Severity / routing |
|---|---|---|
| Fixed amount, no price | *"This charge has no price."* | Ember attention on Card 3 + queue glyph. |
| Usage charge, no per-unit amount | *"Priced by usage but no per-unit amount — it will need a price at billing time."* | Ember on Card 3. |
| Rate-priced, rate unresolvable for a context | *"This rate has no price for that schedule."* (full trace in Simulator) | Ember on Card 3 → links to Rate Plans. |
| Event/attendance/usage trigger, no event date/quantity at simulation | *"This charge needs an event date to simulate."* / *"…needs a quantity…"* | In the Simulator, as a plain-words prompt (not an error). |
| Category unmapped in Accounting | *"Program Fees has no revenue home — this charge couldn't post."* | Ember on Card 4 → routes to Accounting. |
| Bills "a number of days later" with 0/blank days | *"Choose how many days after the event it bills, or pick 'right away'."* | Inline on Clause 4. |
| Review = follow policy, but no posting-review policy exists | *"No review policy is set — this charge won't require review. Set one in Financial Policies if you want review."* | Advisory (gold) on Card 5. |
| Charge with no name | *"Give this charge a name so you can find it."* | Inline on Clause/Card 1. |

- **Severities** follow the cross-cutting model (canonical §8.1): **Attention (ember)** = would break billing; **Advisory (gold)** = safe but suboptimal; **Info (stone)** = neutral. Attention items aggregate into the Overview "Is our financial setup complete?" answer card.
- Validation **never** uses form language ("required", "invalid"). It states the business consequence.

---

## 21. Versioning

- Charge Definitions are **effective-dated** (canonical §5.9, Slice B) via `EffectiveDatedConfigurationEditor`. The verb is **"Schedule a change,"** never "Edit" (P4).
- **States** rendered by `ConfigVersionBadge`: **Current** (effective today), **Scheduled** (future-dated, voidable before start), **Superseded** (replaced), **Retired** (stopped).
- **Schedule a change:** pick an effective date → edit sentence values → save. The prior version closes the day before; nothing overwrites. A **Scheduled** future version is visible, labeled ("Takes effect Sep 1"), and **voidable** before it starts.
- **Retire** stops *future* charge creation **without touching charges already drafted** (canonical §5.9). Copy: *"Retiring this stops it from happening again. Charges already created are unaffected."*
- **"As of" viewing:** the operator can view a charge as it was/will be on any date. The Simulator's "as of" (canonical §7.11) lets them preview *next month's* scheduled price/timing before it takes effect.
- **History** is Card 6 ("What changed?") with one-line diffs.

---

## 22. Progressive disclosure

- **The sentence shows only relevant clauses** (canonical §5.12). A fixed one-time fee hides the per-unit and the days-offset controls; a "right away" charge hides the offset; "Follow our policy" hides the manual review toggle's detail. Hidden = not rendered, not greyed (less chrome, calmer).
- **Advanced disclosure** holds: **Who pays** (Clause 3, unless non-family responsibility exists), review-inheritance detail, and any tax/responsibility overrides. Collapsed by default behind a single "Advanced" affordance.
- **Cards open in Summary**; editing a clause is an intentional click (P3). History (Card 6) and the three Simulator "Why?" panels are collapsed by default (depth on demand).
- The **lifecycle ribbon's** downstream segments (Posts/Collects/Settles) carry their detail only on hover — calm by default.

---

## 23. Empty / first-run

- **Section empty state** (`ConfigurationEmptyState`): *"No extra charges yet. Beyond tuition, most organizations charge for registration, field trips, late pickup, meals, or supplies. Add the ones you use."* Primary action: **the pattern picker** (§6) — *"Add a charge."*
- **BOS proposal** (propose-and-approve, P6): *"Most childcare orgs charge for Registration, Field Trips, and Late Pickup. Want these as drafts?"* — accepting seeds **draft** charges (not active, each needing a price) the operator reviews. BOS never auto-creates active charges.
- **Per-charge incomplete (Draft) state:** a charge missing a required value (e.g. price) renders in the queue with an attention glyph and a Draft badge; its detail shows the specific gap via §20 validation, with the offending clause focused.
- **No dead ends** (canonical §8.4): every empty state explains the business concept and gives one primary action.

---

## 24. Editing workflow

- **Edit a clause:** click the value in the sentence (or the field in its card) → named input → commit on Enter/blur. For values that affect money or timing, the edit is captured as a **scheduled change** (effective-dated) rather than an overwrite — the editor prompts for an effective date (default today). Identity-only edits (name) apply immediately.
- **Schedule a change:** opens `EffectiveDatedConfigurationEditor` with the current sentence pre-loaded; the operator changes values and sets the effective date.
- **Void a scheduled change:** from Card 6 / the history rail, before it starts.
- **Retire:** from the `ConfigButtonRow`, effective-dated, with the "charges already created are unaffected" copy (§21).
- **No modal forms, no separate routes** (P3) — all editing is inline in the Workspace or via the shared effective-dated editor.
- **Read-only mode:** when the operator lacks edit permission, `ConfigReadonlyNotice` is joined by the standard read-only treatment; the sentence renders as calm text with no editable affordances; Simulate remains available (it's read-only by nature).

---

## 25. Future extensibility

- **New trigger sources** (transportation scans, camp registration, billing milestones, POS) become **new "When" options** (Clause 1) — no new screen (canonical §5.13).
- **New amount strategies** extend Clause 2 (e.g. tiered, percentage-of-tuition) — the sentence grammar absorbs them.
- **Live triggers / Operational Consumption:** when it lands, the *same* Charge Definitions begin **firing from live facts** (attendance, schedules, POS) instead of manual/simulated firing — **no re-authoring** (§15, §16). The "fires manually for now" notes are removed; the sentence is unchanged.
- **Effective-dated everything** and the **propose-and-approve** BOS pattern generalize as new sources arrive.
- The lifecycle ribbon extends gracefully: as Posting/Payments ship, the downstream segments can gain a per-charge live state ("posted", "collected") **as read-only status** — still not configured here.

---

## 26. Operator mistakes (and how the screen prevents them)

- **Confusing occurs with bills** — the #1 mistake. Prevented by the Timing card's explicit gap caption (§8) and the lifecycle ribbon's "you configure Occurs→Bills" framing (§7), and proven by the Simulator's timing explanation.
- **Thinking authoring posts money** — prevented by the persistent `ConfigReadonlyNotice`, the lifecycle ribbon's downstream "handled later" framing, and the Simulator's "preview only" notice (P2).
- **Forgetting a price** — caught by §20 validation (ember on Card 3), surfaced in the queue glyph and Overview readiness card.
- **Leaving a category unmapped** — caught and routed to Accounting (§17, §20).
- **Overwriting history** — impossible: the verb is "Schedule a change"; edits supersede (§21).
- **Setting an attendance/schedule trigger and expecting it to fire automatically now** — prevented by the plain "fires manually/simulated for now" note (§15, §16).
- **Authoring a duplicate of an existing charge** — BOS advisory: *"You already have a 'Field Trip' charge — edit it instead of adding another?"* (propose, not block).

---

## 27. How BOS assists (propose-and-approve only)

Per BOS Foundation, every assist is a **proposal chip** the operator approves — never an auto-write (P6, canonical §8.3):

- **Seed common charges** (empty state): Registration, Field Trip, Late Pickup as drafts.
- **Missing-price nudge:** *"Field Trip has no price — most orgs charge $35–$60."* (advisory).
- **Late-fee mirror:** *"Your Late-fee policy is $25 — set this Late Pickup charge to $25?"* (proposes the value from the policy).
- **Unmapped-category fix:** *"Program Fees has no revenue home — map it to 4000 Program Fees?"* (routes to Accounting for approval).
- **Duplicate detection:** *"This looks like your existing 'Field Trip' charge."* (advisory).
- **Stale-price notice (future):** *"This charge's price hasn't changed in 2 years."* (informational).

BOS never posts, never patches truth, never bypasses the authoring services. Proposals appear as chips the operator accepts/dismisses.

---

## 28. Questions answered

This screen lets the operator confidently answer:
- *"What do we charge for beyond tuition?"* — the Object Queue.
- *"For this charge — when does it happen, and when does it bill?"* — the sentence + Timing card + ribbon.
- *"How much is it, and how is that amount decided?"* — Card 3.
- *"Where does its money land?"* — Card 4 (read-through).
- *"Does it need a human before it bills?"* — Card 5.
- *"What would actually happen to a real child?"* — Simulate → Simulator.
- *"What did I change, and what's coming?"* — versioning / Card 6.

## 29. Questions introduced

The screen deliberately raises (and answers, or routes) these:
- *"Wait — does setting this up charge anyone?"* → No (P2 framing, lifecycle ribbon).
- *"Why doesn't it bill on the day it happens?"* → the occurs-vs-bills gap (Timing card, §8).
- *"Will the late-pickup charge fire by itself?"* → not yet; manual/simulated this slice (§15).
- *"Where does this money go after it bills?"* → downstream, handled, not here (ribbon's Posts/Collects/Settles).

## 30. Questions intentionally deferred

Out of scope for this screen / slice (consistent with canonical deferrals):
- **Posting, Collecting, Settling mechanics** — downstream; only *named* on the lifecycle ribbon, never configured here (§7).
- **Live firing from attendance/schedule/POS facts** — Operational Consumption, next phase (§15, §16, §25).
- **Materializing a draft charge** — the Simulator's gated "Write a draft" (Slice D), not on this screen (§19).
- **Authoring Charge Categories** — code-owned (Accounting reference; §17).
- **Subsidy / third-party responsibility resolution** — deferred per canonical; Clause 3 offers the default only, with specifics resolved per-agreement downstream (§5 Clause 3, §16).
- **Tax treatment** — Advanced placeholder; full tax model deferred.
- **Standalone future-billing calendar** on this screen — future dates are a Simulator concern (§18).

---

*This document is the deep expansion of `financial_configuration_product_spec.md` §5. Where the two ever conflict, the canonical spec governs.*
