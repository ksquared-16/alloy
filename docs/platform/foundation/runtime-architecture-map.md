# Alloy OS — Runtime Architecture Map

**Path:** `docs/platform/foundation/runtime-architecture-map.md`
**Status:** **Canonical blueprint** (June 2026). The highest-level architectural document for Alloy OS. Describes the architecture Alloy is **converging toward**, not today's implementation.
**Read with:** [`operational-experience-doctrine.md`](../experience/operational-experience-doctrine.md), [`operational-motion-doctrine.md`](../experience/operational-motion-doctrine.md), [`navigation-runtime-doctrine.md`](../experience/navigation-runtime-doctrine.md), [`experience-layer-architecture.md`](../experience/experience-layer-architecture.md), and the domain model in [`../core/business-process-system.md`](../core/business-process-system.md).
**Audience test:** a Principal Engineer joining tomorrow should understand the entire operating system from this document alone (see the final section).

---

## What is the operating system?

> **Alloy is not a web application with pages. It is an operating system whose programs are units of operational work.**
>
> The operator expresses **intent**. A stack of **runtimes** interprets that intent, composes the operational experience, coordinates the platform, and keeps one canonical truth — while the shell never reloads and the runtime never dies.

Operators never interact with pages, routes, components, rows, or API calls. They interact with **operational intent** — *focus this record, complete this work, review this processing, open this family, switch context.* The Runtime is the thing that turns intent into experience. This document is the map of that Runtime.

---

## The reframing: intent in, experience out

```
        OPERATOR INTENT
              │   "focus this", "complete this", "review processing"
              ▼
        ┌─────────────┐
        │  RUNTIMES   │   interpret → compose → coordinate → keep truth
        └─────────────┘
              │
              ▼
     CONTINUOUS OPERATIONAL EXPERIENCE
        (no pages, no loading, no reloads — the software disappears)
```

Two flows run through the whole system, in opposite directions:

- **Command flows down** — intent decomposes into operations that descend toward data.
- **Truth flows up** — canonical data ascends back through coherence into rendered surfaces.

And one flow runs sideways:

- **Events flow on a shared bus** — a mutation, an attention change, a context switch is published once and every interested runtime reacts (this is what keeps *one record, one truth, everywhere*).

---

## Critical evaluation: it is **not** a linear stack

The candidate hierarchy (Operator → Intent → Navigation → Experience → Operational → Surface → Card → Record → Entity → Persistence) is a useful first sketch, but a pure linear stack is **wrong** for three reasons, and correcting them is the central architectural insight of this map:

1. **Intent fans out; it does not stack.** A single intent ("Open Family") dispatches to *several* runtimes at once — Operational (what work exists for that family), Navigation (change the foreground), Experience (acknowledge + reveal + move). These are **peers under Intent**, not layers stacked on each other.
2. **Experience is cross-cutting, not a mid-stack layer.** Motion is consumed by everything; Reveal gates every surface; Interaction is on every card. Experience is a **coordination plane invoked at boundaries**, with Motion as its *foundation* — it does not "contain" Operational.
3. **The candidate list omits the two things that make it an operating system:** a **Runtime Kernel** (the persistent substrate + event bus that boots and hosts every runtime and survives navigation) and the **cross-cutting services** (Configuration, Identity & Authorization, Intelligence/BOS, Telemetry) that any runtime may consume. Without the kernel there is no "persistent runtime"; without the services every runtime reinvents policy.

So the true shape is: **an apex orchestrator (Intent) → two planes (Coordination and Content/Truth) → over a Kernel → beside cross-cutting Services → on Persistence.**

---

## Architecture review corrections (applied — June 2026)

This map passed an adversarial review; the following six corrections are **approved and authoritative**. Where any text below predates them, these win. They are documentation corrections, not a redesign — the spine (Kernel, event bus, runtime decomposition, the three flows, no-overlap) is unchanged.

