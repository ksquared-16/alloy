# Commercial Model V2 — Reframing

**Status:** ✅ **SHIPPED** — the two-spine structure this proposed is implemented in Commercial Platform V1 (2026-07-03). Retained as design rationale. Canonical: **[Commercial Platform V1](../../platform/commercial/commercial-platform-v1.md)**.
**Date:** 2026-06-30
**Trigger:** Implementation of Services exposed a product-model issue, not a UI issue.
**Mandate:** Determine the canonical commercial model. Do not defend the current model. Challenge it.

---

## 0. The one question

> **When a childcare director configures tuition, what are they actually configuring?**

Everything below is an attempt to answer that honestly, and to let the answer — not the current schema — determine the platform.

**The answer, stated up front:** They are filling in a **grid**. Rows are *how often the child comes*, columns are *how much of the day they stay*, the grid is scoped to *which program/age band*, and the whole grid swaps when *who is paying* changes. Then, separately, they keep a short **list** of extra things they charge for (registration, meals, field trips).

A director does not author "Services." A director authors a **Pricing Matrix** and a **catalog of Offerings**. The current model fails because it tries to express the matrix as a list of Services. That is the entire friction, and it is fatal to the current framing.

---

## 1. What the implementation actually revealed

The friction was read as "Services is hard to implement." It is not. The schema is fine. The friction is that **the Commercial Model is answering two different questions with one object**:

1. *"What recurring seat does this family hold, and at what price?"* — **Enrollment**
2. *"What discrete things can a family buy alongside that seat?"* — **Offerings**

Services answers (2) well. Services answers (1) badly — because (1) is not a catalog, it is a **priced matrix**. Forcing each matrix cell ("Toddler / 5-day / Full-day / Private-pay") to be a Service is what produces the dozens-of-near-duplicate-Services smell that operators recoiled from.

There is a **second conflation hiding inside the first**. The dimensions the prompt lists are not all the same kind of thing:

- **Program, Attendance Pattern, Day Shape** change *what is delivered* → they set the **list price**.
- **Rate Basis** (Private Pay / Subsidy / Corporate / …) does *not* change what is delivered — a subsidy child and a private-pay child in the same room on the same schedule receive the identical service. Rate Basis changes *which price applies and who pays*.

So the model is conflating **product dimensions** (what is delivered) with **commercial dimensions** (who pays, at what rate, with what adjustments). Untangling these two conflations is the whole job.

---

## 2. What a family is actually buying

There are exactly **two purchase archetypes**. Everything in the prompt's lists collapses into one of them.

### Archetype A — Enrollment (a relationship)
A **recurring seat** in a program, attended on a pattern of days, for a portion of each day, billed on a cycle (usually monthly). It is continuous, schedule-shaped, and is the primary economic relationship. It is **priced from a matrix**, not picked from a catalog.

> What's being purchased: *a place for my child, on this schedule, at this price, billed monthly.*

### Archetype B — Offerings (a catalog)
**Discrete things** bought alongside the seat — some required (registration, supply fee), some recurring (meals), some episodic (field trip), some seasonal (camp), some consumable (a pack of drop-in days). These genuinely *are* a catalog. This is what "Services" was always good at.

> What's being purchased: *and also, these specific items.*

**These two archetypes converge downstream.** Both ultimately produce **Obligations** (an amount owed, by someone, for a reason, on a date) → Charge → Ledger → GL. The convergence point is the **Obligation**, which already exists in the Operational Consumption pipeline. Getting the *front* clean (two archetypes) is what makes the *back* (Posting) simple — because everything funnels to Obligation regardless of which archetype produced it.

---

## 3. Canonical dimensions

The prompt's flat lists resolve into **two classes** of dimension. This separation is the core of V2.

### 3a. Product dimensions — *what is delivered* (set the list price)

| Dimension | Values (examples) | Nature |
|---|---|---|
| **Program** | Infant, Toddler, Preschool, Pre-K, School-Age, Summer Camp | The age-banded / curricular unit. **Owns the matrix.** |
| **Attendance Pattern** | 5/4/3/2 days, MWF, Tu/Th, Custom | *How often* — cadence of the seat. Has a **commitment type** (see 3c). |
| **Day Shape** | Full Day, Half Day, AM, PM | *How much of the day* — the core session. |

