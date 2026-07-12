# Financial Experience — Screen 3: Financial Policies

**Type:** Implementation-ready Operator Experience Specification (design sprint, no code).
**Status:** Deep expansion of "Screen 3 — Financial Policies" from `financial_configuration_product_spec.md` (canonical). Where this document and the canonical spec conflict, the canonical spec wins; this document only *expands*, it does not *override*.
**Author posture:** Principal Product Designer / UX Architect / Operator — not engineer.
**Date:** June 2026.

> **Governing principle (inherited):** Operators configure a business, not a database. The test for every surface below: does it feel like setting *how our money works*, or like editing a config object? If it feels like a settings grid, it is wrong.

This document is **design only**. No code, no JSX, no mockups, no migrations, no runtime wiring. It composes the **frozen Configuration Runtime V1** primitives and the named component library; it invents nothing.

**Frozen constraints honored throughout:**
- Shell geometry `Context → Queue → Workspace → BOS`; Section Queue 260px, Object Queue 320px, Workspace flex.
- **Bend Pine `#00a283`** for active/complete/customized; white canvas; stone borders; `1rem` card radius; `config-typo-*` tokens.
- Components named exactly per part: `ConfigurationContext`, `ConfigurationShell`, `ConfigurationQueue`, `ConfigurationQueueItem`, `ConfigurationWorkspace`, `ConfigurationDetailCard{title}`, `ConfigurationEmptyState`, `ConfigReadonlyNotice`, `ConfigField`, `ConfigFieldGrid`, `ConfigEffectiveBadge`, `ConfigScopeBadge{label,override}`, `ConfigVersionBadge`, `ConfigFieldLabel`, `ConfigTextInput`, `ConfigNumberInput`, `ConfigDateInput`, `ConfigSelectInput`, `ConfigPrimaryButton`, `ConfigSecondaryButton`, `ConfigButtonRow`, `EffectiveDatedConfigurationEditor`.
- **BOS proposes, humans approve** — every intelligence assist is a proposal chip, never an auto-write.
- Global patterns inherited (P1–P7): operator language only; preview/read-only truth boundary; Summary mode first; cards answer one question; validation = operational consequence.

---

## Purpose

Define **the rules around money** — when we bill, what happens around absences and changes, what we charge for friction, how we correct money, and what needs a human — as a **small set of business decisions written as sentences**, defaulted safe, customized by exception.

The Financial Policies section turns what is, in the database, 13 distinct policy types into **five operator-meaningful decisions**. An operator should be able to read their own financial policy back to themselves in plain English ("We bill weekly, invoice on Monday, due on receipt, with a 3-day grace period") and change only the few things that differ from the norm. No mandatory wizard, no blank required fields, no enum literals.

This section answers, end to end: *"How does billing work at our organization, and where does it differ?"*

---

## Operator mindset

