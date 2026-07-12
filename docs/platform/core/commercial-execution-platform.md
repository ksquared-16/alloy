---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Commercial Execution Platform — Canonical Architecture

**Status:** 🟡 **Proposed / in-build** (Phase 1 doctrine + Phase 2 core types). Verified against `origin/staging @ d2ba85afd`.
**Scope:** The permanent Alloy platform subsystem that turns **frozen Commercial configuration** into a **consumer-neutral Commercial Resolution** — the canonical execution contract every downstream subsystem consumes.
**Companion docs:** [Commercial Platform V1 (frozen config)](../commercial/commercial-platform-v1.md) · [Operational Consumption (Billing runtime — first consumer)](../modules/operational-consumption-platform.md) · [Commercial ↔ Operational integration](operational-commercial-integration.md).

> **The governing question:** *Given a Commercial Context, what does Commercial configuration deterministically resolve to?*
> Commercial Execution answers that — and **only** that. It produces information, never financial truth.

---

## 1. Where this sits in Alloy

Alloy follows one architecture across every domain:

```
Configuration Platform  →  Execution Platform  →  Operational Platform
```

For Commercial:

```
Commercial Configuration (V1, FROZEN)     ← "what can be sold / charged"
        │  Commercial Export
        ▼
Commercial Execution Platform (THIS DOC)  ← "how configuration becomes executable"
        │  Commercial Resolution  (pure, neutral, explained)
        ▼
Execution Consumers                        ← Billing is the FIRST, not the owner
   Billing · Simulator · Quote Builder · Proposal · Contract Gen ·
   Revenue Forecasting · Capacity Planning · Financial Analytics ·
   Scenario Planning · AI Recommendation Engines
```

**Billing is a consumer, not the owner of Commercial pricing.** The platform is optimized for *execution in general*, never for Billing specifically. This is the reference implementation of the `Configuration → Execution → Operational` pattern that Scheduling, Staffing, HR, and Compliance will follow.

---

## 2. Why this platform exists (the discovery)

A prior audit found **two parallel commercial substrates** on `origin/staging`:

- **Substrate B — Commercial V1 (frozen, PR #65):** the operator-facing canonical config (`program_offerings`, `program_offering_variants`, `commercial_tuition_rates`, `commercial_products`, `billing_cadences`, `commercial_revenue_categories`). Authored under `/adminV2/commercial`.
- **Substrate A — the older `financial_*` model:** what the shipped Billing runtime actually consumes (`financial_services`, `childcare_rate_plans`/`childcare_rate_rules`, `financial_charge_templates`, `financial_policies`). Authored under `/settings/financials`.

**Verified:** the Operational Consumption runtime has **zero references** to any `commercial_*` V1 table. Billing *redefined Commercial* before Commercial V1 was frozen — the exact anti-pattern to eliminate.

Commercial Execution closes this: it reads **frozen Commercial V1** and produces the resolution the runtime consumes. Substrate A's *config role* is deprecated behind the platform (retired later, in a separate approved PR). The runtime, its primitives, and the Simulator are **not rebuilt** — they become consumers.

---

## 2a. The Export layer — where Commercial ownership ends (Phase 3, built)

```
Commercial Configuration (V1, owns the tables)
        │   ← ownership boundary: Commercial writes; nothing below writes
        ▼
Commercial Export  (read-only projection — the ONLY way execution sees config)
        │   composeCommercialExport(ctx) → { export, validation }
        ▼
Commercial Evaluation (Phase 4 — consumes the Export, never the tables)
```

**Commercial Execution never reads database tables directly.** It consumes a `CommercialExport` — a validated, already-connected object graph. Relationship joins happen **once**, in the Export layer; consumers never re-join. Code: [`web/lib/commercial/execution/export/`](../../../web/lib/commercial/execution/export/).

**Tables consumed (read-only):**

| V1 storage | Export type | Notes |
|---|---|---|
| `location_program_categories` | `ProgramDef` | deduped by `key` (program_key is the platform's Program identity) |
| `program_offerings` | `OfferingDef` | effective-dated; `status='archived'` ⇒ inactive |
| `program_offering_variants` | `VariantDef` | transparent default = null quantity |
| `commercial_tuition_rates` | `TuitionRateDef` | reads `revenue_category_id` (present since `20260713000001`; usually null until V2 UI wiring) |
| `commercial_products` | `CommercialProductDef` | fee/addon/deposit + typed behavior |
| `option_sets` / `option_set_items` (`set_key='commercial_billing_cadence'`) | `BillingCadenceDef` | cadences are an option set, **not** a `billing_cadences` table |
| `commercial_revenue_categories` | `RevenueCategoryDef` | `mapped_gl_account_id` → GL |
| `gl_accounts` | *(validation only)* | existence check for mapped GL references |
| *(none yet)* | `CommercialPolicyDef` | **placeholder** — empty set; the typed attach-point for Phase 5 |

**Readers are pure** `(supabase, orgId, asOf) → Def[]` (no writes, no cache, no evaluation), composed by `composeCommercialExport`, which stamps a deterministic config-version fingerprint and runs **graph validation**: broken edges (offering→program, variant→offering, rate→variant, *→revenueCategory, revenueCategory→glAccount) are **errors**; incomplete-but-expected config (unmapped accounting, unseeded cadence) are **warnings**. Nothing is silently ignored.

---

## 3. The one responsibility

> **Input:** a `CommercialContext`. **Output:** a `CommercialResolution`.

Commercial Execution is **pure · deterministic · recomputable · stateless · side-effect-free · consumer-neutral · idempotent · explainable**. It:

- resolves *which configuration applies* (program/offering/variant, pricing, products, revenue category, accounting metadata);
- applies **Commercial policies** so results are policy-adjusted identically for every consumer;
- applies **Funding attribution** (responsibility allocation), which decorates but never changes evaluated value;
- returns a fully **explained**, **version-pinned**, **precision-owned** resolution.

It **never**: creates invoices, payments, obligations, charges, or ledger/GL entries; owns triggers; owns UI; owns Commercial configuration; or lets a consumer re-round or re-price.

---

## 4. Internal pipeline (public surface stays small)

The public API is two evaluation primitives plus a temporal expander. Internally, evaluation is composable, replaceable stages:

```
Commercial Export  →  Resolver  →  Policy Stage  →  Funding Stage  →  Commercial Resolution
                                                                            │
                                                                     expand()   ← platform-owned, pure
                                                                            ▼
                                                                  Commercial Schedule (Occurrences)
                                                                            │
                                                                     materialize()  ← CONSUMER-owned
                                                                            ▼
                                              Billing Records · Forecast Records · Quote Records · …
```

**Evaluation and materialization are separate concerns**, and materialization itself splits in two:

| Function | Owner | Answers | Purity |
|---|---|---|---|
| `evaluate(context)` / `evaluateSet(contexts, group)` | Platform | "What does this configuration mean, right now?" | Pure |
| `expand(resolution, horizon)` | **Platform** | "What happens across time?" — dated occurrences / due dates / recognition timing | Pure |
| `materialize(schedule)` | **Consumer** | "What operational records do I create from this timeline?" | Consumer's concern (may have side effects) |

`expand()` is platform-owned so **temporal logic is never duplicated** across Billing cycles, a Quote's payment schedule, and a Forecast's revenue curve. `materialize()` is deliberately *outside* the platform — it is the seam where a consumer (and only a consumer) turns a neutral timeline into its own vocabulary. **No Billing concept ever crosses into the platform.**

---

## 5. The canonical contract — Commercial Resolution

`CommercialResolution` is consumer-neutral: **not** billing vocabulary, **not** invoice vocabulary, **not** accounting vocabulary. Every consumer receives this exact object. It carries:

- **Context** (echoed) and **Configuration Version** (provenance / reproducibility)
- **Status** (per-resolution and **per-line**, with structured reason codes)
- **Resolved Lines** — each with `gross`, `adjustments`, `net`, `cadence`, `source` provenance, `accounting` metadata (incl. `recognition`), `behavior`, `funding`, and a typed `explanation`
- **Precision / Rounding** (platform-owned; consumers must never re-round)
- **Effective dates**
- A typed **Explanation graph** (not free-form JSON)

The types are defined in [`web/lib/commercial/execution/`](../../../web/lib/commercial/execution/) (Phase 2). The contract was **pressure-tested against two non-billing consumers** (Quote Builder, Revenue Forecasting) before being locked; that test produced six refinements now baked in: relational evaluation (`evaluateSet`), temporal expansion (`expand`), config-version pinning, platform-owned rounding, per-line status + reason codes, and a `recognition` hint + typed explanation.

---

## 6. Evaluation APIs

```ts
evaluate(context: CommercialContext, cfg: CommercialExport): CommercialResolution
evaluateSet(contexts: CommercialContext[], group: RelationalScope, cfg: CommercialExport): CommercialResolution[]
expand(resolution: CommercialResolution, horizon: DateRange): CommercialSchedule
```

- **`evaluate()`** — one subject / enrollment / quote / projected seat.
- **`evaluateSet()`** — group evaluation, required for **relational** pricing: sibling discounts, family caps, corporate/volume pricing, scholarships, household pricing, future cohort pricing. Relational evaluation belongs in Commercial Execution, **never** in Billing — because Forecasting and Quoting need it too.
- **`expand()`** — the shared temporal engine (Phase 7, built: [`web/lib/commercial/execution/expand.ts`](../../../web/lib/commercial/execution/expand.ts)). Turns cadenced lines into dated `ScheduledOccurrence`s (calendar cadences step via `date-fns`; one-time/usage lines emit a single occurrence) with due dates and recognition timing, carrying each line's provenance, funding, and accounting onto every occurrence. Produces no Billing records/draft charges/obligations; `materialize()` stays consumer-owned.

`materialize()` is **not** a platform export — each consumer implements its own against the neutral `CommercialSchedule`.

---

## 7. Layer responsibilities & permanent ownership

| Layer | Owns | Never |
|---|---|---|
| **Commercial Configuration (V1, frozen)** | Programs, Offerings, Variants, Products, Pricing, Revenue Categories, Billing Frequencies, Availability, Effective Dating, Product Behavior, **Policy definitions** | Executes; creates money |
| **Commercial Execution** | `evaluate` / `evaluateSet` / `expand`, the `CommercialResolution`, **policy evaluation**, funding attribution, explanation, rounding, version pinning | Persists truth; triggers itself; knows its consumers; owns config or UI |
| **Billing** (first consumer) | Draft Charges, Financial Obligations, Review, Posting | Redefines Commercial; prices independently |
| **Funding** | Payer responsibility: coverage, eligibility, allocation, residual | Re-prices; creates charges |
| **Accounting** | Revenue-category → GL; the authoritative posting write | Owns rates or catalog |
| **Simulator** | Preview | Persists |
| **Forecasting / Analytics / AI** | Projection, recommendations over resolutions | Mutate config or truth |

### Policy stage (Phase 5, built)
Policy **definitions** are Commercial config (a new **Commercial-owned `commercial_policies`** table, scoped to org/location/program/offering/variant — *not* Substrate-A service/rate_plan). Policy **evaluation** happens inside Commercial Execution, so `net` is already policy-adjusted for every consumer. The pure `financial_policies` engine (typed-value registry shape + most-specific-wins selection) is **lifted as shared code and re-scoped** to Commercial keys — converge, don't rebuild; `financial_policies` is left intact for the legacy consumer and retired with Substrate A.

**Resolution-time types only:** `proration`, `discount`, `sibling_discount`, `waiver`, `eligibility`, `approval`. Payment-time policies (`late_fee`, `nsf_fee`, `grace_period`, `posting_review`, `refund`, `billing_cadence`) stay in the Billing/Money domain and never touch the commercial valuation.

**Policies modify a resolution; they never create a charge.** The engine *selects* the winning policy (`resolvePolicy`); evaluation *applies* it as a `PolicyAdjustment` moving `gross → net` (`applyPolicies`) — waiver wins over discount, net never below zero. `sibling_discount` is **relational**, applied across a group in `evaluateSet()` (this is the primitive's reason to exist). `approval` is a non-mutating review signal recorded in `explanation.policiesConsidered` for the consumer's gate; `proration`/`eligibility` are recorded as considered-but-not-applied pending runtime inputs (day counts / subject data). Code: [`web/lib/commercial/execution/policy/`](../../../web/lib/commercial/execution/policy/).

### Funding stage (Phase 6, built)
Funding **decorates** a resolution — a pure, standalone `attribute(resolution, plan) → resolution` (mirrors the `expand()`/`materialize()` split; **not** part of `evaluate()`). It allocates each resolved line's `net` across payers (private pay, government subsidy, employer sponsorship, scholarship, corporate) and records a **residual** to the primary. It **never changes `net`** and never creates a charge. Layer order: **Execution (priced) → Funding (attributed) → Billing (obligated).**

**Ownership boundary (audit finding):** Commercial Execution owns the funding **engine**, *not* payer data. There is no Commercial funding table — subsidy authorization is **Processing/operational-owned** per the financial domain doctrine. The `FundingPlan` is a **consumer/Processing INPUT** (like `CommercialContext`), so the platform stays consumer-neutral and ownership stays correct.

Single-payer default: a plan with only `primary` → `residual = full net → primary`, no allocations. Multi-payer: per-payer instructions (`percentage` / `fixed_amount`; `coverage_rule` deferred to external rule data) with `target` (tuition/fees/all), clamped so allocations never exceed net. **Invariant: Σ allocations + residual === net** (residual absorbs rounding). Code: [`web/lib/commercial/execution/fundingAttribute.ts`](../../../web/lib/commercial/execution/fundingAttribute.ts). Deferred: stored funding/coverage config, the subsidy-authorization store, claims/settlement, Billing wiring.

---

## 8. Consumer model

**Simulator = first consumer (Phase 8, built).** A read-only preview path — `POST /api/admin/commercial/execution/preview` + the pure builder [`web/lib/commercial/execution/preview/`](../../../web/lib/commercial/execution/preview/) — composes the real Commercial Export and runs `evaluate() → attribute()? → expand()`, returning a `CommercialResolution` preview. It creates **no financial truth** and is **additive**: the Substrate-A consumption simulator (`/api/admin/financial/consumption/simulate`) is untouched. Expected deltas between the two (null-accounting warnings, policy/funding differences, pricing-source divergence) are documented in [commercial-execution-simulator-deltas.md](commercial-execution-simulator-deltas.md) and surfaced per-preview in `notes[]`. Golden/snapshot equivalence is tested over the pure builder.

**Operator surfaces (Operator Completion sprint).** The Commercial workspace at `/settings/commercial` (`CommercialConfigWorkspace`) is the **single canonical operator home** (the hub + dedicated programs/tuition pages redirect to it). Its tabs: Programs & tuition · Catalog · **Policies** (registry-generated CRUD over `/api/admin/commercial/policies`, scoped org→variant, effective-dated, live preview) · Accounting · **Simulator** (operator-facing pricing preview — Commercial vocabulary only, no charges/obligations) · **Funding** (contextual placeholder — "managed in Processing", not built here, per ownership).

**Billing consumes Commercial Execution (Phase 9, built — the convergence payoff).** The shipped Operational Consumption runtime now prices tuition from Commercial Execution instead of Substrate A: at the one seam in `resolveDirective` (the amount fed to the charge template), it calls `getCommercialTuitionValuation` — which maps the enrollment's `program_key` (agreement → placement → `location_program_categories.key`) + scheduleBasis → a Commercial offering/variant ([`resolveCommercialScope`](../../../web/lib/commercial/execution/billing/)), then runs `evaluate()` for the policy-adjusted `net`. **No flag, no fallback:** when Commercial can't resolve (ambiguous/unconfigured), the obligation surfaces `commercial pricing unresolved: <reason>` in review — never a Substrate-A price. Everything else is unchanged and FKs preserved: `consumption_events`, `resolved_obligations` (incl. `charge_template_id`/`service_id`), draft charges, `charge_line_items`, review, posting, idempotency. Substrate A tables/functions remain (retired later). This is the doctrine realized: *Billing consumes Commercial instead of redefining it.*

Commercial Execution never knows who consumes it. Each consumer reads the same resolution and (optionally) the same `expand()` timeline, then runs its own `materialize()`:

| Consumer | Reads | Materializes into |
|---|---|---|
| **Billing** | lines + funding + schedule | Draft Charges → Obligations → Review → Posting |
| **Revenue Forecasting** | net/gross + recognition, over `projected` contexts | Revenue curve |
| **Quote Builder** | lines + schedule, `hypothetical` mode | Payment schedule / quote |
| **Proposal / Contract Gen** | lines + explanation, version-pinned | Contract language |
| **Simulator** | whole resolution | Preview timeline |
| **Capacity Planning** | scope × availability × pricing per seat | Occupancy value model |
| **Financial Analytics** | accounting rollups | Reports |
| **AI Recommendation** | typed explanation graph | Recommendations |

Occupancy, seat counts, and populations are **consumer assumptions**, never Commercial's — the platform prices *one* seat; Forecasting multiplies. That boundary is the platform working correctly.

---

## 9. Explanation, versioning, rounding — platform capabilities

- **Explanation** is a typed graph, not generic JSON. Every line answers: where it came from, why it was selected, which pricing/policy/funding applied, and *what alternatives were rejected*. Built for operators, forecasting, AI, debugging, auditing.
- **Configuration versioning** — every resolution pins the config snapshot (version, effective date, applicable rules/policies/funding). Enables quote reproducibility, forecast reproducibility, auditability, and scenario comparison.
- **Rounding** — one engine, platform-owned. Billing, Quotes, Forecasting, and AI always agree to the cent. Consumers must never re-round.

---

## 10. Implementation sequence

| Phase | Deliverable |
|---|---|
| 1 | **This doctrine** |
| 2 | **Core types** — Context, Resolution, Export, Funding Attribution, Explanation, Schedule/expand |
| 3 | Commercial Export readers (consume frozen V1) |
| 4 | Commercial Evaluation (lift pricing logic; consume V1; return Resolution) |
| 5 | Policy stage (move policy evaluation into Execution) |
| 6 | Funding stage (single-payer impl + multi-payer architecture) |
| 7 | `expand()` — shared temporal engine (no Billing logic) |
| 8 | Simulator consumes Execution — golden-file equivalence tests |
| 9 | Billing consumes the Resolution — Billing no longer owns pricing |
| 10 | Documentation: sequence diagrams, ownership, consumer model, migration, the future Decision-Engine pattern |

**Migration is additive & non-destructive.** No schema drops. `resolved_obligations` keeps its FKs (fed upstream by the resolution). Substrate A's config role is retired only in a separate, explicitly-approved PR. Config/seed migrations only. Do **not** run `supabase db push --include-all` (ledger reconciled out-of-band 2026-07-13). The sprint builds on `origin/staging`.

---

## 11. The final architectural test

> **"If Billing disappeared tomorrow, would Commercial Execution still be a complete, valuable, reusable Alloy platform?"**

**Yes — unequivocally.** With Billing deleted, `evaluate/evaluateSet/expand → CommercialResolution` still prices any commercial context, applies policy and funding, tags accounting, expands a timeline, and explains itself. Quote Builder still prices prospects; Forecasting still projects revenue; Contract Gen still serializes resolutions; AI still reasons over explanations.

The tell that the boundary is right: the words **charge, obligation, posted, invoice** appear **zero** times in `evaluate()`, in `CommercialResolution`, and in `expand()`. They live only in the Billing consumer. That is the abstraction that will scale across the rest of Alloy.
