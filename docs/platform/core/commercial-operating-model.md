---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Commercial Operating Model — Core Doctrine

**Status:** Proposed core doctrine — pending ratification (consolidates and elevates two sprint proposals into doctrine form)
**Date:** 2026-06-30
**Sits beside:** Business Process · Operational Truth · Entity Model · Record System
**Consolidates:** commercial-model-v2-reframing.md (historical: `../../sprints/active/commercial-model-v2-reframing.md`) (structure) · commercial-language-bible.md (historical: `../../sprints/active/commercial-language-bible.md`) (language)
**Mandate:** Define the business model, not the implementation. This becomes the foundation for Enrollment, Scheduling, Attendance, Operational Consumption, Billing, Posting, Payments, Third-Party Payers, Reporting, Parent Portal — and future industries.

---

## 0. The two answers everything hangs on

> **What is an organization commercially offering?**
> **What is a family commercially purchasing?**

**An organization offers two things, and only two things:**

1. **Commitments** — ongoing access to a service. A recurring claim on the organization's capacity. *(Childcare enrollment, gym membership, a medical care plan, a professional retainer, a maintenance contract, tuition.)*
2. **Transactions** — discrete deliverables purchased as events. *(A field trip, a procedure, a personal-training package, a repair job, an exam fee, a meal.)*

**A customer buys** a configured **Commitment** (priced from a matrix, billed on a cycle) and, alongside it, some **Transactions** (priced from a catalog, billed on occurrence) — **paid for by one or more Payers under a funding agreement.**

Everything in this doctrine is the elaboration of those two sentences. Childcare is one instance. The primitives are industry-neutral by design (§9 proves it).

---

## 1. Why this is a doctrine, not a feature

The implementation of "Services" exposed that the remaining work was never UI and never configuration. It was that **we had not named what the business actually is.** A Commercial Operating Model is foundational because every downstream capability is a *consumer* of it:

- **Enrollment** instantiates a Commitment.
- **Scheduling / Attendance** operate a Commitment.
- **Operational Consumption** records what a Commitment or Transaction actually used.
- **Billing / Posting / Payments** turn all of it into money.
- **Reporting / Parent Portal** read it back.

If the commercial primitives are wrong, every one of those inherits the error. If they are right, every one of those gets simpler. That is the test of a doctrine.

---

## 2. The two commercial archetypes

| | **Commitment** | **Transaction** |
|---|---|---|
| What it is | Ongoing access / a recurring claim | A discrete deliverable |
| Priced by | A **Pricing Matrix** (configured) | A **catalog price** (per item) |
| Billed by | **Periodic** (every cycle) | **Event** (on occurrence) |
| Childcare | Enrollment (tuition) | Registration, field trip |
| The relationship | Continuous | Episodic |

These are not childcare concepts. They are the two shapes of commerce. The error in "Services" was forcing a **Commitment** (which is a *matrix of configurations*) to be expressed as a *catalog of items*. A Commitment is not a catalog entry; it is a **resolved selection over a priced space**.

### 2a. The third thing: Consumption is a billing trigger, not an archetype
Metered usage (drop-in days, late pickups, per-meal charges, materials on a job, billable hours, overage) is **not a third thing sold.** It is a **third way a price becomes a charge:**

- **Periodic** — every cycle (the commitment's tuition)
- **Event** — on occurrence (a registration, a procedure)
- **Metered** — per unit actually consumed (a drop-in, a meal, an hour)

Both archetypes can be billed by any trigger. A Commitment can be metered (a punch pass, drop-in enrollment); a Transaction can be metered (per-meal). **Operational Consumption is the engine for all metered billing**, regardless of archetype. This is why a single consumption pipeline serves the whole model.

---

## 3. The commercial domains

The proposed chain — *Enrollment → Pricing → Fees → Funding → Accounting → Collections* — is a pipeline. A doctrine needs **separable domains** (bounded contexts), not stages. The model divides into **two layers of four**.

### Layer A — The Commercial Operating Model proper (what is sold / bought / funded / held)

| Domain | Owns | Childcare |
|---|---|---|
| **1. Catalog** | What is sellable | Programs (commitments) + Offerings (transactions) |
| **2. Pricing** | What sellable things cost | The Pricing Matrix + Offering prices |
| **3. Funding** | Who pays, and why | Funding Sources, Payers, Agreements, Allocation |
| **4. Enrollment** | The live commercial relationship | A family's enrollment + its offerings + its funding |

### Layer B — Realization (how the commercial relationship turns into money)

| Domain | Owns | Childcare |
|---|---|---|
| **5. Consumption** | What actually happened | Attendance & Usage |
| **6. Billing** | Turning it into Charges | Draft Charges → Finalize → Invoice |
| **7. Accounting** | Recognizing & posting | Ledger → GL (invisible to operator) |
| **8. Money** | Receiving & collecting | Payments, allocation, collections, write-offs |

**The doctrine's heart is Layer A.** Layer B is governed by it through one contract: **every domain ultimately emits an Obligation, and every Obligation becomes a Charge.** The Charge is the convergence point of the entire model — the single object where commitments, transactions, and consumption all arrive (this already exists as the Operational Consumption pipeline's terminus).

