---
owner: operator
status: canonical
last_reviewed: 2026-07-17
supersedes: [docs/system/configuration-workspace-doctrine.md, docs/system/configuration-workspace-v1-doctrine.md]
---

# Configuration Workspace Platform Doctrine

**Status:** Canonical. **Locations Version 1 is the frozen reference implementation.**
**Reference implementation:** `web/components/adminV2/settings/locations/` with closeout evidence in `docs/sprints/completed/locations-config-runtime/`.
**Builds on:** `alloy-visual-language.md`, `canonical-interaction-model.md`, `operational-surface-design-system.md`, `focus-panel-architecture-vocabulary.md`. **Consumes (does not redefine):** `../modules/configuration-platform.md` (control plane), `../../system/configuration-ownership-doctrine.md` (ownership matrix), `../../system/configuration-mode-doctrine.md` (shell geometry).

> **Operators do not edit records. Operators operate configuration objects.**
> Configuration is not CRUD. Configuration is an operational experience — the same operator platform Alloy uses to run the business, turned inward to configure it.

---

## Purpose

This is the canonical owner for **every configuration workspace in Alloy** — present and future. It defines the one interaction model that all configuration domains inherit, so that Commercial, Communications, Business Processes, Fields, Surfaces, Automation, Access, and AI Configuration are not each designed from scratch. They adopt this platform.

It exists because a realization surfaced while building Locations: the operator configuring a location is not filling in a database record. They are **running Downtown Campus** — reading its health, seeing what needs attention, and adjusting the parts they own. That is an operational act, not a data-entry act. When configuration is designed as an operational experience, it becomes obvious; when it is designed as CRUD, it becomes a form the operator must decode.

This doctrine makes that philosophy explicit and binding.

---

## The core realization

Every configurable thing in Alloy is an **operational object**:

Location · Program · Room · Commercial Offering · Business Process · Communication Template · Automation · Role · Surface · Field

Each is a thing the operator *runs*, not a row they *edit*. Each deserves its own workspace. And every one of those workspaces has the same anatomy, because the operator's job — understand this object, see what needs attention, change what I own — is the same regardless of which object it is.

Configuration objects are **operational subjects**, in exactly the sense the operator platform already uses that term (`focus-panel-architecture-vocabulary.md`). A Location is an operational subject the way a Lead or a Family is an operational subject. This is the load-bearing idea: **configuration inherits the operator platform rather than inventing a parallel one.** The queue-to-object-to-section spine that runs the business also configures it.

---

## Platform philosophy

1. **Configuration is an operational experience.** The operator's mental posture in configuration is the same as in operations: orient, assess, act. The workspace serves that posture, not the schema.
2. **Objects, not tables.** The unit of configuration is an object with an owner, a state, and a health — never a table, a form, or a settings page with no object behind it.
3. **The business, not the machine.** The operator configures the business in business language. The provider layer, resolvers, precedence, effective-dating, and capacity/ratio engines exist and are consumed — the operator never meets them.
4. **Ownership is the information architecture.** Everything belongs to something. Navigation is that ownership made walkable. Configuration lives where the business already keeps it, never where the engine computes it.
5. **Calm is the default.** A healthy, fully-configured object is almost empty. Emptiness is the feature: it means nothing needs the operator.

---

## Operator mental model

The operator thinks a sentence:

> **"I am running Downtown Campus."**

Not "I am configuring capacity." Not "I am editing the locations table." Not "I am setting a precedence rule."

So the product is organized as **one object and everything that belongs to it**. The operator selects an object, sees it whole, and reaches for the part they want to change. Every screen answers three questions without being asked:

1. **What am I configuring?** — the header and breadcrumb name a *thing*, never a feature.
2. **Why does it matter?** — one plain sentence stating the business consequence.
3. **What should I do next?** — a primary action, an Attention item, or "you're all set."

If a configuration screen cannot answer all three at a glance, it is under-designed.

---

## The configuration object model

An **operational configuration object** has, at minimum:

- **Identity** — a name the operator recognizes, a stable code, a status (active/inactive).
- **An owner** — the object above it in the ownership hierarchy, or the organization. Ownership determines where the object is configured and what it inherits.
- **Owned collections and concerns** — the child objects and settings this object owns (a Location owns its Programs, Rooms, Schedule, Tours, Placement, and Access). Communications remains outside Locations until its ownership model is ready.
- **A derived operational state** — capacity, availability, enrollment, or the equivalent, computed by the substrate and shown as consequence, never as raw numbers.
- **A health** — the live answer to "is anything wrong or improvable right now?"
- **A setup state** — the answer to "have I finished configuring this?"

