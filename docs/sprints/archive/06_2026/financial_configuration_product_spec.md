# Alloy Financial Configuration — Product Specification

**Type:** Implementation-ready product design specification (design sprint, no code).
**Status:** Blueprint for the Financial Configuration experience rebuild.
**Author posture:** Principal Product Designer / UX Architect / Operator — not engineer.
**Date:** June 2026. Supersedes the as-built Financials configuration screens where they conflict.

> **The one principle that governs every screen in this document:**
> **Operators configure a business, not a database.** Per the Operational Grammar (`docs/platform/operator/operational-grammar.md`, Law #1): *"Operators never operate on records. Operators answer operational questions."* Every screen below is judged by one test — does it feel like configuring *how the business operates*, or like configuring *software*? If it feels like software, it is redesigned here.

---

## 0. Doctrine basis and compliance

This spec invents **no new design language**. It composes the frozen Alloy primitives:

| Source doctrine | What we take from it |
|---|---|
| **Operational Grammar** (`operator/operational-grammar.md`) | Cards are *answers* to operational questions; intent precedes data; eight question families (Identity, Process, Work, Intelligence, Communication, Financial, Activity, Metrics). |
| **Alloy Visual Language** (`operator/alloy-visual-language.md`) | Business meaning before fields; scan before read; cards communicate *state* not schema; understanding is ambient, editing is intentional; calm under pressure; premium = predictable. |
| **Canonical Interaction Model** (`operator/canonical-interaction-model.md`) | Spine: Workspace → Queue → Row → Context Frame → Mode → Card → Section → Field. Three modes: Summary / Work / Activity. |
| **Interaction Grammar** (`operator/interaction-grammar.md`) | Records own truth; projections (cards, queues, previews) observe and never mutate; BOS proposes, humans approve. |
| **Configuration Runtime V1** (`system/configuration-runtime-v1.md`) — *frozen* | Shell geometry `Context → Queue → Workspace → BOS`; Section Queue 260px, Object Queue 320px, Workspace flex. `config-typo-*` tokens; **Bend Pine `#00a283`** for active/complete; white canvas; stone borders; `1rem` card radius. |
| **Configuration component library** (`web/components/adminV2/settings/configurationRuntime/`) | `ConfigurationContext/Shell/Queue/Workspace/QueueItem/DetailCard/EmptyState`, `ConfigReadonlyNotice`, `ConfigField/FieldGrid`, `ConfigEffectiveBadge/ScopeBadge/VersionBadge`, `Config*Input/Button`, and the shared `EffectiveDatedConfigurationEditor`. |
| **BOS Foundation** (`product/bos-foundation.md`) | BOS = Business Orchestration System. It *proposes drafts within guardrails*; the platform owns truth/ledger/posting. Every assist below is propose-and-approve, never auto-write. |

**Freeze compliance (important).** Configuration Runtime V1 forbids *changing the config shell IA, adding primary nav, or per-page width overrides*. This spec stays inside that freeze:
- The grouped section nav (Overview / What you sell / Money rules / Money movement / Who pays / Tools) **is** the frozen 260px **Section Queue**. We refine *labels and ordering within the Financials domain*, not the shell.
- The per-section lineage lists (rate plans, policies, templates) **are** the frozen 320px **Object Queue**.
- All redesign below is **Workspace content** (the flex column) plus **Surfaces wiring** — both explicitly permitted post-V1 (bug fixes, visual polish, Surfaces). No new shell, no new primary nav.
- The guided "progression" is a *workspace surface inside the Overview section*, not a new chassis.

### 0.1 Global patterns every Financial screen inherits

These are specified once and referenced (not repeated) per screen.

**P1 — Operator language, always.** No screen shows `id`, `*_key`, `billable_source_type`, enum literals, or table names. A translation layer (§9) maps every stored value to a business phrase. "Plan Key", "Hybrid", "billable_source_id" never appear in the UI.

**P2 — Read-only / preview truth boundary.** Financial *configuration* never posts money. Every configuration surface carries the persistent `ConfigReadonlyNotice`: *"This is configuration. It does not post money. Posting is a separate, controlled process."* Every *simulation* surface carries: *"Preview only — no invoice, no AR, no posting."* This is non-negotiable framing (Interaction Grammar: projections never own truth).

**P3 — Understanding is ambient; editing is intentional.** Each section opens in **Summary mode** — a calm, scannable read of the current business reality. Editing is a deliberate, focused act (inline authoring via `Config*Input`, or the `EffectiveDatedConfigurationEditor` for versioned entities). We never open onto a form.

**P4 — Effective-dated everything reads the same.** Anything that changes over time (rate plans, policies, charge definitions) uses the four canonical states rendered by `ConfigVersionBadge`: **Current** (effective today), **Scheduled** (future-dated, pending), **Superseded** (replaced), **Retired** (ended). The verb is always *"Schedule a change"*, never *"Edit"* — you never overwrite history, you supersede it.

**P5 — Cards are answers.** Every card answers exactly one operational question, in its title, phrased as the operator would ask it ("What does this service power?", "When does this charge bill?", "Where does tuition income land?"). Never a field-group with a noun label.

**P6 — BOS assists, never decides.** Where intelligence helps (suggested mappings, missing-policy detection, "this price hasn't changed in 2 years"), it appears as a **proposal chip** the operator approves. Never an auto-applied change.

**P7 — Validation is operational, not form-level.** Errors speak business consequences ("3 rate cells are empty — a 4-day Toddler enrollment would have no price"), not field constraints ("value required").

---

## 1. Navigation & Information Architecture

### 1.1 The spine: a guided progression, not a settings list

**Decision: guided progression.** Financial configuration is a *causal chain*, not a flat menu. An operator's mental model is a sentence:

> **What we sell → how we price it → the rules around money → how charges are created → where money lands → tools to check it.**

The Section Queue (260px) renders exactly this, grouped, with the existing labels refined:

```
FINANCIALS
  Overview

WHAT YOU SELL
  Services            — what the organization offers
  Rate Plans          — how recurring services are priced

MONEY RULES
  Financial Policies  — the rules around billing & money
  Charges             — one-time & ancillary charges (was "Charge Templates")

MONEY MOVEMENT
  Accounting          — where money lands
  Posting             — (deferred) the authoritative money write
  Payments            — (deferred)

WHO PAYS
  Financial Responsibility
  Subsidy             — (deferred)

TOOLS
  Financial Simulator — (was "Charge Preview")
```

Each queue item carries a **completion glyph** (Bend Pine check when configured; hollow when not) and, where relevant, a count chip ("12 policies", "7 charges"). This is the live version of the mockup's "Commercial Model — 5/6 Configuration complete" widget, but distributed onto the real nav rather than a separate card.

### 1.2 Overview = the Configuration Journey

The **Overview** section's workspace is the progression surface (the mockup's top stepper, formalized):