> **Why the flat chain undersells it:** Funding is *independent* of Pricing — a subsidy agreement exists whether or not a matrix changes. Consumption is *independent* of Enrollment — a drop-in has no enrollment. Treating them as stages hides that they are separately ownable, separately configurable capabilities. Domains, not steps.

---

## 4. Commercial ownership — the question the whole model turns on

> Is tuition **Program Pricing**, **Room Pricing**, or **Enrollment Pricing**?

The confusion is that *three different ownership questions* are being asked at once. Separate them and the answer is unambiguous.

| Ownership question | Answer | Meaning |
|---|---|---|
| **Commercial ownership** — what object *carries* the price? | **Program** | The Program is the sellable commitment; it owns the Pricing Matrix. |
| **Operational ownership** — what object manages *delivery & capacity*? | **Room** | Capacity, ratios, placement. **Never carries price.** |
| **Configuration ownership** — what scope *authors/overrides* values? | **Org → Location** | Org sets defaults; Location overrides. A cascade, not an object. |

**Verdict:** Tuition is **Program Pricing at configuration time, resolved as Enrollment Pricing at runtime, and never Room Pricing.**

- The **Program** defines the offer and owns the matrix (*commercial*).
- The **Enrollment** is a resolved cell of that matrix for a specific child (*the instance*).
- The **Room** is where delivery happens (*operational*) — it inherits the program's commercial context for placement but sets no price.
- The **Org → Location** cascade decides who may set or override the numbers (*configuration*).

This trichotomy — **commercial / operational / configuration ownership** — is itself doctrine. It generalizes: in every industry, *what is sold* (commercial), *where it is delivered* (operational), and *who sets the price* (configuration) are three different owners that must not be collapsed.

### The override cascade
```
Org default  →  Location override  →  Program (owns the matrix)  →  Enrollment override (negotiated)
```
Rooms are absent from this cascade by design.

---

## 5. Pricing doctrine — the Pricing Matrix as a first-class business object

The Pricing Matrix is not a UI and not a table. It is **the business object that maps a configuration of a commitment to a price.**

```
price = Matrix( dimensions , funding , time )
```

### 5a. Anatomy
- **Axes (dimensions)** — the choices that change *what is delivered*, and therefore the price. Childcare: **Schedule** (rows) × **Session** (columns), scoped to a **Program**. Generic: every commitment has configuration axes.
- **Cells** — a price per configuration. **Ragged by design** — not every cell exists (no AM-only infant care).
- **Funding overlay** — the cell *values* swap by **Funding Source** (private / subsidy / corporate). One grid, multiple value-sets.
- **Time** — the matrix is **temporal**. Prices have effective windows; rate increases are *scheduled future versions*, not destructive edits. An Enrollment either **locks** a version (price protection) or **floats** (follows increases) — a policy choice.
- **Overrides** — Location override and per-Enrollment negotiated override, by the §4 cascade.

### 5b. What is NOT a new matrix
From the structure doctrine, these resolve to existing primitives — **do not multiply matrices:**
| Looks like | Actually is |
|---|---|
| Punch card / Pack of 10 | **Enrollment Type** = metered commitment (Consumption-billed) |
| Drop-In | **Enrollment Type** = per-occurrence (Consumption-billed) |
| Unlimited | **Enrollment Type** = flat override of the matrix |
| Before / After Care | **Offerings** (transactions) that attach to an Enrollment |
| Before + After | An **Offering bundle** (composition, not a primitive) |
| Summer Camp | A **seasonal Program** — its own matrix and enrollment window |