Objects nest. A Room is owned by a Location; capacity and ratios are owned by the Room because that is where the business owns them. **Configuration follows ownership** is the first law of the object model: a concern is configured on the object that owns it, summarized on the objects above it, and never configured in two places.

---

## The laws of configuration operation

These are immutable. A configuration workspace that violates one is not on this platform.

### 1. One object, seen whole
An object workspace presents the object in its final structure — header, summary, attention, sections — revealed once. There is no first paint that is later restructured, and no "loading the form" state that the operator watches assemble.

### 2. Configuration follows ownership
Every concern is configured on the object that owns it. Objects above it summarize; they do not configure. There is exactly one place to change any given thing.

### 3. The engine is invisible
No configuration surface names a provider, resolver, precedence, scope, effective-dating, version, capacity engine, ratio engine, or inheritance tree. These are replaced one-for-one by business language (see Business language doctrine). A raw internal key or engine term reaching the screen is a defect.

### 4. Understanding is ambient; editing is intentional
The object is legible at rest — its state and health readable without clicking. Editing is a deliberate, focused act the operator initiates, never the default posture of the screen.

### 5. Edit in place; never a form over a table
Changing an existing thing happens inline on the object, or in a focused editor for that one concern. Dialogs are for **creating** and **confirming destructive acts** only. There is no large CRUD form, no edit drawer over a data grid, as the primary experience.

### 6. Save is immediate and reversible
Saving applies now and is undoable. When the substrate is effective-dated, that is carried by one quiet line ("Effective from Today"), never by exposing versioning. A future date yields a "Scheduled · Undo" affordance.

### 7. Two status systems, never three
An object answers exactly two questions, kept separate: **Attention** (is anything wrong right now?) and **Setup** (am I finished configuring?). Never a third "health" surface that competes with or contradicts them.

### 8. Unknown is never zero
A value the substrate cannot compute renders as "not set up yet" / "needs more information" — never as `0`, blank, or a fabricated number.

### 9. Inheritance is quiet
Inherited values read plainly ("Uses Downtown Campus hours") with a soft path to override ("Set different hours for this room"). Precedence is never shown; the winning source is stated as ownership ("comes from the Location").

### 10. Every number is a link
On summary surfaces, every metric navigates to where it is configured. Nothing is a dead end.

### 11. Product feel over implementation convenience
Where a substrate shape (a version table, a rule scope, a null field) would leak into the experience, the experience wins. The workspace hides the shape; it does not surrender to it.

---

## Workspace anatomy

Every configuration object workspace is built from the same parts, in the same order:

```
┌ object list ────┬ object detail ─────────────────────────┬ command rail ──┐
│ search · filter │ breadcrumb                              │ Quick actions  │
│ · Add           │ object header (name · status · facts)   │ Attention /    │
│ selectable rows │ tab bar (owned concerns)                │ Setup Progress │
│                 │ operational summary + sections          │ (where useful) │
└─────────────────┴─────────────────────────────────────────┴────────────────┘
```

- **Object list** — the persistent selector for objects of this type. Search, filter, Add.
- **Object header** — the loudest element on the page. Name, status, and the two or three facts that identify the object. Edit and overflow live here.
- **Tab bar** — the object's owned concerns, led by an Overview.
- **Operational summary** — the read-only "is this healthy?" surface: a glance at derived state, Attention, and (while incomplete) Setup Progress.
- **Sections** — the editable concerns, each a calm block with a plain headline, quiet supporting detail, and one clear affordance.
- **Command rail** — quick actions and the object's Attention/Setup, where the object warrants it. Restrained; not a mosaic.

Nesting reuses the same anatomy: opening a child object (a Room inside a Location) swaps the list to the child's siblings and presents the child with its own header, tabs, and sections. The anatomy is fractal.

---

## Workspace composition and ownership