These three axes define a **matrix cell**, and a matrix cell has a **list price**.

> **Challenge resolved — are Attendance Pattern and Day Shape one dimension?** No. They are orthogonal: 3-day-full, 3-day-half, and 5-day-AM all coexist. Two axes.

> **Challenge resolved — "Before Care / After Care / Before+After" is not a Day Shape.** It is *wraparound care* that wraps a core day. It is an **Offering** (Archetype B) that attaches to an Enrollment, not a cell of the core matrix. Day Shape is only the *core session* (Full / Half / AM / PM). This is a clean cut that removes a lot of false matrix cells.

### 3b. Commercial dimensions — *who pays, at what rate* (do not change delivery)

"Rate Basis" is not one thing. It is three mechanisms wearing one label:

| Operator says | Actually is | Mechanism |
|---|---|---|
| Private Pay / Subsidy / Corporate | **Price List** | A named set of matrix *values* (an alternate rate card). Swapping it re-prices the whole grid. |
| Sibling / Scholarship / Employee | **Adjustment (Policy)** | A discount/credit *layered on top* of a price list. Does not have its own grid. |
| Agency / Employer (the payer behind subsidy/corporate) | **Payer / Responsibility** | *Who is billed* and how the obligation splits (family co-pay vs. agency portion). Pure billing/AR. |

This decomposition is the highest-leverage finding in this document. The operator *experiences* Rate Basis as a single pivot ("show me the subsidy grid"), and we should honor that in the UI — but **architecturally it resolves into Price List selection + Adjustments + Payer split**. Keeping these three separate is what makes third-party billing and Posting tractable instead of a special case bolted onto pricing.

### 3c. Commitment type — *the shape of the commitment* (a property of Attendance Pattern)

The prompt's "Pack of 10 / Unlimited / Drop-In" are **not** values on the days-per-week axis. They are a different *commitment model*:

| Commitment type | Pricing behavior | Runtime |
|---|---|---|
| **Scheduled** (X days/week) | Fixed recurring matrix price | Periodic obligation generation (monthly tuition) |
| **Unlimited** | Flat recurring price (overrides per-day matrix) | Periodic obligation, no per-visit metering |
| **Pack** (pack of 10) | Prepaid quantity | **Consumption pipeline** — consume 1 unit per attendance |
| **Drop-In** | Per-occurrence | **Consumption pipeline** — one obligation per attended day |

Pack and Drop-In are **consumption-based enrollment**, and they flow through the **existing Operational Consumption pipeline** (Fact → Candidate → Event → Obligation → draft Charge, V1, merged). Scheduled and Unlimited are **commitment-based** (fixed periodic). This unifies attendance: an Enrollment is either commitment-priced or consumption-priced, and the platform already has machinery for both.

---

## 4. Pricing ownership — Programs vs. Rooms

**Recommendation: price attaches to the Program. The Room owns nothing commercial.**

| Concept | Role | Owns price? |
|---|---|---|
| **Program** | Commercial / curricular unit, age-banded | **Yes — owns the Pricing Matrix.** |
| **Location / Site** | Where a program is offered | **Override only** (a scoped price list or multiplier — e.g. downtown costs more). |
| **Room / Classroom** | Physical licensed space (capacity, ratio, placement) | **No. Never.** Operational only. |

**Why not Rooms:** Price does not change because a toddler sits in Room 2A vs. 2B. Rooms are a *capacity and licensing* concept (ratios, placement, waitlist). Attaching price to rooms would explode the matrix and couple commerce to facilities. Rooms *inherit* the commercial context of the program they host, for placement — they never set price.

**Why Programs:** Operators say "Toddler tuition is $X." "Toddler" is a program/age-band. The program is the natural owner of a matrix, and programs are exactly what a director enumerates first.

**Inheritance / override chain:**
```
Org default price list
   → Program (owns the matrix: dimensions + base prices)
      → Location override (optional scoped price list / multiplier)
         → resolved price for an Enrollment
```
Rooms are absent from this chain by design. This matches the existing data: program is currently an option-set key (`childcare_program_type`), rooms are `locations` of `type='unit'`, and pricing already resolves per `vertical` + offering + dimensions.

