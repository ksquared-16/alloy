# Runtime Perspective — Compatibility Layer (Interim)

**Status:** Runtime compatibility layer (flag-gated, default off). Not a new schema, not a config UI.

## What a Perspective is

A **Perspective** is the Alloy OS runtime abstraction for an operational lens: a work unit
viewed through a specific lane/queue selection (e.g. _Tours_, _Waitlist_). It carries the
identity, grain, grouping, sort, default filters, default mission, and empty-state the runtime
needs to render State 1 (queue) and State 2 (compressed queue + Focus Panel).

## Why it is derived (for now)

We are proving the runtime contract **before** redesigning configuration. Rather than add a
`perspectives` table or a Business Processes editor first, the runtime **derives** a
`RuntimePerspective` from data that already exists:

- the active work unit (`work_units.queue_definition`, normalized v1/v2),
- the active queue/lane selection (`selectedQueueKey` / URL `?queue` / bootstrap default),
- the active attention bucket where relevant.

No new fetch, no config mutation, no schema change.

## Where it lives

- `web/lib/adminV2/runtime/perspective/deriveRuntimePerspective.ts` — pure derivation + helpers.
- `web/lib/adminV2/runtime/perspective/RuntimePerspectiveContext.tsx` — single cross-tree store
  (`setActiveRuntimePerspective` / `useActiveRuntimePerspective`) + an in-tree provider.
- The **work-unit page** is the feeder: it publishes the active Perspective to the store and
  seeds BOS (`GlobalAssistantWorkspaceScope.perspective_*`) from the same derived value.
- `AlloyOsRuntimeSplitController` reads the active Perspective (not `?queue=tours`) to emit the
  root attributes that drive the flag-gated visual split.

## Source of truth

Existing Enrollment configuration (`queue_definition`, lanes, `focus_queue`) **remains the
source of truth**. The Perspective is a normalization _over_ that config, not a replacement.

## Trigger semantics

State 2 (`data-alloy-os-runtime-split="true"`) activates when **all** hold:

1. `NEXT_PUBLIC_ALLOY_OS_RUNTIME=1` (flag on),
2. an active `RuntimePerspective` exists (deep link, in-page pill/lane switch, or bootstrap),
3. the Focus Panel / drawer is open,
4. the surface is a work-unit surface.

This is intentionally **not** keyed to a specific queue value, so it works for any work unit.

## Next slice (not this one)

Once the runtime proves the model, Business Processes will expose/edit Perspectives directly.
This layer is an **evolutionary runtime normalization, not a rebuild** — when BP owns
Perspectives, the derivation here becomes the fallback/import path.
