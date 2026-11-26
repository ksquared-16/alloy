---
owner: experience
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Operational Motion Doctrine

**Path:** `docs/platform/experience/operational-motion-doctrine.md`
**Status:** **Canonical** (June 2026). The single source of motion for Alloy. No feature invents its own transitions.
**Companion:** [`operational-experience-doctrine.md`](./operational-experience-doctrine.md) — governs *how Alloy behaves*. This doctrine governs *how Alloy moves when it behaves*.
**Precedent:** Typography earned a tokenized system (`presentationTypography.ts`). Motion gets the same. This doc defines the tokens; `web/lib/motion/motionTokens.ts` will encode them.
**Owner:** the **Motion System** — a platform owner created by this doctrine. Before today, motion had no owner; it was authored by whoever wrote each component.

---

## Why this exists

Today Alloy has **no motion language**. There is no animation library and no central tokens — just 50+ distinct duration values (0.05s → 9.5s) and three ad-hoc easings scattered across four CSS files, 50 keyframes, with no documentation, no owner, and no governance. Route fade is 140ms, drawer enter 200ms, card enter 220ms; nothing shares a rhythm.

The result is **subliminal incoherence**. No single motion is wrong, but nothing feels like it came from one mind — and that signature coherence is exactly what separates premium operational software from a competent app.

This is **not about animation.** It is about **motion**: the physics that make navigation, reveal, editing, and acknowledgement feel continuous, confident, and intentional. Every movement in Alloy must originate from this one language.

---

## The Prime Question

> **Why does this movement exist?**

Before any motion ships, it must answer. A movement is permitted only if it communicates one of:

1. **Continuity** — "you are still in the same place; this is the same thing, moved or changed."
2. **Confidence** — "your action registered; this is real and stable."
3. **Progress** — "work is happening; here is where it stands."

A movement that communicates none of these — that merely reveals that the software fetched, rendered, hydrated, or swapped — is **forbidden.** It is an implementation detail leaking as motion. Delete it or make it imperceptible.

---

## Motion tokens (the entire vocabulary)

Alloy moves at **four speeds** and on **four curves.** Everything else is composed from these. No raw durations or easings in components — ever.

### Durations

| Token | Duration | Use |
|-------|----------|-----|
| `motion.instant` | **80ms** | Direct manipulation feedback: selection, press, hover commit, focus. Must feel like a physical response, not an animation. |
| `motion.micro` | **160ms** | In-place changes: crossfades, value settles, small reveals, drawer→drawer body swap. |
| `motion.standard` | **240ms** | Surface-level transitions: reveal, navigation swap, drawer open/close. The default. |
| `motion.expressive` | **360ms** | Deliberate, attention-worthy moments only: first reveal of a major surface, celebratory confirmation. Used sparingly. |

Ambient/atmospheric loops (BOS smoke, workspace bloom) are a separate, named class (`motion.ambient.*`, 4–12s) — they are environmental, not interactional, and never compete with interaction motion.

### Easing curves

| Token | Curve | Use |
|-------|-------|-----|
| `ease.exit` | accelerate (ease-in) | Things leaving: close, recede, dismiss. |
| `ease.enter` | decelerate (ease-out) | Things arriving: reveal, open, settle. Arrivals decelerate into place. |
| `ease.move` | standard (ease-in-out) | Things moving between two on-screen positions: reorder, swap, slide. |
| `ease.spring` | gentle spring | Acknowledgement only: selection lift, save confirm. The one "alive" curve; never for layout. |

> **Rule:** Arrivals decelerate (`ease.enter`), departures accelerate (`ease.exit`), repositions are symmetric (`ease.move`), and only acknowledgement is springy (`ease.spring`). This asymmetry is what makes motion read as physical.

---

## The Five Choreographies

All interactional motion in Alloy is one of five named choreographies, each composed from the tokens above. A feature does not design motion — it *selects a choreography*.

### 1. `reveal` — a surface or region becomes present

The visual expression of the Experience Doctrine's **Reveal Law**.

```
[not-yet-here: one branded preparation state]
  ↓  readiness object completes
  ↓  entire surface fades+lifts in together — opacity 0→1, translateY 4px→0
  ↓  motion.standard, ease.enter
  ↓  [fully-here]
```
- One frame. No per-region stagger above the fold. No skeleton-to-content swap after reveal.
- *Settle sub-variant* (post-reveal refinement): a genuinely-deferred value ramps opacity into **already-reserved geometry**, `motion.micro`, `ease.enter`, **no translate, no scale, no flash** — below the threshold of attention. This is the only sanctioned post-reveal motion. *(Replaces the KPI "announce"; closes MOT-2.)*

### 2. `navigate` — context changes; the operator does not leave

The visual expression of the **Continuity Law**.

```
Intent (click)
  ↓  acknowledge target (motion.instant, ease.spring) — the destination lifts/holds
  ↓  current surface FREEZES (held payload, no teardown, no scroll reset)
  ↓  destination prepares invisibly (warm cache or fetch)
  ↓  atomic crossfade frozen → ready (motion.standard, ease.move)
  ↓  interactive; scroll/focus restored per-surface
```
- The same choreography for record, work unit, department, workspace. One physics.
- **No outbound loading state.** Loading is only ever the destination's `reveal`, never the source's departure.

### 3. `swap` — one record/content becomes another in place

For drawer→drawer linked navigation and queue prev/next.

