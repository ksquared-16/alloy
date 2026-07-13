---
owner: modules
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Alloy Financial Platform — Canonical Domain (frozen)

**Status:** Canonical domain doctrine (June 2026). **Frozen.** This document defines the **first-class financial entities** of the Alloy platform, their ownership, runtime, lifecycle, and configuration hierarchy — *before* further financial implementation continues. It is deliberately vertical-neutral: childcare is the first implementation, not the architecture.

> **Companion doctrine:** [`billing-financials-platform.md`](./billing-financials-platform.md) is the L5 *billing/posting* doctrine and as-built record. **This document is the upstream domain model** that billing, posting, payments, and subsidy all conform to. Where the two overlap, this domain model is canonical for *what the entities are*; the billing doc is canonical for *how L5 posting behaves*.
>
> **Layer model:** [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) (L1 Config → L2 Intent → L3 Projections → L4 Facts → L5 Consequences). Every financial entity below is placed on that axis. *(L3 "Expected X" values are **Projections** — derived; "Operational Expectations" is the separate authored ledger. See [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md).)*

**Scope of this freeze:** identify the canonical financial concepts and lock the invariants. It is **not** an implementation plan and intentionally contains no schema. The "Implementation implications before next build" section at the end states what must be true *before* code resumes.

---

## 0. The nine frozen determinations

1. **Service is first-class.** It is the foundational sellable that pricing, scheduling, attendance, billing, charge templates, posting, portal, registration, and reporting all reference. It deserves its own table with a stable id.
2. **The `org_settings.metadata.financials.services` catalog is temporary/interim.** It was a no-migration way to prove the authoring UX. It is **not** the home of Service and must not accrue more configuration. Service graduates to a table when implementation resumes.
3. **Charge is the lifecycle spine.** Charge Template, Charge Event, draft charge, posted charge, and invoice line are **not** separate entities — they are the configuration, trigger, and lifecycle stages around one **Charge**.
4. **Charge Event is a trigger fact.** It is the operational occurrence that instantiates a Charge ("Registration Approved", "Field Trip Scheduled", "Late Pickup recorded"). **Reuse `workflow_events` first**; only introduce a dedicated table if a single event must fan out to many charges.
5. **Third-Party Payer generalizes subsidy.** "Subsidy / Agency / Authorization / Claim" is the childcare instance of the universal **Third-Party Payer → Coverage → Claim → Settlement** pattern (insurance, employer benefit, marketplace, grant).
6. **Financial Policies are scoped and effective-dated** — never an org-only blob. They resolve through the same most-specific-wins hierarchy as every other configuration.
7. **Posting is the only authoritative money write.** Every other financial computation is recomputable.
8. **Resolution remains recomputable.** Rate Resolution → Charge Resolution → Financial Resolution write nothing authoritative; they can be discarded and rebuilt at any time.
9. **Financial periods are independent and may diverge.** Service, Billing, Posting, Accounting, Settlement, and Collection periods are distinct concepts and routinely differ.

These nine are the platform laws. Everything below elaborates them.

---

## 1. The layered domain model

The financial platform is five layers riding the operational truth-flow. A financial entity's layer determines its mutability and owner:

```
COMMERCIAL MODEL   (L1 config)  — what we sell & how it's priced
   Service · Package · Rate Plan · Rate Rule · Tax Rule · Discount/Promotion
   Charge Template · Financial Policy · GL Account · GL Mapping · Charge Category

COMMITMENT         (L2 intent)  — what a customer agreed to
   Agreement (= Subscription) · Responsibility Assignment · Coverage (Authorization)

OBLIGATION         (L4 fact + derived) — what is owed, and why
   Charge Event (trigger fact) · Charge (lifecycle: scheduled → draft) · Service Period

RESOLUTION         (derived, recomputable, NEVER authoritative)
   Rate Resolution · Charge Resolution · Financial (responsibility/coverage) Resolution

SETTLEMENT TRUTH   (L5 — the ONLY authoritative writes)
   Posting Run · Posted Charge · Invoice · Statement · Payment · Credit/Refund/Adjustment
   Claim · Settlement Run · GL Journal · Accounting Period
```

**Cardinal doctrine:** everything in RESOLUTION is recomputable and disposable; **only POSTING writes authoritative money truth.** This line keeps the platform safe across all verticals and is already enforced in the P3.x code.

---

## 2. Canonical entity map (tiers)

### Tier 1 — First-class entities (own table, stable id, FK'd across domains, audited)

