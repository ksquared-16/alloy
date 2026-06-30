# Alloy Commercial Language Bible — V1

**Status:** Proposal / canonical-language-in-deliberation (not frozen)
**Date:** 2026-06-30
**Builds on:** [commercial-model-v2-reframing.md](commercial-model-v2-reframing.md) — that doc settled the *structure* (two spines: matrix-priced Enrollment + a catalog of extras). This doc settles the *language* on top of that structure. The structure does not change; the words an operator sees do.
**Mandate:** Determine the canonical operator vocabulary. Challenge every term — including the ones the V2 reframing introduced.

---

## 0. The governing test

> **Would a childcare director say this word, unprompted, on a tour, without training?**

Every term below is judged by that single test. If a director would not say it, it is a *system word* and must be demoted behind the scenes — never shown in an operator-facing surface. This is the line that decides everything.

A corollary: **the V2 reframing's own terms are not exempt.** "Pricing Matrix," "Price List," and "Offering" are accurate system words, but a director does not say them. They get demoted here. The architecture keeps them internally; the operator never sees them.

---

## 1. The most important answer

When a director configures pricing, they think in **Tuition** and **Fees**.

- **Tuition** is the recurring price of a child's spot. They keep it as a **grid**: *how many days down the side, how long each day across the top, and the whole grid changes depending on who's paying.*
- **Fees** (and a few **Add-Ons**) are the extra things they charge for: registration, supplies, field trips, meals.

That is the entire commercial language in one breath. Everything below is just making each of those words precise and director-true.

---

## 2. The term-by-term verdicts

Each verdict gives the **operator word** (canonical), what it **replaces**, and the **why** — measured against the governing test.

