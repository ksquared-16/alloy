---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling ↔ Billing — financial projection without financial ownership

**Status:** Proposed — the last modeling seam before implementation. It defines the exact boundary between **Scheduling** (schedule intent + operational outcome) and **Billing** (all financial truth). It does **not** redesign Billing, invent a Financials platform, or move any Billing responsibility into Scheduling. Scheduling **consumes a Billing projection**; it never calculates financial truth.

**The result is four clean ownership lines:** Enrollment owns enrollment intent · **Scheduling owns operational schedule intent** · **Billing owns financial truth and recurring tuition** · Attendance owns actual execution. Everything downstream becomes composition, not invention.

> **Projection shape refined by [`billing-rate-resolution-contract.md`](./billing-rate-resolution-contract.md) (final).** §4's single-rate `BillingProjection` is superseded by `BillingScheduleProjection`, which returns **eligible rate choices + a recommended default** and **numeric discounts/funding + family responsibility** (not a vague summary). The boundary, ownership, and workflows in this doc stand; read the contract for the final payload and the implementation gap report.

---

## 0. The one rule

> **Scheduling commits schedule intent. Billing evaluates that intent into money. Scheduling displays the result and never computes it.**

A director must see the financial *consequence* of a scheduling decision at the moment they make it — but the numbers are Billing's, read through a projection, never Scheduling's to derive.

---

## 1. Ownership matrix (one owner per capability)

| Capability | Owner |
|-----------|-------|
| Schedule intent · room assignments · patterns · effective dates | **Scheduling** |
| Projected operational outcome (occupancy · ratio · staffing) | **Scheduling** |
| **Requesting + displaying** recurring tuition / rate name / discount + funding **summary** | **Scheduling** (consumes projection) |
| Rate **determination** (which rate applies) | **Billing** |
| Discount rules & amounts | **Billing** |
| Funding / subsidy rules & amounts | **Billing** |
| Recurring **tuition calculation** | **Billing** |
| Invoices · balances · credits · payments · adjustments | **Billing** |
| Statements · transactions · aging · collections · refunds | **Billing** |

No capability appears twice. Scheduling's only financial verb is **display a projection**; every financial *computation* is Billing's.

---

## 2. What Scheduling shows about money

For each item — **Show directly · Show as summary · Link to Billing · Never show**:

| Item | Treatment | Rationale |
|------|-----------|-----------|
| Current recurring rate (`$980/month`) | **Show directly** | the money consequence of the current schedule |
| Recurring tuition (projected) | **Show directly** | same |
| Future recurring rate (`$1,040/mo beginning Sep 2`) | **Show directly** | follows the upcoming schedule |
| Projected tuition change (before → after) | **Show directly** | in the change preview — the decision needs it |
| Effective billing date (`Billing starts Aug 4`) | **Show directly** | must align with the schedule's effective start (§7) |
| Rate name (`Toddler · Full Week`) | **Show directly** | useful context; the *label* Billing determined (not the rule) |
| Discount summary (`Sibling discount applied`) | **Show as summary** | Scheduling knows discounts *exist*; Billing owns the rules → summary + link |
| Funding / subsidy summary (`Subsidy applies`) | **Show as summary** | same — summary + link, funded amount deferred to Billing |
| Billing warnings (`Rate pending`, `No rate configured`) | **Show as summary** | flags an incomplete projection; link to Billing to resolve |
| Invoices · balances · payments · credits · adjustments · statements · transactions · aging · collections · refunds | **Never show** | ledger truth — Billing only. Scheduling never exposes it. |

Discounts and funding always appear as a **summary line + "View in Billing →"**, never as rules, amounts-in-detail, or configuration.

---

## 3. Rate resolution — Scheduling never selects a rate

**Validated flow (accepted):**

```
Schedule intent (days · times · room · program · cadence · effective dates)
        │  Scheduling requests a projection
        ▼
BILLING determines:  rate  (Full Day · Half Day · Full Week · Part Week · Hourly · Seasonal · Camp · program-specific)
        →  applies discounts
        →  applies funding
        →  computes recurring tuition
        │  returns a BillingProjection (read-only)
        ▼
SCHEDULING displays the result   (recurring tuition · rate name · discount/funding summary · effective billing date)
```

**Scheduling never selects, names, or computes a rate.** It passes the *schedule context*; Billing resolves everything financial and returns it. This composes directly onto Alloy's existing commercial/consumption resolver (`resolveConsumption` / the commercial preview pipeline — [`../core/commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md)), which already turns a schedule/attendance context into priced lines **write-free**. Scheduling calls it in *projection* mode; it posts nothing.

---

## 4. The Billing projection contract (what Scheduling requests from Billing)

The canonical read model — **owned by Billing, consumed by Scheduling**. Scheduling sends a schedule context and receives:

```
BillingProjection {                         // Billing owns; Scheduling reads
  for: { childId, scheduleRef, program, room, cadence, effectiveFrom, effectiveTo|openEnded }

  recurringTuition: { amount, unit } | 'pending'   // e.g. { 980, 'month' }
  rateName: string | null                          // "Toddler · Full Week"  (label, not rule)

  discountSummary: { count, labels: string[] } | null   // ["Sibling"] — summary only
  fundingSummary:  { applies: bool, label } | null      // { true, "State subsidy" } — summary only

  effectiveBillingDate: date                       // aligns with the schedule effective start (§7)
  billingStatus: 'projected' | 'active' | 'pending-rate' | 'needs-review'
  warnings: string[]                               // "no rate configured for this program"

  meta: { source: 'billing', computedAt, freshness: 'fresh'|'stale' }
  detailLink                                       // → Billing (for discount/funding/ledger detail)
}
```