**1. The client/server boundary is explicit.** The vertical stack spans two homes:
- **Client (experience) runtimes:** Intent · Navigation · Experience · Surface · Card.
- **Server-authoritative core:** the Operational *domain* (actions, validation, attention policy, Work-View materialization) + Entity + Persistence — reused **identically** by the client runtimes *and* by external consumers (public API, AI agents, third-party integrations, headless white-label).
- **Record Runtime is the client-side cache/coherence of server truth**, not an independent source.

The line is drawn **between Record (client) and the server-authoritative core (Operational-domain + Entity)**. Domain logic must never live only in the presentation runtimes — that is the single rule that lets APIs/AI/integrations reuse the platform instead of forking it.

**2. The Effects / Integration Service exists** (cross-cutting service; *not* a vertical runtime). It owns **outbound side effects** (charge a card, send a message, generate/sign a document, fire a webhook, sync a third party), their **idempotency**, and **reconciliation back into Entity/Record**. Commanded by Operational actions; results flow up as truth. This is the home for Billing, Communications, Documents, and Integrations effects.

**3. Ownership clarifications (no overlap):**
- **Continuity belongs to Navigation Runtime** (transition sequencing). Experience owns only the *primitives* Navigation sequences — Motion choreographies and Reveal gates.
- **Optimistic updates belong to Record Runtime.** Card owns the edit state machine and *emits a commit*; Record owns the optimistic patch, rollback, and propagation.
- **BOS computes Attention; Operational Runtime applies it.** Intelligence produces; operational policy consumes.
- **Tenant boundaries apply to all caches and the persistence boundary.** A cache surviving a tenant/scope switch is a cross-tenant leak; a tenant switch flushes. (Security invariant.)
- **Record distinguishes optimistic vs authoritative mutations.** Most UI is optimistic; money/legal/irreversible mutations are authoritative-confirmed — never an optimistic claim of success.
- **Analytics and Documents are parallel content models**, not children of Record. The Content plane (Surface→Card→Record→Entity) is **record-centric**; aggregates (Analytics) and artifacts (Documents) are sibling structures.

---

# Deliverable 1 + 2 — The Runtime Architecture Map & Hierarchy

```
                              ┌──────────────────────────────┐
                              │          OPERATOR            │
                              │      (expresses intent)      │
                              └───────────────┬──────────────┘
                                              ▼
                              ┌──────────────────────────────┐
   APEX                       │       INTENT RUNTIME         │  interprets intent →
   (orchestration)            │  decompose · orchestrate     │  choreographs the runtimes
                              └───┬───────────┬───────────┬──┘
                    dispatches to │           │           │ (peers, in parallel)
        ┌─────────────────────────▼──┐  ┌─────▼──────┐  ┌─▼───────────────────────┐
   COORDINATION PLANE              ◄──┤  │ NAVIGATION │  │      EXPERIENCE         │
   (how work is reached & felt)       │  │  RUNTIME   │  │  RUNTIME (cross-cutting)│
                                      │  └─────┬──────┘  │  Motion·Reveal·Continuity│
                                      │        │         │  Interaction·Acknowledge │
                                      │        │         └───────────┬─────────────┘
        ┌─────────────────────────────▼────────▼─────────┐          │ invoked at every
   CONTENT / TRUTH PLANE          │   OPERATIONAL RUNTIME │          │ boundary below
   (what work is & what's true)   │ what work should exist│          │
                                  └───────────┬───────────┘          │
                                              ▼                      │
                                  ┌───────────────────────┐          │
                                  │   SURFACE RUNTIME     │◄─────────┤
                                  │   compose the surface │          │
                                  └───────────┬───────────┘          │
                                              ▼                      │
                                  ┌───────────────────────┐          │
                                  │     CARD RUNTIME      │◄─────────┘
                                  │  the editable unit    │
                                  └───────────┬───────────┘
                                              ▼
                                  ┌───────────────────────┐
                                  │    RECORD RUNTIME     │  client truth / coherence
                                  │  one record, one truth│
                                  └───────────┬───────────┘
                                              ▼
                                  ┌───────────────────────┐
                                  │    ENTITY RUNTIME     │  canonical + authorization
                                  └───────────┬───────────┘
                                              ▼
                                  ┌───────────────────────┐
                                  │      PERSISTENCE      │  Postgres / Supabase / RLS
                                  └───────────────────────┘

   ════════════════════════════ RUNTIME KERNEL (Shell) ════════════════════════════
   Persistent substrate that boots, registers, and hosts every runtime · the event
   bus · the shared context store · the persistence boundary · crash isolation.
   Survives all navigation. Only a hard reload reboots it.

   ───────────────────────── CROSS-CUTTING SERVICES ───────────────────────────────
   Configuration (4-plane) · Identity & Authorization · Intelligence/BOS · Telemetry
   · Motion (foundation of Experience). Consumable by ANY runtime.
```