- **Workspace canvas:** Stone is the quiet field; white regions carry coherent operational answers. A region groups an answer. An object carries identity, status, selection, URL state, and view/edit behavior. Do not turn every region into an object card.
- **Left navigation:** owns collection identity, count, search, filter, Add, selection, and keyboard movement. It supports the selected object; it does not compete with the detail workspace.
- **Hero:** owns the selected object's name, status, identifying facts, and object-level Edit action.
- **Operational summary:** answers what the object is and how it currently operates. Readiness supports that understanding; Attention owns actionable problems.
- **Shell Actions rail:** owns contextual cross-section and high-frequency commands. Content must not render a competing page-local Actions card.
- **BOS:** assists through the same registered platform commands and mutation boundaries. BOS does not gain a parallel write path.
- **Inline actions:** remain attached to the issue, row, field, or owned object they affect. Creation also remains discoverable beside its collection.

## Mutation contract

Every visible mutation must:

1. submit through an authorized, organization-scoped server path;
2. receive the authoritative changed row or layer;
3. prove that response contains the submitted patch, including nested objects, arrays, `false`, `null`, and zero;
4. update the local object, list, summaries, Attention, and Readiness consumers that depend on the change;
5. survive hard refresh and reopen from the same canonical read model.

HTTP success, a toast, optimistic copy, or a closed editor is not persistence proof. A mutation control stays hidden or disabled with an honest reason when no authoritative provider exists.

---

## Navigation doctrine

- **Objects are the navigation.** The IA is the ownership hierarchy made walkable: pick an object, see its owned concerns as tabs, drill into an owned child as its own workspace.
- **State lives in the URL.** Selected object, active tab, and nested object are addressable so that an Attention item can deep-link to the exact surface, and back/forward behaves.
- **The breadcrumb is the ownership path**, in business terms, not the route.
- **One nested drill.** An object may open a child object as a nested master–detail. Deeper nesting than that is a smell; prefer summarizing.
- **Every drill has a calm way back** that preserves context.

---

## Editing philosophy

- **Inline-first.** Cards flip to editable in place; the object never traps the operator in a modal to manage something it already shows.
- **Focused editing** for a single rich concern (capacity + ratios, weekly hours): a dedicated editor for that concern, with a live consequence sentence that restates the substrate's result as a business outcome as the operator types.
- **Dialogs create and confirm** — nothing else. (See Dialog doctrine.)
- **Save is one act, effective now.** No per-section save-button mosaics; the effective-date line is the only nod to versioning and most operators never touch it.

### Health model → Attention
"Health" is not a badge and not a heartbeat. It is **Attention**: the live, ranked, human-language answer to "is anything wrong or improvable right now?" Each item is graded **Fix** (blocks correct operation), **Improve** (works, could be better), or **Good** (a sparing reassurance). Each is one-tap actionable and clears when resolved. Empty state is a single calm line ("Everything looks good"). There is **no** "last checked" timestamp — that implies a background monitor and leaks implementation; health is derived live.

### Attention model
Attention is sourced from the substrate's resolution status plus a few product-level checks (no admin, no sender identity, thin availability). Rank Fix > Improve > Good; within a grade, by operational impact. Never show a global "Healthy" lozenge that can contradict an open Fix item — the item list is the truth.

### Setup Progress model
Setup answers a **different** question: "have I finished configuring this object?" It is onboarding, monotonic, and per-owned-area. An area counts as done when it meets a stated minimum bar (or is explicitly marked "not applicable"). It is prominent while incomplete and **collapses to a single line at 100%** — it must never nag a running object. **Setup ≠ Attention:** a fully-set-up object can still have an Attention item. Keeping these separate is non-negotiable; collapsing them (or adding a third status) is the platform's most common self-inflicted confusion.

---

## Business language doctrine

The substrate underneath is a precedence-resolving, effective-dated, versioned configuration engine. **The operator never meets it.** These words never appear in a configuration surface:

> provider · resolver · precedence · scope · inheritance engine · effective dating · version · capacity engine · ratio engine · database · Supabase · metadata key

Each is replaced, one-for-one, by a business phrase. The mapping is a **binding contract**, not decoration — every domain maintains a translation table (engine token → operator language), and a raw token on screen is a bug. Examples the platform standardizes:

| Engine concept | Operator language |
|---|---|
| binding capacity | "Capacity" (the number that applies) |
| limiting factor = ratio | "Limited by staffing ratios" |
| resolution status = not_configured | "Not set up yet" |
| resolution status = conflicted | "Two settings disagree — review" |
| effective-dated version write | "Save changes · Effective from Today" |
| void a scheduled version | "Undo scheduled change" |
| applied rule scope = parent | "Comes from the Location" / "Uses location hours" |

