# Alloy OS — Runtime Map (Nine Layers)

**Status:** Canonical (June 2026). The single picture of how Alloy behaves as **one
operating system** rather than a collection of pages. Defines the nine runtime layers,
the three flows that connect them, the **client/server seam**, and where **outbound
side effects** live. Companion to the implemented doctrine:
[`universal-card-lifecycle.md`](../operator/universal-card-lifecycle.md) ·
[`focus-panel-composition-v2-and-editing.md`](../operator/focus-panel-composition-v2-and-editing.md) ·
[`experience-builder-doctrine.md`](../operator/experience-builder-doctrine.md) ·
[`presentation-runtime-doctrine.md`](../operator/presentation-runtime-doctrine.md) ·
[`operational-runtime-topology.md`](../runtime/operational-runtime-topology.md) (the literal L0–L7 layer stack).

> **Provenance + honest scope.** This map began as a *client-experience* OS model (derived
> from the Experience Layer / Presentation Runtime work) and is richest there. The
> **server / domain / effects / multi-tenancy** half was under-modeled in early drafts;
> the [Architecture Evolution & Known Gaps](#appendix--architecture-evolution--known-gaps)
> appendix below records the corrections that close that gap. The appendix is part of the
> canon — read it with the layers.

---

## The law: one owner per concern (no overlap)

Every responsibility has **exactly one** owning layer. If two layers both "own" a concern,
one of them is wrong. The nine layers below are drawn so that **command flows down**,
**truth flows up**, and **events flow sideways** — with no concern living in two places.

```
                          ┌─────────────────────────────────────────┐
                          │  1. KERNEL  (created once; context-swaps) │  ← persistence boundary + event bus
                          └─────────────────────────────────────────┘
   CLIENT  ───────────────────────────────────────────────────────────────────────
     2. INTENT        gestures/commands → atomic, undoable multi-runtime choreography
     3. NAVIGATION    routing + Continuity (freeze / hold / swap sequencing)
     4. EXPERIENCE    Motion + Reveal primitives (tokenized)
     5. SURFACE       which surfaces exist + how they compose (Zones → Cards → Slots)
     6. CARD          card lifecycle (Summary → Focus → Edit → Expanded → Workspace)
     7. RECORD        client-side CACHE of server truth (optimistic ↔ authoritative)
   ───────────────────────────────────────────────────────────────  CLIENT / SERVER SEAM
   SERVER (authoritative)
     8. ENTITY        canonical persistence (RLS, tenant-scoped) — NOT external I/O
     9. OPERATIONAL / BOS   Operational owns work + policy · BOS computes intelligence
   ────────────────────────────────────────────────────────────────
   CROSS-CUTTING (not a vertical layer)
     • CONFIG (four planes) · EFFECTS / INTEGRATION (outbound side effects) · TENANCY
```

---

## The nine runtime layers

### 1. Kernel
**Owns:** the runtime that is **created once** and lives across navigation; the
**persistence boundary** ("what survives a route change") and the in-process **event
bus**. The OS insight: *create the runtime once, change context within it* — navigation,
drawers, and white-label swaps change context inside the same kernel, they do not rebuild
it.
**Must not own:** any domain logic, any surface knowledge.
**Hard rules:** the persistence boundary and **every cache are tenant-scoped**; a tenant /
org switch **flushes** them (a cache that survives a tenant switch is a cross-tenant
leak). The event bus uses **typed, namespaced contracts with declared publishers /
subscribers** (an event registry) and **loop guards** — it is not a global god-channel.

### 2. Intent
**Owns:** turning operator gestures and AI/command-shell instructions into **atomic,
undoable, multi-runtime choreography** (focus a card *and* swap context *and* reveal — as
one step). Speaks a **small set of domain-parameterized universal verbs** —
`focus` · `complete` · `create` · `review` · `switch(context)` — never per-module verbs
("Review Processing", "Create Enrollment" are `review`/`create` parameterized by domain).
**Must not own:** domain logic. *On probation:* Intent is justified only because Alloy has
a command surface (the AI shell) and needs atomic cross-runtime choreography + undo. If it
accretes domain logic it becomes a god-object — keep it thin, watch it.

### 3. Navigation
**Owns:** routing **and Continuity** — the *sequencing* of freeze / hold / swap so
navigation feels seamless (the shared persistent shell across workspace ↔ work-unit).
**Must not own:** the Motion/Reveal *primitives* it sequences — those are Experience's.
(Continuity is Navigation's choreography of Experience's primitives; it is **not** owned by
Experience.)

### 4. Experience
**Owns:** the **tokenized Motion + Reveal primitives** — the choreographies Navigation
sequences and the reveal gates that decide when a region may paint.
**Must not own:** readiness *truth*. Reveal **observes** readiness signals owned downward
(Operational / Record / Entity) through a **generic region-readiness contract**
(`createRevealContract(regions)`) — Experience is **not** a pure dependency sink, and the
contract keeps surface-specific gate knowledge out of it (no bespoke
`workspace/dept/work-unit` gates leaking in).

### 5. Surface
**Owns:** which **Design Surfaces** exist and how they compose — `Zones → Cards → Slots →
Renderers` (queue row, Focus Panel, dashboard, document, POS, portal). One operational
description renders as **many** surface shapes; that is why Surface and Operational are
separate.
**Must not own:** the truth a card shows, or the work a card acts on.

### 6. Card
**Owns:** the **Universal Card lifecycle** — `Summary → Focus → Edit → Expanded →
(Workspace)` — and the **edit state machine** (it transforms a focused row into controls
and **emits a commit**; it does not itself persist). Cards are composed of **Evidence
Groups**; ownership of a concept lives at the evidence-group level. See
[`universal-card-lifecycle.md`](../operator/universal-card-lifecycle.md).
**Must not own:** the optimistic patch / rollback (that is Record's — Card emits the
commit, Record applies it). One Record renders in **many** Cards across **many** Surfaces;
that is why Card and Record are separate.

### 7. Record
**Owns:** the **client-side cache of server truth** for one record — *one record, one
truth* on this client — plus the **optimistic patch + rollback + propagation** to every
Card showing it. Distinguishes **optimistic** mutations (most UI) from
**authoritative-confirmed** mutations (money, legal, irreversible — never optimistically
"succeeded"). Its contract includes **server-authoritative reconciliation**: it subscribes
to Entity's change stream so another operator's edit (or a server push) reconciles in;
presence / conflict is a thin layer on top.
**Must not own:** being the source of truth — it is a **cache** of the server-authoritative
Entity below the seam.

### 8. Entity (server-authoritative)
**Owns:** **canonical persistence** — the durable, tenant-scoped, RLS-guarded store of
record truth, and its **change stream**.
**Must not own:** **external I/O.** Entity persists; it does **not** talk to Stripe, an SMS
provider, or a webhook. (Those are the Effects service.)

### 9. Operational / BOS (server-authoritative)
**Operational owns:** the **work + policy** layer — what work exists, Work-View
materialization, actions, validation, and **applying** attention/recommendation to work.
It is a **thin engine + per-domain configuration/plugins** (Enrollment, Billing,
Attendance, Processing each contribute Work Views, actions, attention rules) — **not** a
monolith.
**BOS owns:** **intelligence** — it **computes** attention and recommendations. *One
produces, one consumes:* BOS computes; Operational applies. See
[`ai-platform.md`](../modules/ai-platform.md).
**Must not own:** presentation, or external I/O.

---

## The three flows

- **Command down.** Intent → Navigation/Experience/Surface/Card → (commit) → Record →
  **across the seam** → Operational (policy) / Entity (persist).
- **Truth up.** Entity change stream → Record (reconcile) → Card (re-render) → Surface.
- **Events sideways.** The Kernel bus carries typed, namespaced events between layers
  (e.g. `record.patched`, `entity.changed`) under declared publisher/subscriber contracts
  with loop guards.

---

## The client/server seam (decide this first)

The single vertical stack spans **two homes**, and the seam must be explicit:

| Side | Layers | Nature |
|------|--------|--------|
| **Client** | Intent · Navigation · Experience · Surface · Card | presentation runtimes |
| **Seam** | **Record** | client **cache** of server truth |
| **Server (authoritative)** | **Entity** · **Operational domain** (actions, validation, attention, Work-View materialization) · **BOS** | the reusable core |

**Why it matters:** the **server-authoritative core** (Operational domain + Entity) is
consumed **identically** by the client runtimes **and** by API / AI-agent / integration /
headless-white-label clients. If the domain lives in the presentation runtimes, every new
consumer must **re-implement "complete this work" / "execute this action"** — or quietly
fork the platform. The domain must not live in the UI. This is the cheapest decision to
write and the most expensive to get wrong.

---

## Effects / Integration (the missing axis)

Every flow above is "command down → persist; truth up." There is **no axis for commanding
the world and reconciling the result** — charge a card, send an SMS, generate/sign a
document, fire a webhook, sync a third party. Entity is persistence (not external I/O);
Operational decides *what work exists* (it doesn't talk to Stripe).

**The Effects / Integration service** is a **cross-cutting service** (not a new vertical
runtime) that owns:
- **outbound side effects** (payments, messages, documents, webhooks, third-party sync),
- **idempotency**, and
- **reconciliation** of results back into Entity / Record (so results flow up as truth).

It is **commanded by Operational actions**; its results return as truth. Four core modules
have **no home without it** — Billing, Communications, Documents, Integrations — which is
why it is necessary, not speculative. **Side effects must be explicit here, never hidden
inside render.**

---

## Configuration (four planes)

Authoring is **tokenized** and lives in four configuration planes (Structure / Content /
Behavior / Experience). Tokenized Motion + Experience are exactly what made **white-label
theming** fit cleanly — the module expected to break the model is the one it serves best.
The **Experience Builder** is the Configuration Runtime *surface* for presentation; it
**authors** the Surface/Card layers, it is not a separate product. See
[`experience-builder-doctrine.md`](../operator/experience-builder-doctrine.md).

---

## Non-record content (parallel structures)

The Content stack (`Surface → Card → Record → Entity`) is **record-centric**. Two content
shapes are **not** Records and must not be forced under "one record, one truth":
- **Aggregate** content — **Analytics** (a Dashboard category) is aggregate-shaped.
- **Artifact** content — **Documents** are binary artifacts.

Scope the Content plane as *record-centric operational work*, and treat aggregate and
artifact content as **parallel** structures, not children of Record.

---

## Appendix — Architecture Evolution & Known Gaps

This appendix is canonical. The first half records **lessons that are now enforced in
code** (the Experience Builder / Focus Panel work, June 2026); the second half records the
**structural corrections** to the original map.

### A. Lessons now enforced (implemented)

1. **Publish → runtime parity is mandatory.** A layout authored in the builder MUST appear
   in the live runtime exactly (except legitimate responsive collapse). This is a
   first-class invariant, not a nicety. *Real failure it caught:* the Focus Panel Summary
   doc was rejected by the generic drawer write-validator ("Invalid layout doc"), so the
   published layout never persisted and the work-unit fell back to auto-composition — a
   silent parity break. Fixed by exempting the Focus Panel Summary doc from the generic
   drawer validator (`isFocusPanelSummaryDoc` in `validateLayoutDocForSurface.ts`).
   Pinned by the `focusPanelRuntimeParity` test.
2. **The canvas IS the editor.** Composition is authored by direct manipulation on the
   real cards (click · drag · resize width/height · stack · reorder), not in a control
   panel beside a preview. One source of truth — there is no separate lower preview.
3. **Builder and runtime share ONE rendering path.** The builder preview and the operator
   runtime render through the **same** `FocusPanelCardGrid` + `publishedLayout` path. A
   forked "preview renderer" is how parity dies; they must be the same code.
4. **Composition vs Behavior is a hard separation.** The **canvas owns composition**
   (position · width · height · stacking · row). The **inspector owns behavior** (question
   · evidence groups · editing · expanded · related views · actions · conditions · AI ·
   ownership). Composition controls do **not** live in the inspector.
5. **Universal Card Behavior.** Every card declares its lifecycle support
   (Summary/Focus/Edit/Expanded/Workspace) + capabilities via a matrix; the runtime,
   canvas, and inspector read the matrix instead of hardcoding per-card behavior.
   See [`universal-card-lifecycle.md`](../operator/universal-card-lifecycle.md).
6. **Evidence Groups are the unit of card content.** Fields live **inside** Evidence
   Groups; "Fields" is never the primary concept. A group exposes its question/purpose,
   owner card, summary/focus/expanded visibility, editing, and conditions.
7. **Expanded ≠ Related Views.** **Expanded** = the same operational question with
   **additional configured evidence** (overlays downward, never a new surface).
   **Related Views** = optional drill-downs to a **report** (Schedule/Placement/Billing
   History). They are distinct concepts.
8. **Child owns Placement as an Evidence Group.** Placement (Program · Room · Schedule ·
   Teacher · Desired Start) is **not** a separate card — it is an Evidence Group owned by
   the Child card. The operator manages the child without bouncing between cards. (Child
   operational *persistence* still needs a save adapter — until then, child inline edit is
   a clearly-labeled read-only preview; **no fake saves**.)

### B. Structural corrections to the map

| # | Correction | Type |
|---|------------|------|
| 1 | **Draw the client/server line** (above): Operational-domain + Entity are server-authoritative and reused by API/AI/integration; Record is the client cache of that truth. | Boundary, **0 new runtimes** |
| 2 | **Add the Effects / Integration service** (outbound effects, idempotency, reconciliation). Side effects explicit, never hidden in render. | **1 cross-cutting service** |
| 3 | **Dedup ownership:** Continuity → **Navigation** (sequencing) with Experience owning only the primitives; optimism → **Record** (Card emits the commit); attention → **BOS computes / Operational applies**. | Clarification |
| 4 | **Tenant-scope** the persistence boundary + all caches; a tenant switch flushes (security). | Clarification |
| 5 | **Optimistic vs authoritative-confirmed** mutations in Record (money/legal are confirmed, never optimistic). | Clarification |
| 6 | **Non-record content:** acknowledge aggregate (Analytics) + artifact (Documents) as parallel structures; scope the Content plane as record-centric. | Clarification |
| 7 | **State the offline / realtime scoping assumptions explicitly.** Today the persistence boundary covers "survives navigation/reload," and Record's contract includes server-authoritative reconciliation (realtime). A **durable offline mutation queue** is **out of scope unless Alloy operators work offline** — if they do, Record + Kernel need a durable-queue + reconnect-reconciliation extension. | Scoping decision |

### C. Verdict

The **spine survives**: Kernel + persistence boundary, the nine-layer decomposition, the
three flows, and the no-overlap law all hold under stress. The map's gaps were **missing
edges and an unmarked seam**, not a broken skeleton — closed by **one boundary line, one
service, and a handful of clarifications** (above), all **additive**. Decide **#1 (the
client/server line) first**: it determines whether APIs, AI agents, integrations, and
headless white-label **reuse** the platform or quietly **fork** it.
