# Presentation Runtime V2

**Status:** COMPLETE (July 2026)  
**Staging baseline:** `9fb042a7171f3927c0e9c72b183ead2ccacb9081` — includes PR #113 drill-in elevation + field removal  
**Companion:** [`presentation-runtime-v2-retrospective.md`](./presentation-runtime-v2-retrospective.md) · [`experience/surface-composer.md`](./experience/surface-composer.md)

---

## What shipped

### Queue Row

- runtime row composition
- surface composer
- runtime parity

### Focus Panel

- runtime edit mode
- nested runtime surfaces
- household
- children
- child detail
- evidence surfaces

### Surface Composer

- runtime-first editing
- field composition
- section composition
- drag/drop
- inline row layout
- runtime parity

### Nested Surfaces

- household
- children
- child
- evidence

### Runtime Editing

- editable runtime
- field relabel
- drag/drop
- labels
- icons
- display policy

### Presentation

- runtime is source of truth
- composer is edit mode
- one renderer
- one runtime

---

## Canonical Doctrine

**Runtime is sacred.**

The composer is an edit overlay.

Never build another runtime renderer.

Never build another builder.

**Queue Row remains frozen.**

Future improvements extend Surface Composer.

Not replace it.

---

## Supported concepts

| Concept | Role |
|---------|------|
| **Surface** | A named presentation context the operator experiences (Queue Row, Focus Panel card, header band, nested expansion) |
| **Nested Surface** | Drill-in surface owned by a parent surface (household detail, children roster, child edit, evidence group) |
| **Section** | Grouping within a surface or nested surface (identity, emergency contacts, evidence blocks) |
| **Field** | A configured slot bound to a data source with display + edit policy |
| **Evidence Surface** | Expanded evidence presentation within a card or nested surface |
| **Edit Mode** | Composer overlay on the live runtime — selection, library, inspector, placement — not a second renderer |

---

## Non-goals

Do not redesign Queue Row.

Do not duplicate runtime.

Do not expose implementation concepts.

Do not create alternate builders.

---

## Known limitations

| Area | Status |
|------|--------|
| Photo persistence | Avatar upload is preview-only until `persons` photo persistence lands |
| Program picker | Child program selection remains domain-locked / staging-owned save paths |
| Room picker | Not yet configurable through Surface Composer |
| Teacher picker | Not yet configurable through Surface Composer |
| Future evidence improvements | Roster collapsed details, additional evidence namespaces |

---

## Future roadmap

The next platform work extends existing runtime composition — it does not reopen Presentation Runtime architecture.

| Domain | Extension path |
|--------|----------------|
| **Scheduling** | Surface / Nested Surface / Section / Field |
| **Attendance** | Surface / Nested Surface / Section / Field |
| **Billing** | Surface / Nested Surface / Section / Field |
| **Documents** | Surface / Nested Surface / Section / Field |
| **Communications** | Surface / Nested Surface / Section / Field |
| **Processing** | Surface / Nested Surface / Section / Field |

Each should extend Surface Composer rather than invent new presentation models.

---

## Freeze (July 2026)

Presentation Runtime V2 is **frozen**.

Future work must not reopen architecture. Extend the existing runtime model through real business workflows only.

**Next platform work begins with:** Scheduling, Attendance, Billing, Documents, Communications — not Presentation Runtime architecture.
