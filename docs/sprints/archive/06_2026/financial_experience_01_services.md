# Financial Experience 01 — Services (Operator Experience Specification)

**Type:** Implementation-ready Operator Experience Specification. Design only — no code, no mockups, no migrations, no runtime.
**Scope:** The deep expansion of **Screen 1 — Services** (`financial_configuration_product_spec.md` §2). That document is canonical product direction; this document makes its decisions mechanical to build.
**Author posture:** Principal Product Designer / UX Architect / Operator.
**Date:** June 2026.
**Inherits (not repeated here):** the seven global patterns P1–P7 and the cross-cutting validation / versioning / BOS / empty-state models from `financial_configuration_product_spec.md` §0.1 and §8. Where this doc says "P1", "P3", etc., it means those.

> **Governing test (Operational Grammar Law #1):** does the Services experience feel like configuring *what the business offers and what each offering switches on* — or like editing a catalog table? If it feels like a table, it is wrong. A Service is an **operational switchboard**, not a Name/Type/Description row.

---

## 1. Purpose

Define **what the organization sells** as operational capability bundles. A Service is the spine that scheduling, attendance, capacity, waitlist, tuition, parent portal, and charges all hang from. Configuring a Service is configuring *what an offering switches on operationally and financially* — not authoring a price and not authoring a catalog entry.

The Services section answers, for the whole organization, **"What do we sell, and what does each thing do?"** and, for a single service, **"What is this offering, and what does it power?"**

This section deliberately rejects (per spec §11): Name / Type / Description forms; exposing `financial_services`, `plan_key`, `billable_source_type`, status enum literals, "Hybrid", or any `*_id`/`resolution_key` (P1).

---

## 2. Operator mindset

The operator is a childcare director or financial admin, interrupted and under pressure (Visual Language #2, #8). Their mental model is a **list of offerings spoken aloud**: *"We do full-time care, before care, after care, drop-in, meals, and registration."* They do not think "rows in a services table." They think:

- *"What do we offer?"*
- *"Does this one create a schedule / track attendance / take a price?"*
- *"Which programs deliver it?"*
- *"Where does its money go?"*

They expect to land on a calm, scannable read of current reality (Summary mode, P3) — never a blank form. Editing is a deliberate act they choose. The defining mental sort is **billing rhythm**: a recurring service (full-time care) and a one-time service (registration) are *different kinds of thing* in their head, and the screen must agree.

---

## 3. Primary question being answered

**Workspace-level (Services list):** *"What do we sell?"*
**Object-level (one Service in Summary mode):** *"What is this service, and what does it power?"*

Every card on the Service detail is an answer to exactly one narrower question beneath that (Law #2). The card titles are the operator's questions verbatim — never noun labels.

---

## 4. Setup journey

Services is **step 1 of 6** on the Overview journey rail (spec §1.2). It is the first thing an operator configures because everything downstream (Rate Plans price a Service; Charges post to a Service; the Simulator resolves a Service) references it.

The journey through Services has three altitudes:

1. **List altitude — "What do we sell?"** The Object Queue (320px) lists every service with a completion glyph and a billing-rhythm chip. The operator scans the whole offering set in one glance.
2. **Detail altitude — "What is this service, and what does it power?"** Selecting a queue item fills the Workspace with that service's Summary-mode cards. This is where understanding happens.
3. **Authoring altitude — intentional edit.** Adding a service or scheduling a change is a focused act invoked from Summary mode, never the default state.

The operator is never required to complete Services before moving on; the journey glyph simply reflects state (Complete when at least one active service exists with a resolvable price path; In progress otherwise).

---

## 5. Information hierarchy

Both the section and the Service detail follow the shared per-section anatomy (spec §1.3): Context band → `ConfigReadonlyNotice` → Summary body → Object Queue when many lineages exist → inline / effective-dated editing only.

**Service detail reading order (top to bottom), reflecting spec §2.3:**

1. **Identity** — name, one-sentence meaning, and the **billing-rhythm chip** (Recurring / One-time / Usage-based) as the defining attribute, plus unit of sale and status.
2. **What it powers** — the capability switchboard (the single most important card).
3. **How it's delivered** — Associated Programs (association, not ownership).
4. **How it's priced** — Rate Plan(s) for Recurring; Charges for One-time/Usage.
5. **Financial home** — default revenue category → account, read-through to Accounting.
6. **What changed** — effective-dated history, Activity mode.

Billing rhythm is the hinge of the hierarchy: it gates which of items 2 and 4 are even visible (§14 Progressive disclosure).

---

## 6. Cards

The Service detail in **Summary mode** is a stack of answer cards, each rendered by `ConfigurationDetailCard{title}` where the title is the operator's question. Order matches §5.

For every card below: the operator-question title, every field with operator-facing label + example value, the states it can be in, and the component that renders it.

### 6.1 Card — "What is this service?"
*Family: Identity. Renders in `ConfigurationDetailCard{title:"What is this service?"}` with `ConfigFieldGrid` of `ConfigField` rows.*

| Operator label | Example value | Rendered by | Notes |
|---|---|---|---|
| (Name — card subtitle / first field) | "Full-Time Care" | `ConfigField{label:"Name", value}` | Edited inline via `ConfigTextInput`. |
| In one sentence | "Full-day care, five days a week, billed weekly." | `ConfigField{label:"In one sentence", value}` | One-line plain meaning. `ConfigTextInput`. |
| Billing rhythm | `Recurring` chip (Bend Pine) | `ConfigField{label:"Billing rhythm"}` with a chip; the defining attribute | One of Recurring / One-time / Usage-based. Never the enum literal. Drives the whole card set. |
| How is this sold? | "per week" | `ConfigField{label:"How is this sold?"}` + `ConfigSelectInput` | Unit of sale: per week / per day / per session / per hour / per item (spec §2.7). Drives "$/unit" everywhere downstream. Never the word "unit". |
| Status | `Active` (Bend Pine) / `Draft` (stone) / `Retired` (muted) | `ConfigEffectiveBadge`-style status chip | Operator words only — never the enum. |

**States:**
- **Empty (new service, mid-add):** name and sentence blank with placeholder copy ("Name this offering the way families would recognize it"); billing rhythm unset and required before the rest reveals.
- **Loading:** card skeleton at standard density; no field flicker (Visual Language #6).
- **Current (active service):** full read as above.
- **Draft:** identical layout, status chip reads `Draft`, plus a one-line sublabel "Not yet offered to families."
- **Error (e.g. name collides with an existing active service):** inline operational message under Name — see §15.

### 6.2 Card — "What does this service power?" (the switchboard — key card)
*Family: Process. Renders in `ConfigurationDetailCard{title:"What does this service power?"}`. This is the most important card; it is what makes a Service a switchboard, not a price (spec §2.6).*

Six capability **relationships**, each a labeled switch with state, each answering "does this service participate in X?". These are operational truths, not checkboxes for their own sake. Each switch line shows: the capability label, its current state in words, and — when on and relevant — a one-line read-through to where that relationship resolves.

| Capability | Operator label | On-state plain-language read | Default by rhythm |
|---|---|---|---|
| Scheduling | "Creates a schedule" | "Enrolling a child here creates a weekly schedule." | Recurring: **on** · One-time: **off** |
| Attendance | "Tracks attendance" | "Attendance is recorded for this service." | Recurring: **on** · One-time: **off** |
| Capacity | "Consumes capacity" | "Enrollments count against room and ratio capacity." | Recurring: **on** · One-time: **off** |
| Waitlist | "Families can wait for it" | "Families can join a waitlist when it's full." | Recurring: **on** · One-time: **off** |
| Tuition | "Priced by a Rate Plan" | "Priced by a recurring Rate Plan." | Recurring: **on** · One-time/Usage: **off** |
| Parent Portal | "Visible to families" | "Families can see and request this in the parent portal." | Per rhythm default; editable |

**Progressive reveal driven by business meaning (Visual Language #1, spec §2.6):** turning **Tuition** on reveals the "How is it priced?" Rate Plan card (§6.4). Turning it off hides it and reveals the Charges relationship instead. Turning **Scheduling** on is what makes the service eligible for the schedule engine. The switchboard is therefore not decorative — each toggle is a real operational consequence, spelled out at the moment of toggle (§16, §17).

**States:**
- **Empty / new:** switches pre-set to the sensible defaults for the chosen billing rhythm (above), so the operator confirms rather than fills (spec §2.8 — "no blank 20-field form").
- **Loading:** switch row skeletons.
- **Current:** switches in their saved positions with plain-language reads.
- **Mid-edit:** a toggle in flight shows the consequence confirmation before it commits (§9, §16).
- **Error:** an inconsistent combination (e.g. Tuition on, no Rate Plan) surfaces as an attention read on this card and on the queue glyph (§15), never a hard block.

### 6.3 Card — "Which programs deliver it?"
*Family: Process. Renders in `ConfigurationDetailCard{title:"Which programs deliver it?"}`. See §8 Associated Programs for full behavior.*

| Operator label | Example value | Rendered by |
|---|---|---|
| (Program chips) | "Toddler", "Preschool", "Pre-K" | relationship chips with add/remove |
| Add a program | chip-picker affordance | `ConfigSecondaryButton` "Associate a program" opening a picker |

**States:** Empty ("No programs associated yet — this service isn't delivered through any program."); Current (chips); Loading (chip skeletons). This card is **association, not ownership** (spec §2.7) — see §8.

### 6.4 Card — "How is it priced?"
*Family: Financial. Renders in `ConfigurationDetailCard{title:"How is it priced?"}`. Visible only when the relevant capability is on (§14).*

- **Recurring (Tuition on):** shows the linked Rate Plan(s) with a price-range summary.

| Operator label | Example value | Rendered by |
|---|---|---|
| Priced by | "Standard Tuition (North Campus)" | `ConfigField` linking to the Rate Plan |
| Price range | "$145–$285 / week" | `ConfigField` derived summary, unit suffix from §6.1 "How is this sold?" |

- **One-time / Usage:** shows the linked Charges instead (see §13 Charge Template relationship).

**States:**
- **Empty + Tuition on (the dangerous case):** attention read — *"Full-Time Care is recurring but has no price. A family enrolling today would have no tuition."* (spec §2.12) with a deep-link "Set a price in Rate Plans".
- **Current:** the price-range summary; "Open in Rate Plans" link (authoring lives there, §11).
- **One-time with charges:** charge list read-through.
- **Loading:** summary skeleton.

### 6.5 Card — "Where does its revenue land?"
*Family: Financial. Renders in `ConfigurationDetailCard{title:"Where does its revenue land?"}`. See §11 Financial relationship.*

| Operator label | Example value | Rendered by |
|---|---|---|
| Revenue home | "Tuition → 4000 Tuition Revenue" | `ConfigField` read from Accounting |
| Change | inline link → Accounting | `ConfigSecondaryButton` deep-linking to Accounting |

**States:** Mapped (category → account, Bend Pine); Unmapped ("This service's revenue has no home yet — charges couldn't post." routed to Accounting, §11); Loading.

### 6.6 Card — "What changed?" (Activity mode)
*Family: Activity. Renders the effective-dated history for this service. Appears in Activity mode, not Summary.*

Shows the version timeline (Current / Scheduled / Superseded / Retired) for the effective-dated attributes of the service (§12). Each entry: what changed, in operator words ("Default revenue category changed to Program Fees"), effective date, and who scheduled it.

**States:** No history yet ("No changes recorded — this service hasn't been versioned."); Has history (timeline rows with `ConfigVersionBadge`).

---

## 7. Sections

"Sections" here means the frozen shell's Section Queue (260px) placement and the Service detail's internal section grouping.

**Section Queue placement (spec §1.1):** Services sits under the **WHAT YOU SELL** group, above Rate Plans:

```
WHAT YOU SELL
  Services      ← this experience
  Rate Plans
```

The Services queue item carries a completion glyph (Bend Pine check when at least one active, priced-path service exists; hollow otherwise) and a count chip ("6 services"). This is rendered by the frozen `ConfigurationQueueItem{active,title,subtitle,trailing}` — title "Services", subtitle "What the organization offers", trailing the count chip.

**Service detail internal sections:** the Summary-mode card stack of §6, top to bottom. There is no tab chrome — depth is the three Focus Panel modes (Summary / Work / Activity), where Summary is the default landing (P3), Work is intentional inline edit, and Activity is the §6.6 history.

---

## 8. Associated Programs relationship

**Card:** "Which programs deliver it?" (§6.3).
**What it reads:** the set of Programs this Service is *delivered through* — an association the Service observes, not a set it owns (spec §2.7; Configuration Ownership Doctrine: **Locations own programs; Financials references them**).
**What the operator can do here:** add an association (chip-picker of existing programs), remove an association (chip ✕). The picker lists only programs that already exist — the operator cannot create a program here.
**Where authoring actually lives:** Programs are authored under Locations, not Financials. This card is a relationship surface only.
**Operational consequence of toggling:**
- **Associating a program** makes this Service available to be delivered through that program (e.g. a Toddler enrollment can include Full-Time Care). It does not move money and does not create a schedule by itself.
- **Removing an association** stops this Service from being offered through that program *going forward*; it never retroactively touches existing enrollments. If active enrollments depend on the association, the removal is guarded with the count and an operational consequence message (§16), not a generic confirm.

---

## 9. Scheduling relationship

**Card:** "What does this service power?" switchboard (§6.2), the "Creates a schedule" switch.
**What it reads:** whether enrollment in this Service creates a weekly schedule — i.e. whether the Service is eligible for the schedule engine.
**What the operator can do here:** toggle Scheduling on/off. Schedule *shapes* (which days, hours) are not authored here — they are an enrollment/agreement concern; this switch only declares participation.
**Where authoring actually lives:** the schedule engine and per-enrollment schedules live in Enrollment/Scheduling, not Financials. This is a participation declaration.
**Operational consequence of toggling:**
- **On:** enrolling a child in this Service creates a schedule; this is also the precondition for "Charges for: Scheduled days / Attended days" calculation strategies in the Rate Plan to mean anything.
- **Off:** no schedule is created on enrollment. Turning Scheduling **off** on a live recurring service is a high-consequence change — the toggle requires a confirmation that names the consequence (§16): *"Turning off Scheduling means enrolling a child here no longer creates a weekly schedule. Existing schedules are unaffected. Continue?"*

---

## 10. Attendance relationship

**Card:** "What does this service power?" switchboard (§6.2), the "Tracks attendance" switch.
**What it reads:** whether attendance is recorded for this Service and is therefore available as a billing-relevant signal.
**What the operator can do here:** toggle Attendance on/off. Attendance *records* are not authored here.
**Where authoring actually lives:** attendance capture lives in the Attendance module; the relationship to billing (e.g. "Charges for: Attended days") is consumed by Rate Plans (spec §3) and Charges (spec §5). This card only declares participation.
**Operational consequence of toggling:**
- **On:** attendance is tracked, enabling attendance-based pricing strategies and attendance-triggered charges (e.g. late pickup) to reference this Service.
- **Off:** attendance is not tracked here; any Rate Plan using an "Attended days" strategy or any attendance-triggered Charge pointed at this Service loses its signal. The off-confirmation names that consequence (§16): *"Turning off Attendance means attended-days pricing and attendance-based charges for this service have nothing to read."*

---

## 11. Financial relationship

**Cards:** "How is it priced?" (§6.4) and "Where does its revenue land?" (§6.5).
**What it reads:**
- *Priced-by:* for Recurring, the linked Rate Plan(s) and a derived price-range summary; for One-time/Usage, the linked Charges.
- *Revenue home:* the Service's default Charge Category → revenue account, **read from Accounting** (the Service is the revenue *home*; the mapping is owned in Accounting).
**What the operator can do here:** read the price summary; read the revenue mapping; follow inline deep-links ("Open in Rate Plans", "Change in Accounting"). The operator changes nothing money-affecting in place beyond initiating an effective-dated change to the default category (§12).
**Where authoring actually lives:** prices are authored in **Rate Plans** (spec §3); the category→account mapping is authored in **Accounting** (spec §6). One authoring home per concept (Interaction Grammar — avoids two edit paths for one truth).
**Operational consequence:**
- A Recurring service with **Tuition on but no Rate Plan** surfaces the attention read of §6.4 and contributes an attention item to the Overview readiness card (§8.1 of the parent spec).
- An **unmapped revenue category** surfaces as attention routed to Accounting ("X charges would have no account").
- Changing the **default revenue category** is price-affecting and therefore effective-dated through the shared editor (§12) — you *schedule* the change, you never overwrite (P4).
- Per P2, none of this posts money; the persistent `ConfigReadonlyNotice` carries *"This is configuration. It does not post money."*

---

## 12. Capacity relationship

**Card:** "What does this service power?" switchboard (§6.2), the "Consumes capacity" switch.
**What it reads:** whether enrollments in this Service count against room and ratio capacity.
**What the operator can do here:** toggle Capacity on/off. Capacity *limits* (room sizes, ratios) are not authored here.
**Where authoring actually lives:** room/ratio capacity is owned by Locations/Rooms; this switch declares whether this Service consumes it.
**Operational consequence of toggling:**
- **On:** enrolling a child here consumes a seat against the room's capacity and ratio, and (combined with Waitlist on) gates availability.
- **Off:** the Service does not consume capacity — useful for non-seat offerings (e.g. a meal add-on or registration). Turning Capacity off on a live recurring care service is high-consequence; the off-confirmation reads: *"Turning off Capacity means enrollments here no longer count against room limits or ratios. Continue?"*

---

## 13. Parent Portal relationship

**Card:** "What does this service power?" switchboard (§6.2), the "Visible to families" switch.
**What it reads:** whether this Service is visible — and where supported, requestable — in the parent portal.
**What the operator can do here:** toggle Parent Portal visibility on/off. Portal copy, imagery, and booking rules are not authored here.
**Where authoring actually lives:** the parent portal experience is its own surface; this switch declares participation/visibility.
**Operational consequence of toggling:**
- **On:** families can see (and, where the portal supports it, request) this Service.
- **Off:** the Service is internal-only and does not appear to families. Turning visibility **off** while families can currently see it is operationally meaningful but reversible; the confirmation names it plainly: *"Families will no longer see this service in the parent portal. Continue?"*

---

## 14. Charge Template relationship

**Card:** "How is it priced?" (§6.4) in its One-time/Usage form, presented as a **"Charges"** read-through ("3 charges post to this service").
**What it reads:** the set of Charge Definitions whose revenue home is this Service. The Service is the revenue **home**; Charges **reference** the Service (spec §2.7, §5.10).
**What the operator can do here:** read which charges post to this service; follow a deep-link to author them. The operator does **not** create or edit a charge here.
**Where authoring actually lives:** the **Charges** section (spec §5). One authoring home per concept (Interaction Grammar) — this avoids two edit paths for one truth. From the read-through, "Open in Charges" deep-links to the relevant definition; each charge there carries its own "Simulate" affordance (spec §5.7).
**Operational consequence of toggling:** there is no toggle here — the relationship is established when a Charge in the Charges section names this Service as its revenue home. The consequence of that association: the charge's revenue lands in this Service's default category → account (§11). If this Service later loses its revenue mapping, every referencing charge inherits the unmapped-attention state (§15), routed to Accounting.

> Naming note: this section is titled "Charge Template relationship" to match the required heading set, but the **operator never sees the word "template"** (P1, spec §5.1). The operator-facing surface is "Charges".

---

## 15. Validation

All validation speaks **operational consequence**, not form constraints (P7), and routes to a fix. Severities follow the cross-cutting model (spec §8.1): **Attention (ember)** = would break billing; **Advisory (gold)** = suboptimal but safe; **Info (stone)** = neutral.

Literal operator-language messages:

- **Recurring service, Tuition on, no Rate Plan (Attention):** *"Full-Time Care is recurring but has no price. A family enrolling today would have no tuition."* → link "Set a price in Rate Plans". Also aggregates into the Overview readiness card.
- **Service with no revenue category (Attention):** *"This service's revenue has no home yet — charges couldn't post."* → routed to Accounting.
- **Retiring a service with active agreements (blocked — Attention):** *"3 active agreements use this service. Schedule retirement for a future date instead so existing enrollments aren't left without a price."* → offers the scheduled-retirement path (§16, §12).
- **Name collides with an existing active service (Attention, inline):** *"You already offer a service named 'Full-Time Care'. Give this one a name families can tell apart."*
- **Billing rhythm unset while saving (Attention, inline):** *"Pick how this is billed — recurring, one-time, or usage — so we know what it switches on."*
- **Attendance off while a referencing Rate Plan uses Attended-days (Advisory):** *"This service doesn't track attendance, but its Rate Plan charges for attended days — pricing would have nothing to read."*
- **Program association removed while enrollments depend on it (Attention):** the count + scheduled-removal path (§8, §16).

Validation never blocks understanding — Summary mode always renders; attention states decorate the cards and the queue glyph.

---

## 16. Versioning

Services adopt the one platform versioning pattern (spec §8.2), powered by the shared `EffectiveDatedConfigurationEditor`. The verb is always **"Schedule a change"**, never "Edit" (P4). You never overwrite history; you supersede it.

**What is effective-dated vs inline:**
- **Inline (Summary-mode, not versioned as price-history):** Name, one-sentence meaning, "How is this sold?" unit, and the capability switches (spec §2.10). These are intentional inline edits via `Config*Input`/switches.
- **Effective-dated (through the shared editor):** anything price-affecting — notably the **default revenue category** — and **retirement**. These render the version timeline: **Current / Scheduled / Superseded / Retired** via `ConfigVersionBadge`.

**Editing grammar (mechanical):**
1. Operator opens the effective-dated attribute → the shared editor shows the Current version and a **"Create future version"** form.
2. Operator picks an **effective date**, sets the new value, saves → a **Scheduled** version appears, labeled ("Takes effect Sep 1"), and can be **voided** before it starts.
3. On the effective date the prior version becomes **Superseded**; nothing is overwritten.
4. **Retire** closes the window: it stops the service from being offered going forward, marking it **Retired**, while preserving history. Retirement is guarded by the active-agreement check (§15) and is itself schedulable for a future date.

**Capability-toggle confirmations (operational, not generic):** any switch that affects live operations (Scheduling, Attendance, Capacity, Parent Portal off) requires a confirmation that **describes the operational consequence**, using the literal messages in §9–§13. Never a bare "Are you sure?".

---

## 17. Progressive disclosure

- **Billing rhythm gates the visible capability set (spec §2.13):** choosing Recurring reveals Scheduling / Attendance / Capacity / Waitlist / Tuition and the Rate Plan price card; choosing One-time/Usage hides those and reveals the Charges read-through. Same shell, different revealed capabilities.
- **Tuition switch gates the price card:** "How is it priced?" (Rate Plan form) appears only when Tuition is on; otherwise the Charges form shows.
- **Advanced disclosure (collapsed by default):** proration-eligibility default and tax treatment live under an "Advanced" disclosure on the Identity card (spec §2.13) — most operators never touch them and shouldn't be confronted with them (Visual Language #4, #8).
- **Activity (history) is on-demand:** the "What changed?" timeline lives in Activity mode, not Summary — depth on demand, calm by default.

---

## 18. Empty states

Rendered by `ConfigurationEmptyState{title,description}` + a primary `ConfigPrimaryButton`.

**Section empty (no services yet):**
- Title: *"No services yet."*
- Description: *"Services are the things your organization offers — full-time care, before & after care, drop-in, meals, registration. Start with the one most families enroll in."*
- Primary: *"Add your first service."*
- BOS proposal chip (optional, propose-and-approve, §20): *"Most childcare orgs start with Full-Time Care, Before Care, After Care. Want these as drafts?"*

**Card-level empties:**
- Programs card: *"No programs associated yet — this service isn't delivered through any program."* + "Associate a program."
- Price card (Recurring, no Rate Plan): the attention read of §6.4 (a guided fix, not a dead end).
- Revenue-home card (unmapped): the attention read of §6.5, routed to Accounting.
- Activity timeline (no history): *"No changes recorded — this service hasn't been versioned."*

No screen dead-ends (spec §8.4): every empty explains the *business* concept and offers one primary action.

---

## 19. First-run experience

First run differs from returning by **what the operator lands on and how much is pre-decided**.

- **First run (org has zero services):** the section opens on the §18 section empty state, not a list. The journey glyph for Services is "Not started." The single primary action is "Add your first service." The optional BOS seed proposal offers the common starter set as **drafts** the operator approves — never auto-created.
- **Add-flow on first run (intent-first, spec §2.8):** "What are you adding?" → name → **pick billing rhythm** → the relevant capabilities appear **pre-set to sensible defaults for that rhythm** (§6.2 table) → operator confirms/adjusts → save. No blank 20-field form; the operator confirms a sensible default rather than authoring from nothing.
- **Returning (services exist):** the section opens on the Object Queue list at List altitude (§4); selecting a service opens its Summary-mode detail. The Services queue glyph reflects real completion state. Editing is always the intentional act, never the landing.

---

## 20. Editing workflow

Exact step sequences and what changes:

**Add a service (intent-first):**
1. Operator clicks "Add a service" (`ConfigPrimaryButton`). Workspace shows the intent prompt "What are you adding?" — not a form.
2. Operator types the **name** (`ConfigTextInput`) and the one-sentence meaning.
3. Operator picks **billing rhythm** (`ConfigSelectInput`-style chip group). → This reveals the capability switchboard pre-set to that rhythm's defaults (§6.2) and the correct price card (Rate Plan vs Charges, §17).
4. Operator confirms/adjusts switches and "How is this sold?".
5. Operator saves (`ConfigPrimaryButton` in a `ConfigButtonRow`). → A new service is created, status **Draft** until it has a resolvable price path, then surfaceable as Active. The Object Queue gains a row; the Services count chip increments.

**Configure capabilities (intentional inline edit, P3):**
1. From Summary mode, operator toggles a switch on the "What does this service power?" card.
2. If the toggle affects live operations (§9–§13), a consequence confirmation appears with the literal message. → On confirm, the switch commits and any dependent card reveals/hides (e.g. Tuition on reveals the price card).

**Associate a program:**
1. Operator clicks "Associate a program" (`ConfigSecondaryButton`) on §6.3.
2. A chip-picker of existing programs opens; operator selects one. → A program chip is added; the association takes effect going forward (§8). Removing is the chip ✕ with the guard of §15 when enrollments depend on it.

**Schedule a change (effective-dated attribute):**
1. Operator opens the default-revenue-category value → shared `EffectiveDatedConfigurationEditor` opens with Current + "Create future version".
2. Operator picks an effective date, sets the new value, saves. → A **Scheduled** version appears (voidable before start); on the date it supersedes (§16). Never an overwrite.

**Retire a service:**
1. Operator chooses "Retire" → active-agreement check runs.
2. If active agreements exist → blocked with the §15 message and the scheduled-retirement path; operator picks a future effective date. → A scheduled retirement appears; on the date the service becomes **Retired**, history preserved.

---

## 21. Future extensibility

The capability model is **open** (spec §2.14): new capabilities (Transportation, Meals-as-service, Camp sessions) are **new switches on the same switchboard card**, not new screens. New billing rhythms (seasonal, milestone) **extend the chip set** and bring their own default switch posture. A new offering is therefore a *new instance in the model*, never a new product surface. Because everything composes the frozen Configuration Runtime primitives, extensions inherit the shell, the versioning grammar, and the validation/attention model for free.

---

## 22. Operator mistakes

Anticipated mistakes and how the experience prevents or recovers them — always with operational consequence, never a scold:

- **Marking a recurring service Active with no price.** Caught by the §15 attention read on the price card and the Overview readiness card; the service can exist as Draft, but the gap is visible before it bites.
- **Turning off Scheduling / Attendance / Capacity on a live service without realizing the downstream effect.** Caught by the consequence confirmations (§9, §10, §12) — the operator reads the specific effect, not a generic prompt.
- **Trying to retire a service that active families depend on.** Blocked with the count and redirected to scheduled retirement (§15, §20).
- **Trying to create or edit a price / a charge / a program on the Service.** Prevented by design — those cards are read-through with deep-links to the one authoring home (§8, §11, §14); there is no edit affordance to misuse.
- **Naming two services the same.** Caught inline (§15) before save.
- **Expecting a toggle to move money.** Prevented by the persistent `ConfigReadonlyNotice` (P2) — configuration does not post.

---

## 23. How BOS assists

Every BOS assist is a **proposal chip the operator approves — never an auto-write** (P6; spec §8.3). BOS proposes drafts within guardrails; the operator owns the decision.

Proposal copy on this screen:
- **Seed common services (empty state):** *"Most childcare orgs start with Full-Time Care, Before Care, After Care. Want these as drafts?"* → approving creates **drafts**, not active services.
- **Missing-price detection:** *"Full-Time Care is recurring but has no price. Set one in Rate Plans?"* → proposal links to the fix; never auto-creates a price.
- **Capability sanity:** *"This service tracks attendance but isn't priced — most attendance-tracked services have a Rate Plan. Add one?"* → proposal, not a change.

BOS never posts money, never patches truth, never bypasses the authoring services (Rate Plans, Charges, Accounting, Programs own their own truth).

---

## 24. Questions answered

By the operator, on this screen:
- *What do we sell?* (List altitude.)
- *What is this offering, in one sentence?*
- *How is this billed — recurring, one-time, or usage?*
- *What does this service switch on — scheduling, attendance, capacity, waitlist, tuition, parent portal?*
- *Which programs deliver it?*
- *How is it priced (what's the price range / which charges)?*
- *Where does its revenue land?*
- *What changed, and when does a scheduled change take effect?*

---

## 25. Questions introduced

Surfaced here but **answered on another screen** (with deep-links):
- *What exactly is the price table?* → Rate Plans (spec §3).
- *What are the individual charges that post here?* → Charges (spec §5).
- *Which revenue account does this category map to?* → Accounting (spec §6).
- *Which programs exist, and how are they defined?* → Locations / Programs (owned outside Financials).
- *What would a real child actually be charged?* → Financial Simulator (spec §7).

---

## 26. Questions intentionally deferred

- **Live trigger wiring** (attendance/schedule *facts* actually firing charges) — declared by the switchboard here, but firing is the next phase (Operational Consumption, spec §5.6). Here the relationship is configured, not fired.
- **Posting / Payments / Subsidy** — deferred per the spec's navigation (spec §1.1); Services references revenue homes but never posts.
- **Effective-dating of non-price Service attributes** (name, meaning, switches as versioned history) — currently inline; adopts the shared editor only if/when they need history (spec §8.2 extensibility note).
- **Per-program price variation on a single Service** — out of scope here; pricing axes belong to Rate Plans (spec §3.15).
- **Authoring programs / capacity limits / portal content** — owned by other domains; only the *relationship* is shown here.
