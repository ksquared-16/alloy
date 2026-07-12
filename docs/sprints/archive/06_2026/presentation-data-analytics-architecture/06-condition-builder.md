# Condition Builder — One Condition Engine

**Path:** `docs/sprints/06_2026/presentation-data-analytics-architecture/06-condition-builder.md`
**Status:** Architecture sprint — design only (June 2026)
**Deliverable:** 5 — Condition Builder

---

## 1. One engine, not many

Every configurable behavior in Alloy that asks "when?" uses **one** condition engine, **one** grammar, and the **same** Data Source Browser as bindings. There are no per-feature condition systems.

The conditional properties (the "condition slots"):

| Property | Governs | Default |
|---|---|---|
| **Visible When** | whether a primitive renders | always |
| **Editable When** | whether a field can be changed | per field/BP rule |
| **Required When** | whether input is mandatory | per field rule |
| **Highlighted When** | emphasis treatment | never |
| **Collapsed When** | default expand/collapse | per card |
| **Disabled When** | non-interactive state | never |
| **Badge When** | show a badge/flag | never |
| **Actions Available When** | whether an action offers | per action rule |

All eight evaluate the **same** condition shape against the **same** references.

## 2. The grammar

```
Condition  := Group | Predicate
Group      := { match: any | all | none, conditions: [Condition, …] }      (nestable)
Predicate  := { left: DataReference, operator: Operator, right: Operand }
Operand    := Literal | DataReference | Parameter
Parameter  := CurrentUser | Today | ActiveViewpoint | ActivePerspective | CurrentLocation | …  (System kind)
```

- **Left side is any Data Reference** — the *same* references used for bindings, picked from the *same* Browser. (*Primary Contact → Email*, *Billing → Balance*, *State → Readiness*, *Metric → Occupancy*.)
- **Right side** is a literal, **another reference**, or a system **parameter** (so you can compare a field to the current user, or a date to today).
- **Groups nest** with `any`/`all`/`none` for arbitrary boolean logic without raw expressions.

## 3. Operators are type-aware

The operator menu is derived from the **Presentation Type** of the left reference — the admin never sees an operator that doesn't apply.

| Left type | Operators offered |
|---|---|
| **Text** | is, is not, contains, starts with, is empty, is not empty |
| **Number / Money / Percentage / Score** | =, ≠, <, ≤, >, ≥, between, is empty |
| **Date / DateTime** | before, after, on, between, within (last/next N), is empty |
| **Boolean** | is true, is false |
| **Status** | is, is not, is one of, is not one of |
| **Entity** | is, is not, is set, is empty |
| **Collection** | is empty, is not empty, count =/>/<, any (sub-condition), all (sub-condition) |
| **Metric** | =, ≠, <, >, in band (good/warning/critical), vs comparison up/down |

`changed` / `changed to` are offered where the runtime can observe transitions (status, stage).

## 4. Collection sub-conditions

For `Collection` left references, `any`/`all` take a **sub-condition over the item's references** — reusing the whole grammar recursively:

> *Highlighted When* **Children** `any` ( **Child → Enrollment Status** `is` *Unenrolled* )

This is the condition analog of per-item slot templates — the same machinery, one level down.

## 5. Evaluation semantics

| Concern | Rule |
|---|---|
| **Context** | Conditions evaluate in the same context as bindings: subject, Viewpoint, Perspective, system. |
| **Timing** | At render/resolution time; condition-driven properties re-evaluate when their inputs change (reactive, but presentation-only). |
| **Missing data** | `is empty` is true for resolved-empty; *not-yet-loaded* never flips a visibility gate to a false empty (honors reveal doctrine). |
| **Org scoping** | Inherited from references — no cross-tenant comparisons. |
| **Authority** | Conditions affect **presentation** only (visibility, emphasis, availability). They never mutate records, statuses, or workflow. `Required When` informs validation but field/BP rules remain authoritative. |

## 6. Relationship to Business Process rules

Some conditions are **partly owned** by the Business Process / status system (e.g., a field editable only in a stage). The engine:

- Shows BP-owned conditions as **read-only context** ("editable in Tour stage — set by Business Process").
- Lets the surface add **additional** presentation conditions on top (additive, never overriding BP authority).
- Marks clearly which part is BP-owned vs surface-owned, so admins understand precedence.

## 7. UX principles (the builder)

1. **Same Browser, same concepts.** Picking the left side opens the identical Data Source Browser used for bindings — *Primary Contact → Email*, not `person.email`.
2. **Type-led.** After picking the left reference, only valid operators appear; the right-side control matches the type (a date picker for dates, a status chooser for statuses, a reference picker for references).
3. **Plain-language read-back.** Every condition renders as a sentence: *"Show this card when Balance is greater than $0 and Readiness is not Ready."*
4. **Groups are visual.** any/all/none groups are indented blocks with a clear connector, not parentheses in text.
5. **Reusable & inline.** The builder appears inline in Content Mode (Experience Builder V2), anchored to the element whose behavior it governs.
6. **No raw expressions.** There is no formula/text-expression entry — everything is picker-driven, which is what keeps it learnable and safe.

## 8. What the Condition Builder must not do

- Must not introduce a second condition grammar for any feature.
- Must not expose database fields or raw expressions.
- Must not allow conditions to mutate truth (presentation-only).
- Must not override Business Process / field authority — only add presentation conditions.
- Must not offer type-invalid operators.

## 9. Cross-references

| Concern | Doc |
|---|---|
| References (left/right operands) | [`01-presentation-data-doctrine.md`](./01-presentation-data-doctrine.md), [`02-data-taxonomy.md`](./02-data-taxonomy.md) |
| The shared Browser | [`07-data-source-browser.md`](./07-data-source-browser.md) |
| Inline editing surface | `../experience-builder-v2-runtime-editing/05-content-mode-doctrine.md` |
| Condition mockup | mockup `05-condition-builder` |