Derived numbers carry a plain-language basis on an ⓘ affordance ("21 open = 124 capacity − 103 enrolled"), never inline engine math.

---

## Inheritance presentation doctrine

- Inherited values render with a quiet tag naming the **owner** ("Uses Downtown Campus hours", "Using org default"), never a precedence level.
- An **Override** is one gesture, phrased as ownership ("Set different hours for this room"). Removing it silently returns to inherited.
- The object that **is** the source never shows an inheritance tag on its own value (a Location does not "use location hours"). Tags appear only on objects that inherit.
- When the substrate reports conflicting sources, surface it as "two settings disagree — review," linking both, never as a precedence explanation.

---

## Inline editing doctrine

Inline editing is the default editing mode. A card becomes editable in place; fields validate beside themselves; the change saves optimistically and re-resolves. The card never navigates away to edit what it displays. Inline editing is for the common case — change a number, toggle a state, reorder a list.

## Focused editing doctrine

When a concern is rich enough to warrant its own space (capacity with ratios, a weekly schedule with exceptions), it gets a **focused editor** — a dedicated section or tab, not a modal — with a **live consequence sentence** that restates the substrate's computed result as a business outcome. The operator sees the effect of their edit as they make it. Focused editing is still not a form: it is a small set of business fields plus the consequence, plus one save.

## Dialog doctrine

Dialogs are reserved for two jobs:

1. **Create** a new object ("Add Room", "Offer a Program", "Add a location").
2. **Confirm** a destructive or high-consequence act ("Deactivate this location?").

A dialog states the **business consequence**, not the database effect. Managing an existing object is never trapped in a dialog. Dialogs never contain the words version, scope, precedence, or effective dating (the "Effective from" *line* is allowed; the *concept* is never named).

---

## Empty state doctrine

- An empty object is a **primer**, not a blank form. It names the first step and offers the matching action ("Set your weekly hours to get started").
- A brand-new object shows a short setup checklist in place of its summary.
- "Not applicable" is a valid, first-class completion — an operator can say "we don't offer tours" and it counts as done, so Setup can truthfully reach 100%.
- Unknown/derived-but-uncomputable state is an honest "not set up yet," never a fabricated number.

## Validation doctrine

- Validation is **inline and kind** — beside the field, in plain language, never a modal wall of errors or a raw code.
- Guardrails from the substrate (a license limit that would raise capacity, a close-before-open time) surface as business sentences ("A license limit can only make capacity smaller, not larger").
- Destructive or availability-reducing changes confirm with their consequence.
- The object's overall validity is expressed through Attention, not a separate validation panel.

---

## Responsive behavior

- **Desktop:** three zones (list · detail · rail).
- **Tablet:** the object list collapses to a selector; the rail moves below the detail.
- **Mobile:** single column — Attention first, then summary, then sections; quick actions become a sticky bar; Setup Progress becomes a slim banner.
- Wide content (tables, schedules) scrolls within its own container; the page never scrolls horizontally.

## Accessibility

- Every interactive element is labeled; status is conveyed beyond color (glyph + text).
- Tab bars, dialogs, and health glyphs carry roles and labels; focus is visible and managed on open/close.
- The object header is a landmark; the operator is always oriented to the object they are configuring.

---

## Inherited invariants (carried forward)

The following rules from the superseded and adjacent configuration doctrine remain binding and are restated here so nothing is lost:

- **Ownership matrix holds.** Who owns what (Locations, Fields, Statuses, Business Processes, Surfaces, Actions, Access, Communications, Automation) is defined in `../../system/configuration-ownership-doctrine.md`. This platform is the *experience* over that matrix; it does not change ownership.
- **Processes decide behavior; Surfaces decide presentation; Actions is an internal catalog.** Configuration Runtime **consumes** canonical systems (Fields, Statuses) and never duplicates them.
- **Work Units are runtime output, not configuration.** Queue and Focus-Panel presentation are authored in Surfaces.
- **Shell geometry** (Context → Queue → Workspace → command rail) is the frozen configuration-mode shell (`../../system/configuration-mode-doctrine.md`); this doctrine specifies what fills it, not the shell chrome.
- **Config steers; code owns invariants.** Business truth lives in code; configuration selects within guardrails (`../modules/configuration-platform.md`).

---

## Reference implementation

