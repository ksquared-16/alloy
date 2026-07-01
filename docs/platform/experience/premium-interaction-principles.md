# Premium Interaction Principles

**Path:** `docs/platform/experience/premium-interaction-principles.md`
**Status:** **Canonical** (June 2026). The field manual — Alloy's equivalent of Apple's Human Interface Guidelines, specific to operational software.
**Derived from:** [`operational-experience-doctrine.md`](./operational-experience-doctrine.md) (the laws) and [`operational-motion-doctrine.md`](./operational-motion-doctrine.md) (the movement).

> The doctrines state the law. This document is how a designer or engineer *applies* it at a desk, today, on a real feature. When in doubt, the principle here wins; when the principle is silent, the doctrine governs.

---

## The operator we design for

Alloy is not a website visited; it is an **instrument operated**. The operator is not a visitor browsing — they are a professional running a business through this surface for hours. Their mental model is precious: "where I am, what is true, what I just did." Premium interaction means **never contradicting that model.**

The aspiration, stated plainly: an operator should finish a full shift unable to name a single moment they noticed the software.

---

## The Ten Principles

### 1. Acknowledge in under 50 milliseconds, always

Every operator action gets an immediate visual response — a selection lift, a button settle, an optimistic value change — before any network work. The acknowledgement is a promise: *I heard you.* Latency after acknowledgement is tolerable; silence before it is not.

> **Do:** Click → tile lifts (`motion.instant`) → then prepare destination.
> **Don't:** Click → nothing → spinner → result.

### 2. Two states only — never let the operator watch construction

A surface is *not-yet-here* (one branded preparation) or *fully-here* (complete). Never assembling. If you cannot show a region coherently, keep the unified preparation state up a moment longer. A slightly longer honest wait beats a visible build sequence every time.

> **Do:** One loading shell → entire surface together.
> **Don't:** Header → KPIs → cards → health metrics, in waves.

### 3. The operator never leaves

Navigation changes *context*, not *location*. The shell stays. The current surface freezes and is held; the destination prepares behind it; then an atomic swap. No reloads, no scroll resets, no shell blink. Use the `navigate` choreography for every level — record, work unit, department, workspace.

> **Do:** Freeze → prepare → atomic swap.
> **Don't:** `window.location.assign` anything an operator considers continuous.

### 4. Loading belongs to arrival, never departure

A skeleton on the way *out* is a bug in disguise. If you see a loading state while leaving, the architecture is remounting something that should have stayed mounted. Loading is only ever the *destination's* reveal.

### 5. Remember the recent past

Returning to a surface seen seconds ago must be free — warm, instant, no cold fetch. Earn warmth with intent prefetch (hover, pointer-down); keep it with a cache that survives navigation the operator considers continuous. Never discard a cache behind the operator's back.

### 6. One record, one truth, everywhere

A change made in a drawer is true on the queue behind it, instantly. Edits are optimistic and propagate to every surface showing that record. Never let a held payload contradict what the operator just did — continuity must never cost truth. If you must choose, the operator's last action is the truth.

> **Do:** Edit status in drawer → queue row already shows new status on return.
> **Don't:** Edit in drawer → return to queue → old value flashes.

### 7. Editing is one safe verb

Inline (no mode-toggle). Optimistic (no spinner). Acknowledged identically (one settle, everywhere). Guarded on exit (the **same** unsaved-changes prompt on every surface — silent discard of typed work is never acceptable). Rolled back legibly on failure. If editing two different things feels different, you have violated this principle.

### 8. Movement must earn its place

Before adding any motion, answer: does it communicate **continuity, confidence, or progress**? If it only reveals that the software fetched or rendered, delete it or make it imperceptible. Refined/background values *settle* (sub-threshold, in reserved geometry); only genuinely *new* content gets an entrance.

### 9. One motion language — never invent

Four durations (`instant/micro/standard/expressive`), four easings, five choreographies (`reveal/navigate/swap/acknowledge/recede`). Pick one; never author a raw `300ms ease-in-out`. Arrivals decelerate, departures accelerate, acknowledgement springs. If your movement fits none of the five, stop and talk to the Motion owner.