| Entity | Layer | Note |
|---|---|---|
| **Service** | Commercial config | *Promote from org_settings.* The foundational sellable. |
| **Rate Plan** | Commercial config | Exists. Scoped, effective-dated container. |
| **Rate Rule** | Commercial config | Exists. *Must key off Service*, not only `schedule_basis`. |
| **Charge Template** | Commercial config | New. Defines triggered/derived charges + timing + GL + responsibility + category. |
| **Agreement** *(= Subscription)* | Commitment | Exists (`enrollment_agreement`, `job`). The universal billable commitment. |
| **Responsibility Assignment** | Commitment | New first-class relationship: party + share + basis, per agreement/charge. |
| **Coverage / Authorization** | Commitment | New (generalizes Subsidy Authorization). A third-party promise to pay. |
| **Charge** | Obligation → Settlement | The spine. Lifecycle: scheduled → draft → posted → invoiced → settled. |
| **Charge Event** | Obligation (L4 fact) | The trigger occurrence. **Reuse `workflow_events` first.** |
| **Invoice** | Settlement | Groups posted charges for presentation + AR. |
| **Payment** | Settlement | Money received. |
| **Posting Run** | Settlement | The batch execution that converts drafts → authoritative. Audit / idempotency / approval. |
| **Claim** | Settlement | New (generalizes Subsidy Claim). Reimbursement request to a payer. |
| **Settlement Run** | Settlement | New. Reconciles multi-party owed vs. collected (subsidy / insurance / marketplace). |
| **Third-Party Payer** *(Agency)* | Reference | New (generalizes Agency). The funding organization. |
| **GL Account** | Accounting config | Exists. |
| **Accounting Period** | Accounting | New. Fiscal period with open/closed state and GL lock. |
| **Tax Rule** | Commercial config | New. Jurisdictional tax config (generality; childcare often exempt). |

### Tier 2 — Configuration (first-class config rows; policy, not money)

GL Mapping (exists) · Charge Category (code-owned vocabulary) · Financial Policy (scoped — §6) · Discount / Promotion (rate/charge modifiers) · Package (Service bundle) · Billing / Posting / Settlement period **definitions** (cadence config).

### Tier 3 — Derived / recomputable (NEVER system-of-record)

Rate Resolution · Charge Resolution · Financial Resolution · Statement (a rendered snapshot — persisted for audit, but reproducible) · Expected revenue · AR aging.

### Tier 4 — Transaction *kinds*, NOT entities (categories/states on the Charge & Ledger spine)

Credit · Adjustment · Refund · Deposit · Discount line · Fee · Tax line. These are `charge_category` / ledger-transaction-type variants. (A Deposit is a liability-state Charge, not its own table.)

### Tier 5 — Adjacent / not financial-core

Offer (Sales/CRM — pre-agreement pricing presentation) · Promotion campaign (Marketing) · GL Journal lines (mechanical output of Posting, not authored).

---

## 3. Entity ownership (who configures vs. who runs it)

| Entity | Config owner | Operational runtime | Financial runtime | Processing | BOS | Reporting |
|---|---|---|---|---|---|---|
| Service | Financial Config | Scheduling, Attendance | Rate/Charge Resolution | — | — | ✓ |
| Rate Plan / Rule | Financial Config | — | Rate Resolution | — | — | ✓ |
| Charge Template | Financial Config | Triggers (events) | Charge Resolution | — | — | ✓ |
| Agreement | Enrollment/Sales | Enrollment | Charge/Financial Resolution | Onboarding | ✓ | ✓ |
| Responsibility | Financial Config + Agreement | — | Financial Resolution | — | ✓ | ✓ |
| Charge Event | Charge Template config | **Operational facts** | Charge Resolution | — | ✓ | ✓ |
| Charge | — | — | Resolution → **Posting** | Posting | ✓ | ✓ |
| Invoice / Statement | Posting policy | — | Posting | Billing run | ✓ | ✓ |
| Payment | Payment config | Portal / POS | Settlement | Collections | ✓ | ✓ |
| Posting Run | Posting config | — | **Posting (authoritative)** | Posting | ✓ | ✓ |
| Coverage / Claim / Settlement | Payer config | — | Settlement | Claims processing | ✓ | ✓ |
| GL Account / Mapping / Period | Accounting Config | — | Posting | Period close | — | ✓ |
| Tax Rule | Financial Config | — | Charge Resolution | — | — | ✓ |