### 5c. The universal claim
Every industry prices commitments through a matrix: fitness (tier × term), medical (plan × panel), trades (plan × property size), education (program × credit load). **The Pricing Matrix is the universal pricing primitive for Commitments.** Transactions, by contrast, carry a flat catalog price. Two pricing shapes, matching the two archetypes.

---

## 6. Funding doctrine — separate Who / How Much / Why

Funding is a first-class domain *because it is industry-universal*: subsidy, insurance, employer benefit, scholarship, warranty are all the same shape — a third party who pays some of the bill under an agreement. The error is treating "who pays" as one concept. It is three.

| Question | Concept | Definition |
|---|---|---|
| **Why** do they pay? | **Funding Source** | The basis/agreement: private choice, subsidy authorization, employer benefit, scholarship award. Selects which **rates** apply (the price-list overlay) and establishes the agreement. |
| **Who** pays? | **Payer** | The responsible party or parties: family, agency, employer, fund. A bill may have several. |
| **How much** does each pay? | **Allocation** | The split rule: an agency cap, a family co-pay, a percentage, a fixed employer contribution. |

```
Enrollment price
   → Funding Source selects the rates (Why)
   → split across Payers (Who)
   → by Allocation rules (How Much)
   → produces one Obligation per Payer
```

**Each payer's portion is its own Obligation → its own Charge → its own Invoice.** This is why making Funding explicit makes Billing and Posting *simpler* rather than harder: split billing is native, not a special case. Subsidy co-pays, employer-sponsored seats, and scholarship-funded enrollments are all the same mechanism with different agreements.

**Generalization:** Medical = insurance (Why: coverage; Who: insurer; How much: allowed amount + patient responsibility). Trades = home warranty. Fitness = corporate wellness benefit. The third-party-payer-with-a-split is one of the most reused patterns in the entire model.

---

## 7. Fees & Add-Ons doctrine (Transactions)

Transactions are the catalog (the surviving, narrowed role of "Services"). Two operator-facing kinds:

- **Fee** — a required / administrative charge: **Registration, Supplies, Late Pickup, Late Fee.** *(The fine print.)*
- **Add-On** — an optional purchasable extra: **Meals, Transportation, Field Trips, Before/After Care.** *(The menu.)*

| Term challenged | Verdict |
|---|---|
| Service | **Retired** — overloaded; was conflating commitment + transaction |
| Commercial Offering / Ancillary Offering | **Internal only** — operators don't say it |
| Product / Activity | Rejected — retail / too narrow |
| **Fee / Add-On** | **Canonical** — directors think in these two words |

Each Transaction has a **billing trigger** (once / periodic / per-event / metered) — surfaced to operators as a simple "how often" setting, never as "charge template." Camp is *not* an add-on — it is a seasonal **Program** (a commitment). Consumables and per-meal charges are **metered Transactions** through the Consumption engine.

---

## 8. Financial Rules doctrine — definition scope vs. application point

The prompt's list mixes two different axes. The clean doctrine: **every policy is *defined* at a scope and *applied* at a moment.** These are independent.

- **Definition scopes** form a cascade: **Organization → Location → Program → Enrollment.** (A policy is set high and overridden lower.)
- **Application points** are moments in the lifecycle where a policy *acts*: **Enrollment · Charge · Funding · Payment · Posting.** (These are not scopes — they are when the rule fires.)

> The prompt listed "Pricing, Charge, Funding" alongside "Org, Location, Program." That conflates *objects a policy acts on* with *scopes that own a policy*. Untangling them is the doctrine.

| Policy | Defined at (scope) | Applied at (moment) |
|---|---|---|
| Billing cadence | Program (org default) | Billing |
| Proration | Organization | Enrollment / Charge |
| Deposit | Program (org default) | Enrollment |
| Withdrawal notice | Organization / Program | Enrollment (end) |
| Vacation / absence credit | Organization / Program | Consumption → Charge |
| Discounts (sibling/staff/scholarship) | Organization (catalog) | Enrollment / Funding |
| Late fee | Organization | Charge / Collections |
| Refund | Organization | Payment |
| Credit | Organization | Charge |
| Write-off | Organization (governed) | Charge / Collections |
| Adjustment approval | Organization (governance) | Charge |
| Posting review | Organization (governance) | Billing → Accounting boundary |