**Hierarchy, stated plainly:** the Operator drives the **Intent Runtime** (apex). Intent fans out to the **Coordination Plane** (Navigation + Experience) and the top of the **Content Plane** (Operational), which converge down through **Surface → Card → Record → Entity → Persistence**. Everything runs *inside* the **Runtime Kernel** and *beside* the **Cross-cutting Services**.

---

# Deliverable: Every runtime defined

Each runtime is specified by: **Purpose · Responsibilities · Inputs · Outputs · Public API · Dependencies · Owner · Lifecycle · Failure behavior · Convergence gap** (where today differs).

### Runtime Kernel (Shell) — *the thing that makes it an OS*

- **Purpose.** The always-on process that boots, registers, and hosts every runtime; holds the event bus, the shared context store, and the persistence boundary; survives navigation.
- **Responsibilities.** Boot/teardown · runtime registry · event bus (publish/subscribe) · shared session+context store · persistence boundary (what survives a transition) · crash isolation (one runtime's failure never kills the shell).
- **Inputs.** App boot, session identity. **Outputs.** A live runtime environment.
- **Public API.** `kernel.register(runtime)` · `kernel.bus.publish/subscribe(event)` · `kernel.context` (shared store) · `kernel.persistenceBoundary`.
- **Dependencies.** Persistence, Identity. **Owner.** Platform.
- **Lifecycle.** Boots once per session; persists across *all* navigation; only a hard reload reboots it.
- **Failure.** Isolates per-runtime failures behind boundaries; only a kernel-fatal fault triggers a full reboot (the Navigation reload floor).
- **Convergence gap.** `AdminV2Shell` is the embryonic kernel (it persists). Missing: a formal runtime registry, a single event bus, and a shared context store — today state is scattered across React contexts.

### Intent Runtime — *the apex orchestrator*

- **Purpose.** Interpret operator intent into a coordinated choreography across runtimes. The "verb layer."
- **Responsibilities.** Own the **intent vocabulary** (Focus Record, Complete Work, Review Processing, Open Family, Create Enrollment, Switch Context, …) · interpret a gesture/command into an intent · decompose the intent into runtime operations · sequence/orchestrate them · intent-level undo/redo.
- **Inputs.** Operator gestures (click, keyboard, command bar), BOS-suggested intents. **Outputs.** Dispatched operations to Operational / Navigation / Experience.
- **Public API.** `intent.express(name, params)` · `IntentVocabulary` · `intent.undo()`.
- **Dependencies.** Commands Operational, Navigation, Experience. Consumes BOS (suggestions), Identity (capability).
- **Owner.** Platform (new). **Lifecycle.** Per-gesture; stateless between intents except an intent history for undo.
- **Failure.** An unresolvable intent degrades to the nearest valid operation and tells the operator — never a dead-end.
- **Guardrail.** Intent Runtime is an **orchestrator, not a doer.** It must never contain domain logic or rendering; it only decomposes and dispatches. The risk is a god-object — keep it thin.
- **Convergence gap.** Today intents are *implicit and inlined* — every `onClick` hard-codes its own (navigate + open drawer + execute action). Converge by extracting the vocabulary; handlers *express intent*, the runtime orchestrates.

### Navigation Runtime — *change of foreground operational context*

- **Purpose.** The single authority for "the foreground operational context is changing." Fully specified in [`navigation-runtime-doctrine.md`](../experience/navigation-runtime-doctrine.md).
- **Responsibilities.** Context model · transition lifecycle (intent→ack→prepare→hold→commit→settle/recover) · URL projection · history/back-forward · persistence boundary · failure recovery (with the reload floor).
- **Inputs.** A target context (from Intent). **Outputs.** A committed foreground context + URL projection + history entry.
- **Public API.** `navigate(targetContext)` · `back()` · `getContext()` · `subscribe()`.
- **Dependencies.** Experience (waits on Reveal gate; invokes Motion), Kernel (persistence boundary, bus). **Owner.** Navigation.
- **Lifecycle.** Lives in the Kernel for the session; each transition is a bounded, recoverable operation.
- **Failure.** Tiered recovery: supersession → hold+retry → degraded reveal → **reload floor**. Never deletes the floor.
- **Convergence gap.** Today `window.location.assign` (full reload, default); `runAdminV2NavigationTransition` (inbound-only orchestration); drawer `replaceState` (the proof it can be soft). Converge per its doctrine.

### Experience Runtime — *how everything moves, reveals, and acknowledges* (cross-cutting)

- **Purpose.** Make the Runtime's coordination *perceptible* as continuity, confidence, and progress. Owns the *how*, never the *when/what*.
- **Responsibilities.** **Motion** (tokens + 5 choreographies, foundation) · **Reveal** (atomic gates) · **Continuity** (freeze/hold/swap — sequenced by Navigation) · **Interaction** (feedback states) · **Acknowledgement** (one primitive) · **Loading** (one shell) · **Editing feedback**.
- **Inputs.** Boundary calls from Navigation, Surface, Card. **Outputs.** Choreographed motion, reveal gating, acknowledgement.
- **Public API.** `motionChoreography(name)` · `createRevealContract(regions)` · `useInteractionState()` · `acknowledge(kind)`.
- **Dependencies.** None downward (it is foundational); invoked *by* Navigation/Surface/Card. **Owner.** Experience / Motion System.
- **Lifecycle.** Stateless primitives + per-surface reveal contracts.
- **Failure.** Degrades to opacity-only (reduced-motion is a first-class state); motion never gates interactivity.
- **Convergence gap.** Motion built (`motionTokens.ts`); Reveal partially enforced (KPI-gating shipped); Interaction/Editing still two patterns. Full build = Experience Layer Steps 2–4.

### Operational Runtime — *what work should exist*

- **Purpose.** Given operator + context, determine *what work exists*: which Work Views, which records need attention, what actions apply, what guidance.
- **Responsibilities.** Business Process binding · Operational Context resolution · **Work View** materialization (predicate → record set) · surface-shape selection · **Attention** · **Tasks** · **Actions** resolution · **BOS** guidance surfacing · operational questions.
- **Inputs.** Operator identity/role (Identity), current context (Navigation), domain state (Record/Entity), policies (Config). **Outputs.** An *operational description* (work-view + records + actions + attention) handed to Surface.
- **Public API.** `resolveOperationalContext(ctx)` · `materializeWorkView(view)` · `resolveActionsForContext(ctx)` · `resolveAttention(ctx)`.
- **Dependencies.** Record/Entity (domain state), Config (policy), Intelligence/BOS (guidance), Identity (role). **Owner.** Operational.
- **Lifecycle.** Re-resolved on context change; cached per context.
- **Failure.** A failed sub-resolver (e.g. attention) degrades that region to empty/known-absent, never blocking the whole description.
- **Convergence gap.** Pieces exist (`resolveActionsForContext`, attention resolver, `queueDef`) but are coupled into the work-unit page. Converge into a runtime; adopt the **Work View** model as the primary configurable abstraction (see the Work View evaluation).

### Surface Runtime — *compose the surface*

- **Purpose.** Compose a surface — its regions, cards, and layout — from the operational description; own surface lifecycle and context propagation.
- **Responsibilities.** Surface composition · region layout (LayoutDoc) · card placement · context propagation to cards · surface lifecycle (mount/hold/release) · **surface shape** (queue · grid · calendar · board · ledger · drawer).
- **Inputs.** Operational description (Operational), layout config (Config). **Outputs.** A composed surface tree of cards.
- **Public API.** `composeSurface(description)` · `SurfaceShape` · `surface.hold()/release()`.
- **Dependencies.** Operational (what), Card (units), Experience (reveal/motion), Config (layout). **Owner.** Surface.
- **Lifecycle.** Mounted by Navigation; **held** (not unmounted) across transitions where possible; released on eviction.
- **Failure.** A failed region renders an in-context error boundary; the surface never white-screens.
- **Convergence gap.** Strong today (LayoutDoc / LayoutRuntime / work-unit-layout / queue-record). Gap: generalize beyond the *queue* shape to the full shape taxonomy (needed for Attendance/Scheduling/Billing).

### Card Runtime — *the editable unit*

- **Purpose.** Own the card as the atomic editable unit and its lifecycle: `viewing → focused → editing → dirty → saving → saved → viewing`.
- **Responsibilities.** Card lifecycle state machine · editing · optimistic save · dirty state + universal guard · acknowledgement · refresh · layout stability.
- **Inputs.** A record/VM (Record), placement (Surface), edit intent (Intent/Interaction). **Outputs.** Rendered card + edit operations to Record.
- **Public API.** `useEditableRuntime({ read, write, optimistic })` (Experience Layer Cap 5).
- **Dependencies.** Record (data + optimistic), Experience (interaction/acknowledge), Surface (placement). **Owner.** Card.
- **Lifecycle.** Per-card; survives surface refresh without layout jump.
- **Failure.** Optimistic rollback + legible, consistent error; never silent loss (universal dirty-guard).
- **Convergence gap.** Cards are clean stateless renderers, but editing runs **two competing patterns** with no shared acknowledgement. Converge onto one runtime (Experience Layer Step 4).

### Record Runtime — *one record, one truth* (client coherence)

- **Purpose.** The client-side coherence layer for a record: one identity, one truth, optimistic patches, cross-surface propagation, selection.
- **Responsibilities.** Record identity · optimistic patch apply + rollback · **cross-surface propagation** (the patch channel) · selection · hold-prior-payload · the one-record-one-truth guarantee on the client.
- **Inputs.** Canonical entity (Entity), edit operations (Card). **Outputs.** Coherent record state to every surface showing it; mutations to Entity.
- **Public API.** `record.patch(id, patch)` · `record.subscribe(id)` · `record.select(id)`.
- **Dependencies.** Entity (canonical), Kernel bus (propagation). **Owner.** Record.
- **Lifecycle.** Per-record session cache; coherent across all surfaces; reconciled on revalidate.
- **Failure.** Continuity never costs truth: a held payload that contradicts the operator's last action is forbidden; failed mutations roll back legibly.
- **Convergence gap.** The drawer save coordinator does optimistic+rollback *within the drawer*; **cross-surface propagation is the gap** (audit CARD-2/WU-2). This is the hinge that makes Work Views and persistent navigation *safe*.

### Entity Runtime — *canonical + authorization*

- **Purpose.** The authoritative source of entities: canonical model, relationships, persistence, authorization, integrity, lifecycle.
- **Responsibilities.** Canonical entity model · relationship graph · fetch/persist · **authorization (RLS)** · data integrity · entity lifecycle (create/archive).
- **Inputs.** Queries/mutations (Record), identity (Auth). **Outputs.** Canonical entities; persistence effects.
- **Public API.** REST/RPC endpoints + VM composition (existing). **Dependencies.** Persistence, Identity/Auth. **Owner.** Entity/Platform.
- **Lifecycle.** Stateless request/response over durable storage.
- **Failure.** Authorization and integrity are hard invariants — failures are refusals, never silent partial writes.
- **Convergence gap.** Strong and canonical today (entity-model, RLS, triggers, VM composition). Largely unchanged by this map.

### Persistence — *the substrate*

Not a runtime — the floor. Postgres / Supabase, RLS, triggers, schema. Entity Runtime is the only thing that touches it directly.

### Cross-cutting Services (consumed by any runtime)

| Service | Owns | Consumed by |
|---------|------|-------------|
| **Configuration** | Four-plane config (platform → industry template → customer → personal); *config steers, code owns invariants* | Operational, Surface, Card, Experience |
| **Identity & Authorization** | Session, role, scope; enforced as RLS at Entity | Intent, Operational, Entity |
| **Intelligence / BOS** | Attention, recommendation, guidance, config stewardship; can *suggest intents* | Intent, Operational |
| **Telemetry / Perf** | Reveal-gate + navigation + surface traces; the signals that gate the keystone | All |
| **Effects / Integration** | Outbound side effects (payments, comms, document generation/signing, webhooks, third-party sync) · idempotency · reconciliation back into Entity/Record | Operational (commands it); Entity/Record (receive reconciled truth) |
| **Motion** | Token foundation of Experience (also usable directly) | Experience, Navigation, Surface, Card |

---

# Deliverable 4 — Communication model

```
COMMAND (down)         TRUTH (up)              EVENTS (sideways, on the Kernel bus)
Intent                 Persistence             record.patched   → all surfaces w/ record
  → Operational          → Entity              context.changed  → Experience plays motion,
  → Navigation           → Record                                 Surface recomposes
  → Experience           → Card (rendered)     attention.changed→ Operational re-resolves,
    → Surface            → Surface                                 surfaces re-rank
      → Card                                   intent.expressed → Intent orchestrates
        → Record                               nav.committed    → URL projected, history
          → Entity                             config.changed   → affected runtimes refresh
            → Persistence
```

**Shared state (via Kernel bus + context store):** the navigation context, the record-patch channel, attention state, configuration, identity/session. These are the things that must stay coherent across surfaces.

**Isolated state:** each card's local edit/dirty buffer (until commit), each surface's scroll/focus anchors, each transition's in-flight preparation. These are deliberately *not* shared — isolating them is what prevents one card's editing from leaking into another.

**The golden rule:** a fact is **published once** and **subscribed many**. No runtime reaches *into* another's state; they communicate only via the bus (events) and public APIs (command/query). This is what keeps ownership non-overlapping.

---

# Deliverable 3 — Ownership matrix

Every behavior has exactly one home. The rule that resolves contention: **the content owner decides *what/when*; Experience decides *how*; the Kernel decides *what persists*.**

| Behavior | Owner runtime | Notes |
|----------|---------------|-------|
| Interpreting operator goals | **Intent** | new; today inlined in handlers |
| Foreground context change, history, URL, recovery | **Navigation** | absorbs `commitNavigation`, `runAdminV2NavigationTransition`, drawer URL sync |
| Motion (how things move) | **Experience / Motion** | tokens built |
| Reveal gating (when a surface appears) | **Experience / Reveal** | KPI-gating shipped |
| Interaction + acknowledgement + editing feedback | **Experience** | one primitive; today scattered |
| What work exists (views, attention, actions, BOS) | **Operational** | adopt Work View model |
| Surface composition / layout / shape | **Surface** | LayoutDoc; add shape taxonomy |
| Card lifecycle / editing / dirty / save | **Card** | one editing runtime; merge the two patterns |
| Record identity / optimistic / cross-surface truth | **Record** | cross-surface propagation is the gap |
| Canonical entities / relationships / RLS / persistence | **Entity** | strong today |
| Persistence boundary / event bus / runtime hosting | **Kernel** | formalize `AdminV2Shell` |
| Config policy | **Configuration (service)** | four-plane |
| Session / role / scope | **Identity (service)** | RLS at Entity |
| Attention / guidance intelligence | **BOS (service)** | feeds Operational |
| Perf / metrics | **Telemetry (service)** | gates the keystone |

**Audit verdicts — remain / move / merge / disappear:**

| Existing subsystem | Verdict |
|--------------------|---------|
| `AdminV2Shell` | **Becomes** the Runtime Kernel (formalize registry + bus + context store) |
| `adminV2CommitNavigation` (`location.assign`) | **Demote** to Navigation's recovery floor |
| `runAdminV2NavigationTransition` | **Merge** into Navigation Runtime |
| `syncOperatorWorkUnitUrlInBrowser` (drawer URL) | **Merge** into Navigation URL projection |
| Reveal gates (`*RevealGate`) | **Move** under Experience/Reveal |
| Drawer save coordinator | **Split:** editing → Card; optimistic+propagation → Record |
| Motion CSS scattered across 4 files | **Merge** into Motion tokens |
| `queueDef.queues` lane config | **Move/elevate** to Operational as Work Views |
| `resolveActionsForContext`, attention resolver | **Move** under Operational |
| LayoutDoc / LayoutRuntime / queue-record | **Remain**, under Surface + Card |
| Entity model / RLS / VM composition | **Remain**, under Entity |
| Dual nav paradigm (shallow vs reload) | **Disappear** (collapsed into Navigation) |
| In-memory-only session caches | **Disappear** (superseded by Kernel persistence boundary) |
| `WorkUnitWorkspaceColdShell` on outbound | **Disappear** (held-prior-surface) |

---

# Deliverable 5 — Lifecycle model

| Scope | Boots | Persists across | Re-created on |
|-------|-------|-----------------|---------------|
| **Kernel / Shell** | Session start | *All* navigation | Hard reload only |
| **Intent** | Per gesture | — (stateless + intent history) | — |
| **Navigation context** | Session start | All surface transitions | Hard reload (rehydrated from persistence + URL) |
| **Operational context** | Per context | Held while in context | Context change |
| **Surface** | On entering a context | **Held** across transitions where possible | Eviction |
| **Card** | With its surface | Surface refresh (no layout jump) | Surface release |
| **Record** | On first reference | All surfaces showing it (one truth) | Cache eviction / revalidate |
| **Entity** | Per request | — (stateless over durable store) | — |

The defining property: **everything above Entity lives inside the Kernel and survives navigation.** The website model re-creates this stack on every URL change; the OS model creates it once and *changes context within it.*

---

# Deliverable 6 — Failure & recovery model

Every runtime declares its failure behavior; the Kernel guarantees isolation.

| Runtime | Failure | Recovery |
|---------|---------|----------|
| **Intent** | Unresolvable intent | Degrade to nearest valid operation + inform operator; never a dead-end |
| **Navigation** | Cancelled / stalled / inconsistent transition | Tiered: supersession → hold+retry → degraded reveal → **reload floor** (deliberate, last-resort) |
| **Experience** | — | Reduced-motion is a normal state; motion never blocks interactivity |
| **Operational** | A resolver fails (e.g. attention) | Degrade that region to known-empty; rest of the description proceeds |
| **Surface** | A region fails to compose | In-context error boundary; surface never white-screens |
| **Card** | Save fails | Optimistic rollback + legible consistent error + retry; never silent loss |
| **Record** | Mutation rejected / stale | Roll back legibly; revalidate silently; held payload never contradicts the last action |
| **Entity** | Authz / integrity violation | Hard refusal — never a silent partial write |
| **Kernel** | A runtime crashes | Isolate behind its boundary; only a kernel-fatal fault reboots (the reload floor) |

**Principle:** failure is *contained at the lowest possible runtime*. The reload — the heaviest recovery — is the Kernel's last resort, never any runtime's default. The Telemetry service watches `fallback_to_reload_rate`; if it is non-trivial, resilience is not ready and the floor carries the load.

---

# Deliverable 7 — Runtime dependency graph

```
Intent ──► Operational ──► Record ──► Entity ──► Persistence
   │           │             ▲           ▲
   │           └──► Surface ──┘           │
   ├──► Navigation ──► (Experience: Reveal gate, Motion)
   │           │
   └──► Experience (cross-cutting; invoked by Nav, Surface, Card)
                    │
            Surface ──► Card ──► Record

Every runtime ──► Kernel (bus, persistence boundary, hosting)
Every runtime ──► Services (Config, Identity, BOS, Telemetry, Motion) as needed
Entity ──► Identity (authorization)
```

**Dependency rules (enforced):**
- Dependencies point **downward and toward truth** — never upward. A Card never depends on a Surface; a Record never depends on a Card.
- **Experience and the Services are dependency sinks** — consumed widely, depending on little. (Motion depends on nothing.)
- The **Kernel depends only on Persistence + Identity** and is depended on by all — the classic kernel shape.
- No cycles. If two runtimes seem to need each other, the shared concern belongs on the **event bus**, not in a mutual dependency.

---

# Deliverable 8 — Migration implications

This map is mostly a **relocation of ownership**, not a rebuild — which is why it is achievable.

**What stays (do not redesign — position):**
Business Process → Stage → Record domain model · Work Views · Surface/Card doctrines · Experience & Motion doctrines · Navigation Runtime doctrine · Configuration (four-plane) · Entity model + RLS · Persistence.

**What changes (relocate / formalize):**
- `AdminV2Shell` → formalized **Runtime Kernel** (registry + bus + context store).
- Scattered `onClick` orchestration → **Intent Runtime** vocabulary.
- Navigation → the keystone build (its own doctrine).
- Drawer save coordinator → **split** into Card (editing) + Record (truth/propagation), with **cross-surface propagation** added — the highest-value new mechanism.
- `queueDef` lanes → **Work Views** under Operational.
- Reveal gates → under **Experience/Reveal**; Motion CSS → tokens.

**What disappears:**
The dual navigation paradigm · full-reload-as-default · in-memory-only caches · outbound cold shells · per-component editing/acknowledgement forks · scattered motion durations.

**Sequencing (it composes with the existing roadmap):**
1. Formalize the **Kernel** (bus + context store) — enables everything else to communicate cleanly.
2. **Record Runtime** cross-surface propagation — the safety prerequisite for Work Views *and* persistent navigation.
3. **Experience** completion (Reveal generalization, one editing/acknowledgement) and **Operational** (Work Views).
4. **Navigation Runtime** (the keystone, per its doctrine, flag-gated, reload floor retained).
5. **Intent Runtime** last — it is the thinnest layer and only meaningful once the runtimes it orchestrates exist.

---

> **This document does not describe today's implementation. It describes the architecture Alloy is converging toward. Where today's implementation differs, the gap and its migration path are identified explicitly (see each runtime's "Convergence gap" and Deliverable 8). Do not let current code constrain the operating system design.**

---

## The final test

> *"If a Principal Engineer joined Alloy tomorrow, could they understand the entire operating system from this document alone?"*

**Yes — to the level of *architecture*.** From this document a Principal Engineer can state: what the operator interacts with (intent, never pages); the nine runtimes and the kernel, each with a purpose, an API, an owner, and a failure mode; how command flows down, truth flows up, and events flow sideways; which subsystem owns which behavior with no overlap; what persists and what is re-created; how failure is contained and why the reload is a floor, not a default; and what must change, stay, and disappear to get there.

**What it deliberately does *not* give them** — and where they must go next — is named in each runtime's *Convergence gap*, the linked doctrines (Experience, Motion, Navigation, Work Views), the domain model (`business-process-system.md`), and the schema reference. This map is the **atlas**; those are the **street maps.** An engineer who reads this knows the shape of the whole system and exactly which door to open for the next level of detail — which is the correct and sufficient definition of "understanding the operating system."

---

## When this document must be updated

A new runtime enters or leaves the architecture; the hierarchy or ownership matrix changes; a cross-cutting service is added; or a convergence gap closes (move the detail into the relevant doctrine and update the gap here).
