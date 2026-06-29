# Operational Consumption platform

**Status:** Canonical module doctrine (June 2026). Defines the **runtime layer** between Operational Execution and Commercial / Financial Resolution — the layer that interprets an operational fact into the commercial meaning it should carry.

> **Companion docs.** Truth-flow layering: [`../operational-truth-flow-doctrine.md`](../operational-truth-flow-doctrine.md). Financial domain (frozen): [`./financial-platform-domain.md`](./financial-platform-domain.md). Posting / draft Charge Resolution: [`./billing-financials-platform.md`](./billing-financials-platform.md).

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

Backing table: `consumption_events` (migration `20260706120000`). Key fields:

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

Backing table: `resolved_obligations` (migration `20260706120000`). Key fields:

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

## What this slice does NOT build

Posting, Payments, Invoices, Statements, GL posting, Subsidy runtime, Claims, Settlement, Focus Panel, Attendance consumption, Schedule-tuition consumption, Vacation credits, Refunds, Withdrawal policies. Those are later slices. Slice 1 proves the platform boundary with one vertical.