Pattern: **Config authors; Resolution derives; Posting commits; Processing operates batches; BOS surfaces exceptions; Reporting reads everything.**

---

## 4. Runtime ownership (the three runtimes)

- **Operational Runtime** owns the facts that *trigger* money — attendance, schedule, enrollment, registration, work-order completion. Produces **Charge Events**.
- **Financial Runtime — Resolution** owns Rate → Charge → Financial Resolution. **Pure, recomputable, writes nothing authoritative.** Produces **draft Charges**.
- **Financial Runtime — Posting/Settlement** owns Posting Run, Invoice, Payment, Claim, Settlement, GL Journal, Period close. **The only authoritative writer.**

Keeping **Resolution and Posting as separate runtimes** is the single most important invariant. It exists in the P3.x code; this freeze makes it a platform law.

---

## 5. Canonical financial lifecycle

```
CONFIGURE   Service → Rate Plan/Rule + Charge Template + Tax + Policy + GL Mapping
   ↓
COMMIT      Agreement (Subscription) + Responsibility + Coverage/Authorization
   ↓
OPERATE     Service Period delivered  +  Charge Event (trigger fires)
   ↓
RESOLVE     Rate Resolution → Charge Resolution → Financial Resolution
            (responsibility split + coverage/subsidy split)   → DRAFT charges
   ↓
POST        Posting Run → Posted Charge → Invoice (+ Statement)        [authoritative]
   ↓
COLLECT     Payment → Credit / Refund / Adjustment → AR / Collection
   ↓
SETTLE      Claim → Settlement Run (third-party payer reconciliation)
   ↓
ACCOUNT     GL Journal → Accounting Period close → Reporting
```

Two refinements over a naive lifecycle: (1) an explicit **OPERATE/trigger** stage — charges originate from events, not only from rate plans; (2) **COLLECT and SETTLE are distinct** — collecting from the family is not the same as settling with the agency/insurer.

---

## 6. Configuration hierarchy (scope + policy inheritance)

Reuse the proven most-specific-wins, effective-dated resolver from Operational Configuration, extended with **Service** and **Agreement** as scope dimensions:

```
Organization → Location → Program → Room → Service → Rate Plan → Charge Template → Agreement → Context
                          (most specific wins; effective-dated at every level)
```

**Unifying decision:** the same scoped, effective-dated resolution that powers capacity/ratio/rate config also powers financial **policy**, **responsibility**, and **coverage**. One resolution engine, every financial decision.

Financial Policy attaches at the most natural level — never org-only:

| Policy | Natural level(s) |
|---|---|
| Proration / billing cadence | **Rate Plan** (already) · Service · Org |
| Grace period / late fee | Org · Location |
| Vacation / absence credit | Service · Program · Agreement |
| NSF fee · refund · write-off | Org (financial standard) |
| Deposit policy | Service · Agreement |
| Withdrawal policy | Program · Agreement |
| Discount eligibility | Service · Promotion |
| Tax | Location (jurisdiction) · Service |

**As-built (Commercial Model Slice C, migration `20260704120000`):** `financial_policies` is first-class, scoped (org / location / service / rate_plan; Agreement is the next dimension), and effective-dated, with a code-owned policy-type registry, typed `value` jsonb, and a pure most-specific-wins resolver. Configuration only — recomputable, posts nothing. **Charge Categories** were reviewed and kept **code-owned** (platform invariants), surfaced under Accounting as reference with GL-mapping status.

**As-built (Commercial Model Slice D, migration `20260705120000`):** the **Charge lifecycle** spine landed on the existing `charges` table — additive columns `occurs_on` / `billable_on` / `charge_template_id` / `service_id` (the frozen `status` / `charge_type` CHECKs, RLS, and the posted-charge immutability trigger untouched; "scheduled" is **derived** — `billable_on` in the future — not a new status). A pure, recomputable resolver turns a configured **Charge Template** + context into a draft/scheduled **Charge intent** (occurs-on, billable-on, amount, category, GL, responsibility, review, lifecycle status); the lifecycle service writes `status='draft'` rows **only**, idempotent on `metadata.resolution_key`, skipping any posted charge. It consumes Services, Charge Templates, and the posting-review Financial Policy, and is exercised end-to-end by a Charge Template Simulator under `/settings/financials`. **Charge Event remains a trigger fact** (`workflow_events`-first). Still **not Posting** — drafts are non-authoritative, write no AR/ledger/invoices, and recompute until Posting (separate, authoritative) writes the money truth.