- A horizontal **journey rail**: six steps (Services → Rate Plans → Financial Policies → Charges → Accounting → Simulator), each with a one-line "Define what you offer / Define how you charge / …" subtitle and a state (Complete / In progress / Not started), Bend-Pine for complete.
- Below it, **four ambient summary cards** (`ConfigurationDetailCard`) answering: *"What do we sell?"* (N services), *"How do we price?"* (N rate plans, N price points), *"What are our money rules?"* (N policies, M customized vs default), *"How are charges created?"* (N charge definitions). Each card is a shortcut into its section.
- A **readiness answer card** (BOS, Intelligence family): *"Is our financial setup complete?"* — e.g. *"Ready to bill recurring tuition. 1 charge category is unmapped in Accounting — field-trip revenue would have no home."* This is a proposal/attention card, not a blocker.

**Why this is the Alloy way:** Navigation Doctrine puts *Business Process* above raw entity lists. The journey *is* the financial setup process. Operators land in a narrative, not a control panel.

### 1.3 Per-section workspace anatomy (shared shell)

Every section below uses the identical workspace skeleton, so the product feels like one system (Visual Language #9, premium = predictable):

1. **Context band** (`ConfigurationContext`): the operator question as title + one-line plain-language purpose.
2. **`ConfigReadonlyNotice`** (P2).
3. **Summary mode** body: cards that answer questions.
4. **Object Queue (320px)** when the section holds many lineages (rate plans, policies, charges) — a scannable list with status badges; selecting one fills the workspace with its detail.
5. **Editing** is always inline or via the shared effective-dated editor — never a separate route, never a modal form.

---

## 2. Screen 1 — Services

### 2.1 Purpose
Define **what the organization sells** as operational capability bundles — not as catalog rows. A Service is the spine that scheduling, attendance, capacity, waitlist, tuition, and the parent portal all hang from.

### 2.2 Operator goal
*"Set up the things we offer — full-time care, before/after care, drop-in, meals, registration — and what each one switches on operationally and financially."*

### 2.3 Information hierarchy
1. **Identity** — name, what it is in one sentence, and its **billing rhythm** (Recurring / One-time / Usage-based) as the defining chip.
2. **What it powers** — the operational capabilities (scheduling, attendance, capacity, waitlist, tuition, parent portal).
3. **How it's delivered** — associated programs (Toddler / Preschool / Pre-K).
4. **How it's priced** — link to its Rate Plan(s) (recurring) or its Charges (one-time/usage).
5. **Financial home** — default revenue category / accounting (read-through to Accounting).

### 2.4 Sections (Service detail = Summary mode cards)
- **"What is this service?"** — description, billing rhythm chip, unit of sale ("sold per week / per day / per session / per hour / per item"), status (Active / Draft / Retired).
- **"What does this service power?"** — the capability card (see 2.6). The single most important card; it expresses that a Service is an *operational switchboard*, not a price.
- **"Which programs deliver it?"** — Associated Programs as relationship chips with add/remove.
- **"How is it priced?"** — for Recurring: the linked Rate Plan(s) with a price-range summary ("$145–$285/week"). For One-time/Usage: the linked Charges.
- **"Where does its revenue land?"** — default Charge Category → revenue account, read from Accounting, with an inline "change" that deep-links to Accounting.

### 2.5 Cards (the answer set)
| Card (question) | Family | Content |
|---|---|---|
| *What is this service?* | Identity | Name, one-line meaning, billing-rhythm chip, unit of sale, status. |
| *What does this service power?* | Process | Capability toggles (below). |
| *Which programs deliver it?* | Process | Program chips. |
| *How is it priced?* | Financial | Rate plan summary or charge list + price range. |
| *Where does its revenue land?* | Financial | Category → account. |
| *What changed?* | Activity | Effective-dated history (Activity mode). |

### 2.6 The "What this service powers" capability model (key decision)
A Service exposes capability **relationships**, shown as labeled switches with state, each answering "does this service participate in X?":

- **Scheduling** — does enrollment in this service create a schedule? (Recurring: yes; Registration: no.)
- **Attendance** — is attendance tracked / billable-relevant?
- **Capacity** — does it consume room/ratio capacity?
- **Waitlist** — can families wait for it?
- **Tuition** — is it priced by a Rate Plan?
- **Parent Portal** — is it visible/bookable to families?

These are *operational truths*, not checkboxes for their own sake — turning **Tuition** on reveals the Rate Plan relationship; turning **Scheduling** on is what makes it eligible for the schedule engine. This is progressive disclosure driven by business meaning (Visual Language #1).

### 2.7 Open questions — resolved
- **Should Units be configurable?** **Yes**, but framed as *"How is this sold?"* (per week / day / session / hour / item), never as a `unit` enum. The unit drives how Rate Plans and Charges express price ("$/week" vs "$/session"). It is meaningful business vocabulary.
- **Should recurring vs one-time feel different?** **Yes, fundamentally.** Billing rhythm is the *defining* attribute and changes the entire card set: Recurring services show scheduling/attendance/capacity/waitlist + a Rate Plan; One-time/Usage services hide those and show Charges instead. Same shell, different revealed capabilities.
- **Should Services own Programs?** **No — association, not ownership.** Programs are operational groupings that exist independently; a Service is *delivered through* programs. Shown as a relationship card. (Mirrors Configuration Ownership Doctrine: Locations own programs; Financials references them.)
- **Should Services own Charge Templates?** **No — Services are the revenue *home*; Charges *reference* the Service.** The Service detail shows a **"Charges"** relationship tab (read-through: "3 charges post to this service"), but authoring lives in the Charges section. One authoring home per concept (avoids two edit paths for one truth — Interaction Grammar).

### 2.8 Workflows
- **Add a service:** intent-first. "What are you adding?" → name + pick billing rhythm → the relevant capabilities appear pre-set to sensible defaults for that rhythm → save. No blank 20-field form.
- **Configure capabilities:** inline toggles in Summary mode (intentional edit, P3).
- **Associate a program:** add-chip picker.
- **Retire a service:** effective-dated retire (see 2.10), with a guard if active agreements depend on it (P11).

### 2.9 Empty states
`ConfigurationEmptyState`: *"No services yet. Services are the things your organization offers — full-time care, before & after care, drop-in, meals, registration. Start with the one most families enroll in."* + primary "Add your first service." BOS proposal (optional): *"Most childcare orgs start with Full-Time Care, Before Care, After Care. Want these as drafts?"* (propose-and-approve).

### 2.10 Editing & versioning behavior
- Identity and capabilities edit **inline** (Summary mode).
- Anything price-affecting (default category) is **effective-dated** through the shared editor — you *schedule* a change, never overwrite. Retire closes the window; history is preserved as Superseded/Retired.
- Capability toggles that affect live operations (e.g. turning Scheduling off) require confirmation describing the operational consequence, not a generic "are you sure?".

### 2.11 Relationships
Service → Rate Plans (priced-by), → Charges (revenue-home), → Programs (delivered-through), → Accounting category (posts-to), → Agreements (enrolled-via, read-only here). The Service is the hub of the Financial graph.

### 2.12 Validation
- A Recurring service with **Tuition on but no Rate Plan** → attention: *"Full-Time Care is recurring but has no price. A family enrolling today would have no tuition."*
- A service with **no revenue category** → attention surfaced in Accounting.
- Retiring a service with active agreements → blocked with the count and a path ("3 active agreements use this — schedule retirement for a future date instead").

### 2.13 Progressive disclosure
Billing rhythm gates the visible capability set. Advanced attributes (proration eligibility default, tax treatment) live under an "Advanced" disclosure, collapsed by default.

### 2.14 Future extensibility
The capability model is open — new capabilities (Transportation, Meals-as-service, Camp sessions) are new switches, not new screens. New billing rhythms (seasonal, milestone) extend the chip set. This is the Operational UX Doctrine promise: a new offering is a *new instance in the model*, not a new product.

### 2.15 Why this is the Alloy way
It answers *"what do we sell?"* with operational meaning leading and schema supporting (Visual Language #1). The Service becomes a switchboard for the operating system, not a catalog row — exactly the difference between configuring a business and configuring a database.

---

## 3. Screen 2 — Rate Plans (the Pricing Matrix)

### 3.1 Purpose
Define **how recurring services are priced** as a readable pricing table an operator could hand to a parent — not as a list of atomic Rate Rules.

### 3.2 Operator goal
*"Set our weekly tuition by how many days a child attends and by age group, here and at each location."*

### 3.3 Decision: Rate Plan → Pricing Matrix
**A Rate Plan is presented as a pricing matrix, not a rule list.** Rate Rules become *cells*, not first-class objects the operator manages.

```
Standard Tuition — North Campus · Full-Time Care            [Current ▾ history]

                  Toddler (18–36mo)   Preschool (3–5yr)   Pre-K
  5 days / week        $285               $265            $250
  4 days / week        $245               $230            $220
  3 days / week        $195               $185            $175
  2 days / week        $145               $140            $135
  Half day             $165               $155            $150
  Hourly               $12 / hr           $11 / hr        $10 / hr

  Charges for: ◉ Scheduled days   ○ Attended days   ○ Flat weekly
```

- **Rows** = schedule shape (5/4/3/2 days, Half day, Hourly) — the operator's real pricing axis.
- **Columns** = age group (driven by the org's age bands).
- **Cells** = the price (the underlying Rate Rule). Editing a cell *is* superseding a rule, but the operator never sees "rule".
- **"Charges for"** = the calculation strategy, in plain language: **Scheduled days** / **Attended days** / **Flat weekly**. The word **"Hybrid" is removed** entirely.

### 3.4 Information hierarchy
1. **Which service & where** — plan name, the service it prices, the scope (Organization default vs Location override).
2. **The matrix** — the price points.
3. **How it charges** — calculation strategy + billing basis (weekly/monthly), in words.
4. **When it's effective** — current vs scheduled vs historical.

### 3.5 Sections / cards
- **"What does this price?"** — service + scope badge (`ConfigScopeBadge`: "Organization default" or "North Campus override"). **Plan Key is hidden** (P1).
- **"The price table"** — the matrix (3.3).
- **"How does it charge?"** — calc strategy + basis + currency, plain language.
- **"Where does this apply?"** — the multi-location consumption card (3.7).
- **"Pricing history"** — effective-dated timeline (3.8).

### 3.6 Open questions — resolved
- **Hide Plan Key** — done (internal; never shown).
- **Replace "Hybrid"** — replaced by **Scheduled days / Attended days / Flat weekly** as the three "Charges for" options.
- **Matrix vs Rate Rules** — matrix wins decisively. Rules are an implementation detail beneath the cells.

### 3.7 How multiple Locations consume one Rate Plan (key decision)
- One plan is the **Organization default**. Locations **inherit** it unless overridden.
- An override is presented as **"Same as organization, except…"** — a *diff*, not a fresh table. The override matrix shows inherited values in muted text and overridden cells in Bend Pine, so an operator sees *exactly what differs* ("North Campus 5-day Toddler is $295 instead of $285; everything else inherited").
- A **"Where this applies"** card lists locations: *"Inherited by 3 locations · overridden at North Campus."* Clicking a location shows its effective table.
- Creating an override starts from inheritance, so operators change one number, not twelve.

### 3.8 Versioning behavior (how history appears)
- Powered by `EffectiveDatedConfigurationEditor`. The matrix header shows the active state badge and a **"Pricing history"** rail: Current / Scheduled / Superseded / Retired.
- The verb is **"Schedule a price change"** — pick an effective date, edit cells, save. The prior table closes the day before; nothing overwrites.
- A **Scheduled** future table is visible and labeled ("Takes effect Sep 1") and can be **voided** before it starts.
- Operators can view the table **"as of"** any date.

### 3.9 Workflows
- **New rate plan:** pick the service it prices → pick scope (org/location) → fill the matrix (pre-seeded with the org default if an override) → choose "Charges for" → set effective date → save.
- **Change a price:** open plan → "Schedule a price change" → edit cells → effective date.
- **Override for a location:** "Price differently here" → diff editor.

### 3.10 Empty states
*"No pricing yet for [Service]. Build a price table by days-per-week and age group — the way you'd quote it to a parent."* + "Build price table."

### 3.11 Editing behavior
Cell edit is inline, money-typed (`ConfigNumberInput`/money). Bulk affordances: "raise all by %" as a BOS proposal that fills the scheduled table for review (propose-and-approve), never auto-applied.

### 3.12 Relationships
Rate Plan → Service (prices), → Location (scoped), → Age groups (columns), → Agreements (consumed-by, read-only), → Charge Resolution (the Simulator reads it). Drives the recurring half of the financial graph.

### 3.13 Validation
- **Empty cell** → *"4-day Preschool has no price. An enrolling family at that schedule would have no tuition."*
- Override identical to default in every cell → *"This override matches the organization price exactly — it has no effect. Remove it?"*
- Hourly strategy without an hourly rate → operational warning.

### 3.14 Progressive disclosure
Hourly/Half-day rows appear only if the service supports them. Currency and tax sit under "Advanced". Age columns follow the org's configured bands.

### 3.15 Future extensibility
New pricing axes (sibling tier, income tier, seasonal) extend the matrix dimensions without a new screen. The "Charges for" set can grow (e.g. "Charge for enrolled days"). The diff-override pattern generalizes to any scoped, versioned config.

### 3.16 Why this is the Alloy way
A pricing table is how a director *thinks about price*; a list of rate rules is how a database stores it. Leading with the table (Visual Language #1) and burying the rules is the literal embodiment of "configure the business, not the schema."

---

## 4. Screen 3 — Financial Policies

### 4.1 Purpose
Define **the rules around money** — when we bill, what happens around absences, what we charge for lateness, when humans must approve — as a small set of business decisions with sensible defaults, not a wall of settings.

### 4.2 Operator goal
*"Set how billing works at our organization, change the few things that differ from the norm, and leave the rest on safe defaults."*

### 4.3 Decision: cluster policies into five operator-meaningful groups
The 13 policy types are grouped by the *question they answer*, not by table. Each group is a card; within it, simple policies edit inline and complex ones open a focused editor.

| Group (question) | Policies | Posture |
|---|---|---|
| **Billing rhythm** — *"When and how do we bill?"* | Billing schedule/cadence, Invoice date, Due date, Grace period | **Simple** — front and centre. Most orgs set these once. |
| **Absences & changes** — *"What happens when plans change?"* | Proration, Vacation/absence credit, Withdrawal | **Medium** — common but considered. |
| **Fees & deposits** — *"What do we charge for friction?"* | Late fee, NSF fee, Deposit | **Simple-ish** — single values mostly. |
| **Adjustments & credits** — *"How do we correct money?"* | Refund, Credit, Write-off | **Medium**. |
| **Controls & approvals** — *"What needs a human?"* | Adjustment approval, Draft lifetime, Posting review | **Advanced** — collapsed by default; governance. |

### 4.4 Information hierarchy
1. **The five groups**, ordered by how often operators touch them (Billing rhythm first; Controls last).
2. Within a group, each policy shows its **current effect in plain language** and whether it's **Alloy default** or **Customized** (`ConfigEffectiveBadge`-style chip).
3. Scope (Org / Location / Service / Rate Plan) shown only where a non-org scope exists ("Org default · North Campus differs").

### 4.5 Sections / cards
Each group is a `ConfigurationDetailCard` titled with its question. Inside, each policy is a one-line **"sentence with the value inline"**:
- *"We bill **weekly**, invoice on **Monday**, due **on receipt**, with a **3-day** grace period."*
- *"Late pickup costs **$25**."*
- *"Returned payments cost **$30**."*
- *"Refunds **require owner approval**."* (Controls group.)

Editing a value happens in place; the sentence updates. This is the opposite of a settings grid.

### 4.6 Setup flow (simple vs advanced)
- **First run:** every policy ships **on a labeled Alloy default** ("Using Alloy default"). The org is billable immediately; customization is optional. This honors "calm under pressure" — no blank mandatory setup.
- **Customizing:** click a value → inline edit → it becomes "Customized" with a "reset to default" affordance.
- **Advanced** (Controls & approvals) is collapsed behind "Show governance policies", because most operators never change posting-review/adjustment-approval and shouldn't be confronted with them.

### 4.7 Open questions — resolved
- **Which belong together / how grouped** — the five clusters in 4.3.
- **What's simple vs advanced** — Billing rhythm + Fees = simple/prominent; Absences + Adjustments = medium; Controls/approvals = advanced/collapsed.
- **Setup flow** — defaults-first, customize-by-exception, never a mandatory wizard.

### 4.8 Workflows
- **Change billing rhythm:** open Billing rhythm card → edit the sentence values → optionally schedule the change for a future date.
- **Set a scoped policy:** "This differs at a location/service" → pick scope → set value (most-specific-wins is explained in the resolved preview).
- **Tighten controls:** expand Controls → turn on Posting review / set approval thresholds.

### 4.9 Empty states
There is no true empty state — defaults always exist. The "empty" feeling is replaced by *"You're using Alloy's recommended financial rules. Customize any that differ for your organization."*

### 4.10 Editing & versioning behavior
- Policies are **effective-dated** (Slice C): changes *supersede*; you can schedule "late fee becomes $30 on Jan 1". The shared editor's timeline applies; the per-policy line shows Current/Scheduled state.
- A **resolved-effect preview** ("As of today, at North Campus, the late fee is $30 because the location overrides the $25 org default") accompanies any scoped policy — the operator sees *what actually applies*, not just what they typed.

### 4.11 Relationships
Policies scope to Org / Location / Service / Rate Plan and resolve most-specific-wins. They are **consumed** by Charge Resolution (e.g. posting-review gates whether a draft needs approval; grace/late-fee inform future charges). The Simulator (§7) shows which policy applied to a given charge.

### 4.12 Validation
- Contradictory scope (a service policy looser than the org control) → explained, not blocked, with the resolved winner shown.
- Due-date before invoice-date → operational error in plain terms.
- A late-fee policy with no amount → "Late fee is on but has no amount."

### 4.13 Progressive disclosure
Three tiers: prominent (Billing rhythm, Fees), expandable (Absences, Adjustments), governance (Controls). Scope controls appear only when invoked ("this differs somewhere").

### 4.14 Future extensibility
New policy types are new sentences in the right group (e.g. "Sibling discount eligibility", "Tax rule") — no new screen. The group taxonomy absorbs the doctrine's full future policy list. Agreement-scope is the next scope dimension and slots into the same resolver.

### 4.15 Why this is the Alloy way
It turns a 13-row settings table into *five business decisions written as sentences*, defaulted safe, customized by exception. Operators read their own policy in their own words (Visual Language #2: scan before read) — they are configuring how the business handles money, not editing a config object.

---

## 5. Screen 4 — Charges (was "Charge Templates")

### 5.1 Decision on the concept
**Operators do not think "templates."** They think *"what else do we charge for, and when does it happen?"* Reframe:

- **Surface name:** **"Charges"** (or "Billable Items") — the things you charge for beyond recurring tuition.
- **Each item is a Charge Definition** answering: *"When **X happens**, charge **$Y**, billed **at time Z**."* (The word "template" survives only in code/docs, never in the UI.)
- They are neither a financial event nor a charge record — they are **a rule for creating a future charge**. Framed as a plain-language sentence, that distinction becomes intuitive.

### 5.2 Purpose
Define **how non-tuition charges come into being** — registration, field trips, late pickup, meals, transportation, camp, consumables — including *when they occur* and *when they bill*, without ever posting money.

### 5.3 Operator goal
*"Set up the extra things we charge for and when each one bills, so they happen correctly without me remembering."*

### 5.4 Information hierarchy (the sentence builder)
Each Charge Definition is authored and read as a **plain-language sentence** with inline editable values:

> **"When a child goes on a field trip, charge $45 to the family, billed 21 days after the event, as Program Fees, needing no review."**

Decomposed:
1. **When** (trigger + occurs): manual / on enrollment / on a date / on an attendance event / on a schedule.
2. **What & how much**: fixed amount, derived from a rate, or by usage quantity.
3. **Billed when**: immediately / a number of days later / next billing cycle.
4. **Revenue home**: which Service / Charge Category (→ Accounting).
5. **Who pays**: responsibility default (family / third party).
6. **Needs review?**: yes/no (or inherited from a Posting-review Policy).

### 5.5 Sections / cards (detail = Summary mode)
- **"What is this charge?"** — name, category, revenue-home service, status (Active / Review-required badge as in the mockup).
- **"When does it happen, and when does it bill?"** — the timing card: occurs-on and billable-on in words, with the gap called out ("occurs on the trip date, bills 21 days later"). This is the most distinctive card.
- **"How much?"** — amount strategy in plain language (Fixed $45 / Priced from a rate / By usage quantity).
- **"Where does its revenue land?"** — category → account (read-through to Accounting).
- **"Does it need review before posting?"** — the control, showing whether it's the charge's own setting or inherited from a Policy.

### 5.6 Open questions — resolved
- **Templates / Financial Events / Charge Definitions?** → **Charge Definitions**, surfaced as **"Charges"**, authored as sentences.
- **What information belongs?** → the six elements in 5.4. Notably *excluded* from the operator view: idempotency keys, resolution keys, source enums (P1).
- **How should timing be configured?** → as two plain-language moments (occurs / bills) with the divergence made explicit, because "occurs ≠ bills" is the single concept operators miss.
- **How should future billing feel?** → like scheduling: "bills 21 days after the event" reads as a promise, and the Simulator (§7) shows the exact future date.
- **Relation to Services / Policies / Rate Plans / Attendance / Scheduling:**
  - **Service** = revenue home (every charge posts to a service's category).
  - **Policies** = the Posting-review policy can require review; future cadence/proration policies inform timing.
  - **Rate Plans** = a "priced from a rate" charge reads Rate Resolution.
  - **Attendance / Scheduling** = the *trigger* source (late-pickup fires from an attendance fact; consumables from a schedule). In this slice the trigger is configured but fired manually/simulated; the wiring to live facts is the next phase (Operational Consumption).

### 5.7 Workflows
- **Add a charge:** "What are you charging for?" → name → pick a starting pattern (One-time fee / Event charge / Attendance charge / Usage charge) that pre-fills the sentence → adjust values → save. Pattern-first, not field-first.
- **Test it immediately:** every charge has a **"Simulate"** affordance that opens the Financial Simulator (§7) pre-loaded with this charge — closing the loop between authoring and seeing the result (this is the mockup's simulator, reachable from each charge).
- **Schedule a change:** effective-dated supersede (5.9).

### 5.8 Empty states
*"No extra charges yet. Beyond tuition, most organizations charge for registration, field trips, late pickup, meals, or supplies. Add the ones you use."* + pattern picker. BOS proposal: common childcare charges as drafts.

### 5.9 Versioning behavior
Effective-dated (Slice B): a price or timing change *supersedes*; the timeline shows Current/Scheduled/Superseded/Retired; retiring stops future creation without touching charges already drafted.

### 5.10 Relationships
Charge → Service (revenue home), → Charge Category → Accounting (lands), → Posting-review Policy (gated), → Rate Plan (if rate-priced), → Attendance/Schedule trigger (fires, future), → Draft Charges (produces, via the Simulator/Resolution). It is the bridge from configuration to the draft-charge lifecycle.

### 5.11 Validation
- Fixed strategy with no amount → "This charge has no price."
- Event-triggered charge with no event date in simulation → the Simulator explains "needs an event date".
- Usage charge with no unit price → "Priced by usage but no per-unit amount — it will need a price at billing time."
- Unmapped category → attention routed to Accounting.

### 5.12 Progressive disclosure
The sentence shows only the parts relevant to the chosen pattern (a fixed one-time fee hides offset/usage controls). "Advanced" holds responsibility overrides and review inheritance.

### 5.13 Future extensibility
New trigger sources (transportation scans, camp registration, billing milestones) are new "When" options; new amount strategies extend "How much". When Operational Consumption lands, the *same* definitions begin firing from live facts — no re-authoring. The sentence grammar scales.

### 5.14 Why this is the Alloy way
A charge written as a sentence — *"when X, charge Y, billed Z"* — is a business rule a director states out loud. Exposing occurs-vs-bills in plain language teaches the lifecycle without jargon. It is configuring *how the business charges*, not defining template rows.

---

## 6. Screen 5 — Accounting

### 6.1 Decision
Reframe from "general ledger / chart of accounts" to **"Where the money lands."** Operators map *what they charge for* to *where its income belongs*, in business language. Accounting jargon (GL, debits/credits, journal lines) stays out of the operator surface; it lives in the platform.

### 6.2 Purpose
Ensure **every kind of charge has a revenue home** so money posts cleanly later — and make gaps obvious before they bite.

### 6.3 Operator goal
*"Make sure tuition, fees, and program charges each land in the right income account, and nothing is unmapped."*

### 6.4 Information hierarchy
1. **Coverage answer** — *"Is everything mapped?"* ("9 of 10 charge categories have a revenue home").
2. **The mapping map** — each Charge Category → Revenue account, as a readable relationship list.
3. **Accounts** — the revenue accounts themselves (name + number), framed as "income accounts", secondary.
4. **Categories reference** — the code-owned charge categories with plain descriptions/examples (read-only, per Slice C).

### 6.5 Sections / cards
- **"Is our money mapped?"** (Intelligence/answer card) — coverage with the unmapped ones named: *"Field-trip revenue has no account — field-trip charges couldn't post."*
- **"Where does each kind of charge land?"** — the mapping card: `Tuition → 4000 Tuition Revenue`, `Program fees → 4000 Program Fees`, etc. Each row editable (pick account). Bend-Pine check when mapped; ember attention when not.
- **"Income accounts"** — the account list (name + number), add/edit, framed as business income buckets.
- **"What are these charge categories?"** — the code-owned reference (description + example per category), explicitly *"managed by Alloy — not editable"*, so operators understand why they can't add categories.

### 6.6 Open questions — resolved
- **GL Accounts / Mappings / Categories / visualization / preview / validation / warnings** — all present, but renamed and reframed: "Income accounts", "Where charges land", coverage answer card, and a relationship map rather than a ledger grid.
- **Operational language not accounting jargon** — "revenue home", "where money lands", "income account". No debit/credit, no journal, no chart-of-accounts.
- **Charge Categories** — remain **code-owned** (platform invariants), surfaced as reference with mapping status (Slice C decision upheld).

### 6.7 Relationship visualization
A simple, scannable **Category → Account** map (not a node graph): left column the things you charge for, right column where they land, a connecting state per row. Coverage summarized at top. The "preview" is the answer card; the "warnings" are inline attention states on unmapped rows.

### 6.8 Workflows
- **Map a category:** click the unmapped row → pick an income account → mapped.
- **Add an income account:** name + number → available for mapping.
- **Fix coverage:** the answer card lists gaps; each links to its row. BOS may **propose** a mapping ("Field-trip revenue → 4000 Program Fees?") for approval.

### 6.9 Empty states
*"No revenue accounts yet. Tell Alloy where different kinds of income belong — tuition, program fees, late fees — so charges can post to the right place."* + "Add income account."

### 6.10 Editing & versioning
Mappings are current-state config (a mapping isn't effective-dated in V1; changing it changes future posting). Account edits are inline. (If/when mappings need history, they adopt the same effective-dated pattern — extensibility note.)

### 6.11 Relationships
Charge Category ↔ Income account (the mapping); Services and Charges reference categories; Posting (deferred) consumes these mappings to write the ledger. Accounting is the *destination* end of the financial graph.

### 6.12 Validation
- **Unmapped category in use** (a Service/Charge points to it) → high-attention: "X charges would have no account."
- **Account with no number** → warning.
- **Orphan account** (mapped to nothing) → low-priority info.

### 6.13 Progressive disclosure
Account numbers and any export/GL-integration detail sit under "Advanced". Default view is the category→account map only.

### 6.14 Future extensibility
When real posting/GL integrations arrive, the same map gains a "synced to QuickBooks/Sage" state per account without changing the operator model. New categories (code-owned) appear in the reference with mapping prompts.

### 6.15 Why this is the Alloy way
Operators see *where their income lands*, not a chart of accounts. The coverage answer card turns accounting from a spreadsheet into a single operational question — "is everything mapped?" — which is exactly how a director worries about it.

---

## 7. Screen 6 — Charge Preview → **Financial Simulator**

### 7.1 Decision
Charge Preview becomes the **Financial Simulator** — the place an operator *checks what would happen* to a real (or hypothetical) child, end to end, with the resolution explained. It is the proof that all the configuration above is correct. No UUIDs, no "billable source", ever.

### 7.2 Purpose
Let an operator **see the charges a child would generate** — recurring tuition and one-time charges — and understand *why*, before any money moves.

### 7.3 Operator goal
*"Show me what Riley would be charged, when, and why — so I trust the setup."*

### 7.4 Workflow (intent-first, the mockup's flow formalized)
```
Child  →  Agreement  →  (auto: Services · Schedule · Attendance)  →  Date / Period  →  Preview
```
- The operator picks a **Child** (by name), then an **Agreement** (by plain label: "Standard Enrollment · from May 5"). Everything downstream — the services on that agreement, the schedule, attendance — is **resolved automatically and shown**, not asked for.
- They pick **what to simulate**: a **recurring tuition** period, and/or a specific **charge** (e.g. Field Trip) with its occurs date / usage quantity.
- **Preview** computes the intent.

### 7.5 Preview output (information hierarchy)
A single **"What would be charged?"** result card (the mockup's right panel), in plain language:
- **Lifecycle badge**: "Scheduled draft" / "Draft" (with the P2 preview-only notice).
- **What**: service + charge category ("Full-Time Care · Field Trip").
- **How much**: amount + currency.
- **When**: **Occurs on** May 5 · **Billable on** May 26 — with the gap annotated *"21 days after the event"*.
- **Where it lands**: GL mapping ("4000 Program Fees").
- **Who pays**: responsibility ("Family").
- **Needs review?**: yes/no.

### 7.6 The three explanations (the differentiator)
Below the result, three collapsible **"Why?"** explanations — this is what makes it a *simulator*, not a preview:
1. **Resolution explanation** — *"$285 because Riley is on the 5-day Toddler schedule under the Standard Tuition plan (North Campus override)."* Traces the rate matrix cell that won.
2. **Policy explanation** — *"Bills weekly, due on receipt, 3-day grace — North Campus billing rhythm. No proration applied (full week scheduled)."* Names the policies and their scope resolution.
3. **Timing explanation** — *"Occurs on the trip date (May 5). Bills 21 days later (May 26) because the Field Trip charge is set to bill 21 days after the event."* Teaches occurs-vs-bills.

### 7.7 Sections / cards
- **"Who are we simulating?"** — child + agreement, with the auto-resolved services/schedule/attendance shown as context chips (read-only).
- **"What would be charged?"** — the result card (7.5).
- **"Why this result?"** — the three explanations (7.6).
- **(Optional) "Write a draft"** — the explicit, gated action to materialize a draft charge (Slice D), clearly *not posting*. Requires the agreement; reuses idempotent resolution.

### 7.8 Open questions — resolved
- **Workflow** — Child → Agreement → auto-context → date → Preview. No "billable source / ID" anywhere.
- **Information hierarchy / output / warnings / explanations** — the result card + three Why panels.
- **No UUIDs / no implementation terminology** — enforced by P1 and the resolution layer (§9).

### 7.9 Empty states
*"Pick a child and an agreement to see what they'd be charged — and why. Nothing here posts money."* If the org isn't billable yet (no rate plan), the simulator says *"Set up a price for Full-Time Care first"* and links to Rate Plans — turning a dead end into a guided fix.

### 7.10 Editing behavior
The Simulator is read-only by nature (a projection — Interaction Grammar: previews never own truth). Its only write is the explicit, gated "Write a draft" action, which is idempotent and recomputable, never authoritative.

### 7.11 Versioning behavior
The Simulator can run **"as of"** a date, so an operator can preview *next month's* scheduled prices/policies before they take effect — directly exercising the effective-dated config.

### 7.12 Relationships
Reads the entire graph: Services, Rate Plans, Policies, Charges, Accounting, plus the child's Agreement/Schedule/Attendance. It is the single consumer that proves every other screen is correct — the integration test as a product surface.

### 7.13 Validation / warnings
- Unresolvable (no rate for the schedule) → *"No price for a 4-day Toddler schedule"* with a link to fix it.
- Unmapped category → *"This charge has no revenue home"* → Accounting.
- Missing event date / usage → asks for it in plain terms.

### 7.14 Progressive disclosure
The three Why panels are collapsed by default (calm by default; depth on demand). "Write a draft" appears only when an agreement is selected and the amount is resolvable.

### 7.15 Future extensibility
As Operational Consumption and Posting arrive, the Simulator gains modes: "what *will* bill this cycle", "what *did* post", "what a parent will see" — the same surface, deeper. It becomes the operator's permanent financial truth-checker.

### 7.16 Why this is the Alloy way
It begins with **intent** (a child, an agreement) and answers operational questions ("what would they be charged, and why?"), never asking the operator to think in records or IDs (Operational Grammar Law #3). The explanations make the system *legible* — the highest form of "premium means predictable."

---

## 8. Cross-cutting systems

### 8.1 The validation/attention model
One model across all screens: validation speaks **operational consequence** and routes to a fix. Three severities, rendered consistently:
- **Attention (ember)** — would break billing ("a family enrolling today would have no price"). Surfaced on the section's queue glyph and Overview readiness card.
- **Advisory (gold)** — suboptimal but safe ("this override matches the default — no effect").
- **Info (stone)** — neutral notes.
Attention items aggregate into the Overview "Is our financial setup complete?" answer card.

### 8.2 The versioning model (one pattern everywhere)
Rate Plans, Policies, and Charges all use `EffectiveDatedConfigurationEditor` with identical grammar: **Schedule a change** (never "edit"), Current/Scheduled/Superseded/Retired badges, void-before-start, "as of" viewing. Operators learn it once. Services and Accounting mappings adopt it as they gain history.

### 8.3 BOS assist hooks (propose-and-approve only)
Per BOS Foundation, every assist is a **proposal chip** an operator approves — never an auto-write:
- Services: "seed common services as drafts".
- Rate Plans: "raise all prices 4% next term" → fills a scheduled table for review.
- Policies: "you haven't set a late fee — most orgs charge ~$25".
- Charges: "seed common childcare charges".
- Accounting: "map field-trip revenue → 4000 Program Fees?".
- Simulator: "Riley has no price for her schedule — fix in Rate Plans".
BOS never posts, never patches truth, never bypasses the authoring services.

### 8.4 Empty-state philosophy
No screen dead-ends. Every empty state explains the *business* concept, gives one primary action, and (where useful) offers a BOS draft proposal. The "calm under pressure" principle: a new org is billable on safe defaults, then customizes by exception.

---

## 9. Operator-language translation layer (the anti-jargon contract)

A single mapping table the UI must honor everywhere (P1). The left column **never appears**; the right column always does.

| Stored / schema term | Operator-facing language |
|---|---|
| `plan_key`, any `*_id`, `resolution_key` | (hidden) |
| `billable_source_type = enrollment_agreement` | "this child's enrollment" |
| `charge_type`, enum literals | the category's plain label |
| calculation strategy `hybrid` | (removed) → "Scheduled days" / "Attended days" / "Flat weekly" |
| `occurs_on` / `billable_on` | "Occurs on" / "Bills on" |
| `status = draft` (future billable) | "Scheduled draft" |
| `posting_review` policy | "Needs review before posting" |
| `financial_services` | "Services" (the things you sell) |
| `childcare_rate_plans` / rate rules | "Rate Plans" / price cells (rules hidden) |
| `financial_charge_templates` | "Charges" / Charge Definitions |
| GL account / chart of accounts | "Income account" / "where money lands" |

This table is itself a deliverable: it is the acceptance test for P1 on every screen.

---

## 10. Recommended build sequence

Design is ready; this is the suggested implementation order (each ships as a vertical workspace surface inside the frozen shell):

1. **Navigation & Overview journey** — the progression spine + readiness card. Cheap, reframes everything.
2. **Rate Plans → Pricing Matrix** — highest operator value; turns the weakest current screen into the strongest.
3. **Charges sentence-builder** — closes the authoring→Simulator loop.
4. **Financial Simulator** — the proof surface; depends on 2 & 3.
5. **Financial Policies clustering** — defaults-first, sentences.
6. **Services capability model** — the switchboard.
7. **Accounting reframe** — "where money lands" + coverage.

Each step is independently shippable and independently improves the operator's ability to answer "is our money set up correctly?".

---

## 11. What this spec deliberately rejects

- ❌ Name / Type / Description forms (Services) — replaced by capability switchboards.
- ❌ Rate Rule lists — replaced by the Pricing Matrix; rules become cells.
- ❌ "Plan Key", "Hybrid", "Billable Source", UUIDs — removed from all operator surfaces.
- ❌ A 13-row policy settings grid — replaced by five clustered, sentence-based decisions on safe defaults.
- ❌ "Charge Templates" as an operator concept — reframed as **Charges** authored as plain-language rules.
- ❌ A chart-of-accounts/GL grid — replaced by "where money lands" + a coverage answer.
- ❌ A flat settings list IA — replaced by a guided progression.
- ❌ Any new design language — everything composes the frozen Configuration Runtime primitives, Bend Pine, and `config-typo-*` tokens.

The product we are designing is the one a director would recognize as *how their business runs* — not the one closest to the database.