```
[showing record A]
  ↓  hold A (prior payload), prepare B invisibly
  ↓  when B ready: A crossfades to B (motion.micro, ease.move)
  ↓  identity (header) and body apply from the SAME commit — never header-then-body
  ↓  [showing record B]
```
- No hard cut. No stale-A-under-B-header (header/body atomic). *(Closes DRW-2.)*

### 4. `acknowledge` — the system confirms the operator's action

The visual expression of **Truth** and **Editing**. The product's confidence signal.

```
Action (select / save / commit)
  ↓  immediate response (motion.instant, ease.spring): selection lift, button settle
  ↓  for edits: value updates optimistically (<50ms) — NO spinner
  ↓  on confirm: ONE settle/check, identical everywhere (motion.micro, ease.spring)
  ↓  on failure: legible rollback (motion.micro, ease.exit) + consistent error
```
- Exactly one acknowledgement vocabulary across all editable surfaces. *(Closes CARD-1's missing save-ack standard.)*
- Acknowledgement is the **only** place `ease.spring` is used. It is what makes the product feel responsive and alive — reserve it.

### 5. `recede` — a transient surface departs

For drawer close, overlay dismiss, popover close.

```
Dismiss
  ↓  content + panel ease out — opacity 1→0, slight scale/slide away (motion.standard, ease.exit)
  ↓  backdrop fades in concert
  ↓  attention handed back to the surface beneath (subtle, not a pop)
```
- Symmetric to the surface's entrance. A drawer that `reveal`/`navigate`-entered must `recede` to leave — never an instant unmount. *(Closes DRW-1; gives sidebar drawers an entrance too.)*

---

## Hard rules

1. **No raw timing in components.** Every duration and easing references a token. A literal `300ms` or `ease-in-out` in a component is a violation. (Lint target.)
2. **No feature invents a choreography.** If a movement doesn't fit one of the five, it is reviewed by the Motion owner before it ships — not added ad hoc.
3. **Motion never gates interactivity.** The operator can act through a transition; motion is never a wall.
4. **Imperceptible beats expressive for refinement.** Post-reveal and background updates use `settle` — never an entrance animation meant for *new* content. New content arrives; refined content was-always-there. *(Closes MOT-2.)*
5. **One acknowledgement, everywhere.** Save/selection confirmation is identical across surfaces. No per-component flash.
6. **Departures accelerate, arrivals decelerate.** The easing asymmetry is mandatory; it is what makes motion physical.
7. **`prefers-reduced-motion` collapses choreography to opacity-only** at token level (not per-component), preserving continuity (crossfade) while removing translate/scale/spring. Accessibility is a first-class motion state, not an afterthought.
8. **Ambient motion never competes with interaction.** Atmospheric loops stay low-energy and yield visually to any active choreography.

---

## Categories of motion — present-state and target

| Category | Today | Under this doctrine |
|----------|-------|---------------------|
| Page / surface transition | full reload or 140ms fade, inconsistent | `navigate` choreography, `motion.standard` |
| Surface / region reveal | atomic (good) but KPI announces | `reveal` + `settle`; nothing announces |
| Drawer open | 300ms zoom (modal only), sidebar none | `reveal`/`navigate` entrance, all presentations |
| Drawer close | **instant unmount** | `recede`, `motion.standard`, `ease.exit` |
| Drawer→drawer swap | hard cut, stale flash | `swap`, `motion.micro`, atomic identity |
| Loading / skeleton | scattered stagger micro-waves | one coherent shell; no above-fold stagger |
| Hover / selection | 120–140ms ad hoc | `acknowledge` feedback, `motion.instant` |
| Edit / save confirm | flash-or-nothing, per-pattern | one `acknowledge` settle, everywhere |
| KPI / value update | 260ms hydrate flash (announces) | `settle`, imperceptible |
| Optimistic change | drawer-only | `acknowledge`, propagated cross-surface |
| Ambient / atmospheric | 50 keyframes, undocumented | `motion.ambient.*`, documented, yielding |

---

## Implementation contract

1. **`web/lib/motion/motionTokens.ts`** — the four durations, four easings, five named choreography presets (CSS custom properties + a small JS/TS map for runtime use). Mirrors the `presentationTypography.ts` precedent.
2. **Migrate the four CSS files** (`globals.css`, `adminV2.css`, `workspace.css`, `bosIdentity.css`) onto tokens. Collapse the 50+ durations to four; the three easings to the named palette.
3. **Engineer exit windows** where portals unmount synchronously (drawers), so `recede` has time to play (reuse the drawer phase machine).
4. **Add a motion-phase to the drawer swap machine** for `swap` crossfade with atomic identity.
5. **One `acknowledge` primitive** consumed by all editable surfaces.
6. **Lint** for raw durations/easings in components.
7. **Motion enters code review** as a checklist item: "Which of the five choreographies? Which tokens? Why does this movement exist?"

---

## Instrumentation & governance

- Motion changes are reviewed against the five-choreography model. New choreographies require Motion-owner sign-off and a doc update here.
- The existing reveal-gate instrumentation (`[wu-reveal-gate]`, `[perf:work-unit]`, etc.) already measures *when* surfaces reveal; this doctrine governs *how* the reveal moves once the gate clears. They compose — performance owns the clock, motion owns the curve.

---

## When this doc must be updated

A change to the token set or the five choreographies; a sanctioned new choreography; or a change to the reduced-motion / accessibility contract.