---

## 7. Relationships

```
Service ──< Rate Rule >── Rate Plan
Service ──< Charge Template
Agreement >── Service                  (what this commitment buys)
Agreement ──< Responsibility Assignment >── Party (household | employer | Third-Party Payer)
Charge Template + Charge Event ──> Charge
Charge >── billable_source (Agreement | Job | …)     ← existing polymorphism; keep
Charge ──< Invoice ; Charge ──< Posting Run
Charge ──< Claim >── Coverage >── Third-Party Payer
Payment / Claim ──> Settlement Run
Charge Category ──> GL Mapping ──> GL Account ──> Accounting Period
```

---

## 8. First-class tables vs configuration vs derived (the determination)

- **Deserve first-class tables (promote/keep):** Service, Rate Plan, Rate Rule, Charge Template, Charge, Charge Event (or `workflow_events`), Agreement, Responsibility Assignment, Invoice, Payment, Posting Run, Coverage, Claim, Settlement Run, Third-Party Payer, GL Account, Accounting Period, Tax Rule.
- **Remain configuration:** GL Mapping, Financial Policy, Discount/Promotion, Package, Charge Category (code-owned), period **definitions** (cadence).
- **Remain derived (no system-of-record):** all three Resolutions, Statement, expected revenue, AR aging.
- **Remain transaction kinds (no table):** Credit, Refund, Adjustment, Deposit, Fee, Tax line, Discount line.
- **Adjacent (other domains):** Offer (Sales), Promotion campaign (Marketing).

---

## 9. Services — determination

**Promote Service to a first-class entity before any further financial implementation.**