---

## 5. The Pricing Matrix as the primary object

**Yes — but be precise about *which* primary, because there are two duals:**

- **Configuration-time primary object: the Pricing Matrix.** It is literally the artifact directors already maintain in a spreadsheet. The platform should let them author *that*, not transcribe it into Services.
- **Runtime primary object: the Enrollment.** An Enrollment is a *resolved selection over the matrix* (one cell) + adjustments + payer + schedule. It is what a family holds.

The Matrix is the **price source**; the Enrollment is the **priced instance**. Stating both resolves the "is the matrix THE object?" question without overclaiming.

### Matrix doctrine
1. The matrix is **N-dimensional**, presented as a **pivotable 2D grid**. Default view: rows = Attendance Pattern, columns = Day Shape, scoped to a selected Program and Price List. Operator pivots by Program and by Price List (Rate Basis).
2. Cells may be **null/disabled** (not every program offers AM-only). Matrices are allowed to be ragged.
3. Switching Price List (Private → Subsidy → Corporate) **re-prices the entire grid** — this is the operator's "switch and watch it change" mental model, and it is just selecting a different value-set for the same axes.
4. The matrix substrate **already exists** in schema (`pricing_dimensions`, `pricing_dimension_values`, `pricing_matrix`, `service_price_dimensions.dimension_type`). V2 mostly *re-roles* it from a square-footage tiering tool into the enrollment matrix.

### Pricing Matrix doctrine — formula
```
list_price = Matrix[ Program, Attendance Pattern, Day Shape ]   (selected Price List supplies the values)
effective_price = list_price  − Adjustments(sibling, scholarship, employee, …)
obligation(s) = split effective_price across Payers (family co-pay, agency, employer)
```

---

## 6. Commercial Offerings doctrine (the survivor)

Offerings are the catalog (Archetype B). This is what Services *was*, narrowed to its true scope.

```
Offering            (catalog item: registration, meals, supplies, field trip, diapers, before/after care)
  → Charge Template     (how it bills: one-time | per-day | per-period | per-event)
  → Charge Resolution   (when/whether it triggers: enrollment event | attendance | calendar | manual)
  → Obligation → Charge → Ledger → GL
```

- **One-time** (registration, supply fee) → fires on enrollment / annually.
- **Recurring** (meals at $X/month, before+after care) → periodic, like a mini-enrollment.
- **Per-event** (field trip, drop-in extra) → through the **consumption pipeline**.
- **Wraparound care** (before/after) → an Offering that attaches to an Enrollment; "Before+After" is a **bundle** of two offerings (see §7).

`charge_templates` and `charge_resolution` survive **unchanged** and serve Spine B.

---

## 7. Bundles — not a primitive

"Bundle" is a UX convenience, not a new object. Each example resolves to an existing primitive:

| "Bundle" | Resolves to |
|---|---|
| Before + After | **Offering composite** — two wraparound Offerings priced together |
| Pack of 10 | **Consumption plan** — prepaid quantity (commitment type = Pack) |
| Unlimited | **Rate Plan variant** — flat override of the matrix (commitment type = Unlimited) |
| Summer Camp | **A seasonal Program** — its own matrix, its own enrollment window |

**Doctrine:** do not make Bundle a first-class entity. It is a presentation/composition over Programs, Offerings, and commitment types. (Note: Summer Camp is a *Program*, not a bundle — it has its own grid.)

---

## 8. Third-party pricing (Subsidy / Corporate / Employer / Agency / Scholarship)

Already decomposed in §3b; the relationship model:

```
Enrollment → effective_price
   → Payer Model splits effective_price into Obligations by responsible party:
        • Family co-pay obligation        (billed to family)
        • Agency obligation (subsidy)      (billed to agency, often capped)
        • Employer obligation (corporate)  (billed to employer)
   → each Obligation → its own Charge → Ledger → GL
```

- **Subsidy/Corporate** select a **Price List** *and* introduce an external **Payer** with a **split** (agency pays capped portion, family pays the gap).
- **Scholarship/Sibling/Employee** are **Adjustments (Policies)** — discounts/credits, same payer (family or internal fund), no separate price grid.
- **Split billing** is therefore native: pricing produces one effective price; the payer model fans it into multiple obligations. This is why explicit Payer/Responsibility makes Posting *simpler* — each obligation already knows its payer and GL treatment.

