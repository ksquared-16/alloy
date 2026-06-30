# Operational Consumption platform

**Status:** Canonical module doctrine (June 2026). **Runtime COMPLETE — Slices 1–3 shipped** (registration · agreement + schedule recurring tuition · the Consumption Pipeline + attendance). Defines the **runtime layer** between Operational Execution and Commercial / Financial Resolution — the layer that interprets an operational fact into the commercial meaning it should carry. **Posting, Invoicing, Payments, Statements, Subsidies, Claims, Settlement, and the General Ledger are downstream consumers of this runtime and are not part of it.**

> **Companion docs.** Truth-flow layering: [`../operational-truth-flow-doctrine.md`](../operational-truth-flow-doctrine.md). Financial domain (frozen): [`./financial-platform-domain.md`](./financial-platform-domain.md). Posting / draft Charge Resolution: [`./billing-financials-platform.md`](./billing-financials-platform.md).
>
> **The completed runtime (one canonical pipeline):** Operational Truth → Operational Execution → **Operational Consumption** (Operational Fact → Consumption Candidate → Consumption Event → Resolved Obligation) → Commercial Model → Financial Resolution → Draft Charges → **Posting** (downstream, authoritative). Three consumption domains flow through the same pipeline: **Agreement** (registration), **Schedule** (recurring tuition / proration / drop-in), and **Attendance** (late pickup / drop-in / hourly / vacation credit). See the Slice 1/2/3 sections below.

---

## Why this layer exists

The Commercial Model (Services, Rate Plans, Rate Rules, Charge Templates, Financial Policies, Charge Resolution, Draft Charges, Accounting) is **configuration plus a resolver**: given a Charge Template and a context, it produces a draft Charge intent. But *something* has to decide **which** template applies to **which** operational fact, **when**, and **for whom** — and to record that decision as a first-class runtime object. That is **Operational Consumption**.

Operational Consumption answers exactly one question:

> **Given an operational fact, what commercial meaning should exist?**

It sits on the truth-flow axis at the **L4 → L5 boundary**: it reads immutable Operational Facts (L4) and interprets them into the genesis of Operational Consequences (L5), *without itself being authoritative money*.

```
Operational Truth
  → Operational Execution        (records the fact)
  → Operational Consumption      (interprets the fact → draft commercial meaning)   ← THIS LAYER
  → Commercial Model             (the configured rules it consumes)
  → Financial Resolution         (recomputable draft Charge resolution)
  → Draft Charges                (non-authoritative)
  → Posting                      (the ONLY authoritative money write)
```

---

## Hard runtime ownership boundaries

Operational Consumption **does**:

- Accept a normalized **operational fact** and map it to a **Consumption Event**.
- Resolve the matching **Commercial Model** Charge Template(s) — by **consuming** the existing Charge Template resolver, never reimplementing pricing/timing/review.
- Produce **Resolved Obligation** previews (the commercial meaning).
- Optionally create **idempotent draft charges** through the existing Slice D charge lifecycle service.

Operational Consumption **does NOT** (these are out of scope and belong to later/other stages):

- Post money. **Posting remains the only authoritative money write.**
- Create invoices, payments, statements, or write the ledger / GL.
- Mutate authoritative financial truth, or touch a **posted** charge (ever).
- Own pricing. It delegates to the Commercial Model / Financial Resolution.

**`/settings/financials` remains Commercial *Configuration*** — what you sell, how you price it, the rules, how it posts. **Operational Consumption is runtime *interpretation*** of facts against that configuration. The two are deliberately distinct: configuration is authored and effective-dated; consumption is recorded at runtime and recomputable. The Consumption simulator lives under `/settings/financials` only to make the boundary *visible*; it is not configuration.

---

## The Consumption Event model

A **Consumption Event** is a normalized operational fact, recorded as the **canonical runtime contract** for commercial interpretation. It is **not a charge.**

Backing table: `consumption_events` (migration `20260706120050`). Key fields:

| Field | Meaning |
|---|---|
| `org_id`, `location_id` | Scope (org isolation + optional location). |
| `event_type_id` | The registered `consumption_event_types` row this fact matched. |
| `source_family`, `event_key` | What kind of fact this is (e.g. `agreement` / `enrollment.registration`). |
| `source_entity_type`, `source_entity_id` | The operational entity that produced the fact (e.g. `child_enrollment_agreements` / the agreement id). |
| `subject_type`, `subject_id` | Who/what the fact is about (e.g. the child). |
| `occurs_on`, `effective_on` | When the fact occurs / takes effect. |
| `status` | `recorded` → `resolved` / `no_obligation` / `superseded`. |
| `context` (jsonb) | Free-form normalized fact context. |
| `idempotency_key` | Stable per (org, fact) — re-recording the same fact does not duplicate. |

**Consumption Event Types** (`consumption_event_types`) are the registry of *which facts carry commercial meaning*. A type names the `source_family`, the `event_key`, and the Commercial Model **`charge_template_key`** it resolves (by key, resolved per-org at runtime). Global templates have `org_id NULL` (mirroring `metric_definitions`); an org may override with its own row. A `charge_template_key` of `NULL` is valid and means **the event produces no charge.**

### Consumption Events are not charges

This is the core doctrine. A Consumption Event is the *recorded interpretation step*, not an obligation:

- **Some Consumption Events produce no charge** (e.g. an informational fact, or a type with no template configured for the org). `status = no_obligation`, zero obligations. This is a first-class, expected outcome — not an error.
- **Some produce exactly one charge** (the Slice 1 vertical: `enrollment.registration` → one registration-fee obligation).
- **Some may later fan out into many obligations** (e.g. one field trip → 30 children, or a usage event → tiered components). The model permits this: a Consumption Event has zero-or-more Resolved Obligations. Slice 1 implements only the 0-or-1 case; the schema does not foreclose fan-out.

### Why Consumption Events replace "Charge Events" as the canonical runtime contract

