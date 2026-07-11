# Identity Surface Doctrine — Canonical Disclosure Model

**Status:** Active — July 2026  
**Scope:** One identity interaction model for every identity entity in Alloy (runtime and Surface Builder)  
**Does not change:** Current Work, Capability Registry execution, Process Runtime, entity/relationship truth

---

## North star

> Runtime disclosure has four layers, but configuration has three field purposes plus evidence collections. **Context is derived from Summary plus Context Facts.**

Every identity follows the same grammar: Household, Parent, Guardian, Child, Employee, Additional Contact, Emergency Contact, Vendor, and future identity types.

**Builder must mirror runtime cognition.** The administrator learns the same hierarchy the operator experiences.

---

## 1. Runtime layers (operator experience)

Identity information progressively discloses through four **runtime layers**:

```
Summary → Context → Details → Evidence
```

These are information layers, not UI widgets.

| Layer | Question | Purpose |
| --- | --- | --- |
| **Summary** | Who is this? | Recognition — avatar, name, phone, badge |
| **Context** | What else belongs here? | Operational understanding — **Summary + incremental facts** |
| **Details** | Tell me more about **this** person? | Inspection after selecting one identity |
| **Evidence** | Show me supporting proof? | Collection-oriented proof (documents, forms, …) |

Runtime flow:

```
Summary → View Collection → Select Identity → Details → Evidence
```

Do **not** jump directly from collection to inspection.

---

## 2. Configuration purposes (administrator buckets)

Administrators configure **three field purposes** plus evidence collections:

```
Summary Fields → Context Facts → Detail Fields → Evidence Collections
```

**Context is a projection, not a duplicate field layer.**

```
Context (runtime) = Summary Fields + Context Facts
```

### Summary Fields

Recognition only. Lightweight. No inspection-level information.

### Context Facts

**Incremental operational facts only** — teacher, program, room, rate, etc.

Summary fields **automatically appear in Context** at runtime. Administrators must **not** configure Name, Phone, Email (or other summary fields) again under Context Facts.

### Detail Fields

Inspect one identity after selection — address, employer, notes, secondary phone, etc.

Detail fields must **never** appear in Context unless explicitly configured as Context Facts (discouraged for inspection-level data).

### Evidence Collections

Collection-oriented — documents, health forms, licenses, immunizations, authorizations. **Not** a generic field-placement bucket.

---

## 3. Configuration shape

Persisted on `NestedSurfaceGroupConfig` (no parallel format):

| Purpose | Persistence | Placement tier |
| --- | --- | --- |
| Summary Fields | `selectedFieldKeys` | `summary` |
| Context Facts | `contextFieldKeys` | `context_fact` (legacy tier `context` adapts on read) |
| Detail Fields | `expandedFieldKeys` | `details` (legacy tier `expanded` adapts on read) |
| Evidence Collections | `evidenceCollections` | collection config |

Conceptual section shape:

```ts
type IdentitySectionConfig = {
  summary: { fields: IdentityFieldPlacement[] };
  context: { facts: IdentityFieldPlacement[] };  // incremental only
  details: { fields: IdentityFieldPlacement[] };
  evidence: { collections: IdentityEvidenceCollectionConfig[] };
};
```

Shared VM invariant:

```ts
contextRows = composeSummaryAndContextFacts(summaryRows, contextFactRows);
```

- Stable order: summary first, then incremental facts  
- Deduplicate by field ref; **summary placement wins**

---

## 4. Runtime examples

### Household Summary

```
Jordan Johnson · Phone · Email
Taylor Johnson · Phone · Email
2 children
```

### View Household / Context

```
Jordan Johnson · Phone · Email · (+ configured context facts)
Taylor Johnson · Phone · Email
Children · Emergency Contacts · Additional Contacts
```

Summary information appears automatically — no duplicate configuration.

### Parent Details

```
Address · Employer · Language · Notes
```

### Children Context

```
Name · DOB/Age · Schedule · Teacher · Program · Room · Rate
         ↑ summary (inherited)              ↑ context facts only
```

---

## 5. Builder interaction

Progressive drill — **not** four unrelated top-level tabs:

```
Identity Surface → Summary Fields → Context Facts → Detail Fields → Evidence Collections
```

For collection surfaces:

```
Household → Summary → Primary Contact → Configure Summary
Back → Context Facts → Primary Contact → Configure incremental facts
Back → Detail Fields → …
Back → Evidence Collections → …
```

### Context Facts editor

Must show:

1. **Inherited from Summary** (read-only) — cannot remove from Context here; remove from Summary to remove from Context  
2. **Context Facts** (editable) — add only incremental facts  
3. **Context Preview** — Summary + Context Facts merged (representative labels, never raw field keys)

---

## 6. Boundaries

### Evidence

Collection reference, ordering, display mode, empty state. Not another field grid.

### Capabilities

Identity config controls **placement** only. Capability Registry owns execution, permissions, and handlers. Do not mix capabilities into field lists.

---

## 7. Compatibility

| Legacy | Canonical |
| --- | --- |
| `selectedFieldKeys` | Summary Fields |
| `contextFieldKeys` | Context Facts (summary duplicates stripped on reconcile) |
| `expandedFieldKeys` | Detail Fields |
| placement tier `context` | `context_fact` |
| placement tier `expanded` | `details` |

Existing published configs continue to load. Reconcile adapts tiers and strips duplicate context facts.

---

## 8. Wireframes

### Builder — Context Facts

```
┌ Context Facts — Primary Contact ────────────┐
│ Context includes Summary automatically.      │
│                                              │
│ Inherited from Summary (read-only)           │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│   Name · Phone · Email                       │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│                                              │
│ Context Facts                    [+ Add fact]│
│   Teacher · Room                             │
│                                              │
│ Context Preview                              │
│   Name · Phone · Email · Teacher · Room      │
└──────────────────────────────────────────────┘
```

---

## 9. Code map

| Layer | Path |
| --- | --- |
| Doctrine | `docs/platform/operator/identity-surface-composition-v2.md` |
| Context composition | `web/lib/adminV2/runtime/focusPanel/identity/composeIdentityContextRows.ts` |
| Layer types | `web/lib/adminV2/settings/surfaces/identityDisclosureLayers.ts` |
| VM projection | `web/lib/adminV2/runtime/focusPanel/identity/buildIdentityCardVM.ts` |
| Builder drill-in | `web/components/adminV2/settings/surfaces/composer/IdentityBuilderDrillIn.tsx` |
| Context Facts panel | `web/components/adminV2/settings/surfaces/composer/IdentityContextFactsPanel.tsx` |
| Tests | `web/tests/adminV2/runtime/identityDisclosureLayers.test.ts` |

---

## 10. Remaining gaps

| Gap | Notes |
| --- | --- |
| Card disclosure state machine | Wire Household/Children local expanded/focus to `IdentityDisclosureDepth` |
| Evidence collection builder | Minimal UI; types persisted |
| Nested identity builder drill | `nested-purpose` frames defined; full collection-surface drill pending |
| Builder/runtime parity fixture | Automated cross-check test |
| `insightTemplate` on summary/context | Type hook reserved; not yet implemented |
