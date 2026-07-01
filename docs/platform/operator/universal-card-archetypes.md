# Alloy OS — System 5A — Universal Card Archetypes

**Revision:** 1  
**Status:** Approved / frozen (June 2026) — archetypes implemented in Focus Panel runtime  
**Extends:** [`operational-surface-design-system.md`](./operational-surface-design-system.md) (System 5 — frozen) · [`universal-card-system.md`](./universal-card-system.md) (System 4)

---

## Position in the stack

| System | Owns |
|--------|------|
| **System 4** | Universal Card primitive — anatomy, tiers, density, grid |
| **System 5** | Operational surface design — hierarchy, color, spacing, typography, shared grammar |
| **System 5A** | **Universal Card Archetypes** — purpose-specific composition within the shared design language |
| **System 5B** | **Card interaction & expansion** — five interaction models, back behavior, subject preservation |
| **System 5C** | **Content templates & field inclusion** — compact / expanded / drill / workspace field rules |

**Law:** System 5A does not replace System 5. Archetypes inherit System 5 tokens (white canvas, quiet borders, tier rails, typography scale). Variety comes from **archetype behavior**, never from arbitrary one-off styling.

**Related:** [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) (5B) · [`card-content-template-field-inclusion-doctrine.md`](./card-content-template-field-inclusion-doctrine.md) (5C)

---

## Principle

Every card answers **one business question**.

Different questions deserve **different archetypes**.

- **Consistency** comes from the design language (System 5).
- **Variety** comes from archetypes (System 5A).
- **Never** from arbitrary styling.

---

## Archetype catalog

| # | Archetype | Purpose | Typical cards |
|---|-----------|---------|---------------|
| 1 | **Action** | Move work forward | Why Now, Required Information, Current Work, Primary Next Action |
| 2 | **Status** | Explain operational state | Health, Readiness, Billing Status |
| 3 | **Summary** | Summarize a business domain | Tour, Communications, Documents, Current Step |
| 4 | **Profile** | Structured identity/context | Household, Primary Contact, Location, Program |
| 5 | **Collection** | Related records at a glance | Children, Tasks, Authorized Pickups |
| 6 | **Metric** | Single numeric signal | Capacity, Readiness %, Billing Balance |
| 7 | **Timeline** | Chronological history | Timeline, recent events |
| 8 | **Launcher** | Begin work | Work Launcher, Automation Launcher |

---

## Archetype 1 — Action Card

**Purpose:** Move work forward.

**Characteristics:** Strongest accent rail · obvious CTA · operational urgency · compact · tells operator exactly what to do.

**Grammar:** Icon · Title · Status · Primary insight · Supporting insight · Primary action

**Example:**

```
⚠ WHY NOW
Review Lead Overdue
Waiting 4 days
View Details →
```

---

## Archetype 2 — Status Card

**Purpose:** Explain operational state.

**Characteristics:** Medium emphasis · summary first · issue breakdown second · action optional.

**Body:** Bulleted issue list when issues exist (max 4 visible).

**Example:**

```
Enrollment Health
Needs Attention
• Tour overdue
• Medical Form Missing
View →
```

---

## Archetype 3 — Summary Card

**Purpose:** Summarize a business domain.

**Characteristics:** Descriptive · lightweight · one primary action · minimal body.

**Example:**

```
Tour
Not Scheduled
Family requested mornings
Schedule →
```

---

## Archetype 4 — Profile Card

**Purpose:** Display structured information.

**Characteristics:** Label/value pairs · missing information visible · no hidden fields.

**Law — Missing Information Rule:** Missing data is **shown**, never hidden.

Instead of omitting a blank phone field, display:

```
Phone
—
```

Readiness becomes **confirmation** instead of **discovery**.

**Example:**

```
Primary Contact    Justin Wright
Secondary Contact  —
Phone              555-555-5555
Email              —
View →
```

---

## Archetype 5 — Collection Card

**Purpose:** Summarize related records.

**Characteristics:** Small collection · max 3 visible rows · overflow indicator · per-item status.

**Example:**

```
Children
Emyrson     Waiting on Forms
McKenzie    Ready
+1 More
View All →
```

---

## Archetype 6 — Metric Card

**Purpose:** Single metric.

**Characteristics:** Large value · tiny supporting detail · almost no text · micro density preferred.

**Example:**

```
Readiness
87%
No blockers
```

---

## Archetype 7 — Timeline Card

**Purpose:** Explain history.

**Characteristics:** Chronological · timeline is the content · CTA de-emphasized or absent.

**Example:**

```
Today       Packet Sent
Yesterday   Lead Created
Monday      Status Changed
```

---

## Archetype 8 — Launcher Card

**Purpose:** Begin work.

**Characteristics:** Rows, not cards within cards · label + short description + affordance per row.

**Example:**

```
Manual        Start →
BOS Assist    Assist →
Import        Import →
```

---

## Configuration contract

Experience Builder does **not** configure arbitrary card layouts.

It **selects archetypes**.

| Card concept | Archetype |
|--------------|-----------|
| Children | Collection |
| Household | Profile |
| Health | Status |
| Why Now | Action |

The **platform owns archetype behavior**. Configuration selects which archetype to use for a card slot.

---

## Focus Panel mode composition

Modes intentionally **mix archetypes** — not one repeated template.

| Mode | Archetypes |
|------|------------|
| **Summary** | Action · Status · Summary · Profile · Collection · Metric |
| **Work** | Action · Launcher · Status · Collection |
| **Activity** | Timeline · Summary · Embedded Workspace |

---

## Embedded workspace rule (Communications)

Communications is special in Activity mode:

```
Activity
  → Timeline (default)
  → Communications tab
      → Communications Summary (context strip)
      → Open Thread affordance
      → Embedded CommunicationsDrawerSection
```

- Do **not** recreate messaging UI.
- Do **not** turn Activity into a second inbox.
- Sending remains header-action-driven, Inbox-driven, or explicit communication action-driven.

---

## Platform attributes

Runtime cards expose archetype for styling and tests:

- `data-card-archetype="action|status|summary|profile|collection|metric|timeline|launcher"`

Archetype inherits System 5 `data-card-role` from tier where applicable.

---

## Cross-references

- System 5 grammar: [`operational-surface-design-system.md`](./operational-surface-design-system.md)
- System 5B interaction: [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md)
- System 5C content templates: [`card-content-template-field-inclusion-doctrine.md`](./card-content-template-field-inclusion-doctrine.md)
- System 4 primitive: [`universal-card-system.md`](./universal-card-system.md)
- Runtime modes: [`alloy-runtime-specification.md`](./alloy-runtime-specification.md)