**Most policies are defined org-wide and applied at one specific moment.** Governance policies (adjustment approval, posting review, write-off) are about *who may act*, not *what is charged* — they belong to the org's control layer and are invisible to the parent.

---

## 9. The canonical relationship model

```
                         ┌──────────────── LAYER A: COMMERCIAL OPERATING MODEL ────────────────┐

  CATALOG                 PRICING                    FUNDING                    ENROLLMENT
  ───────                 ───────                    ───────                    ──────────
  Program ──── owns ────▶ Pricing Matrix             Funding Source (Why) ───┐
   (commitment)           axes: Schedule × Session    Payer (Who)            │
   delivered in Room       values per Funding Source  Allocation (How Much)  │
   (operational,                  × Time (versioned)                         │
    no price)                          │                                     ▼
  Offering  ───────────▶ catalog price │                       ENROLLMENT = Program + Schedule
   (Fee / Add-On,                      └──────────────────────▶  + Session + Funding + Discounts
    transaction)                                                  + Policies  → recurring tuition
                                                                       │
                         ┌──────────────── LAYER B: REALIZATION ───────────┼───────────────────┐
                         │                                                 │                    │
  CONSUMPTION ──────────▶ Attendance & Usage ──(metered)──┐                │                    │
   (what happened)        late pickup · drop-in · meals    │               │                    │
                                                           ▼               ▼                    │
  BILLING ──────────────────────────────────────▶  OBLIGATION  ──▶  DRAFT CHARGES  ──▶  CHARGE  │
   (periodic + event + metered)                    (per payer)      (review)        (convergence)│
                                                                          │                      │
  ACCOUNTING ─────────────────────────────────────────────────▶ Finalize → Ledger → GL (hidden) │
                                                                          │                      │
  MONEY ──────────────────────────────────────────────▶ Invoice → Payment → Allocation →        │
   (payments & collections)                              Collections / Write-off                 │
                         └──────────────────────────────────────────────────────────────────────┘

  REPORTING & PARENT PORTAL  read across every domain (consumers, not owners)
```

**One sentence:** *A Program owns a versioned Pricing Matrix; a family's Enrollment resolves one cell of it under a Funding arrangement; that plus Offerings and Consumption produce Obligations; Obligations become Charges; Charges become Invoices and post silently to the ledger; money is received and allocated back.*

---

## 10. Operator journey — a brand-new center, from nothing to first invoice

| # | Step | What they configure | Scope | BOS recommends | Derived / Automatic | Never sees |
|---|---|---|---|---|---|---|
| 1 | **Organization** | Name, financial defaults (cadence, proration, late fee, deposit, notice) | Org | Vertical default policy pack | — | Ledger/GL setup |
| 2 | **Locations & Rooms** | Sites, rooms (capacity, ratios) | Location | Room/ratio templates | — | Pricing (rooms have none) |
| 3 | **Programs** | Sellable commitments (Infant…Pre-K) | Program | Standard childcare programs | Age-band mapping | — |
| 4 | **Schedules & Sessions** | The matrix axes (5/4/3-day; full/half/AM/PM) | Program | Standard axis set | — | "dimensions" |
| 5 | **Tuition Grid** ★ | Fill the grid per program | Program | **Pre-fill from market benchmarks** | Empty cells flagged | "pricing matrix" |
| 6 | **Funding Sources** | Private (default) + subsidy/corporate; payers & splits | Funding | Common agency/employer templates | Co-pay = price − cap | "payment allocation" |
| 7 | **Discounts** | Sibling, staff, scholarship | Org | Standard discount catalog | — | — |
| 8 | **Fees & Add-Ons** | Registration, supplies, meals, field trips, before/after + "how often" | Catalog | Typical fee set | — | "charge template" |
| 9 | **Enroll first family** | Pick Program + Schedule + Session + Funding + Discounts | Enrollment | Best-fit program by age | **Recurring tuition charge derived** | "obligation" |
| 10 | **Attendance happens** | (nothing) | — | — | **Attendance & Usage captured; metered items accrue** | "operational consumption" |
| 11 | **Billing run** | (nothing) | — | "Ready to bill" nudge | **Draft Charges generated** (periodic + event + metered + splits) | Ledger |
| 12 | **Review & Finalize** ★ | Approve Draft Charges | Charge | Flags anomalies for review | **Invoice sent; posting silent** | "posting" |

