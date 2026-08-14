---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Canonical Interaction Model

**Status:** Canonical doctrine (June 2026). Defines the single interaction spine every operational domain inherits — Enrollment, Billing, Attendance, Scheduling, Staffing, Subsidy, Compliance, POS, Transportation, Meals, Health.

This document is **doctrine, not implementation status**. It cements the operator interaction model *before* mockups and refactor planning so that future surfaces are composed from shared primitives rather than invented per domain. Where current implementation differs from this model, the gaps are stated explicitly in [§ Doctrine vs. current implementation](#doctrine-vs-current-implementation) and [§ Known UX alignment gaps](#known-ux-alignment-gaps).

See also: [Interaction Grammar](./interaction-grammar.md) (the laws that bind these primitives), [Operator Story](./operator-story.md) (the lived experience), and [Alloy Visual Language](./alloy-visual-language.md) — **the bridge from this model into mockups** (how the primitives should look and feel).

---

## Why this doctrine exists

Alloy is moving from *"Enrollment CRM + configured drawers"* toward a **universal operational platform**. The risk in that move is that each new domain — Billing, Attendance, Scheduling, Staffing — quietly becomes its own product with its own mental model: a "Billing Drawer," an "Attendance Drawer," a "Person Drawer," each designed from scratch.

Alloy rejects that. There is **one interaction model**. Domains differ in *what they are about*, not in *how the operator moves through them*. Enrollment is the reference implementation; Billing is the validation case; Attendance and Scheduling should fit naturally without a new paradigm.

This complements [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md):

| Doctrine | Answers |
|----------|---------|
| **Operational UX Architecture** (`operational-ux-doctrine.md`) | *Why* every domain shares one architecture — five planes, Operations/Records split, progressive drawers, tabs vs. actions. |
| **Canonical Interaction Model** (this doc) | *What the primitives are* — the named spine an operator traverses, and how the universal drawer carries meaning. |
| **Interaction Grammar** (`interaction-grammar.md`) | *The laws* — which primitive owns what, and how they are allowed to relate. |

---

## The canonical spine

Every operational interaction in Alloy traverses the same path:

```
Workspace
  → Perspective
    → Queue
      → Row
        → Drawer (infra) / **Focus Panel** (presentation)
          → Context Frame
            → Mode
              → Card / **Subject Composition**
                → Section
                  → Field
```

> **Alloy OS vocabulary:** The operator-facing surface at this step is the **Focus Panel** — one shell, different **subject composition** per operational subject and mode. Legacy code and this spine still say *Drawer* for the payload/reveal layer; see [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md).

The operator learns this **once**. Adding Billing or Attendance feels like the same workspace gaining new abilities, not learning a new tool.

---

## Record attention resolves the subject first

**Durable record attention resolves the SUBJECT first. Operational host/context is optional
enrichment. Operational intent may legitimately have no destination; durable-record intent remains
openable whenever the canonical record exists and access permits.**

An active Work Unit says where a subject is **worked**. It never said whether the subject **exists** —
but until August 2026 the contract made it the existence authority anyway, and the consequences were
invisible for exactly as long as they lasted: a canonical staff member (Person + Employment, no
household) had no representable destination at all, and an enrolled child whose case had left the
active queue became unopenable while remaining fully enrolled. Both answered `null`, callers
correctly withdrew the affordance, and nothing ever errored.

### The subjects

| Subject | Identity of record | Has an operational home of its own? |
|---|---|---|
| `opportunity` | `opportunities.id` | **Yes** — a case IS the operational home. It is not a durable-record subject; routing it to one would route around the queue it belongs to. |
| `person` | `persons.id` | No. A staff member has no household and no case, and must still open. |
| `child` | `customer_members.id` | No. ⚠ `customer_members.person_id` is NULLABLE — keying a child on its person loses every person-less child. |

### The two intents — declared, never inferred

| Intent | Question | Answer when no queue holds the record |
|---|---|---|
| `operational` (default) | "Where do I **work** this?" | `null` / `false` — **a valid answer**, not a failure |
| `durable_record` | "**Open** this record." | Opens |

The caller declares which. The same record has different right answers under the two, and because
`null` is *legitimate* on the operational side, an inferred intent would fail silently — which is the
defect class this whole model exists to remove. Callers state only intent; the adapter owns household
resolution, Work Unit keys, addresses and composition.

### Optional host semantics

`operational_host` is the case a durable subject is ALSO being worked in, when one exists. It is
typed `opportunities` because a *host* genuinely is always a case — what changed is that a host is no
longer required for a subject to exist. It may add an affordance. It may never decide that a subject
exists, change its identity, or supply its `businessProcess`, and it never participates in card
selection — otherwise the same record would show different cards depending on someone else's
workflow state.

A host with no active Work Unit key is a case that exists but is not a destination
(`hasOperationalDestination`).

### One runtime, composition varies by subject

There is one Focus Panel runtime, one grid and one card catalog. What varies is composition: a card
**declares** the subject grains it can truthfully compose for, and a composer selects. An undeclared
card is case-only — silence never widens applicability.

@see `docs/runtime/DURABLE-RECORD-ATTENTION.md` for the implementation and its certification.

## Primitive definitions

### Workspace

The operator's home for getting work done. A workspace hosts business processes, their stages, and the queues that surface work. The operator arrives here, not at a record. Route: `/workspace`.

> The workspace begins with **work**, not with a thing. See `../core/navigation-and-workspace-doctrine.md`.

### Perspective

> **Terminology (June 2026):** The operator-facing name for this primitive is **Work View**. `Perspective` / `RuntimePerspective` / `PerspectiveConfig` are retained as **internal compatibility/runtime** names only — this spine keeps "Perspective" as the architectural term, but UI copy should read **Work View** and continue converging there. See [`operational-workspace-shell.md` § Perspective terminology](./operational-workspace-shell.md#perspective-terminology-resolved).

An **operating lens** over the same underlying records — a saved framing of *what subset of work matters right now* and *how it is ordered/grouped*. "Today's Tours," "Failed Payments," "Missing Check-ins," and "Waitlist" are perspectives.

A perspective **changes the lens, not reality**. It re-filters, re-sorts, and re-groups records; it never creates a separate data store and never mutates the records it observes. Two perspectives over the same records show the same truth from different angles.

### Queue

The **preview/selection surface** for a perspective — a list of candidate records the operator can scan and pick from. Queues are *previews only*: they render labels, sort, filter, and navigate. They do **not** own data, drive business logic, run workflows, perform financial math, or resolve identity. Authoritative detail always comes from the record responder / entity GET.

See `./queue-system.md`, `../core/record-system.md`.

### Row

A single **preview** of one record inside a queue. A row is enough to recognize and select a record; it is never the source of truth for acting on it. Selecting a row opens the drawer **in place** — the queue does not remount, and the operator never feels they navigated to a separate "record module." Row order defines `Previous`/`Next` traversal (see Interaction Grammar).

### Drawer

The **one universal record surface**. There is a single drawer shell across the entire platform. There is **no** "Opportunity Drawer product," "Person Drawer product," "Billing Drawer product," or "Attendance Drawer product." The drawer is detail *in place*, and it carries three distinct concepts at once:

1. **[Record of Truth](#record-of-truth)** — the authoritative database/domain entity.
2. **[Record of Attention](#record-of-attention)** — what the operator is currently working on.
3. **[Context Frame](#context-frame)** — *why* the operator opened it right now.

The drawer **preserves workspace, perspective, and queue context** while open (see Interaction Grammar). See `./drawer-system.md`.

### Context Frame

The **reason the drawer was opened right now** — the entry intent that shapes which lens, mode, and cards lead. The same Record of Truth opened from different perspectives presents a different Context Frame:

| Entry perspective | Record of attention | Context Frame |
|-------------------|---------------------|---------------|
| Today's Tours | Family / enrollment context | **Tour** |
| Failed payment | Billing account / family financial context | **Billing** |
| Missing check-in | Child-day attendance context | **Attendance** |
| Waitlist | Child enrollment context | **Waitlist** |
| Parent contact update | Person / contact | **Family / Communication** |

The Context Frame does **not** change what the record *is*. The opportunity is still an opportunity; the person is still a person. The Context Frame changes **what leads** — which mode opens first and which cards surface — so the operator lands on the work they came to do.

### Mode

The **primary lens within a drawer** — how the operator is currently relating to the record. The canonical runtime vocabulary is **Summary / Work / Activity** (these labels reflect operator intent; earlier drafts used Overview / Operations / Activity):

| Mode | Purpose | Feel |
|------|---------|------|
| **Summary** | Ambient understanding of the whole record | Business meaning first; reading, not editing |
| **Work** | Active operational work surfaces for the record | Cards for the domains in play (Billing, Attendance, Schedule, …) |
| **Activity** | History / timeline of what has happened | Append-only record of facts |

Modes organize the drawer's lenses. Per-domain operational surfaces (Billing, Attendance, Schedule, Placement) appear as **cards inside Work**, gated by the progressive-drawer rules (Hidden / Startable / Active) from `../core/operational-ux-doctrine.md` — not as separate drawer products. The Context Frame decides which mode and cards lead on open.

### Card

A **reusable business primitive** — not a raw field group. A card answers a *business question* and composes from the same underlying record truth wherever it appears: drawer, queue snapshot, planning, analytics, reports, and BOS context. Build one strong card primitive and the runtime reuses it everywhere. See [§ Cards doctrine](#cards-doctrine).

### Section

A grouping **within a card** — an organizing band of related content under the card's business question. Sections structure a card; they do not own data and are not a substitute for cards as the default runtime experience.

### Field

The smallest unit — a single value bound to record truth. Fields are display-first; editing is intentional and explicit (see [§ Known UX alignment gaps](#known-ux-alignment-gaps)). A field never owns truth; it observes and (when explicitly editable with a save adapter) proposes a change to the record.

---

## The drawer carries three concepts

This is the most important correction in this doctrine. Operators do **not** experience separate drawer products. They experience **one contextual record drawer** that simultaneously holds:

### Record of Truth

The authoritative entity in the database/domain: an `opportunity`, a `person`, a child (`opportunity_customer_members` enrollment grain), a `child_enrollment_agreement`, a billing account, an attendance event, a `location`. These remain **records/entities**. The interaction model never dissolves them; it stops *fragmenting them into separate drawer experiences*.

### Record of Attention

**What the operator is actually working on** in this moment — which may be narrower or differently framed than the Record of Truth. Opening a family from Today's Tours, the Record of Truth may be the opportunity, but the Record of Attention is the *tour and the family enrollment context*. Opening from a failed payment, the Record of Attention is the *family's billing/financial context*.

### Context Frame

**Why it was opened right now** (defined above). Truth + Attention + Frame together let one drawer serve every entry point without becoming a different product per domain.

> **Records remain records.** Opportunity, Person, Child, Billing Account, Attendance Event, Location, and Agreement are all still entities with their own authority. What changes is the *experience*: one contextual drawer, many entry intents.

---

## Relationship-scoped authority

The model must support **households with multiple children and multiple guardians/parents**. Authority is **not** assumed globally at the household level. A parent/guardian relationship may apply to **one child, several children, or all children**, and each kind of authority is scoped independently:

| Authority | Scope is per | Never assume |
|-----------|--------------|--------------|
| Visibility | child / relationship | "Guardian sees all children" |
| Pickup / contact permission | child / relationship | Household-wide pickup rights |
| Financial responsibility | child / relationship | One payer for the whole household |
| Communication semantics | child / relationship | One inbox for all guardians |
| Primary/emergency designation | scope (this child / selected siblings / all) | Boolean on the person record |

Primary contact, emergency contact, pickup authorization, and financial responsibility are **relationship actions**, not inline booleans on a person. This is already doctrine in `../core/record-system.md` § Relationship model — the interaction model inherits it: the drawer must make the **active child/relationship scope explicit** rather than presenting a single flat household view.

---

## Location-scoped operational context

The model must support **location-scoped operational context**. A household may have children tied to **different locations, programs, rooms, schedules, statuses, or enrollment contexts**:

- Child site authority is `opportunity_customer_members.location_id`, **not** `opportunities.location_id` alone (see `../core/placement-system.md`).
- The drawer must make the **active location/operational context clear** — without fragmenting into separate drawer mental models per location.
- A multi-location household is one Record of Truth experience with the active location/context surfaced, not N drawers.

---

## Cards doctrine

Cards are **reusable business primitives, not raw field groups**. They are the unit that lets Alloy compose many views efficiently from the same underlying truth. Build one strong card primitive and the entire runtime can reuse it across **drawer, queue snapshot, planning, analytics, reports, and BOS context**.

### Cards answer business questions

| Card | Business question it answers |
|------|------------------------------|
| **Enrollment Readiness** | Is this child ready to enroll? What's missing? |
| **Tour** | What is the tour state, and what's next? |
| **Placement** | Where is this child placed (site / program / room)? |
| **Schedule** | What days/pattern is committed? |
| **Attendance** | Who is present / expected / missing today? |
| **Billing Setup** | Is billing configured and ready to run? |
| **Family** | Who are the people and relationships? |
| **Funding** | What subsidy/funding applies and what's its state? |
| **Medical / Health & Safety** | What health, allergy, and safety facts apply? |
| **Operational Work** | What needs action on this record right now? |
| **Communications** | What has been said, and to whom? |
| **Forecast** | What does the future state look like? |
| **Capacity** | How full, and what's the room to grow? |

### Avoid

- ❌ "Enrollment Fields"
- ❌ "Billing Info"
- ❌ Raw grid-like field sections as the **default** runtime experience

A card leads with **business meaning**; fields are an implementation detail *inside* the answer, not the headline. (Grid/form layouts may still exist for dense editing, but they are not the default lens.)

### Card reuse

Because a card composes from record truth (not from queue JSON or another card), the same card primitive renders:

| Surface | Card role |
|---------|-----------|
| Drawer (Operations/Overview) | Full interactive card |
| Queue row / snapshot | Compact preview of the same card answer |
| Planning / Forecast | Card consuming projected facts |
| Analytics / Reports | Card answer aggregated across records |
| BOS context | Card answer the assistant reasons over and references |

Cards communicate **through records, not directly to other cards** (see Interaction Grammar).

---

## Doctrine vs. current implementation

This doc is the **intended model**. Current implementation is partially aligned. Do not overstate status.

| Primitive / concept | Doctrine (intended) | Current implementation (June 2026) | Gap / future alignment |
|---------------------|---------------------|------------------------------------|------------------------|
| Workspace → Stage → Record spine | Canonical | **Shipped** — `/workspace` → work-unit queues → drawer | None at spine level |
| Perspective | First-class named lens | **Partial** — perspectives expressed as queue lanes / attention buckets / client filters | Promote "perspective" to an explicit named concept |
| Queue / Row preview boundary | Locked | **Shipped & enforced** | None |
| Universal drawer shell | One shell, many entry intents | **Complete** — VM hard cutover; legacy drawer deleted; Focus Panel canonical | Card editing substrate; no legacy restoration |
| Context Frame | Explicit entry-intent concept | **Implicit** — drawers open from rows but entry intent is not a modeled concept | Model Context Frame so the same record leads differently per perspective |
| Mode (Summary / Work / Activity) | Three primary lenses; domains are cards in Work | **Tab-style** composition today (Placement, Schedule, Billing tabs) | Reframe progressive tabs into Modes + Cards |
| Card as reusable business primitive | Compose everywhere from record truth | **Partial** — Experience Builder composes sections/related-lists/widgets; some surfaces still field-grid | Build the card primitive; reuse across drawer/queue/analytics/BOS |
| Relationship-scoped authority | Child/relationship scoped | **Doctrine + partial runtime** — scoped relationship contacts shipped (`layoutRuntimeScopedRelationshipContacts`) | Extend scope to billing/visibility/communication consistently |
| Location-scoped operational context | Active location explicit | **Partial** — child site authority on OCM; operational enrollment (agreements/placements/schedules) flag-gated | Make active location/context a first-class drawer affordance |

For per-domain maturity see `../../foundation/platform-capabilities.md`. For sequencing see `../foundation/product-roadmap.md`.

---

## Known UX alignment gaps

These are **acknowledged gaps between today's runtime feel and the doctrine** — captured so mockups and refactors target them deliberately:

1. **Drawers feel too grid/form-like.** Runtime should feel like modern operational **cards**, not raw configurable database forms.
2. **Business meaning before fields.** The runtime should reveal *what this record means and needs* before exposing raw field values. Understanding should be **ambient**; editing should be **intentional**.
3. **Date/time controls are cumbersome.** They should become **platform-level input primitives**, not per-surface widgets.
4. **Field control consistency.** Dropdown styling, background, font color, disabled states, read-only vs. editable affordance, and field density need **system-level consistency** — one input system, not per-card divergence.
5. **Editing intent.** Edit mode should be explicit and obvious; display mode should never look half-editable. (See `./experience-builder-doctrine.md` § Inline edit behavior — derived section Edit is the current mechanism.)

These gaps do **not** weaken any locked runtime/performance doctrine (`../../system/adminv2-runtime-performance-doctrine.md`). They describe presentation and primitive maturity, not reveal/payload gates.

---

## Current Platform Direction

Alloy is standardizing around **Workspace → Perspective → Queue → Row → Drawer → Context Frame → Mode → Card → Section → Field**.

- **Enrollment** remains the **reference implementation**.
- **Billing** is the **validation case** — if it fits the model cleanly, the model is sound.
- **Attendance** and **Scheduling** should fit **naturally** with no new paradigm.
- **Mockups** should be derived from this doctrine, **not invented from scratch**.
- **Future implementation** should refactor **toward primitives**, not toward one-off screens.

---

## Cross-references

| Concern | Doc |
|---------|-----|
| Interaction laws / grammar | [`./interaction-grammar.md`](./interaction-grammar.md) |
| Lived operator experience | [`./operator-story.md`](./operator-story.md) |
| Visual doctrine (look/feel; mockup bridge) | [`./alloy-visual-language.md`](./alloy-visual-language.md) |
| Runtime Specification (synthesis; implementation bridge) | [`./alloy-runtime-specification.md`](./alloy-runtime-specification.md) |
| Five planes / domains-share-one-architecture | [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) |
| Drawer architecture & VM ownership | [`./drawer-system.md`](./drawer-system.md) |
| Queue preview boundary | [`./queue-system.md`](./queue-system.md) |
| Experience Builder (card/section/field authoring) | [`./experience-builder-doctrine.md`](./experience-builder-doctrine.md) |
| Record authority & relationship model | [`../core/record-system.md`](../core/record-system.md) |
| Placement / location-scoped context | [`../core/placement-system.md`](../core/placement-system.md) |
| Navigation & workspace spine | [`../core/navigation-and-workspace-doctrine.md`](../core/navigation-and-workspace-doctrine.md) |
| BOS / assist boundary | [`../modules/ai-platform.md`](../modules/ai-platform.md) |

---

## When this doc must be updated

- The canonical spine (Workspace → … → Field) changes.
- The three drawer concepts (Truth / Attention / Frame) change.
- A primitive is promoted from doctrine to shipped (move the row in [§ Doctrine vs. current implementation](#doctrine-vs-current-implementation)).
- A new operational domain validates or breaks the model.
