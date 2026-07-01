# Operational Configuration Card Pattern

> **Status**: Pattern documented. Reference implementation: Financial Configuration card (billing_preview key).

---

## The Pattern

Every operational domain in Alloy follows the same four-layer structure:

```
Operational Facts (persisted placement / assignment / role facts)
  → Configuration (who is responsible, what rules apply)
    → Readiness (are the required pieces in place?)
      → Activity / History (what has happened under that configuration?)
```

This structure repeats without modification for Billing, Scheduling, Attendance, and Staff.
Cards in each domain answer the same four questions in order:

1. **Facts** — what placement / assignment / role facts exist?
2. **Configuration** — is the domain configured? (billing contact? tuition rule? schedule pattern?)
3. **Readiness** — what is missing before the domain can operate?
4. **Activity** — what transactions / events have occurred?

The card surface answers only the questions appropriate to the current lifecycle phase
(pre-enrollment vs. active vs. historical). It never fabricates answers.

---

## Why Cards Do Not Derive From Other Cards

The Children card and the Financial Configuration card both consume `_inquiry_children`
placement facts (program, room, schedule). They are peers consuming shared facts, not a hierarchy.

```
context.truth._inquiry_children
  ├── Children card         → displays placement/status (who, where, what status)
  └── Financial Config card → adds payer/responsibility/payment readiness to same child facts
```

If the Financial Configuration card derived from the Children card, two problems follow:

1. **Coupling**: Financial Config would break whenever Children card internals change.
2. **Grain confusion**: the Children card is case-grain display; financial configuration
   is child-grain ownership. The billing responsibility belongs to an OCM, not a household.

**Rule**: every card reads from `context.truth` or `context.signals`. No card reads from
another card's evidence output.

---

## Why Expanded View Is Evidence / History, Not Just More Fields

Summary state answers the operational question in one line (the insight). Focus/Expanded
state should deepen that answer with domain evidence — not expose raw configuration fields.

A billing card expanded view shows:
- billing readiness checklist (evidence of configured state)
- payer / responsibility breakdown (evidence of who pays what)
- payment history, outstanding balance (evidence of activity)

It does NOT show: raw record fields, API IDs, internal config flags, or a general
"show more" of the summary content.

This keeps expanded views purposeful and scannable rather than becoming dump tabs.

---

## Reference Implementation: Financial Configuration Card

### Naming

The card key is `billing_preview` (code, unchanged in this PR). The conceptual name
going forward is **Financial Configuration** — it answers the configuration question,
not just whether a billing preview exists.

### Operational Question by Phase

| Phase | Question |
|---|---|
| Enrollment / Pre-attendance | "Is this child financially configured so billing can begin?" |
| Active Attendance | "What is the current financial state of care?" |

### Fact Sources (shared with Children card)

From `context.truth._inquiry_children` (per-child rows):
- `desired_program_label` — program placement
- `program_room_cohort_label` — room / cohort
- `desired_schedule_label` — schedule pattern
- `desired_start_date` — start date

These are the placement facts. The Financial Configuration card adds:
- Tuition rule (which rate applies to this program/schedule)
- Billing responsibility (who pays, what split)
- Billing contact (who receives invoices)

### Signal Layer

`context.signals.billing` carries the current truth projection:

```typescript
type OperationalBillingSignal = {
  billingConfigured: boolean;       // is billing fully configured?
  billingContactName: string | null;
  billingContactEmail: string | null;
  tuitionRateLabel: string | null;
  feeBalanceCents: number | null;   // outstanding balance
};
```

Payer/responsibility/subsidy fields are NOT yet in the billing signal — they will be
added when the billing responsibility write path is built. Until then, the card shows
a `"Billing responsibility not configured."` missing-state section rather than fabricating
payer data.

### Evidence Layers

**Summary (always visible)**:
- Configured / not-configured status chip
- Tuition rate label (or missing)
- Billing contact name (or missing)
- Outstanding balance if present