**Locations is the reference implementation for Configuration Runtime V1** — the way Operational Runtime has its reference surfaces and the Focus Panel has its reference subjects. Every future configuration domain **references Locations**; it does not invent its own experience.

Locations demonstrates the whole platform: an **organization landing** (configuration health across locations — never auto-opening a single object), an object list, an object workspace with owned-concern tabs (Programs offered, Rooms/Delivery Resources, Schedule, Tours, Placement, Access), a nested child-object workspace (Room / Program offering) that answers what is configured / needs attention / next action before editing, the two-status model (**Needs attention** + **Operational readiness**) **in the page body**, contextual commands on the **platform Actions rail** (not a page-local Actions card), **Scope** (Organization vs Location), quiet inheritance language, business-language timezone/locality identity (never raw IANA ids), and honest unknowns (unknown readiness areas are never counted incomplete). **Apply To… stays hidden in a domain until an authoritative copy provider exists; a confirmation dialog may never imply that a deferred copy was applied.** Communications is intentionally absent until ownership is ready.

**Top-level landing distinction:** Organization presents the configuration domain catalog. Locations presents operational summary, Needs Attention, and a quiet Location collection with search, inactive filtering, Add Location, and direct entry into each Location workspace. The two pages share Configuration Runtime visual language without forcing the same object presentation. Detailed explanation remains inside the selected domain or Location runtime; no readiness, attention, mutation, or ownership logic moves into landing presentation.

**Ownership model (binding):** Settings content owns configuration understanding. The shell owns contextual commands. BOS assists through the same platform boundaries. Inline controls remain local to their objects.

**Reference child-object behavior:** Program offerings, Rooms/Delivery Resources, and Schedule use one master/detail grammar: the collection supports selection, the selected object owns the workspace, and create/edit are intentional modes that replace read summaries rather than stacking beneath them. Primary collection creation is available both in collection chrome and, where useful, the shell Actions rail. Operational Readiness visibly lists every authoritative dimension as **Complete**, **Needs setup**, or **Not assessed** (and **Not applicable** when a domain can prove that state); its percentage uses only assessed dimensions and must visibly reconcile with that list.

**Reference Overview behavior:** the first row answers “What is this object?” with a two-thirds operational glance and a one-third readiness explanation. The second row answers “What needs me?” with equal-weight Attention and owned-capability regions. Attention keeps problem, impact, and action together. Capability state is explicit rather than inferred from decorative cards. Empty Attention disappears rather than manufacturing healthy filler.

Organization Runtime V2 freezes Organization as publisher and Locations as consumers. V2.2 tightens its equal-height Configuration Domain Cards without changing their accepted content: identity, publication state, concise ownership, Used By, and Open. Detailed ownership, inheritance, overrides, and health remain in the domain runtime through progressive disclosure. They are not dashboard widgets. The nine-domain registry includes Programs, Automation, and Operational Intelligence as distinct owners. See `../../system/organization-configuration-runtime-v2.md`.

Organization Runtime inherits the workspace grammar, not Location-specific nouns or storage. Its landing is `/organization`. Organization owns reusable pattern creation and target selection; Locations owns Programs offered, Rooms/Delivery Resources, local schedules, applied child objects, and their authoritative local read surfaces. Programs define reusable services; they do not own rooms, capacity, or scheduling. Apply must be published-revision-only, durable, auditable, response-confirmed for every selected Location, and deterministic enough to retry safely before it is exposed. Until a domain supplies resolved governance evidence, the landing says **Not assessed** rather than inferring inheritance or compliance.

Implementation primitives live under `web/components/adminV2/settings/configurationRuntime/workspace/` and `LocationsCommandRailActions` (shell registration). Commercial, Communications, Scheduling, Staffing, Billing, and future Settings modules should compose them rather than inventing parallel UX.

The Placement tab presents the existing waitlist ranking policy without changing its owner. Ranking is currently persisted as `work_units.metadata.placement_priority_v1` on the selected eligible waitlist Work Unit and therefore applies anywhere that Work Unit runs; it is **not location-scoped**. The Locations workspace must disclose that scope while allowing selection and ordering only from the registered profile's supported operator factors. The fallback factor remains active and last, and the registered tie-break sequence remains runtime-owned.

When a new domain asks "how should this configuration feel?", the answer is: **like Locations.**

