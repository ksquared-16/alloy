---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling — pattern & financial spec (final correction)

**Status:** Proposed — the narrow pre-implementation correction pass. It fixes four inaccuracies without reopening architecture: **(1)** week order from configuration; **(2)** Billing returns eligible rate *choices* + a recommended default; **(3)** discounts/funding show real amounts (or an explicit pending state); **(4)** money uses neutral Alloy styling, not yellow-as-warning. Companion: [`billing-rate-resolution-contract.md`](./billing-rate-resolution-contract.md) (the `BillingScheduleProjection` + gap report). This refines [`schedule-lifecycle-and-object.md`](./schedule-lifecycle-and-object.md) and [`scheduling-billing-boundary.md`](./scheduling-billing-boundary.md).

---

## 1. Week structure comes from configuration

The Scheduling command **never hardcodes Monday-first or Sunday-first.** It resolves the displayed week from configuration.

| Aspect | Rule |
|--------|------|
| **Config owner** | organization/location **calendar configuration** (week-start day, operating days, weekend visibility, locale, program operating pattern), read via the config runtime. **Location overrides organization**; program may refine operating pattern. |
| **Inputs** | org week start · location week start · operating days · weekend visibility · locale · program operating pattern |
| **Fallback** | if week-start unset → **locale default** (e.g. `en-US` → Sunday-first; most locales → Monday-first) → org default. Never a hardcoded constant. |
| **Locale behavior** | locale supplies the default week start only when config is unset; explicit config always wins. |
| **Operating-day behavior** | non-operating/closed days may be **shown** (dimmed, labelled *Closed*, **not selectable**) or **hidden** — per `weekendVisibility`/operating-day config. Closed days can never be selected as active. |
| **Projection field** | the command context carries `weekConfig { weekStart, operatingDays[], visibleDays[], closedDays[] }`. |
| **UI rendering** | the day selector renders `visibleDays` in `weekStart` order; `closedDays` render in a distinct, non-interactive treatment. |

So the same command shows `Sun Mon Tue Wed Thu Fri Sat` for one org and `Mon Tue Wed Thu Fri Sat Sun` for another — driven entirely by config.

---

## 2. Pattern editor (retained, refined)

Configure the minimum; override only exceptions.

- **Days** — in the configured order (§1); select active days (closed days non-selectable).
- **Defaults** — default arrival, default departure, default room.
- **Per-day overrides** — arrival · departure · room (and **program only when valid** for the room/child).
- **Effective** — start · end or open-ended · temporary.

**Overrides are multiple assignments within one schedule version — never separate schedules.** A Tuesday 9:30 arrival is an override assignment; the schedule remains one version with two assignments (the M/W/Th/F default + the Tue override). This is the assignment model from [`scheduling-projection-contract.md`](./scheduling-projection-contract.md) §1–2.

---

## 3. Billing resolves eligible rate *options*, not one rate

Correcting the prior assumption. Billing evaluates the proposed schedule and returns **a set**: a **recommended/default** rate, other **eligible** configured rates, optionally **ineligible** rates with safe reasons, plus each rate's basis · recurring frequency · effective date · projected amount · override authorization. Examples of configured rates (**never hardcoded by Scheduling**): Toddler Full Week · Part Week · Full Day · Half Day · Hourly · program-specific · legacy · contracted · subsidized. The options come from **Billing configuration + its registered pricing logic**; Scheduling supplies the schedule context and displays what Billing returns.

---

## 4. Director rate selection

The command normally: **recommends the Billing default**, **preselects it when deterministic and safe**, shows other **eligible** rates, **explains why** the recommendation applies, and lets an **authorized** operator choose another eligible option.

Only rates valid for the current **child · program · location · pattern · days · times · effective dates · enrollment agreement · funding arrangement · operator authority** are shown — never every configured rate. Presentation:

```
RATE   Recommended · Toddler · Full Week · $980/month     ●
       Other eligible rates
       Toddler · Contracted Full Week — $925/month        ○
       Toddler · Legacy Rate — $900/month                 ○
```

---

## 5. Authorized rate override (controlled)

An override may: choose another eligible rate, enter a custom amount, preserve a legacy amount, apply an exception — and may **require approval, a reason, and an expiration**. Not every director may enter any rate. The capability resolves through **configured commands + permissions + approval policy**.

| Aspect | Rule |
|--------|------|
| **Who may override** | operators with the configured override permission for the org/site |
| **What may be overridden** | only what Billing config marks overridable (rate selection; custom amount only if allowed) |
| **Required reason** | yes — free-text reason captured on the override |
| **Approval** | per Billing approval policy — an override may be **pending approval** before it takes financial effect |
| **Effective dates** | override carries its own effective from/(optional) end |
| **Audit** | Billing records who/when/why + prior value (authoritative audit) |
| **Downstream ownership** | **Billing** owns the override record and its authoritative financial effect |
| **In Scheduling** | the selected rate shows `Override · reason · pending approval` (a warning state) or `Override · approved` |
| **In Billing** | the authoritative override + approval trail |

---

## 6. Discounts show financial values

Never `Sibling discount applied` alone. Show amounts, or a total when summarized:

```
Base recurring tuition    $1,100/month
Sibling discount            −$120/month
Employee discount              −$0
```
Summarized: `Discounts  −$120/month` (with expand / **View in Billing**). **Billing owns** eligibility · calculation · stacking · precedence · effective dates · maximums · expiration · audit. Scheduling **displays the Billing-resolved amounts** — it computes none of them.

---

## 7. Funding shows financial values (or honest pending)

Never `State subsidy applies` without an amount or an explicit unresolved state:

```
Projected tuition        $980/month
State subsidy             −$650/month
Family responsibility     $330/month
```
When unknown: `State subsidy — Pending determination` / `Family responsibility — Pending`. **Never fabricate or prematurely resolve unknown funding.** Billing represents funding source · projected funded amount · family responsibility · pending verification · maximum · effective dates · authorization period · expiration · partial coverage. Funding maps onto the existing multi-payer attribution (a funding source is a payer; family responsibility is the residual to the primary payer — [`billing-rate-resolution-contract.md`](./billing-rate-resolution-contract.md)).

---

## 8. Canonical financial preview (compact, neutral)

```
RECURRING TUITION
Rate                  Toddler · Full Week
Base amount           $1,100 / month
Discounts             Sibling discount  −$120 / month
Funding               State subsidy     −$650 / month
Family responsibility $330 / month
Begins                Jul 28
                      View details in Billing →
```
Adapt to the case — **don't render empty discount/funding rows** unless useful. **Never** show invoices, balances, payments, credits, or ledger activity.

---

## 9. Before & after (schedule change)

Show the financial consequence beside the operational one, write-free until commit:

| | Current | Beginning Aug 4 |
|---|---|---|
| Pattern | Mon–Fri | Mon–Thu |
| Rate | Full Week | Part Week |
| Base tuition | $1,100 | $900 |
| Discounts | −$120 | −$100 |
| Funding | −$650 | −$550 |
| **Family responsibility** | **$330** | **$250** |

Then summarize: *"Family responsibility decreases by $80/month beginning Aug 4."*

---

## 10. Temporary & future schedules

Projections follow effective dates. **Future:** show the upcoming financial state beside the upcoming schedule (`From Sep 2: $1,040/mo`). **Temporary:** state whether it affects tuition — *"Temporary room change · Jul 24–Aug 15 · No tuition change"* or *"Temporary reduction · Jul 24–Aug 15 · Projected family responsibility decreases by $60."* **Billing owns proration**; Scheduling displays the result.

---

## 11. Visual language correction

**Money is not a warning — remove the broad yellow.** Use the standard Alloy card hierarchy. Financial states:

| State | Treatment |
|-------|-----------|
| **Resolved** | neutral / default (standard card, midnight text — no color chrome) |
| **Selected / recommended** | Alloy green (Bend Pine) emphasis |
| **Pending** | muted / caution (never bright yellow blocks) |
| **Blocked / error** | warning / error (Ember) |

Warning color is **reserved** for: unresolved rate · pending funding · unauthorized override · conflicting effective dates · stale projection · missing Billing configuration · a changed financial result requiring review. Every financial chip, border, title, amount, and callout is reviewed against this — resolved tuition renders like any other operational fact.

---

## 12. Ownership & write-path matrix

| Value | Origin (owner) | Committed where |
|-------|----------------|-----------------|
| Selected days · times · room assignments · effective dates · schedule intent | **Scheduling** | `schedule_assignments` / `child_placements` (effective-dated) |
| **Selected rate *reference*** | Scheduling *selects*; **Billing** defines the rate | persisted as part of the committed schedule/financial intent **as a reference** (Scheduling may store the rateId link where the model requires; it stores no amount) |
| Rate configuration · eligible resolution · recommended rate | **Billing** | Billing config / pricing |
| Discounts · funding · tuition calculation · family responsibility · proration | **Billing** | Billing (computed; Scheduling persists none) |
| Override selection (reason) | Scheduling *submits*; **Billing** owns the record + approval | Billing override record (authoritative) |
| Authoritative recurring financial outcome · ledger | **Billing** | Billing ledger |

**Scheduling persists the selected rate *reference*** as part of committed schedule/financial intent where the existing model requires; **it independently calculates no amount** and **exposes no ledger**.

---

## 13. Configured command binding (rate selection & override)

Rate selection and override are **configured command behavior**, not a hardcoded Scheduling menu. Candidate operator intents: **Create schedule · Change schedule · Select rate · Override rate · Request rate approval · Apply discount · Review funding.** **Configuration owns** availability · labels · placement · ordering · visibility · required approval · confirmation language. The **Command Surface** owns the interaction; **Billing** owns eligibility/pricing/approval. Extends the matrix in [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md#configured-command-binding-matrix) with the rate/override intents — none hardcoded.

---

## Cross-references

- [`billing-rate-resolution-contract.md`](./billing-rate-resolution-contract.md) — the `BillingScheduleProjection` contract + implementation gap report + blocker statement.
- [`scheduling-billing-boundary.md`](./scheduling-billing-boundary.md) — the boundary this refines (now with eligible rates + numeric values).
- [`scheduling-projection-contract.md`](./scheduling-projection-contract.md) — assignments; the pattern editor edits these.
- [`mockups/scheduling-financial-command.html`](./mockups/scheduling-financial-command.html) — corrected week order, rate choice, numeric amounts, neutral styling.