The operator arriving here is a childcare director or finance lead, interrupted and under time pressure (Visual Language #8, "calm under pressure"). They are **not** thinking in policy types. They are thinking in questions:

- "When do invoices go out, and when are they due?"
- "If a kid is sick for a week, do we credit the family?"
- "What do we charge if a parent picks up late?"
- "Who has to sign off before I refund someone?"

They expect the system to **already have sane answers** and to let them adjust the two or three that are genuinely different at their organization. They do not expect to *author* a policy from scratch. They expect to *correct a default*.

Critically: most operators **never** touch governance controls (posting review, adjustment approval, draft lifetime). Confronting them with those on first load would feel like a database admin panel. Those are collapsed behind an advanced disclosure.

The mental model is **"safe by default, customized by exception, scoped where reality demands it."**

---

## Primary question being answered

> **"How does billing work at our organization — and where does it differ?"**

Every card, sentence, badge, and preview in this section is judged against that one question. Secondary questions each group card answers:

- Billing rhythm → *"When and how do we bill?"*
- Absences & changes → *"What happens when plans change?"*
- Fees & deposits → *"What do we charge for friction?"*
- Adjustments & credits → *"How do we correct money?"*
- Controls & approvals → *"What needs a human?"*

---

## The five policy groups (full per-policy table)

The 13 policy types cluster into five groups by the **question they answer**, not by table. Each group is one `ConfigurationDetailCard` whose title is an operator question. Within a group, simple policies edit **inline** (the sentence value is the control); complex policies open a **focused editor** (the `EffectiveDatedConfigurationEditor` or an inline focused panel).

**Group order (by how often operators touch them):** Billing rhythm → Fees & deposits → Absences & changes → Adjustments & credits → Controls & approvals.

> Note on ordering: the canonical spec lists the five groups and assigns disclosure tiers — Billing rhythm + Fees as *prominent/simple*, Absences + Adjustments as *expandable/medium*, Controls as *advanced/governance*. We render the two **prominent** groups first (Billing rhythm, then Fees & deposits, because Fees are also single-value and "simple-ish"), then the two **expandable** medium groups (Absences, Adjustments), then the **governance** group last. This keeps the most-touched, lowest-effort decisions at the top.

### Group 1 — Billing rhythm · *"When and how do we bill?"*
**Disclosure tier:** Prominent (always expanded, first card). **Posture:** Simple, front and centre. **Order:** 1.

| Policy | Sentence slot | Input control + units | Default value | Inline vs focused | Dependencies / warnings |
|---|---|---|---|---|---|
| Billing schedule / cadence | "We bill **{weekly}**…" | `ConfigSelectInput` (Weekly / Every two weeks / Monthly / Per session) | **Weekly** | Inline | Changing cadence re-frames Invoice date wording (day-of-week vs day-of-month). Warn if it conflicts with a Rate Plan billing basis (§Dependencies). |
| Invoice date | "…invoice on **{Monday}**…" | `ConfigSelectInput` whose options depend on cadence: weekly → day-of-week; monthly → day-of-month (1–28, "last day") | **Monday** (weekly) / **the 1st** (monthly) | Inline | Options are gated by cadence. Due date is measured relative to this. |
| Due date | "…due **{on receipt}**…" | `ConfigSelectInput` (On receipt / Net N days) with `ConfigNumberInput` for N (days) when "Net N" chosen | **On receipt** | Inline | **Must not resolve before the invoice date** (§Validation: due-before-invoice). Interacts with Grace period (grace starts at due date). |
| Grace period | "…with a **{3-day}** grace period." | `ConfigNumberInput` (days, 0–30) | **3 days** | Inline | Grace begins at the due date. Late fee (Group 2) fires only after grace expires; if grace ≥ next invoice interval, warn it may never trigger a late fee. |

### Group 2 — Fees & deposits · *"What do we charge for friction?"*
**Disclosure tier:** Prominent (expanded by default, second card). **Posture:** Simple-ish — mostly single values. **Order:** 2.

| Policy | Sentence slot | Input control + units | Default value | Inline vs focused | Dependencies / warnings |
|---|---|---|---|---|---|
| Late fee | "Late pickup costs **{$25}**." | `ConfigNumberInput` (money) + an "off / on" affordance | **Off** (no fee) by default; suggested **$25** if turned on | Inline | If turned **on with no amount** → "Late fee is on but has no amount." Depends on Grace period to determine *when* it applies (late = after grace). BOS proposes $25 if unset (§BOS). |
| NSF / returned-payment fee | "Returned payments cost **{$30}**." | `ConfigNumberInput` (money) + on/off | **Off** by default; suggested **$30** if on | Inline | Same on-with-no-amount validation as Late fee. Independent of grace. |
| Deposit | "We hold a **{$0}** deposit, **{refundable}** at withdrawal." | `ConfigNumberInput` (money) + `ConfigSelectInput` (Refundable / Non-refundable / Applied to first invoice) | **$0** (no deposit); type **Refundable** | **Focused** (two linked values: amount + handling) | Deposit handling at withdrawal interacts with Withdrawal policy (§Dependencies). If amount > $0 but handling unset → warn. |

### Group 3 — Absences & changes · *"What happens when plans change?"*
**Disclosure tier:** Expandable (collapsed to a one-line summary; "Show absence & change rules"). **Posture:** Medium — common but considered. **Order:** 3.

| Policy | Sentence slot | Input control + units | Default value | Inline vs focused | Dependencies / warnings |
|---|---|---|---|---|---|
| Proration | "When a child starts or stops mid-period, we **{charge for scheduled days only}**." | `ConfigSelectInput` (Charge for scheduled days only / Charge the full period / Don't prorate) | **Charge for scheduled days only** | **Focused** (the choice cascades into Rate Plan "Charges for" interpretation) | Interacts with Rate Plan "Charges for" (Scheduled / Attended / Flat weekly): a Flat-weekly plan cannot be day-prorated — warn that proration has no effect there. |
| Vacation / absence credit | "Families get **{0}** credited vacation days per **{year}**." | `ConfigNumberInput` (days) + `ConfigSelectInput` (per year / per quarter / per month) | **0 days** (no vacation credit) | **Focused** (count + period + whether unused days roll over) | If days > 0, a "credited at" question appears (applied as account credit). Interacts with Credit policy (Group 4) as the mechanism. |
| Withdrawal | "When a family withdraws, we require **{2 weeks}** notice and bill **{through the notice period}**." | `ConfigNumberInput` (notice period, weeks) + `ConfigSelectInput` (bill through notice / stop billing immediately / charge a withdrawal fee) | **2 weeks** notice; **bill through the notice period** | **Focused** (notice + billing treatment + optional fee) | If "charge a withdrawal fee" chosen, an amount field appears. Interacts with Deposit handling (deposit may offset final balance). |

### Group 4 — Adjustments & credits · *"How do we correct money?"*
**Disclosure tier:** Expandable (collapsed; "Show correction rules"). **Posture:** Medium. **Order:** 4.

| Policy | Sentence slot | Input control + units | Default value | Inline vs focused | Dependencies / warnings |
|---|---|---|---|---|---|
| Refund | "Refunds **{require owner approval}** and go back to **{the original payment method}**." | `ConfigSelectInput` (require owner approval / no approval needed) + `ConfigSelectInput` (original payment method / account credit / either) | **Require owner approval**; **original payment method** | **Focused** (approval + destination) | The approval half is **echoed in** Controls → Adjustment approval (§Dependencies: refund approval is a *view* of the same governance setting, not a second source of truth). |
| Credit | "We can issue account credits up to **{$100}** without approval." | `ConfigNumberInput` (money threshold) + on/off for "requires approval above threshold" | **$100** threshold | **Focused** | Threshold is bounded by Adjustment approval threshold in Controls (a credit threshold *looser* than the org control is flagged, not blocked — §Validation contradictory scope). Vacation credit (Group 3) issues via this mechanism. |
| Write-off | "We can write off balances up to **{$50}**; larger write-offs **{need a manager}**." | `ConfigNumberInput` (money threshold) + `ConfigSelectInput` (need a manager / need an owner / no approval) | **$50** threshold; **need a manager** above | **Focused** | Threshold relationship to Adjustment approval (Controls) same as Credit. A write-off threshold above the org adjustment-approval ceiling is contradictory → explained. |

### Group 5 — Controls & approvals · *"What needs a human?"*
**Disclosure tier:** Advanced / governance (collapsed behind **"Show governance policies"**; never shown on first load). **Posture:** Advanced. **Order:** 5 (last).

| Policy | Sentence slot | Input control + units | Default value | Inline vs focused | Dependencies / warnings |
|---|---|---|---|---|---|
| Adjustment approval | "Money corrections over **{$100}** need **{owner}** approval." | `ConfigNumberInput` (money threshold) + `ConfigSelectInput` (manager / owner / no one) | **$100** threshold; **owner** | **Focused** | This is the **source of truth** that Credit, Write-off, and Refund approval read from / are checked against. Lowering it below a child threshold flags those as contradictory. |
| Draft lifetime | "Unposted draft charges expire after **{30}** days if no one acts." | `ConfigNumberInput` (days, 1–365) | **30 days** | Inline (within advanced) | Pure governance hygiene. No downstream policy dependency; warns if set below the longest billing interval (drafts could expire before their billing cycle). |
| Posting review | "Charges **{don't}** need review before posting." | `ConfigSelectInput` (don't need review / always need review / only above an amount, with `ConfigNumberInput` threshold) | **Don't need review** | **Focused** | Consumed by Charge Resolution and by each Charge Definition's "Needs review?" (a Charge may inherit this). Turning review on is high-consequence — confirmation describes the operational effect (every draft waits for a human). |

**Total: 13 policies across 5 groups.** (Billing rhythm 4 + Fees & deposits 3 + Absences & changes 3 + Adjustments & credits 3 — *correction: Adjustments has 3 (Refund, Credit, Write-off)* — + Controls & approvals 3 = 4+3+3+3 = 13. Deposit lives in Fees & deposits, not Absences.)

---

## Simple mode vs Advanced mode

The section has two operator-visible modes, switched by a single toggle in the `ConfigurationContext` band ("Simple ⇄ Advanced"). Default is **Simple**.

**Simple mode (default):**
- Shows the two **prominent** groups expanded (Billing rhythm, Fees & deposits) as sentences.
- Shows the two **expandable** groups (Absences, Adjustments) **collapsed** to a single summary line each ("Absences & changes — using Alloy defaults" with a chevron).
- **Hides the governance group entirely** behind "Show governance policies" — it is not even a collapsed card row until requested; it appears as a quiet link at the bottom.
- Hides scope controls until invoked. Hides effective-dating affordances behind each policy's value menu ("Schedule a change").
- Hides "Advanced" sub-fields within focused editors (e.g. roll-over rules on vacation credit, "either" refund destinations).

**Advanced mode:**
- All five groups expanded, including governance.
- Each policy line shows its **scope chips** inline (`ConfigScopeBadge`) even where only the org default exists, so the operator can see and add overrides.
- Effective-dating timeline (`ConfigVersionBadge` row) shown per policy, not hidden behind the value menu.
- Focused-editor advanced sub-fields exposed (roll-over, refund "either", posting-review thresholds, withdrawal fee specifics).
- The resolved-effect preview (below) is shown **always**, not on-demand.

**Mode is a presentation choice, not a data choice.** Switching modes never changes any policy value; it only changes what is revealed. Simple mode is "calm by default"; Advanced is "depth on demand" (Visual Language #4).

---

## Setup journey (defaults-first)

There is **no mandatory wizard and no blank required state.** The journey:

1. **Land already-billable.** On first entry, every one of the 13 policies is on a **labeled Alloy default** ("Using Alloy default"). The organization can bill recurring tuition immediately. The Context band reads: *"You're using Alloy's recommended financial rules. Customize any that differ for your organization."*
2. **Read the sentences.** The operator scans Billing rhythm and Fees as sentences. This is reading, not editing (P3).
3. **Customize by exception.** They click a single value (e.g. the grace-period number). It becomes inline-editable. On save, that policy flips from **"Using Alloy default"** to **"Customized"** (Bend Pine chip) and gains a **"Reset to default"** affordance.
4. **Go deeper only if needed.** If absences or corrections differ, they expand those groups. If governance must tighten, they click "Show governance policies."
5. **Scope only when reality demands it.** If a value differs at one location/service, they invoke "This differs at a location/service" on that single policy (§Scope). Most orgs never do this.
6. **Schedule, don't overwrite.** If a change should take effect later (e.g. "late fee becomes $30 on Jan 1"), they use "Schedule a change" rather than editing in place.

The journey never *requires* steps 3–6. An org that does nothing is correctly configured on safe defaults. This is the literal embodiment of "calm under pressure" and "customize by exception."

---

## Information hierarchy

1. **Context band** (`ConfigurationContext`): title *"Financial Policies"*, purpose line *"The rules around billing & money — defaulted safe, customized by exception."*, and the Simple ⇄ Advanced toggle.
2. **`ConfigReadonlyNotice`** (P2): *"This is configuration. It does not post money. Posting is a separate, controlled process."*
3. **The five group cards**, in touch-frequency order (Billing rhythm, Fees & deposits, Absences & changes, Adjustments & credits, Controls & approvals).
4. Within a group card, each policy is a **one-line sentence** with the value(s) inline. Beneath the sentence (Advanced, or on-demand in Simple): the **default/customized chip**, the **scope chips** (only where a non-org scope exists), and the **version state**.
5. **Resolved-effect preview** for any scoped policy, attached beneath that policy's sentence.
6. Scope and effective-date controls are **summoned**, never standing — they appear when the operator invokes them.

The whole section is **Summary mode first**. There is no separate "edit page" and no modal form. The Object Queue (320px) is **not used** for this section in the usual lineage sense — Financial Policies is a single coherent workspace of five cards, not a list of many objects. (If a future Agreement-scope dimension introduces many scoped overrides worth listing, the Object Queue can list *overrides* — see Future extensibility.)

---

## Cards

Each group is a `ConfigurationDetailCard{title}` whose **title is the operator question**. Card-level spec:

| # | Card title (the question) | Disclosure tier | Default state (Simple) | Contents |
|---|---|---|---|---|
| 1 | **"When and how do we bill?"** | Prominent | Expanded | The 4 Billing-rhythm policies as one compound sentence + individual value slots. |
| 2 | **"What do we charge for friction?"** | Prominent | Expanded | Late fee, NSF fee, Deposit — each its own sentence. |
| 3 | **"What happens when plans change?"** | Expandable | Collapsed to summary line | Proration, Vacation/absence credit, Withdrawal — sentences, each opening a focused editor. |
| 4 | **"How do we correct money?"** | Expandable | Collapsed to summary line | Refund, Credit, Write-off — sentences, each a focused editor. |
| 5 | **"What needs a human?"** | Advanced / governance | Hidden behind "Show governance policies" | Adjustment approval, Draft lifetime, Posting review. |

Each card answers exactly one operational question (P5). A card is never a noun-labeled field group (no "Billing Settings", no "Fee Configuration"). The collapsed summary line of an expandable card states its current posture in one phrase: *"Absences & changes — using Alloy defaults"* or *"Absences & changes — 1 customized"*.

---

## Per-policy sentence specifications (all 13)

Below, every policy's **canonical sentence template** with its value slot(s) in **bold**, the control, units, default, group, inline/focused, and dependencies/warnings. Values shown in `{braces}` are the editable slots.

**Group 1 — Billing rhythm**

1. **Billing schedule / cadence** — *"We bill **{weekly}**…"*
   - Control: `ConfigSelectInput` — Weekly / Every two weeks / Monthly / Per session. Units: cadence. Default: **Weekly**. Inline. Dependency: drives the option set of Invoice date; warn on conflict with Rate Plan billing basis.
2. **Invoice date** — *"…invoice on **{Monday}**…"*
   - Control: `ConfigSelectInput`, options gated by cadence (weekly → day-of-week; monthly → day-of-month 1–28 / last day). Units: day. Default: **Monday** (weekly). Inline. Dependency: Due date measured relative to this.
3. **Due date** — *"…due **{on receipt}**…"*
   - Control: `ConfigSelectInput` (On receipt / Net N days) + `ConfigNumberInput` N (days). Units: days. Default: **On receipt**. Inline. Validation: must not fall before the invoice date.
4. **Grace period** — *"…with a **{3-day}** grace period."*
   - Control: `ConfigNumberInput`. Units: days (0–30). Default: **3 days**. Inline. Dependency: grace begins at due date; late fee fires after grace; warn if grace ≥ billing interval.

   *(Group 1 reads as one compound sentence: "We bill **weekly**, invoice on **Monday**, due **on receipt**, with a **3-day** grace period." Each bold value is independently editable in place.)*

**Group 2 — Fees & deposits**

5. **Late fee** — *"Late pickup costs **{$25}**."* (or, when off: *"We don't charge a late-pickup fee."*)
   - Control: `ConfigNumberInput` (money) + on/off. Units: currency. Default: **Off**; suggested $25 on. Inline. Validation: on-with-no-amount. Dependency: timing governed by Grace period.
6. **NSF / returned-payment fee** — *"Returned payments cost **{$30}**."* (off: *"We don't charge for returned payments."*)
   - Control: `ConfigNumberInput` (money) + on/off. Units: currency. Default: **Off**; suggested $30 on. Inline. Validation: on-with-no-amount.
7. **Deposit** — *"We hold a **{$0}** deposit, **{refundable}** at withdrawal."* (zero: *"We don't collect a deposit."*)
   - Control: `ConfigNumberInput` (money) + `ConfigSelectInput` (Refundable / Non-refundable / Applied to first invoice). Units: currency + handling. Default: **$0 / Refundable**. Focused. Dependency: Withdrawal policy uses deposit handling at final billing.

**Group 3 — Absences & changes**

8. **Proration** — *"When a child starts or stops mid-period, we **{charge for scheduled days only}**."*
   - Control: `ConfigSelectInput` (Charge for scheduled days only / Charge the full period / Don't prorate). Default: **Charge for scheduled days only**. Focused. Dependency: no effect on Flat-weekly Rate Plans — warn.
9. **Vacation / absence credit** — *"Families get **{0}** credited vacation days per **{year}**."* (zero: *"We don't credit vacation days."*)
   - Control: `ConfigNumberInput` (days) + `ConfigSelectInput` (per year / per quarter / per month); advanced: roll-over yes/no. Default: **0 days / per year**. Focused. Dependency: issued via the Credit mechanism (Group 4).
10. **Withdrawal** — *"When a family withdraws, we require **{2 weeks}** notice and bill **{through the notice period}**."*
    - Control: `ConfigNumberInput` (weeks) + `ConfigSelectInput` (bill through notice / stop billing immediately / charge a withdrawal fee → reveals amount). Default: **2 weeks / bill through the notice period**. Focused. Dependency: deposit may offset final balance.

**Group 4 — Adjustments & credits**

11. **Refund** — *"Refunds **{require owner approval}** and go back to **{the original payment method}**."*
    - Control: `ConfigSelectInput` (require owner approval / no approval needed) + `ConfigSelectInput` (original payment method / account credit / either). Default: **Require owner approval / original payment method**. Focused. Dependency: the approval half mirrors Controls → Adjustment approval (single source of truth).
12. **Credit** — *"We can issue account credits up to **{$100}** without approval."*
    - Control: `ConfigNumberInput` (money threshold) + on/off "requires approval above threshold". Default: **$100**. Focused. Dependency: bounded by Adjustment approval threshold; vacation credit issues here.
13. **Write-off** — *"We can write off balances up to **{$50}**; larger write-offs **{need a manager}**."*
    - Control: `ConfigNumberInput` (money threshold) + `ConfigSelectInput` (need a manager / need an owner / no approval). Default: **$50 / need a manager**. Focused. Dependency: threshold checked against Adjustment approval ceiling.

**Group 5 — Controls & approvals (governance, advanced)**

14. **Adjustment approval** — *"Money corrections over **{$100}** need **{owner}** approval."*
    - Control: `ConfigNumberInput` (money threshold) + `ConfigSelectInput` (manager / owner / no one). Default: **$100 / owner**. Focused. Dependency: source of truth for Credit / Write-off / Refund approval.
15. **Draft lifetime** — *"Unposted draft charges expire after **{30}** days if no one acts."*
    - Control: `ConfigNumberInput` (days, 1–365). Default: **30 days**. Inline (within advanced). Warning: if below longest billing interval.
16. **Posting review** — *"Charges **{don't}** need review before posting."* (variants: "always need review", "need review only over **{$X}**")
    - Control: `ConfigSelectInput` (don't / always / only above an amount → reveals `ConfigNumberInput`). Default: **Don't need review**. Focused. Dependency: consumed by Charge Resolution and each Charge Definition's "Needs review?"; turning on requires consequence-describing confirmation.

*(Numbering 1–16 above reflects sentence sequence; the policy **count is 13** — the four Billing-rhythm slots, Late/NSF/Deposit, Proration/Vacation/Withdrawal, Refund/Credit/Write-off, Adjustment-approval/Draft-lifetime/Posting-review. Each is one of the canonical 13 policy types.)*

---

## Scope & resolved-effect preview

Policies scope across four dimensions and resolve **most-specific-wins**:

> **Organization → Location → Service → Rate Plan** (most specific wins).

A policy with no override resolves to the **Org default**. An override at any level supersedes broader levels for the entities beneath it.

### Scope display
- In **Simple mode**, scope chips appear only where a non-org scope **exists** — e.g. a `ConfigScopeBadge{label:"Org default · North Campus differs"}`. Untouched policies show no scope chrome.
- In **Advanced mode**, every policy shows at minimum `ConfigScopeBadge{label:"Organization default"}` so the operator can add an override.

### Scope-setting workflow ("this differs at a location/service")
1. On a policy sentence, the operator opens its value menu and chooses **"This differs at a location / service."**
2. A focused scope panel appears (not a modal route): `ConfigSelectInput` for the **scope level** (Location / Service / Rate Plan) → then `ConfigSelectInput` for the **specific entity** (named in operator language — "North Campus", "Full-Time Care", "Standard Tuition", never IDs).
3. The override starts **pre-filled with the inherited value** (so the operator changes one number, not re-authors a policy — mirrors the Rate Plan override "Same as organization, except…" pattern).
4. On save, a new `ConfigScopeBadge{label,override:true}` (Bend Pine) attaches to the sentence, and the **resolved-effect preview** appears.

### Resolved-effect preview copy
Attached beneath any scoped policy, the preview states **what actually applies and why**, as of today:

> **"As of today at North Campus, the late fee is $30 because the location overrides the $25 org default."**

Template: *"As of {date} at {most-specific scope entity}, the {policy} is {resolved value} because {the winning scope} overrides the {next-broader value} {broader scope} default."*

When nothing overrides:
> **"As of today, the late fee is $25 everywhere — the organization default applies."**

When multiple scopes stack:
> **"As of today for Full-Time Care at North Campus, the grace period is 5 days because the service override beats the location's 3 days and the org's 3-day default."**

The preview is a **projection** (Interaction Grammar: projections observe, never mutate). It carries the P2 framing implicitly — it describes configuration resolution, not a posted charge. The operator sees *what is true*, not just *what they typed* — this is the "preview truth boundary" applied to scope resolution.

---

## Dependencies between policies

These relationships are real and must be surfaced as **operational explanations**, never as hard form-coupling. Dependencies are explained and (where contradictory) flagged — they are not auto-corrected.

| Source policy | Depends on / affects | Behavior |
|---|---|---|
| Due date | Invoice date | Due date is measured *from* the invoice date; must not resolve before it (validation). |
| Grace period | Due date; Late fee | Grace begins at the due date; the late fee fires only after grace expires. If grace ≥ billing interval, the late fee may never trigger — advisory warning. |
| Late fee | Grace period | "Late" is *defined* by grace. Editing grace changes when the late fee applies; the late-fee sentence can show a hint ("applies after the 3-day grace"). |
| Proration | Rate Plan "Charges for" | Day-proration has no effect on a Flat-weekly plan — advisory ("This plan charges a flat weekly rate, so proration won't change the amount"). |
| Vacation credit | Credit policy | Vacation days are issued via the account-credit mechanism; if Credit is fully locked behind approval, vacation credits inherit that gate. |
| Withdrawal | Deposit | A refundable deposit offsets the final balance at withdrawal; the withdrawal focused editor notes the deposit handling. |
| Refund approval | Adjustment approval (Controls) | The refund-approval value is a **view** of the same governance setting — editing one updates the other; they are never two independent truths. |
| Credit threshold | Adjustment approval (Controls) | A credit threshold looser than the org adjustment-approval ceiling is contradictory → explained with the resolved winner. |
| Write-off threshold | Adjustment approval (Controls) | Same as Credit threshold. |
| Posting review | Charge Resolution; each Charge Definition | Charge Definitions may inherit "Needs review?" from this policy; the Charge surface shows whether review is the charge's own setting or inherited. |
| Draft lifetime | Billing cadence | If draft lifetime < longest billing interval, drafts may expire before their cycle — advisory. |

**Rule:** dependencies surface as **advisory copy or a resolved-winner explanation**, except the two true *errors* (due-before-invoice; fee-on-with-no-amount) which block save. Contradictory scope/threshold is **explained, never blocked** (the doctrine: explain the winner).

---

## Validation & warnings

Validation speaks **operational consequence** (P7), not field constraints. Three severities (inherited from the cross-cutting attention model): **Attention (ember)** = would break billing; **Advisory (gold)** = suboptimal but safe; **Info (stone)** = neutral.

### Literal validation messages

**Blocking errors (Attention):**
- **Due-before-invoice:** *"Payments would be due before the invoice is even sent. Set the due date on or after the invoice date."*
- **Late-fee-with-no-amount:** *"Late fee is on but has no amount — no one would actually be charged. Set an amount or turn it off."*
- **NSF-fee-with-no-amount:** *"Returned-payment fee is on but has no amount. Set an amount or turn it off."*
- **Deposit amount with no handling:** *"You've set a deposit amount but not what happens to it at withdrawal. Choose refundable, non-refundable, or applied to first invoice."*

**Explained, not blocked (Advisory — contradictory scope/threshold):**
- **Contradictory scope (service looser than org control):** *"Full-Time Care lets staff write off up to $200, but the organization caps approval-free corrections at $100. The stricter org control wins: corrections over $100 still need owner approval."*
- **Override with no effect:** *"This North Campus late fee is $25 — the same as the organization default. It has no effect. Remove it?"*
- **Grace swallows late fee:** *"Your 8-day grace period is longer than your weekly billing cycle, so the late fee may never apply."*
- **Proration on flat plan:** *"Standard Tuition charges a flat weekly rate, so 'charge for scheduled days only' won't change what families pay on that plan."*
- **Draft lifetime too short:** *"Draft charges expire after 7 days, but you bill monthly — drafts could disappear before their billing cycle. Consider a longer draft lifetime."*

**Neutral (Info):**
- **Customized notice on reset:** *"Reset to Alloy's recommended value? This policy will follow the default again."*
- **Scheduled change pending:** *"A change to this policy is scheduled for Jan 1 — the current value applies until then."*

Validation never says "value required", "invalid input", or names a field. It names the **business outcome**.

---

## Versioning grammar

Policies are **effective-dated** (canonical Slice C). The grammar is identical to Rate Plans and Charges — operators learn it once (cross-cutting versioning model).

- **States** (`ConfigVersionBadge`): **Current** (effective today) / **Scheduled** (future-dated, pending) / **Superseded** (replaced) / **Retired** (ended).
- **The verb is always "Schedule a change"**, never "Edit." You never overwrite policy history; you supersede it.
- **Workflow:** on a policy value menu → **"Schedule a change"** → `ConfigDateInput` for the effective date → edit the value(s) → `ConfigButtonRow` (`ConfigPrimaryButton` "Schedule", `ConfigSecondaryButton` "Cancel"). The prior value closes the day before the new one begins.
- **Scheduled state is visible and voidable:** a future change reads *"Late fee becomes $30 on Jan 1 (scheduled)"* and can be **voided before it starts** (`ConfigSecondaryButton` "Void scheduled change").
- **"As of" viewing:** the operator can view the resolved policy **as of any date** (a date control in the Context band, Advanced mode), so they can confirm next term's scheduled rules before they take effect.
- In **Simple mode**, effective-dating is summoned via the value menu and the per-policy line shows only Current/Scheduled. In **Advanced mode**, the full `ConfigVersionBadge` timeline rail shows per policy.
- The shared `EffectiveDatedConfigurationEditor` powers the focused-editor policies (Deposit, Proration, Vacation, Withdrawal, Refund, Credit, Write-off, Adjustment approval, Posting review). Inline policies (cadence, invoice/due/grace, late fee, NSF, draft lifetime) carry the lightweight "Schedule a change" affordance on the value menu and route to the same effective-dated mechanism.

---

## Progressive disclosure

Three disclosure tiers, mapped to the five groups:

- **Prominent** — *Billing rhythm*, *Fees & deposits*. Always expanded; first thing the operator sees. Sentences with inline values.
- **Expandable** — *Absences & changes*, *Adjustments & credits*. Collapsed to a one-line posture summary in Simple mode; expand on click. Medium-effort decisions.
- **Advanced / governance** — *Controls & approvals*. Hidden behind **"Show governance policies"**; not rendered as a card until requested. Most operators never open it.

Additional disclosure layers, all "depth on demand" (Visual Language #4):
- **Scope controls** appear only when "This differs at a location/service" is invoked.
- **Effective-dating** appears only via "Schedule a change."
- **Focused-editor advanced sub-fields** (roll-over, refund "either", posting-review thresholds, withdrawal fee) appear only inside their editor under an "Advanced" sub-disclosure.
- **Resolved-effect preview** is on-demand in Simple mode (appears when a scope exists), always-on in Advanced.

The default surface is calm: two expanded sentence cards, two collapsed summaries, one quiet governance link. Nothing required, nothing dense.

---

## Empty / first-run experience

There is **no true empty state** — defaults always exist (canonical 4.9). The "empty" feeling is replaced by a **default-confidence state**.

- `ConfigurationEmptyState` is **not** used as a dead-end. Instead, the populated default surface carries a Context-band line: *"You're using Alloy's recommended financial rules. Customize any that differ for your organization."*
- Every policy renders its sentence on its Alloy default, each chipped **"Using Alloy default."** The org is billable on arrival.
- First-run BOS proposal (propose-and-approve): *"Most childcare organizations charge a $25 late-pickup fee and a $30 returned-payment fee. Want to turn these on?"* — a single approval chip that, if accepted, flips Late fee → $25 and NSF → $30 (still customizable). Never auto-applied.
- No mandatory wizard, no required first step. The "calm under pressure" promise: a brand-new org is correctly configured before touching anything.

---

## Editing workflow

All editing is **inline or focused**, never a separate route, never a modal form (P3).

**Inline policies** (cadence, invoice/due/grace, late fee, NSF, draft lifetime):
1. Operator clicks the **bold value** in the sentence → it becomes the matching `Config*Input` in place.
2. Edits → on blur/Enter, the sentence re-renders with the new value; chip flips to **"Customized"** (Bend Pine) with **"Reset to default."**
3. If a blocking error applies (due-before-invoice, fee-no-amount), the value cannot commit and the operational message shows beneath the sentence.

**Focused-editor policies** (Deposit, Proration, Vacation, Withdrawal, Refund, Credit, Write-off, Adjustment approval, Posting review):
1. Operator clicks the sentence → a **focused panel** opens in the workspace (not a modal, not a route) hosting the multiple linked `Config*Input` fields and the `EffectiveDatedConfigurationEditor` timeline.
2. They edit the linked values (e.g. notice period + billing treatment + optional fee for Withdrawal).
3. `ConfigButtonRow`: `ConfigPrimaryButton` ("Save" or "Schedule") + `ConfigSecondaryButton` ("Cancel"). High-consequence saves (Posting review on) show a consequence-describing confirmation, not a generic "Are you sure?".

**Scope edit:** "This differs at a location/service" → focused scope panel (§Scope), pre-filled with inherited value.

**Schedule a change:** value menu → "Schedule a change" → `ConfigDateInput` + edit → "Schedule."

**Reset:** "Reset to default" on any Customized policy → confirmation *"Reset to Alloy's recommended value?"* → reverts to default, chip returns to "Using Alloy default."

Editing is **intentional** (P3): the default state is reading the sentences; an edit is a deliberate click on a value.

---

## BOS guidance

Per BOS Foundation, every assist is a **proposal chip the operator approves** — never an auto-write (P6). Guidance proposals for this section:

- **Missing late fee:** *"You haven't set a late-pickup fee. Most childcare organizations charge around $25. Add it?"* → approve sets Late fee = $25 (customizable), or dismiss.
- **Missing NSF fee:** *"Returned-payment fees protect against bounced payments — most orgs charge $30. Turn it on?"*
- **First-run bundle:** *"Most organizations charge a $25 late fee and a $30 returned-payment fee. Want both as a starting point?"* (single chip, two values).
- **Contradiction nudge:** *"Full-Time Care allows write-offs up to $200, but your org cap is $100. Want the service rule to match the org cap?"* (proposes alignment; does not force it).
- **Stale policy:** *"Your grace period hasn't changed in 2 years and you've had 14 late payments this month. Consider tightening it."* (informational proposal; no value pre-set).
- **Scope simplification:** *"This North Campus late fee matches the org default exactly. Remove the override to simplify?"*
- **Posting-review caution:** when an operator turns Posting review on, BOS does **not** auto-suggest a threshold; it surfaces the consequence so the human decides.

BOS **never** posts money, never patches a policy directly, never bypasses the authoring path. Each proposal is a chip with **Approve** / **Dismiss**, and approval routes through the same editing workflow a human click would.

---

## Future extensibility

The five-group taxonomy is the **absorptive surface** for the doctrine's full future policy list:

- **New policy types are new sentences in the right group** — "Sibling discount eligibility" → Adjustments & credits; "Tax treatment" → Billing rhythm or a new "Taxes" sub-line; "Subsidy handling" → a future "Who pays" interaction. No new screen.
- **New scope dimension — Agreement-scope** — slots into the same most-specific-wins resolver as the most specific level (Org → Location → Service → Rate Plan → **Agreement**). If many agreement overrides accumulate, the Object Queue (320px) can begin listing *overrides* as a scannable lineage, without changing the five-card model.
- **New cadences** (seasonal, milestone, per-term) extend the Billing-schedule option set; Invoice date wording adapts to the new cadence.
- **New fee types** are new sentences in Fees & deposits.
- **Live policy consumption** — when Operational Consumption and Posting land, the *same* policies begin governing real charges (grace/late-fee timing, posting-review gating) with no re-authoring; the Simulator already explains which policy applied.
- **Group taxonomy is stable**; growth is *instances in the model*, never new products (Operational UX Doctrine).

---

## Operator mistakes

The design anticipates and gracefully handles the predictable mistakes:

1. **Turning on a fee but leaving the amount blank.** → Blocked with "Late fee is on but has no amount — no one would actually be charged."
2. **Setting due date before invoice date.** → Blocked with the plain-consequence message; cannot commit.
3. **Creating an override that matches the default.** → Advisory "no effect — remove it?" (not blocked).
4. **Setting a service/location threshold looser than the org control.** → Explained: the stricter org control wins; the operator sees the resolved winner, not a silent failure.
5. **Setting a grace period longer than the billing cycle.** → Advisory that the late fee may never fire.
6. **Turning on Posting review without realizing the workload.** → Consequence-describing confirmation ("every draft charge will wait for a human before posting").
7. **Setting draft lifetime shorter than the billing interval.** → Advisory that drafts could expire before their cycle.
8. **Over-scoping early** (creating many location overrides before needing them). → Simple mode hides scope chrome and BOS proposes removing redundant overrides; the default path discourages premature scoping.
9. **Expecting "Edit" to overwrite history.** → The verb is always "Schedule a change"; history is preserved as Superseded. A scheduled change is visible and voidable before it starts.
10. **Assuming changing a policy posts/refunds money.** → The persistent `ConfigReadonlyNotice` and preview-only framing make clear configuration never moves money.

---

## Questions answered

This screen lets an operator answer, in their own language:

- *When do invoices go out, when are they due, and how much grace do we give?*
- *What happens to billing when a child starts mid-week, goes on vacation, or withdraws?*
- *What do we charge for late pickup and returned payments? Do we hold a deposit?*
- *How do we issue refunds, credits, and write-offs — and up to what amount without sign-off?*
- *What money corrections require a human, and which charges need review before posting?*
- *Where do any of these rules differ — at a location, a service, a rate plan?*
- *What actually applies right now at this location, and why?* (resolved-effect preview)
- *Is our billing set up safely even if we change nothing?* (yes — defaults)

---

## Questions introduced

Deliberately surfaced design questions for the build team and future slices:

- **Agreement-scope timing:** when does Agreement become a real scope level, and does it warrant the Object Queue lineage list? (Deferred to Operational Consumption.)
- **Refund/Adjustment-approval single-source mechanics:** the refund-approval value is a *view* of Adjustment approval — confirm the editing UX makes the shared-truth relationship legible (editing one updates both).
- **Vacation-credit issuance:** vacation credit issues via the Credit mechanism — is the operator-facing relationship clear enough, or does it need its own sentence in Absences referencing the credit gate?
- **"As of" interplay with scope:** confirm the resolved-effect preview and "as of date" compose cleanly (resolving both a date and a scope at once).
- **Tax as a policy vs a separate concept:** does tax belong as a Billing-rhythm sentence, a new sub-group, or its own screen? (Flagged for future extensibility.)

## Questions intentionally deferred

- **Subsidy/third-party payer policies** — belong to the "Who pays" domain (Financial Responsibility / Subsidy), deferred there, not here.
- **Live posting behavior** — Posting is deferred (canonical nav). Policies *configure* gating; actual posting/ledger writes are out of scope.
- **Payment-method-specific rules** (card vs ACH fees) — deferred until Payments lands.
- **Per-family policy exceptions** — an Agreement-scope concern, deferred to Operational Consumption.
- **Mapping-style effective-dating for Accounting** — out of scope for Policies; tracked in the Accounting screen.
- **Automated enforcement / actual fee firing** — this screen configures rules; the wiring to live attendance/payment facts that *fire* late fees and NSF fees is the next phase (Operational Consumption), not this slice.
