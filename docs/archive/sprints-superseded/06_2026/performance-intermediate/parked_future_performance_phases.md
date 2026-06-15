# Parked Future Performance Phases

**Status:** Parked — do NOT implement now. Documentation only.
**Owner of decision to start:** product/eng lead (explicitly out of the current sprint).

These phases are captured so they are not lost. They are **not** part of the current
runtime performance sprint and should not be started until that sprint is closed.

---

## Current sprint boundary (for context)

The current sprint is focused exclusively on **read / open / navigation** performance for:

> Workspace → Department → Work Unit → Drawer → Drawer Tabs

It established a reusable **Drawer Performance Contract** and related runtime patterns that the
future phases below should reuse rather than reinvent:

- Registry-driven first-paint contract + section classification (`first_paint_critical` vs `background_only`).
- Monotonic snapshot writes (never downgrade a higher paint-completeness surface).
- Above-fold-safe background/deferred merges (background hydration fills but never *moves* painted above-fold content).
- Reveal gated on first-paint-critical chrome readiness (opportunity / person / child).
- Warm snapshot reuse (instant repeat open; no cacheBust when above-fold is complete).

**Still open inside the current sprint (NOT future phases — just not yet done):**
- Card 4 Tier 1 transition polish (gate↔shell min-height; comms inner skeleton dimensions; dept skeleton-on-warm seed).
- Card 4 Tier 2 (non-workflow drawer tab mount-once; dept empty-then-refill guard; person→person no-seed edge).
- Card 5 Communications full stabilization (prefetch self-destruct, cross-open message cache, mark-read decoupling).
- Deferred (own validated card): **Dept → Work Unit soft navigation** — currently a hard `window.location.assign` full-document reload / whole-shell remount; biggest perceived-perf win but risky (hard nav exists due to prior RSC-cancellation). Needs staging validation.

---

## Future Phase: Settings Performance Review

All of `/settings` will eventually need the same performance review and upgrade applied to the
workspace/drawer surfaces. Apply the same doctrine: stable shells, no skeleton-on-warm, no
empty-then-refill, reserved dimensions, stale-while-revalidate.

**Scope (later):**
- Settings page navigation
- Tab switching
- Table loading
- Form save / update behavior
- Field / config updates
- Cache invalidation
- Optimistic UI
- Avoiding full-page refetches
- Stable transitions between settings sections

**Not part of the current sprint.** The current sprint remains focused on
Workspace → Department → Work Unit → Drawer → Drawer Tabs.

---

## Future Phase: Save / Update Performance

The current sprint mainly covers **read / open / navigation** performance. A separate
**save / update** performance pass is needed later — mutation flows have their own perceived-
performance failure modes (flashes, reverts, full refetches) not addressed by the read-path work.

**Scope (later):**
- Record updates from drawers
- Status changes
- Action completion
- Assignment changes
- Field edits
- Form / config saves
- Optimistic updates
- Loading states on save buttons
- Toasts and confirmation timing
- Cache invalidation after save
- Preventing drawer / row / KPI flashes after mutation
- Rollback / error handling
- Avoiding full refetches unless truly needed

**Performance goal:** Saving should feel **immediate, stable, and trustworthy.**

**The user should NOT see:**
- Drawer reload
- Row disappear / reappear
- KPI flash
- Status revert then change
- Button hang without feedback
- Full page refetch after small updates

**Reuse from the current sprint:** monotonic snapshots and above-fold-safe merges already provide
the foundation for "mutate without moving painted content" — an optimistic update should patch the
existing snapshot/record in place (above-fold-safe) and reconcile on the server response, rather
than clearing and refetching. Cache invalidation after save should be surgical (the touched record /
derived KPI), never a full-surface refetch.

**Do not implement now. Documented as a future phase only.**