### 10. Reserve the special moments

`motion.expressive` and `ease.spring` are scarce on purpose. Acknowledgement is the only springy thing; first reveal of a major surface is the only expressive thing. Premium is restraint — when everything is animated, nothing feels intentional. Spend attention like currency.

---

## Pattern playbook

Concrete recipes for the interactions that recur across Alloy. Each cites the law and choreography it implements.

### Opening a record (drawer)

| | |
|---|---|
| **Warm (prefetched)** | Click → `acknowledge` (row lifts, `motion.instant`) → drawer `reveal`s atomically with data already present. No overlay. |
| **Cold (rare)** | Click → `acknowledge` → one branded "Opening record…" preparation (no internal skeleton wave) → drawer `reveal`s atomically. |
| **Law** | Reveal (1), Memory (3). Maximize the warm path; the cold path is the exception, not the design center. |

### Navigating between records (linked / prev-next)

`swap` choreography: hold current record → prepare next invisibly → crossfade (`motion.micro`) with **header and body from the same commit**. Never a hard cut; never a mismatched header/body pair.

### Closing a drawer

`recede` choreography: content + panel ease out (`motion.standard`, `ease.exit`), backdrop in concert, attention handed back to the queue. Symmetric to how it opened. Never an instant unmount. Guard first if dirty (Principle 7).

### Editing a field

Inline affordance on focus (`motion.instant`) → type → commit → optimistic value update (<50ms, no spinner) → one `acknowledge` settle → silent revalidate. On failure: legible rollback + consistent error + retry. Identical on every card and drawer.

### Switching work units / surfaces

`navigate` choreography. The queue/shell stays mounted; the surface freezes and is held; destination prepares warm; atomic swap. No reload, no outbound skeleton, no scroll reset.

### A KPI or metric resolving late

`settle` sub-variant of `reveal`: opacity ramp into reserved geometry, `motion.micro`, no translate/scale/flash. The number appears as if it was always there. The operator's eye is never pulled to it.

### Acknowledging a queue action (status change, assignment)

Optimistic row update + `acknowledge` settle on the row. Propagate to any other surface showing the record (Principle 6). Revalidate silently.

---

## Anti-patterns (reject in review)

| Anti-pattern | Why it breaks the illusion | Replace with |
|--------------|----------------------------|--------------|
| Spinner before acknowledgement | Silence reads as "did it hear me?" | `acknowledge` in <50ms |
| Section skeletons after reveal | Surface looks half-built | Atomic `reveal`; gate stays up |
| `window.location.assign` for operator nav | Reloads the world | `navigate` soft transition |
| Skeleton on the way out | Loading belongs to arrival | Keep destination mounted |
| Stale row after an edit | Contradicts the operator's action | Optimistic cross-surface propagation |
| Silent discard of typed edits | Destroys trust permanently | Universal dirty-guard |
| Instant drawer unmount | Asymmetric, jarring | `recede` |
| Hard cut between records | Ambiguous: updated or reloaded? | `swap` crossfade, atomic identity |
| Raw `300ms ease-in-out` in a component | Fractures the motion language | Motion tokens |
| Entrance animation for a refined value | Pulls the eye; reads as loading | `settle`, imperceptible |
| Per-component "saved" flash | Editing feels different each place | One `acknowledge` primitive |

---

## The five-second review

For any operator-facing change, ask in order:

1. **Does it acknowledge instantly?** (Principle 1)
2. **Is there any state the operator can watch assemble?** (Principle 2) — there must not be.
3. **Does anything reload, reset, or blink?** (Principles 3, 4) — it must not.
4. **Is what the operator just did true everywhere, now?** (Principle 6)
5. **Did any movement get invented instead of chosen?** (Principle 9)

Five no-or-yes answers. Any wrong one is a doctrine violation.

---

## When this doc must be updated

A new recurring pattern enters the playbook; a new anti-pattern is identified; or a principle changes because a doctrine law changed.