- Referenced by **8+ domains** (Programs, Rooms, Rate Plans/Rules, Scheduling, Attendance, Billing, Charge Templates, Posting, Parent Portal, Registration, Reporting). Cross-domain references require a stable, FK-able id — `org_settings` JSON provides none.
- Must be **scoped and effective-dated** (a Service's name/availability changes per location/program over time). JSON cannot versioned-resolve.
- **Rate Rules must key off Service**, not only `schedule_basis`. Pricing should answer "Full-Time Care," with schedule basis a *dimension of* a Service rate rather than its identity.
- Future verticals make this non-optional: medical "procedure," HVAC "service line," restaurant "menu item," fitness "class/membership" are all **Service**.

The `org_settings` services catalog shipped in the Financial Configuration Convergence was **interim only**. **As-built (Commercial Model Slice A, migration `20260702120000`):** Service is now the first-class `financial_services` table, and `childcare_rate_plans.service_id` wires the Rate Plan → Service relationship. The org_settings services path has been removed. Charge Templates and Financial Policies (the remaining promotions) follow as their own vertical slices.

---

## 10. Charge Template vs Charge Event — determination

Three distinct concepts; do not collapse them:

| Concept | Layer | What it is |
|---|---|---|
| **Charge Template** | Config (L1) | The *rule*: what triggers a charge, occurs-on vs. billable-on timing, amount/rate source, category, GL, responsibility. |
| **Charge Event** | Operational fact (L4) | The *trigger occurrence* ("Registration Approved", "Field Trip Scheduled", "Late Pickup recorded"). References a template. **Reuse `workflow_events` first.** |
| **Charge** | Obligation → Settlement | The resulting *obligation*, whose lifecycle carries the timing divergence: `occurs_on`, `billable_on`, status `scheduled → draft → posted → invoiced → settled`. |

So "Field Trip scheduled today → charge created → billable in 3 weeks → invoiced next month" is: **Charge Event (today)** → instantiates a **Charge** in `scheduled` state (`billable_on` = +3 weeks) → Resolution drafts it when billable → Posting Run invoices it next month.

**Determination:** Charge Event is the **trigger fact** and largely already exists as `workflow_events` (converge, don't rebuild). The *scheduled future charge* is **not** a separate entity — it is the **Charge's genesis state**, so the Charge owns `occurs_on` / `billable_on`. Add a dedicated `charge_event` table **only** if one event must fan out to many charges (e.g., one field trip → 30 children) and a batch parent is needed.

**As-built (Commercial Model Slice B, migration `20260703120000`):** the `financial_charge_templates` table is now the first-class, effective-dated config for this concept — `service_id`, `charge_category`, `trigger_type`/`trigger_key`, `amount_strategy`, `occurs_on_strategy`, `billable_on_strategy`/`billable_offset_days`, `default_gl_mapping_key`, `default_responsibility_key`, `review_required`. It is configuration only (posts nothing); Charge Events remain trigger facts and the Charge lifecycle/Posting are unchanged and still to come.

**As-built (Operational Consumption Slice 1, migration `20260706120050`):** the *runtime contract* that interprets a trigger fact is now first-class — the **Consumption Event** (`consumption_events`), resolving to **Resolved Obligations** (`resolved_obligations`). The trigger fact still lives in `workflow_events`; "Charge Event" is retired only as a *runtime-contract name*, replaced by the Consumption Event, which carries the idempotent, recomputable interpretation and links (when drafted) to a `status='draft'` Charge. Consumption **consumes** the Slice D Charge Template resolver — it does not reimplement pricing — and posts nothing. See [`./operational-consumption-platform.md`](./operational-consumption-platform.md).

**As-built (Operational Consumption Slice 2, migration `20260707120000`):** Consumption now understands **recurring** obligations from an agreement + schedule. A pure schedule-interpretation engine maps a schedule mutation to zero-or-more obligation directives (a recurring schedule → recurring tuition; a replacement → proration credit + replacement tuition; a holiday override / exception / no-op → **no obligation**), and the service consumes **Rate Resolution** + the Charge Template resolver + **Financial Policies** (proration, billing cadence, posting review) to price/date them. One Consumption Event may resolve to **many** Resolved Obligations (`resolved_obligations.obligation_kind` + `period_start`/`period_end`, additive). Still no Posting.

**As-built (Operational Consumption Slice 4, migration `20260709120000`):** a **Draft Obligation Review** lifecycle (`resolved_obligations.review_status`: pending | review_required | reviewed | suppressed | stale — distinct from `status` and `charges.status`) gives operators a **pre-posting** surface to inspect every Resolved Obligation ("why does Alloy think this should be charged?"), mark reviewed / flag / suppress / restore / recompute, and decide future-Posting eligibility. Recompute replays the pipeline in preview (no writes). It posts nothing — Posting/invoices/payments/ledger remain downstream. See [`./operational-consumption-platform.md`](./operational-consumption-platform.md).

**As-built (Operational Consumption Slice 3, migration `20260708120000`):** every domain now enters one canonical **Consumption Pipeline** — Operational Fact → **Consumption Candidate** (normalized, non-persisted) → Consumption Event(s) → Commercial Resolution → Resolved Obligation → Draft Charge — sharing a single directive resolver that consumes the existing Rate Resolution + Charge Template resolver + Policies. **Attendance** is the first consumer: a pure interpreter turns attendance facts into events (check-out after the late threshold → `attendance.late_pickup` fixed fee; drop-in/extra/hourly → rate-derived; absence → vacation credit only if eligible; room transfer / on-time check-out / excused absence → **no event**). Explanation is first-class for created **and** suppressed obligations. This completes the runtime; Posting / Invoicing / Payments / GL remain downstream consumers.

---

## 11. Financial periods — determination

Distinct first-class concepts; they routinely diverge. Conflating them is a classic accounting defect.

| Period | Owner | Can diverge? | Configuration it owns |
|---|---|---|---|
| **Service Period** | Operational | — | Delivery window; derived from agreement/schedule. The "what was consumed." |
| **Billing Period** | Financial config | ✓ (bill May for June) | Cadence (monthly/biweekly/term), in-advance vs. arrears, proration. |
| **Posting Period** | Posting config | ✓ | Posting frequency, cutoffs, draft lifetime, batching. |
| **Accounting Period** | Accounting | ✓ | Fiscal calendar, open/closed, GL lock. First-class with state. |
| **Settlement Period** | Payer / Settlement | ✓ | Claim submission windows, reimbursement cadence per payer. |
| **Collection Period** | AR config | ✓ | Due dates, grace, dunning/aging schedule. |

**They should diverge — that is the point.** Service in June, billed in advance in May, posted June 1 into the June Accounting Period, subsidy claimed in August, collected over July–September. Each period answers a different question and owns its own configuration; the platform models them independently and lets a Charge reference its Service Period, Billing Period, and Accounting Period.

---

## 12. Future-industry coherence

The spine — **Service → Rate → Charge → Agreement → Posting → Invoice → Payment → Settlement → GL** — holds across verticals because "Subsidy" generalizes to "Third-Party Payer."

| Vertical | Service | Agreement | Charge Event | Third-Party Payer | Settlement |
|---|---|---|---|---|---|
| **Childcare** | Care type | Enrollment | attendance / late-pickup | Agency / Subsidy | Subsidy claim |
| **Medical** | Procedure / visit | Care plan | procedure performed | Insurer | Insurance claim |
| **HVAC** | Service line / part | Work order | job completed | Warranty provider | Warranty claim |
| **Restaurant** | Menu item | (none / tab) | order placed | Delivery marketplace | Marketplace payout |
| **Prof. services** | Engagement / T&M | Retainer / SOW | time logged | Client AP | — |
| **Fitness** | Class / membership | Subscription | class attended | Corporate wellness | Employer reimbursement |
| **Education** | Course / term | Enrollment | term started | Scholarship / grant | Grant disbursement |

The only concept that needed renaming for generality is **Subsidy → Coverage / Claim / Third-Party Payer**. Restaurants are the edge case (no Agreement/Subscription — charges spawn directly from order events); the model handles it because **Charge Event → Charge does not require an Agreement** (`billable_source` is polymorphic and optional). The model is coherent.

---

## Implementation implications before next build

This domain is frozen. Before financial implementation resumes, the following must be true. **None of these are implemented by this document** — they are the contract the next build honors.

1. **Promote Service to a first-class table.** Scoped + effective-dated, with a stable id that other domains FK to. This is the highest-leverage prerequisite; it unblocks pricing-by-service, scheduling, attendance, charge templates, portal, and reporting.
2. **Add `service_id` to Rate Rules.** Pricing keys off Service; `schedule_basis` becomes a dimension of a Service rate, not the rate's identity.
3. **Model Charge Templates** as first-class configuration (trigger, occurs-on vs. billable-on timing, amount/rate source, category, GL mapping, responsibility).
4. **Extend Charge with `occurs_on` / `billable_on` and the lifecycle statuses** (`scheduled → draft → posted → invoiced → settled`) if missing, so a Charge can carry the timing divergence without a parallel entity.
5. **Prepare Third-Party Payer / Coverage / Claim / Settlement Run as future substrate** — generalize the childcare subsidy concepts to these names now, so the schema and resolution seams are payer-agnostic before subsidy ships.
6. **Do not build more Financial Configuration on `org_settings` services.** That catalog is interim; freeze its scope and migrate Service to a table before extending Services, Charge Templates, or Policies.

**Frozen invariants (the laws that survive every vertical):**
- Resolution is recomputable; **only Posting writes authoritative truth.**
- One scoped, effective-dated resolution engine for rates, policies, responsibility, and coverage.
- Financial periods are independent and may diverge.
- `billable_source` stays polymorphic and optional (no Agreement required).
- **Third-Party Payer is the primitive; Subsidy is its first instance.**

---

## Open questions (deferred, do not block the freeze)

1. **Charge Event table vs. Charge-owned scheduling.** Recommended: Charge owns `occurs_on`/`billable_on` and the trigger lives in `workflow_events`. A dedicated `charge_event` table is only justified by event→many-charges fan-out. Decide when the first fan-out template (e.g. field trip) is built.
2. **Statement persistence.** Statement is derived (reproducible), but a rendered statement is often retained for audit/legal. Decide whether to persist statement snapshots or regenerate on demand.
3. **Responsibility granularity.** Whether responsibility splits attach at Agreement level only, or also per Charge/Charge Category (e.g. employer covers tuition but not late fees). Lean: support per-category override via the scoped policy hierarchy.
4. **Tax engine boundary.** Whether Tax Rule resolution is in-platform or delegated to an external tax service for verticals that need it (restaurants/retail). Childcare ships Tax disabled.
5. **Package vs. Service-with-children.** Whether a Package is a distinct config entity or a Service composition. Lean: Service composition to avoid a parallel hierarchy.

---

## When this doc must be updated

- A new first-class financial entity is identified, or one of the nine determinations changes.
- Service is promoted to a table (record the migration + update the billing doc's as-built).
- Subsidy concepts are generalized to Third-Party Payer in code.
- The lifecycle or period model changes.

Cross-references: [`billing-financials-platform.md`](./billing-financials-platform.md) (L5 posting doctrine + as-built) · [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) (L1–L5) · `../../sprints/archive/06_2026/operational_configuration_v1.md` (historical: `../../sprints/archive/06_2026/operational_configuration_v1.md`) (Financial Configuration Convergence as-built).