---

## 9. Commercial Model V2 — the two spines

```
SPINE A — ENROLLMENT  (the recurring seat; matrix-priced)

  Program  ── owns ──▶  Pricing Matrix
     │                     axes:  Attendance Pattern × Day Shape   (product dims → list price)
     │                     values supplied by: Price List          (Rate Basis: private/subsidy/corporate)
     │
     └──▶ Enrollment  (resolved cell + schedule + commitment type)
              ├─ Adjustments (Policies: sibling, scholarship, employee)
              ├─ Payer Model (split: family / agency / employer)
              └─ commitment type → { Scheduled, Unlimited }  → periodic Obligations
                                  → { Pack, Drop-In }        → consumption-pipeline Obligations

SPINE B — OFFERINGS  (the catalog; template-priced)

  Offering ──▶ Charge Template ──▶ Charge Resolution ──▶ Obligations
     (registration, meals, supplies, field trip, diapers, before/after care)

CONVERGENCE

  Obligation ──▶ Charge ──▶ Ledger Transaction ──▶ GL Posting
  (both spines funnel here; consumption pipeline already feeds Obligation)
```

### Canonical vocabulary (the commercial language of Alloy)
**Program · Pricing Matrix · Product Dimension (Attendance Pattern, Day Shape) · Price List (Rate Basis) · Commitment Type · Enrollment · Adjustment (Policy) · Payer / Responsibility · Offering · Charge Template · Charge Resolution · Obligation · Charge · Ledger.**

Note what is *gone*: "Service" as the home of tuition; "Rate Plan / Rate Rule" as opaque hierarchy. They are replaced by named concepts an operator would recognize.

---

## 10. Operator mental model (this is also the configuration UI)

A director configuring tuition, in order:

1. **"What programs do I run?"** → Infant, Toddler, Preschool, Pre-K (+ Summer Camp seasonally) — *Programs*
2. **"What schedules can families pick?"** → 5/4/3/2-day; full/half/AM/PM — *Matrix axes*
3. **"Fill in the grid."** → the **Pricing Matrix** — *the spreadsheet they already keep*
4. **"Are there different rate cards?"** → Private Pay / Subsidy / Corporate grids — *Price Lists*
5. **"Any standing discounts?"** → 10% sibling, employee rate, scholarships — *Adjustments / Policies*
6. **"Who gets billed?"** → family; agency for subsidy; employer for corporate — *Payer Model*
7. **"What else do we charge for?"** → registration, supplies, meals, field trips, before/after — *Offerings*

Steps 1–6 are Spine A. Step 7 is Spine B. **Step 3 is the primary act.** If the platform makes step 3 feel like editing the spreadsheet they already own, the model is right.

---

## 11. Migration impact

The headline: **this is a re-rooting of language, not a rebuild.** The schema already generalized toward a matrix; the friction was that the *naming and operator model* hid it.

| V2 concept | Current substrate | Change |
|---|---|---|
| **Program** (owns matrix) | `childcare_program_type` option-set; `service_offerings` | Promote Program to first-class (table or `service_offerings.kind='program'`). **New role, mostly.** |
| **Offering** | `service_offerings` | Keep; narrow scope to Spine B (`kind='offering'`). |
| **Pricing Matrix** | `pricing_matrix` | Keep — re-role from square-footage to enrollment lookup. **Already exists.** |
| **Product Dimensions** (attendance, day shape) | `pricing_dimensions` / `pricing_dimension_values` / `service_price_dimensions.dimension_type` | Keep — add `dimension_type ∈ {program, attendance_pattern, day_shape}`. **Generic already.** |
| **Price List** (Rate Basis) | `service_plan_templates` / `pricing_modes` (partial) | **New first-class concept**: a named value-set over the matrix. Partial fit today. |
| **Commitment Type** | `pricing_modes`, `service_plan_templates.is_recurring` | Re-role to {Scheduled, Unlimited, Pack, Drop-In}. |
| **Adjustment** | Financial Policies | Keep — sibling/scholarship/employee become Policies. |
| **Payer / Responsibility** | `payment_allocations` (downstream only) | **New** — explicit payer split at obligation time. The genuinely new build. |
| **Enrollment** | `jobs` + `job_line_items` + `schedules` | Re-role: an Enrollment is a recurring Job whose line items resolve from the matrix. |
| **Charge Template / Resolution** | `charge_templates`, charge resolution | Keep — serve Spine B unchanged. |
| **Consumption (Pack/Drop-In)** | Operational Consumption V1 (merged) | **Reuse** — already built (Fact→Candidate→Event→Obligation→Charge). |
| **Obligation → Charge → Ledger → GL** | `charges`, `ledger_transactions`, `gl_*` | Keep — convergence point unchanged. |