**Focus / Expanded (opened on demand)**:
- Billing readiness checklist (billing contact ✓/○, tuition rate ✓/○)
- Payer / responsibility sections — only when real payer records exist
- Missing responsibility state — when no payer records exist
- Future: activity/history area (last payment, next charge) — only when real charge records exist

**Hard rules**:
- No fake payers. No fake invoices. No fake payment history.
- Balance shown only when `fee_balance_cents > 0` and is a real persisted value.
- Responsibility section shown only when real payer records are projected into truth.

### Lifecycle

```
billing_preview key
  Summary    — status chip + tuition rate + billing contact or missing state
  Expanded   — readiness checklist + payer sections (real or missing-state)
  [deferred] — activity/history tab when charge/payment records are available
```

Read-only until a billing assignment write path is built
(see [Operational Grain Doctrine §7](operational-grain-doctrine.md#7-billing-evolution-doctrine)).

---

## Transferable Domains

The same four-layer pattern applies to each domain below. None of these are being built now.
The structure is documented to ensure future cards follow the same model without redesign.

### Scheduling

```
Placement → Room → Schedule Pattern → Staffing Need → Daily Schedule Activity
```

| Layer | Source | Evidence |
|---|---|---|
| Facts | `desired_schedule_label`, room assignment | Program, room, requested days/times |
| Configuration | Schedule record (is a confirmed schedule set?) | Confirmed M–F 8:30–2:30 / not yet scheduled |
| Readiness | Is a room assigned? Is capacity available? | Seat confirmed / waitlisted |
| Activity | Actual attendance sessions, exceptions | Today's check-in status, week view |

**Card question**: "Is care scheduled and confirmed for this child?"

### Attendance

```
Schedule → Expected Attendance → Check-in/out → Exceptions → Attendance History
```

| Layer | Source | Evidence |
|---|---|---|
| Facts | Confirmed schedule sessions | Expected days/times |
| Configuration | Attendance tracking setup (check-in method, contact for pickup) | Configured / not configured |
| Readiness | Is today's attendance trackable? (schedule + setup present) | Ready / missing setup |
| Activity | Check-in/out events, absences, exceptions | Today's status, history |

**Card question**: "Is this child checked in, and is attendance on track?"

### Staff

```
Role → Assignment → Schedule → Compliance → Work History
```

| Layer | Source | Evidence |
|---|---|---|
| Facts | Staff role, room assignment | Lead Teacher · Butterflies Room |
| Configuration | Schedule assigned, compliance docs on file | Schedule configured / compliance missing |
| Readiness | Are required certifications / background checks current? | Current / expiring / missing |
| Activity | Shift records, time worked, incidents | This week's hours, notes |

**Card question**: "Is this staff member assigned, compliant, and scheduled?"

---

## Pattern Checklist for Future Domain Cards

When building a new domain card, verify:

- [ ] Card reads from `context.truth` or `context.signals` directly — NOT from another card's evidence
- [ ] Summary answers the operational question in one line
- [ ] Expanded shows domain evidence (checklist, records) — not a dump of extra fields
- [ ] Read-only until a real write path exists for that domain
- [ ] Missing-state sections displayed when data is absent (not hidden, not fabricated)
- [ ] Grain is correct: case-grain for household-level questions, child-grain for per-child questions
- [ ] No synthetic status strings — status reflects actual persisted state
- [ ] Activity/history sections gated on real record existence, not stubbed

---

## Implementation Notes

The Financial Configuration card is the reference implementation for this pattern.
Its current state (`billing_preview` key, `BillingPreviewCard` component,
`buildBillingPreviewCardEvidence`) demonstrates:

- **Summary** with status chip + supporting line ✅
- **Expanded** readiness checklist driven by real signal fields ✅
- **Missing-state** handling when billing is not configured ✅
- **Balance line** only when `fee_balance_cents > 0` ✅
- **Zero fabrication** of financial values ✅

Future additions (payer rows, charge history, subsidy section) follow the same evidence-first
approach: project real data, display missing-state when absent, defer until write path exists.