### Program — **SURVIVES (first-class)**
Directors say "program" constantly: *"our Toddler program," "the Pre-K program," "summer camp."* It is in every parent handbook.
- Rejected: *Offering* (SaaS), *Enrollment Program* (redundant — you enroll **in** a program), *Commercial Program* ("commercial" is a system word), *Learning Program* (too narrow — camp isn't "learning").
- **Verdict: keep Program.** It is the single strongest operator word in the set. A Program is the age-banded / curricular unit that **owns the Tuition Grid**.

### Room — **SURVIVES (operational, not commercial)**
Directors say *"the Toddler room," "Ms. Garcia's room," "Room 3."* A Room is where the child physically is: a teacher, a ratio, a capacity, a place the child socially belongs.
- A Room is **operational + capacity + placement + relationship**. It is **not** pricing.
- **Verdict: keep Room as an operational word; keep it out of the commercial language.** Price follows the *Program*; placement follows the *Room*. At small centers one Room = one Program, and that's fine — they stay separate words so they can diverge. ("Classroom" is a synonym; **Room** is canonical.)

### The price grid — **Pricing Matrix → "Tuition Grid"**
Directors say **tuition**, never "pricing matrix." The artifact they already maintain is a grid / rate sheet.
- Rejected: *Rate Plan* (telecom), *Pricing Matrix* ("matrix" is math/system — my own prior term, demoted), *Pricing Table* (generic), *Pricing Schedule* / *Tuition Schedule* (**"schedule" collides** hard with staff/room scheduling — fatal).
- **Verdict: Tuition Grid** (operator-canonical). *Pricing Matrix* becomes the internal name only. The Tuition Grid is the **primary thing a director configures**.

### Attendance Pattern — **split into "Schedule" + "Enrollment Type"**
Directors say *"she comes 3 days," "she's on a 5-day schedule," "MWF."* But "5 days" and "drop-in" are not the same kind of thing, so one word can't carry both.
- Rejected: *Attendance Pattern* (system), *Pricing Pattern* (it's not about price), *Schedule Pattern* (redundant), *Commitment* (too contractual — a director doesn't ask "what's your commitment?").
- **Verdict — two words:**
  - **Schedule** — *which days*: 5-day, 4-day, 3-day, MWF, Tu/Th, Custom. (The grid's **row axis**.)
  - **Enrollment Type** — *the shape of the commitment*: **Recurring** (a Schedule), **Drop-In**, **Punch Pass**, **Unlimited**. Directors say "drop-in," "punch pass," and "unlimited" directly, so those surface as-is.
- **Known risk:** "Schedule" collides with staff/room scheduling. In any ambiguous surface, qualify it as **"Attendance Schedule."** This is the one term with real collision danger and must be scoped carefully in UI.

### Day Shape — **→ "Session"**
Directors say *"full day or half day?" "AM or PM?"* Preschools genuinely say **session** — "morning session," "AM/PM session," "full-day session."
- Rejected: *Day Shape* (a director would never say "what's the day shape?" — my own prior term, demoted), *Attendance Window* / *Schedule Window* / *Program Window* ("window" is a system word).
- **Verdict: Session.** Full-Day, Half-Day, AM, PM. (The grid's **column axis**.)
- **Important cut:** *Before Care / After Care / Before+After are NOT Sessions.* They wrap a core day → they are **Add-Ons** (see §2 Fees & Add-Ons). This keeps the grid clean.

So the Tuition Grid reads exactly as a director reads their rate sheet: **rows = Schedule (how many days), columns = Session (how long each day).**

### Price Lists / Funding Types — **→ "Funding Source" (+ "Discount" + "Who Pays")**
The prompt's list ("Private, Corporate, Subsidy, Employee, Sibling, Scholarship, Seasonal") is three different things wearing one label. Director language separates them cleanly:
- **Private / Subsidy / Corporate** → **Funding Source.** Directors say *"she's a subsidy family," "that's a corporate contract," "private pay."* Switching Funding Source swaps the rates the grid shows — exactly the "switch and watch it change" behavior.
- **Sibling / Scholarship / Employee (Staff)** → **Discount.** Directors say *"sibling discount," "staff discount," "scholarship."* These layer on top of a rate; they do not have their own grid.
- **Seasonal** → not a funding source at all; it's a time-bound rate, and Summer Camp is its own **Program**. Fold in there.
- Rejected umbrella terms: *Price List* / *Pricing Profile* (system — my own prior term, demoted), *Commercial Agreement* (the contract idea is real but it's the **payer agreement**, see Who Pays).
- **Verdict: Funding Source** (the rate/payer pivot), **Discount** (the reductions), and **Who Pays** for the billing split (family / agency / employer). Directors say all three.

### Commercial Offerings — **→ "Fees" and "Add-Ons"**
Directors don't say "offerings." They say **fees** and **extras / add-ons**. And the two are genuinely different in their minds:
- **Fee** — a charge for something required or administrative: **Registration Fee, Supply Fee, Late Pickup Fee, Late Fee.** (On the *fine print*.)
- **Add-On** — an optional purchasable extra: **Meals, Transportation, Field Trips, Before/After Care.** (On the *menu*.)
- Rejected: *Offerings* (SaaS — my own prior term, demoted), *Products* (retail), *Services* (the overloaded word we are retiring), *Charge Templates* (pure system), *Activities* (too narrow), *Ancillary Services* (accounting/contract speak).
- **Verdict: Fee and Add-On.** Internally these can be one catalog; operator-facing they are two words because directors think in two words. (Note: **Camp** is usually a seasonal **Program**, not an add-on — it has its own grid.)

### Financial Policies — **→ "Policies" (with operator-named specifics)**
Directors say *"our late fee policy," "our two-week notice policy,"* but never "financial policy" as a noun. Keep **Policy** as the umbrella; force the specifics into operator words and hide accounting jargon.
- **Operator-natural (keep):** Late Fee, Late Pickup Fee, Deposit, Proration *("we prorate the first month")*, Withdrawal Notice *("two weeks' notice")*, Vacation Credit / Absence Credit, Sibling/Staff Discount, Annual Rate Increase.
- **Accounting language (rename or hide):** "NSF" → **Returned Payment Fee**; "Revenue Recognition," "Accruals," "Deferred Revenue" → **hidden entirely** (back-office only).
- **Verdict: Policies**, named in operator terms. The distinction a director feels: **Fees/Add-Ons are on the menu; Policies are the fine print** (rules that *generate* a charge under a condition).

### Enrollment — **SURVIVES (first-class)**
*"She's enrolled," "enrollment paperwork," "we're at full enrollment."* Native. **Enrollment** is the child's spot — the runtime relationship (Program + Schedule + Session + Funding Source + Discounts + Who Pays).
- **Verdict: keep Enrollment.** Strong.

### Operational Consumption — **→ "Attendance & Usage"**
A director never says "operational consumption." But the pipeline behind drop-ins, late pickups, per-day meals, and punch passes is real. The director experiences it as *what actually happened*: she attended, she stayed late, she had lunch three times.
- **Verdict:** Operator-facing = **Attendance & Usage** (what happened that we bill for). *Operational Consumption* stays as the internal pipeline name.

### Charge / Invoice — **SURVIVE (keep)**
Directors say *"charge," "bill," "invoice."* Line-level amount = **Charge**; the document sent to the family = **Invoice** (or **Statement**). **Draft Charges** before they're finalized — directors understand "draft."
- **Verdict: keep Charge, Invoice, Draft Charges.**

### Posting — **→ hidden; operator sees "Finalize" / "Send"**
"Post to the GL" is pure accounting. A director does not say it and should never see it.
- **Verdict:** *Posting* is **hidden plumbing.** The operator action is **Finalize** (turn Draft Charges into a real Invoice) / **Send**. Posting happens silently behind Finalize.

### Charge Template / Charge Resolution — **→ hidden (a billing setting)**
A director never says "charge template." When they set up a Fee, they just choose **how often it bills** ("once," "monthly," "per day").
- **Verdict:** hidden. Surfaced only as a simple "how often" setting on a Fee/Add-On.

---

## 3. Vocabulary Dictionary

| Canonical term | What it means (operator definition) | Replaces (system word) | A director would say… |
|---|---|---|---|
| **Program** | The age-banded / curricular unit that owns a Tuition Grid | service offering (enrollment side) | "Our Toddler program is full." |
| **Room** | The physical space a child is placed in (capacity, ratio) — *not* a price | location (unit) | "She's in Ms. Garcia's room." |
| **Tuition Grid** | The grid of recurring prices for a Program | pricing matrix | "I need to update my tuition grid." |
| **Schedule** | Which days a child attends (5-day, MWF, …) — the grid's rows | attendance pattern | "She's on a 3-day schedule." |
| **Enrollment Type** | The commitment shape: Recurring / Drop-In / Punch Pass / Unlimited | pricing mode / commitment | "Is this drop-in or a punch pass?" |
| **Session** | How much of the day: Full / Half / AM / PM — the grid's columns | day shape | "AM session or full day?" |
| **Funding Source** | Who funds the spot & which rates apply: Private / Subsidy / Corporate | price list / pricing profile | "She's a subsidy family." |
| **Discount** | A reduction layered on a rate: sibling / staff / scholarship | adjustment policy | "They get the sibling discount." |
| **Who Pays** | The billing split across responsible parties: family / agency / employer | payer / payment allocation | "The agency pays, family covers the co-pay." |
| **Enrollment** | A child's spot: Program + Schedule + Session + Funding + Discounts + Who Pays | job (recurring) | "He's enrolled for fall." |
| **Fee** | A required/administrative charge: registration, supplies, late pickup | offering / charge template | "There's a registration fee." |
| **Add-On** | An optional purchasable extra: meals, transport, field trips, before/after | offering / charge template | "Do you want the meal plan add-on?" |
| **Policy** | A rule that generates a charge under a condition (late fee, proration, deposit, notice, vacation credit) | financial policy | "Our policy is two weeks' notice." |
| **Attendance & Usage** | What actually happened that we bill for (attended, late pickup, meals) | operational consumption | "She stayed late twice this week." |
| **Charge** | A single amount owed | charge | "I'll add that charge." |
| **Draft Charges** | Charges pending review before invoicing | draft obligation / draft charge | "Let me check the draft charges." |
| **Invoice** | The bill sent to the family | — | "Her invoice went out Friday." |
| **Finalize** | Turn Draft Charges into an Invoice (posting happens silently) | posting | "I'll finalize and send these." |

---

## 4. Operator mental model

A director thinks in this order. This sequence *is* the configuration flow.

1. **"What programs do I run?"** → Programs (Infant, Toddler, Preschool, Pre-K, + Camp seasonally)
2. **"What schedules can families pick?"** → Schedules (5/4/3-day, MWF) + Enrollment Types (drop-in, punch pass, unlimited)
3. **"How long each day?"** → Sessions (full, half, AM, PM)
4. **"Fill in the tuition."** → the **Tuition Grid** — *their spreadsheet, on screen*
5. **"Who's paying, and at what rates?"** → Funding Sources (private / subsidy / corporate)
6. **"Any discounts?"** → Discounts (sibling / staff / scholarship)
7. **"What's the fine print?"** → Policies (late fee, deposit, proration, notice, vacation credit)
8. **"What else do we charge for?"** → Fees & Add-Ons (registration, supplies, meals, field trips, before/after)

Then, at runtime, the director never re-configures — they just *enroll a child* (steps that pick one cell of the grid) and *review draft charges* before finalizing. **Step 4 is the heart.** If it feels like editing the rate sheet they already own, the language is right.

---

## 5. End-to-end example (the walkthrough, in canonical language)

| Director's flow | Canonical term | Natural? |
|---|---|---|
| Toddler | **Program** | ✓ "the Toddler program" |
| 5 Days | **Schedule** | ✓ "a 5-day schedule" |
| Full Day | **Session** | ✓ "full-day session" |
| Private Pay | **Funding Source** | ✓ "private pay" |
| Weekly Tuition | recurring charge from the **Tuition Grid** | ✓ "weekly tuition" |
| Registration Fee | **Fee** | ✓ "registration fee" |
| Field Trip | **Add-On** | ✓ "the field trip" |
| Late Pickup | **Late Pickup Fee** (a **Policy**, fired by **Attendance & Usage**) | ✓ "late pickup fee" |
| Meals | **Add-On** | ✓ "the meal plan" |
| Final Draft Charges | **Draft Charges** → **Finalize** → **Invoice** | ✓ "let me finalize these" |

**Every operator-facing term passes the test.** The only system words anywhere near this flow — pricing matrix, charge template, operational consumption, posting — are all demoted or hidden. A director reads this top to bottom with zero training.

---

## 6. Relationship model (business concepts, not tables)

```
PROGRAM  (Toddler)
  │  owns
  ▼
TUITION GRID
  rows ───▶ SCHEDULE        (5-day, 3-day, MWF, …)   ── plus ── ENROLLMENT TYPE (Recurring / Drop-In / Punch Pass / Unlimited)
  cols ───▶ SESSION         (Full, Half, AM, PM)
  rates shown per FUNDING SOURCE (Private / Subsidy / Corporate)
  offered in ROOMS          (placement & capacity — never price)

        │  a family enrolls a child
        ▼
ENROLLMENT  =  Program + Schedule + Session + Funding Source
                 ├─ DISCOUNTS   (sibling / staff / scholarship)
                 ├─ WHO PAYS    (family / agency / employer)
                 └─ POLICIES    (late fee, proration, deposit, notice, vacation credit)
        │
        ├─ recurring TUITION charge (weekly / monthly)
        │
        ├─ FEES & ADD-ONS attach:
        │     Registration Fee · Supply Fee   (Fees)
        │     Meals · Transport · Field Trips · Before/After Care   (Add-Ons)
        │
        └─ ATTENDANCE & USAGE generates charges:
              Late Pickup → Late Pickup Fee
              Drop-In day → per-day charge
              Punch Pass  → consume one day

ALL OF IT ──▶ DRAFT CHARGES ──▶ (director reviews) ──▶ FINALIZE ──▶ INVOICE to the family
                                                          └─ posting happens silently (hidden)
```

---

## 7. Terms that should disappear (system words — internal only, never operator-facing)

Pricing Matrix · Rate Plan · Rate Rule · Charge Template · Charge Resolution · Price List · Pricing Profile · Pricing Dimension · Service Offering · Service Plan Template · Day Shape · Attendance Pattern · Pricing Mode · Operational Consumption · Posting · NSF · Revenue Recognition · Accruals / Deferred Revenue.

*(These keep their schema names internally. The rule is only that an operator never sees them.)*

## 8. Terms that should be renamed

| From (system) | To (operator) |
|---|---|
| Services | **Fees & Add-Ons** |
| Pricing Matrix | **Tuition Grid** |
| Day Shape | **Session** |
| Attendance Pattern | **Schedule** (+ **Enrollment Type**) |
| Pack of 10 | **Punch Pass** |
| Price List / Funding Type | **Funding Source** |
| Adjustment | **Discount** |
| Payer / Payment Allocation | **Who Pays** |
| Financial Policies | **Policies** (operator-named specifics) |
| Operational Consumption | **Attendance & Usage** |
| Posting | **Finalize** (operator) / hidden |
| Draft Obligation | **Draft Charges** |

## 9. Terms that become first-class (the canonical operator vocabulary)

**Program · Room · Tuition Grid · Schedule · Enrollment Type · Session · Funding Source · Discount · Who Pays · Enrollment · Fee · Add-On · Policy · Attendance & Usage · Charge · Draft Charges · Invoice · Finalize.**

---

## 10. Migration impact

**This is a language migration, not a data migration.** Nothing in the schema must be renamed. The work is a **vocabulary mapping layer** between operator words and system tables:

1. **Glossary / label map** — one source of truth mapping each operator term to its system table/concept (the Dictionary in §3 is the seed).
2. **Operator-facing copy** — config screens, field labels, buttons, empty states, help text adopt the canonical words.
3. **New operator surfaces** — the Tuition Grid editor, Funding Source selector, Fees & Add-Ons catalog, Draft Charges review are authored in canonical language from day one.
4. **No table renames required** — system words (`pricing_matrix`, `charge_templates`, `operational_consumption`, posting) stay internal behind the map.
5. **One real risk to manage:** the **"Schedule" collision** with staff/room scheduling. Anywhere the two could be confused, the commercial surface uses **"Attendance Schedule."**

Because tuition was deferred from the May-2026 go-live, there is little legacy operator-facing copy to unwind on the enrollment side — the language can be set correctly before those surfaces are built.

---

## 11. Final recommendation

1. **Adopt this vocabulary as the Commercial Language Bible** and enforce it on every operator-facing surface across Financial Configuration, Enrollment, Scheduling, Attendance, Parent Portal, and Reporting. One language, everywhere a director (or parent) reads.
2. **Keep system names internal, behind a mapping layer.** Architecture (the two spines from the V2 reframing) is unchanged; only the words operators see change.
3. **The acceptance test for any future term is the governing test:** *would a director say it, unprompted, on a tour, without training?* If not, it is a system word and stays behind the scenes.
4. **Make the Tuition Grid the centerpiece** of Financial Configuration — it is the artifact directors already own, and getting it to *feel* like their rate sheet is the single highest-leverage UX outcome.
5. **Hide accounting end-to-end:** the director's last verb is **Finalize**; posting, ledgers, and GL never surface.

> The win condition: a childcare director sits down, sees "Programs," "Tuition Grid," "Funding Sources," "Fees & Add-Ons," and "Draft Charges," and starts working — because those are the words already in their head. When the language disappears, the platform is right.