**Genuinely new build:** (1) Program as first-class commercial owner; (2) Price List as a named value-set; (3) explicit Payer/Responsibility split. **Everything else is rename + re-role of existing, already-generic infrastructure.** Tuition was explicitly deferred from the May-2026 go-live, so there is little legacy enrollment data to migrate — this is close to greenfield on the enrollment side.

---

## 12. Recommendation

1. **Split the Commercial Model into two spines: Enrollment (matrix-priced) and Offerings (template-priced).** This is the load-bearing decision.
2. **Kill "Services" as the home of tuition.** Lift enrollment pricing out entirely into a **Program-owned Pricing Matrix**.
3. **Rename Services → Offerings** and narrow it to Spine B (registration, meals, supplies, field trips, wraparound care). Services survives *only* in this narrowed role.
4. **Make the Pricing Matrix the primary configuration object** and **Enrollment the primary runtime object.**
5. **Attach price to Program; let Location override; forbid Room from owning price.**
6. **Decompose "Rate Basis" into three mechanisms:** Price List (values), Adjustment/Policy (discounts), Payer/Responsibility (billing split). Build explicit Payer/Responsibility — it is the one genuinely new primitive and it makes third-party billing and Posting fall out cleanly.
7. **Treat Pack/Drop-In as consumption-based enrollment** routed through the existing Operational Consumption pipeline; Scheduled/Unlimited as commitment-based periodic obligations.
8. **Do not make Bundle first-class.** It composes over Programs/Offerings/commitment types. Summer Camp is a seasonal Program, not a bundle.

### Success-criteria verdicts
| Question | Verdict |
|---|---|
| Does **Services** survive? | **Partially** — only as the narrowed Offerings catalog (Spine B). |
| Is Services **renamed**? | **Yes** → **Offerings.** |
| Does Services **become Offerings**? | **Yes**, for its surviving scope. |
| Does **pricing move under Programs**? | **Yes** — Program owns the matrix; Location overrides; Room never. |
| Does the **Pricing Matrix become the primary pricing object**? | **Yes** at configuration time (Enrollment is the runtime dual). |

### Why this makes the rest of Financials simpler
Rate Plans, Operational Consumption, and Posting get simpler because **everything converges on the Obligation**, and each obligation now arrives already knowing its **payer, reason, and GL treatment** — because we separated *what is delivered* (matrix) from *who pays at what rate* (price list + payer + policy) at the very front. The complexity that was leaking backward into Posting was created by collapsing those concerns into "Services" up front. Fix the front, and the back stops being a special-case machine.

---

## Appendix — open questions to resolve before building

1. **Is Program a new table, or `service_offerings.kind`?** (Leaning: first-class table — it owns a matrix and an enrollment window, which `service_offerings` does not model.)
2. **Price List granularity:** one value-set per (Program × basis), or a shared value-set referenced by many programs? (Affects how "switch basis re-prices the grid" is stored.)
3. **Payer split rules:** are subsidy caps modeled per-agency (a payer profile) or per-enrollment? Co-pay = matrix price − agency cap, or an independently configured amount?
4. **Day Shape vs. wraparound boundary:** confirm Before/After are always Offerings, never matrix columns, across all operators we've seen.
5. **Multi-program children** (e.g., Preschool + After-Care + summer Camp): is that one Enrollment with multiple lines, or multiple Enrollments? (Leaning: one Enrollment, multiple matrix/offering lines, to keep a single billing relationship.)