**Commercial Configuration validates the platform** as the second consumer: it is already the reference implementation of the *control plane* (`../modules/configuration-platform.md`), and applying this experience doctrine to it proves the platform generalizes beyond Locations. Locations is the reference for the *experience*; Commercial is the proof it *inherits*. Two domains, one platform — and no third domain invents a new configuration experience.

---

## Future platform applicability

This platform is intended to power, **without changing the interaction model:**

Programs · Communications · Business Processes · Fields · Surfaces · Automation · Access · AI Configuration · and every future operational configuration domain.

Each brings its own objects (an Offering, a Template, a Process, a Role, a Surface, a Field, an Automation) and its own substrate. Each inherits the same anatomy, the two-status model, business language, quiet inheritance, and editing philosophy. The domain supplies objects and a translation table; the platform supplies the experience.

---

## Non-goals

- This is **not** the control plane. What configuration is *allowed* to steer (the four-plane Fields/Grouping/Surfaces/Actions model) is `../modules/configuration-platform.md`. This doctrine owns the *experience*, not the capability.
- This is **not** a schema, data-contract, or API doctrine.
- This does **not** redefine ownership; it presents the ownership defined elsewhere.
- This does **not** cover operational (non-configuration) workspaces; those are `operational-workspace-shell.md` and the runtime doctrine. (Configuration inherits their spine; it does not replace them.)

## Anti-patterns

Future engineers **must not** build:

- **Large CRUD forms** as the primary configuration experience.
- **Edit drawers over a table** — the "grid + edit panel" pattern.
- **Database-first screens** — surfaces organized by table, column, or subsystem instead of by object.
- **Provider / resolver / precedence terminology** anywhere an operator can see it.
- **Configuration precedence UI** — dials, scope pickers, priority ladders exposed to operators.
- **Raw implementation concepts** — version tables, effective-date pickers framed as versioning, null fields shown as `0`.
- **Implementation-driven navigation** — an IA that mirrors the code's module boundaries rather than the operator's ownership model.
- **Table editors as primary experiences.**
- **Configuration pages with no object ownership** — a settings page that configures "capacity" in the abstract, owned by nothing.
- **A third status surface** competing with Attention and Setup Progress.
- **A permanent help/resources rail** or live operational metrics (e.g. "tours scheduled today") on a configuration surface — configuration shows setup state, not live operations.

---

## Relationship to existing doctrine (conflicts reconciled)

- **Supersedes** `../../system/configuration-workspace-doctrine.md` (which named Data Model / `/settings/fields` as *the* reference implementation) and `../../system/configuration-workspace-v1-doctrine.md` (ownership-domain IA). Their still-valid ownership rules are carried forward above and in `configuration-ownership-doctrine.md`. The reference implementation for the configuration *experience* is now **Locations**; earlier docs' reference surfaces (Data Model, Processes) remain valid **examples** of the plane/domain model but are no longer the experiential reference.
- **Object-centric reframes plane-centric, at a different layer.** The four-plane control-plane model (Fields/Grouping/Surfaces/Actions) governs *what a configuration object's sections may contain*; this doctrine governs *how the operator experiences the object*. They are orthogonal layers, not competitors.
- **Reconciled (Organization Runtime V2):** the frozen surface-ownership matrix names the one authoring home; the ratified four-owner model (`../core/configuration-ownership-and-inheritance.md`) separates business, operational, configuration, and runtime responsibility. Its configuration owner must equal that authoring home, so it creates no second edit surface.

---

## Related docs

- `../../system/operational-configuration-experience-product-spec.md` — the reference-implementation product spec (Locations).
- `../../system/operational-configuration-platform-phase-b-blueprint.md` — the reference-implementation engineering blueprint.
- `configuration-workspace-visual-language.md` — why configuration workspaces *feel* different, and the visual system.
- `configuration-workspace-component-library.md` — the reusable platform primitives.
- `../foundation/platform-decisions.md` — the registered platform decision ("Configuration is object-centric") this doctrine realizes.
- `alloy-visual-language.md`, `canonical-interaction-model.md`, `operational-surface-design-system.md` — the operator platform this doctrine specializes.
- `../modules/configuration-platform.md`, `../../system/configuration-ownership-doctrine.md`, `../../system/configuration-mode-doctrine.md` — the control plane, ownership matrix, and shell this doctrine consumes.

## When this doc must be updated

A new configuration domain adopts (or deviates from) the platform; the object model, workspace anatomy, or two-status model changes; a law is added, amended, or retired; or the reference implementation moves beyond Locations.