**The two ★ steps are the product.** Step 5 must feel like editing the rate sheet they already own. Step 12 must feel like a one-click review. Everything between them the system derives. The director's *last verb is Finalize* — accounting never surfaces.

---

## 11. Future-industry validation

The model is doctrine only if it survives beyond childcare. It does — childcare is one row.

| Industry | Commitment (matrix-priced) | Transaction (catalog) | Consumption (metered) | Funding (3rd-party) |
|---|---|---|---|---|
| **Childcare** | Enrollment (program × schedule × session) | Registration, field trip | Drop-in, late pickup, meals | Subsidy, employer |
| **Fitness** | Membership (tier × term) | PT package, merch | Drop-in class, class-pack | Corporate wellness |
| **Medical** | Care plan / concierge (plan × panel) | Visit, procedure | Supplies, per-unit tests | Insurance (allowed + patient resp.) |
| **Trades** | Maintenance contract (plan × property) | Project / job | Materials, labor hours | Home warranty |
| **Professional svcs** | Retainer (level × term) | Fixed-fee engagement | Billable hours | Insurer / third-party |
| **Hospitality** | Membership / season pass | Booking | Incidentals | Corporate account |
| **Education** | Tuition (program × credit load) | Course / exam fee | Lab materials | Grant / scholarship / employer |

Every industry maps onto the same five primitives — **Commitment, Transaction, Consumption, Pricing Matrix, Funding (Source/Payer/Allocation)** — with the same commercial/operational/configuration ownership split. **The model survives.** What changes per industry is vocabulary and the contents of the catalog, never the shape. That is exactly the property a foundational doctrine must have.

---

## 12. Final recommendations

1. **Adopt the two-archetype model — Commitment and Transaction — as the root of all commerce in Alloy.** Everything sold is one or the other.
2. **Treat Consumption as a billing trigger, not a third archetype.** One consumption engine serves all metered billing across both archetypes.
3. **Organize the platform around eight domains in two layers** (Catalog / Pricing / Funding / Enrollment ‖ Consumption / Billing / Accounting / Money), connected by one contract: **everything emits an Obligation; every Obligation becomes a Charge.**
4. **Lock the three ownerships:** commercial = **Program**, operational = **Room**, configuration = **Org → Location**. Tuition is Program Pricing resolved as Enrollment Pricing; never Room Pricing.
5. **Make the Pricing Matrix a first-class, versioned, overridable business object** — `price = f(dimensions, funding, time)` — and refuse to multiply matrices for punch-cards, drop-ins, bundles, or camp (they resolve to Enrollment Types, Offerings, or seasonal Programs).
6. **Make Funding first-class and three-part** (Source / Payer / Allocation). Third-party billing then falls out as native split-billing, simplifying Billing and Posting.
7. **Govern policies by definition-scope × application-point**, not by a flat list. Keep governance policies (approval, posting review, write-off) in the org control layer, invisible to parents.
8. **Hide accounting end-to-end.** The operator's vocabulary and last verb are commercial; posting, ledger, and GL never surface.

### Success criteria — the four answers
| Question | Answer |
|---|---|
| **What do businesses sell?** | **Commitments** (recurring access, matrix-priced) and **Transactions** (discrete deliverables, catalog-priced), drawn from a **Catalog**. |
| **What do customers buy?** | An **Enrollment** (a configured Commitment) plus **Offerings**, funded by one or more **Payers** under a **Funding Source agreement**. |
| **What do operators configure?** | The four commercial domains: **Catalog, Pricing (the Grid), Funding, and Policies.** |
| **What does the platform derive?** | Everything else — **Obligations, Charges, splits, proration, discounts, posting, collections** — from Enrollment + Consumption. |

> **Everything else falls out of this.** Enrollment, Scheduling, Attendance, Consumption, Billing, Posting, Payments, Reporting, and the Parent Portal are all *consumers* of the four commercial domains. Define what is sold, bought, funded, and held — and the rest of the platform is downstream of that definition. That is why this is doctrine.
