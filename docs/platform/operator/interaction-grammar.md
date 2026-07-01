# Interaction Grammar

**Status:** Canonical doctrine (June 2026). The **laws** that bind the primitives defined in the [Canonical Interaction Model](./canonical-interaction-model.md). Where that doc names the parts, this doc states **which primitive owns what** and **how they are allowed to relate**.

This is doctrine. It constrains how new surfaces, cards, perspectives, and assist features may be built so they compose from one model instead of forming parallel runtimes.

---

## The grammar in one screen

```
configuration   defines   expression
business process defines  possibility
workflows       define    execution
records         define    truth
runtime         defines   how operators move through work
```

Everything below is an expansion of those five lines, plus the relationships between primitives.

---

## Ownership laws

### 1. Records own truth

A record is the **single authority** for its own data. Drawer authority, business logic, financial math, identity resolution, and workflow conditions resolve against the record (entity GET / record responder / underlying tables) — never against a preview.

### 2. Projections observe records

Queues, rows, cards, snapshots, planning views, analytics, and BOS context are all **projections** of records. A projection reads and presents truth; it does not become a second source of it.

### 3. Queues do not own data

A queue is a preview/selection lens. It MAY render labels, sort, filter, select, and navigate. It MUST NOT drive business logic, workflows, actions, financial math, identity resolution, or drawer authority. Pattern: **Queue → select → entity GET → act** (see `./queue-system.md`, `../core/record-system.md`).

### 4. Cards do not own data

A card is a reusable projection that answers a business question. It composes from record truth. It does not hold authoritative state of its own and does not persist a private copy of the record.

### 5. Cards communicate through records, not directly to other cards

When one card's change should affect another, it does so by **writing to the record** (through the proper action/workflow/PATCH path); the other card re-projects from updated truth. Cards never call each other or share mutable state directly. This is what keeps cards reusable across drawer, queue, analytics, and BOS without coupling.

### 6. Perspectives change the operating lens, not reality

A perspective re-filters, re-sorts, and re-groups the same records. It never mutates them and never creates a parallel data store. Two perspectives over the same cohort show the same truth, framed differently.

---

## Movement laws

### 7. The drawer preserves workspace / perspective / queue context

Opening a record opens the drawer **in place**. The workspace and queue page do not remount; the active perspective and queue selection persist. Closing the drawer returns the operator exactly where they were. The operator must never feel they navigated to a separate "record module."

### 8. Previous / Next follows the current filtered & sorted queue

In-drawer `Previous`/`Next` traverses the **operator's current view** — the active perspective's filtered, sorted, grain-scoped queue — not the underlying unfiltered table. If the operator filters to "Failed payments, oldest first," `Next` is the next failed payment by that order.

### 9. Actions are explicit operator intent

State changes happen through **actions** — explicit operator intent routed through the canonical action/workflow path (`../modules/actions-and-workflows.md`). Display surfaces never silently mutate truth. A hidden tab/card must never hide the path to begin valid work: surfaces show *history*, actions *start* work (see `../operational-ux-doctrine.md` § tabs vs actions).

---

## Assist law

### 10. BOS observes, proposes, and assists through the same primitives — never as a parallel runtime

The Business Orchestration System reads the same records, renders/reasons over the same cards, and acts only through the same actions, workflows, events, permissions, and audit paths as a human operator. BOS **proposes; humans approve**. There is no autonomous side-effect path and no BOS-only data model. If a capability can't be expressed through the existing primitives, it is not yet a capability. See `../modules/ai-platform.md`.

---

## Layer law

### 11. Each layer owns exactly one responsibility

| Layer | Owns | Does **not** own |
|-------|------|------------------|
| **Configuration** | *Expression* — how the org's work looks and is composed (fields, layouts, cards, statuses, placements) | Business truth; execution effects |
| **Business processes** | *Possibility* — what stages/work exist and what is valid | The act of executing; the recorded fact |
| **Workflows** | *Execution* — what happens when an event fires | The definition of what's allowed; the truth after |
| **Records** | *Truth* — authoritative state and history | How it's framed or presented |
| **Runtime** | *Movement* — how operators traverse work (the canonical spine) | What's true; what's allowed |

A change in **configuration** changes *expression*, never recorded operational truth. A change in **business process** changes *possibility*, never history. **Workflows** execute; **records** hold truth; **runtime** moves the operator through it.

---

## How the laws hold the model together

- Because **records own truth** and **projections observe records**, any number of cards, queues, and perspectives can exist without divergence.
- Because **cards talk through records**, the same card primitive is safe to reuse across drawer, queue snapshot, planning, analytics, reports, and BOS.
- Because **perspectives change lens, not reality**, "Today's Tours" and "Failed Payments" are cheap to add and never fork the data.
- Because **the drawer preserves context** and **Previous/Next follows the current view**, an operator can dive into a record and resume the exact queue they were working.
- Because **actions are explicit** and **BOS uses the same primitives**, automation and assist never become a shadow system.

---

## Anti-patterns (forbidden)

- ❌ Reading queue JSON for business logic, actions, or financial math.
- ❌ A card holding authoritative state or mutating another card directly.
- ❌ A perspective that writes to or forks records.
- ❌ A drawer that navigates away from / remounts the queue, or a `Next` that ignores the active filter/sort.
- ❌ A display surface that mutates truth without an explicit action.
- ❌ A BOS path that writes operational truth without a human-approved action through the normal path.
- ❌ Encoding business-critical truth only in configuration JSON (config steers; code owns invariants).
- ❌ A new domain shipping its own drawer product / navigation spine / record module instead of reusing primitives.

---

## Cross-references

| Concern | Doc |
|---------|-----|
| Primitive definitions | [`./canonical-interaction-model.md`](./canonical-interaction-model.md) |
| Lived operator experience | [`./operator-story.md`](./operator-story.md) |
| Visual doctrine (look/feel; mockup bridge) | [`./alloy-visual-language.md`](./alloy-visual-language.md) |
| Runtime Specification (synthesis; implementation bridge) | [`./alloy-runtime-specification.md`](./alloy-runtime-specification.md) |
| Queue preview boundary | [`./queue-system.md`](./queue-system.md) |
| Record authority | [`../core/record-system.md`](../core/record-system.md) |
| Tabs vs. actions / progressive drawer | [`../operational-ux-doctrine.md`](../operational-ux-doctrine.md) |
| Actions & workflows | [`../modules/actions-and-workflows.md`](../modules/actions-and-workflows.md) |
| BOS boundary | [`../modules/ai-platform.md`](../modules/ai-platform.md) |
| Configuration steers / code owns | [`../modules/configuration-platform.md`](../modules/configuration-platform.md) |

---

## When this doc must be updated

- An ownership boundary changes (who owns truth, who may mutate).
- The movement laws (context preservation, Previous/Next semantics) change.
- The BOS boundary changes.
- The layer responsibilities (configuration / process / workflow / record / runtime) change.