- **No ledger fields** — no invoice, balance, payment, credit, or transaction. If it's in the ledger, it's not in this projection.
- **Summaries, not rules** — `discountSummary`/`fundingSummary` carry labels/counts; the amounts, rules, and configuration stay in Billing behind `detailLink`.
- **This feeds the canonical Scheduling projection** — each `ScheduleView.rate` / `.projectedTuition` / `.fundingApplies` in [`scheduling-projection-contract.md`](./scheduling-projection-contract.md) is populated from this Billing projection. Scheduling stores none of it authoritatively; it is read on projection and refreshed on change.

---

## 5. Schedule creation — when Billing evaluates

```
Operator sets  Days → Times → Room → Effective dates   (pattern editor, a command)
        │  PREVIEW (before commit)
        ▼
Scheduling requests a BillingProjection for the proposed schedule
        →  Billing evaluates: rate · discounts · funding · recurring tuition   (write-free)
        →  the preview shows: "Projected $980/month · Full Week · Sibling discount · Billing starts Jul 28"
        │  operator reviews the money BEFORE committing
        ▼
COMMIT schedule intent  (Scheduling writes assignments)
        ▼
Billing consumes the committed schedule → establishes recurring tuition going forward (authoritative)
        ▼
Scheduling projection refreshes → shows the committed recurring tuition
Future invoices reflect it — owned by Billing
```

**Answers:**
- **When Billing evaluates:** in the **preview** (read-only projection) *and* on **commit** (authoritative recurring tuition setup).
- **When projected tuition appears:** in the command preview and on the Scheduling card (current + upcoming).
- **When discounts/funding resolve:** by Billing, inside the projection (preview) and authoritatively on commit — Scheduling never resolves them.
- **When the projection refreshes:** on any schedule change (re-request), on commit, and when Billing signals a rate/config change made it stale.

---

## 6. Schedule change — where the financial preview lives

```
Current schedule  →  change (command)  →  Billing projection refresh  →  operator reviews before→after  →  Commit
        →  Billing updates future recurring tuition  →  future invoices reflect the change (Billing)
```

The **financial preview belongs in the change command's preview step** (inside the Command Surface): *"Now $980/month → From Aug 4 $1,040/month."* The resulting rate then shows on the Scheduling card as the upcoming rate. Scheduling shows the *preview*; Billing owns the *update* and the invoices.

---

## 7. Effective-date synchronization

Scheduling and Billing **agree on time**: every financial projection carries the schedule's effective dates, and **no projection ignores them**.

| Schedule shape | Financial projection |
|----------------|----------------------|
| Future start | recurring tuition **begins** on the effective start (`Billing starts Aug 4`) |
| Open-ended | recurring, no end |
| Bounded / **temporary** | recurring tuition **for the window**; reverts with the schedule |
| Future change | **upcoming** recurring tuition from its effective date |
| Ended | recurring tuition **stops** at the effective end (Billing prorates) |

The `effectiveBillingDate` in the projection (§4) is derived from — and must equal — the schedule's effective start. A temporary schedule yields a bounded financial impact; a future schedule yields an upcoming rate. This alignment is guaranteed because Scheduling passes the effective dates into the projection request and Billing evaluates against them.

---

## 8. Implementation readiness

| Piece | Maturity |
|-------|----------|
| Billing evaluation of a schedule context → priced result (write-free) | **built** — `resolveConsumption` / commercial preview pipeline ([`../core/commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md)) |
| Effective-dating alignment | **built** — `effectiveDating` |
| **`BillingProjection` read API** (schedule context → §4 shape, with discount/funding **summary** + rate name for display) | **partial** — the pricing exists; the *summary-shaped, Scheduling-facing read model* is the integration to build |
| Discount/funding **summary** (labels/count, not rules) | **partial** — Billing has the rules; the summary projection is thin |
| Stale-on-rate-change signal | **partial** — Billing publishes config/rate version; Scheduling re-requests |

**One integration to build:** a **Billing-owned `BillingProjection` read endpoint** that Scheduling calls with a schedule context (in preview and on card render) and receives the §4 shape. No new pricing logic, no ledger exposure, no rate/discount computation in Scheduling — just a read model over what Billing already computes.

---

## 9. Mockups (stay inside Scheduling — never mock invoices/balances)

[`mockups/scheduling-billing-projection.html`](./mockups/scheduling-billing-projection.html): schedule creation → Billing projection in preview → review → commit; current + future recurring tuition; discount + funding summary; rate change; temporary/future schedule tuition. No ledger, no invoices, no balances.

---

## Success — the four lines are clean

- A director sees the financial consequence of every scheduling decision (projection in preview + on card).
- Scheduling never owns financial truth — it displays a Billing projection.
- Billing remains authoritative for rate, discount, funding, tuition, and the entire ledger.
- The projection contract (§4) is complete and engineering knows exactly what Scheduling requests from Billing.
- No ownership ambiguity remains.

---

## Cross-references

- [`scheduling-projection-contract.md`](./scheduling-projection-contract.md) — the canonical Scheduling projection this feeds (`ScheduleView.rate`/`projectedTuition`).
- [`schedule-lifecycle-and-object.md`](./schedule-lifecycle-and-object.md) §5 — rates/tuition presentation (now sourced from the Billing projection).
- [`../core/commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md) — the existing write-free pricing preview Scheduling calls.
- [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) — Billing ledger ownership (#4/§1) and calculation #12.