[`./financial-platform-domain.md` §10](./financial-platform-domain.md) defined a **Charge Event** as the *trigger fact* (an L4 occurrence such as "Registration Approved"), to be served by `workflow_events` (converge, don't rebuild). That remains true — **`workflow_events` is still the immutable trigger-fact log.** What was missing was a named runtime object for the *interpretation*: the durable record that "this fact was consumed, against this event type, and resolved to these obligations."

A bare "Charge Event" conflated three things — the fact, the decision to charge, and the resulting obligation. The **Consumption Event** cleanly separates them:

- The **trigger fact** stays in `workflow_events` (immutable L4 history).
- The **Consumption Event** is the canonical runtime *contract*: the normalized, idempotent, recomputable interpretation of that fact, carrying its own status and its link to obligations.
- The **Charge** stays the obligation on the lifecycle spine (`occurs_on` / `billable_on`, `draft → posted → …`).

So "Charge Event" is retired as a *runtime contract name*: the trigger fact is `workflow_events`; the canonical runtime object you build resolution on is the **Consumption Event**. This is naming + an additive table, not a rebuild — no `workflow_events` change, no Charge change.

---

## The Resolved Obligation model

A **Resolved Obligation** is the commercial meaning a Consumption Event resolves to: a **draft obligation preview**, optionally linked to a **draft Charge**. It is never authoritative and always recomputable.

Backing table: `resolved_obligations` (migration `20260706120050`). Key fields:

| Field | Meaning |
|---|---|
| `org_id`, `location_id` | Scope. |
| `consumption_event_id` | The event this obligation resolves from. |
| `charge_template_id`, `service_id` | The matched Commercial Model objects. |
| `amount_cents`, `currency_code` | Resolved amount (null when not resolvable at preview time). |
| `responsibility_key` | Who is responsible (defaults from the event type when the charge carries none). |
| `occurs_on`, `billable_on` | Timing, copied from the Charge intent. |
| `status` | `previewed` → `drafted` / `no_charge` / `superseded`. |
| `review_required` | OR of template + policy review. |
| `explanation` (jsonb) | Why this obligation exists (template key, amount strategy, GL mapping, lifecycle). |
| `draft_charge_id` | The linked **draft** Charge (`charges`, `status='draft'`) if one was written. **Never a posted charge.** |
| `resolution_key` | Idempotency — equals the Charge resolver's `tpl:<key>:<occurs_on>:<scope>` key. |

### Draft obligation lifecycle

```
previewed   — resolved, no row written (preview mode) OR written without a draft charge yet
drafted     — a draft Charge was written and linked (draft_charge_id set)
no_charge   — the event type / org produced no chargeable obligation
superseded  — replaced by a newer resolution (effective-dated discipline)
```

The obligation is **recomputable**: re-running resolution for the same `resolution_key` recalculates the existing row rather than duplicating it, and the underlying draft Charge follows the same idempotency (Slice D `metadata.resolution_key`). **Posting** — the separate, only authoritative money write — takes over from there and is out of scope; a posted Charge is never mutated by consumption.

---

## Runtime flow (Slice 1 vertical)

```
Enrollment Agreement Activated                         (operational fact, L4)
  → Consumption Event  enrollment.registration         (consumption_events, idempotent)
  → Charge Template    registration_fee                (Commercial Model, resolved by key)
  → resolveChargeFromTemplate (Slice D, unchanged)      (Financial Resolution — consumed, not bypassed)
  → Resolved Obligation                                 (resolved_obligations, draft preview)
  → Draft Charge        charges status='draft'          (idempotent; never posted)
```

- **Preview mode** (`previewConsumption`) computes and persists **nothing**.
- **Draft mode** (`draftConsumption`) persists only **safe draft objects**: the Consumption Event, the Resolved Obligation, and (via the existing lifecycle service) an idempotent `status='draft'` Charge. It never posts and never mutates a posted Charge.

Code: `web/lib/operationalConsumption/` (`consumptionTypes.ts`, `resolveConsumption.ts` — pure, `consumptionService.ts` — orchestration). API: `POST /api/admin/financial/consumption/simulate` (`action=preview|draft`, role-gated). UI: the **Consumption** runtime section under `/settings/financials`.

---

# Slice 2 — Agreement + Schedule consumption (recurring obligations)

Slice 1 proved the boundary with a fixed fee. Slice 2 teaches Consumption to understand **recurring** commercial obligations from an agreement + schedule, still without Posting.

> **The defining principle.** Operational Scheduling answers *"where should the child be?"*. Operational Consumption answers *"what financially applies because of that schedule?"*. **These are not the same question, and operational changes do not automatically imply commercial changes.** Consumption determines the meaning.

## Agreement Consumption doctrine

An agreement is the **scope + subject** of recurring consumption, not itself a charge. Agreement lifecycle facts are consumption *sources*:

| Agreement fact | Consumption meaning |
|---|---|
| Agreement Activated | Eligibility opens: combined with a schedule, recurring tuition can be consumed for service periods. |
| Agreement Updated | Re-evaluate; only a change to billable shape (service/rate scope) is commercial. |
| Effective Date Changed | The service period window shifts; recurrence re-anchors. Recomputable — no duplicate obligations. |
| Agreement Ended | Recurrence stops after the end; a partial final period may prorate (preview). |

The agreement supplies the **Rate Resolution scope** (`site_location_id`, age group) and the **billable source** for any draft charge. Consumption reads it; it never mutates it.

## Schedule Consumption doctrine

A schedule fact is interpreted by the **schedule financial interpretation engine** (`web/lib/operationalConsumption/scheduleInterpretation.ts`, pure) into zero-or-more obligation *directives*. **Not every schedule mutation is commercial:**

| Schedule fact | Financial interpretation | Obligation(s) |
|---|---|---|
| Recurring schedule (e.g. MWF) | Recurring tuition for the service period | 1 — `recurring_tuition` (draft charge) |
| Temporary schedule | Tuition prorated across the partial period | 1 — `proration` (**preview only**; adjustment posts downstream) |
| Extra day | Charged at the drop-in rate | 1 — `extra_day` (draft charge) |
| Drop-in | Charged at the drop-in rate | 1 — `drop_in` (draft charge) |
| Schedule replacement | Prior schedule ends mid-period **and** a new recurring tuition begins | 2 — `proration_credit` (preview) **+** `recurring_tuition` (draft charge) |
| Holiday override | Changes attendance, not the recurring obligation | **0** — no financial impact |
| Schedule exception | One-off; no obligation by itself | **0** — no financial impact |
| No-op schedule edit | Billable shape unchanged | **0** — no financial impact |

The engine maps a weekday set (or the pattern's `schedule_type_key`) to a Rate Resolution **schedule basis** (`weekdaysToScheduleBasis`): 3→`three_day`, 4→`four_day`, 5→`five_day`, 1→`drop_in`; an unsupported shape (e.g. a 2-day week) is **null → no obligation, explained**.

## New Consumption Event catalog (Slice 2)

Seeded globally (`20260707120000`), each mapping to the Commercial Model template it resolves:

| Event key | Source family | Charge template (by key) | Amount source |
|---|---|---|---|
| `schedule.recurring_tuition` | schedule | `tuition` (rate_derived) | Rate Resolution |
| `schedule.proration` | schedule | `tuition` (prorated) | Rate Resolution × proration policy |
| `schedule.drop_in` | schedule | `drop_in` (rate_derived) | Rate Resolution (`drop_in` rule) |
| `schedule.extra_day` | schedule | `drop_in` (rate_derived) | Rate Resolution (`drop_in` rule) |

## Commercial Resolution — Consumption consumes, never duplicates

For each directive the service:
1. **Rate Resolution** — `resolveRate(plans, rules, { siteLocationId, ageGroupKey, scheduleBasis, planKey }, periodStart)` selects the Rate Plan + Rate Rule and yields the amount. *(consumed, not reimplemented)*
2. **Charge Template resolution** — `resolveChargeFromTemplate` (Slice D) prices/dates/categorizes via the rate-resolved amount (`resolvedAmountCents` threaded through `chargeLifecycleService`). *(consumed, not bypassed)*
3. **Financial Policy resolution** — `resolveFinancialPolicy` for `proration` (method), `billing_cadence`, `posting_review` (drives `review_required`), and `grace_period` (noted; consumed at Posting, not here). *(no new policy types — these already exist)*

Consumption decides *"what should be commercially evaluated?"*; the Commercial Model decides *"what does the org charge?"*.

## One Consumption Event → many Resolved Obligations

`resolved_obligations` gains `obligation_kind` + `period_start`/`period_end` (additive). A single event may now fan out:

```
Schedule Replacement  →  Proration Credit (preview)  +  Replacement Recurring Tuition (draft charge)
Recurring Schedule    →  Recurring Tuition (one draft charge per service period, idempotent by period)
```

Idempotency is per `(org_id, resolution_key)`: a draftable obligation reuses the Charge resolver's `tpl:<key>:<occurs_on>:<scope>` key (period-scoped, so re-running a schedule edit never duplicates and a new period yields a new obligation); preview-only obligations carry a synthesized `cons:<kind>:<period>:<agreement>` key.

## Explanation is a core platform capability

The preview returns, for every step, *why it happened*: the schedule `interpretation` (+ `noImpactReason`), `commercialObjectsUsed` (which Rate Plan / Rate Rule / Charge Template matched or didn't), `policiesApplied` (which policy, scope, and effect), and per-obligation `explanation` (the directive reason, amount strategy, and why a charge was or wasn't created). This is surfaced end-to-end in the Consumption simulator.

---

## What is still OUT of scope (after Slice 2)

Posting, Payments, Invoices, Statements, GL posting, Subsidy runtime, Claims, Settlement, Focus Panel, **Attendance** consumption, late pickup, meals, hourly care, vacation credits, refunds, withdrawals. Slice 2 adds agreement + schedule recurring tuition (and drop-in / proration interpretation); everything else remains a later slice. Posting is never introduced here.

---

# Slice 3 — the Consumption Pipeline + Attendance consumption

Slices 1–2 each consumed a vertical directly (agreement → registration; schedule → tuition). Attendance would make a third. That does not scale, so Slice 3 introduces **one canonical runtime pipeline** that every operational domain enters identically — and makes Attendance its first consumer.

## The Consumption Pipeline

```
Operational Fact
  → Consumption Candidate      (normalized runtime interpretation — NOT persisted)
  → Consumption Event(s)        (0..N — the canonical runtime contract)
  → Commercial Resolution       (Service / Rate Plan / Rate Rule / Charge Template / Policies)
  → Resolved Obligation         (draft preview)
  → Draft Charge                (idempotent; never posted)
```

Every domain (agreement, schedule, attendance) now flows through the same stages. The shared core is `resolveDirective` (`consumptionService.ts`): given one obligation *directive* it consumes the existing Rate Resolution + Charge Template resolver + Financial Policies and produces a Resolved Obligation. It handles **rate-derived** amounts (with an optional unit multiplier, e.g. hours), **fixed-fee** templates (e.g. late pickup), and **preview-only** credits (e.g. vacation credit) uniformly. Pricing is never reimplemented; Posting is never introduced.

## The Consumption Candidate model

A **Consumption Candidate** represents an operational fact that *may* carry commercial significance. It is a normalized runtime interpretation — **not a persisted financial record** (no table; it lives only in the pipeline).

```
Agreement Activated  → Candidate → Registration Consumption Event
Check-out 5:18 PM    → Candidate → Late-Pickup Consumption Event
Schedule Changed     → Candidate → Proration Consumption Event
Check-out 4:30 PM    → Candidate → (discarded — no commercial impact)
```

A Candidate resolves to **one event, many events, or none** (discarded with a reason). It carries `{ domain, factType, sourceEntity, subject, location, occursOn, agreementId, attributes }`. Provenance is recorded on the persisted Consumption Event (`source_family`, `event_key`, and `context` — including `attendance_fact_type` and any `discard_reason`).

## Attendance Consumption doctrine

Attendance is **interpreted, not redesigned**. Operational Truth owns the raw attendance facts; Consumption asks whether each carries commercial meaning. The pure engine `attendanceInterpretation.ts` decides — and **not every attendance fact becomes a Consumption Event:**

| Attendance fact | Interpretation | Outcome |
|---|---|---|
| Check-out after the late threshold | Late-pickup fee (fixed template) | `attendance.late_pickup` → draft charge |
| Check-out before the threshold | On-time | **discarded** (no event) |
| Extra day / drop-in / unexpected attendance | Drop-in rate | `attendance.extra_day` / `drop_in` → draft charge |
| Hourly care | Hourly rate × hours | `attendance.hourly_care` → draft charge |
| Extended day | Drop-in rate | `attendance.extended_day` → draft charge |
| Absence (vacation-eligible) | Vacation credit | `attendance.vacation_credit` → **preview-only** (credits post downstream) |
| Absence (not eligible) / excused absence | — | **discarded** (no event) |
| No-show | Fee **only if** configured | `attendance.no_show` → charge if a template exists, else **suppressed (no_charge)**, explained |
| Room transfer / early pickup / check-in / duration / expected attendance | — | **discarded** (no commercial impact) |

Late threshold + hours are supplied with the fact (operating-window config is a future input). Idempotency is per-day: a late-pickup obligation keys on `tpl:late_pickup:<event_date>:<agreement>`, so **duplicate attendance facts never create duplicate obligations**.

## New attendance Consumption Event catalog (`20260708120000`)

`attendance.late_pickup` (fixed), `attendance.drop_in` / `extra_day` / `extended_day` (drop-in rate), `attendance.hourly_care` (hourly rate × hours), `attendance.no_show` (fee only if configured), `attendance.vacation_credit` (preview-only).

## Explanation is now first-class — for created AND suppressed obligations

The preview explains every Candidate outcome: **why** it became a Consumption Event (or why it was discarded — `attendanceInterpretation.discardReason`), which Commercial objects matched (`commercialObjectsUsed`), which Policies applied (`policiesApplied`), which obligations were created, and which were **suppressed** (`status='no_charge'` with a `no_charge_reason`, counted in `suppressed_obligation_count`). The simulator renders this complete reasoning chain: Candidate → Consumption Event → Commercial objects → Policies → Resolved Obligations → Draft Charges.

## Product goal (achieved)

*"A child checked out at 5:18 PM"* → Candidate (attendance / check_out) → after the 17:00 threshold → `attendance.late_pickup` Consumption Event → matched the fixed Late-Pickup Charge Template → review-required policy applied → one Resolved Obligation → a **$25 draft charge** — posting nothing.

## What remains downstream (after Slice 3)

The Operational Consumption Platform is complete as a runtime. **Posting, Invoicing, Payments, Statements, Subsidies, Claims, Settlement, and the General Ledger** remain downstream consumers of this runtime — none are introduced here. Meals and other attendance-derived verticals can now be added simply by registering an event type + interpreter directive; the pipeline already carries them.
