---
owner: platform
status: canonical
last_reviewed: 2026-08-21
supersedes: []
---

# Communications workspace — duplicate loader ownership (HANDOFF)

**Status:** open · **Owner:** Communications lane · **Raised by:** Runtime Performance / Premium UX
sprint (slot 5) · **Not fixed here** — the remedy touches Communications internals, and this sprint
was scoped out of them to avoid colliding with that lane.

This is a durable handoff, not a bug report from a hunch: the defect, the evidence, the disproved
explanation, and the exact remedy are all recorded so the owning lane does not have to re-derive them.

---

## 1. The defect

Every time the Communications workspace opens, **five reference URLs are each fetched twice, roughly
6.4 s apart.** The first burst is the warm cache doing its job at +0 ms. The second burst is a
different loader, owned by the workspace components, re-fetching what was already warm.

Duplicated per open:

| URL |
|---|
| `/api/admin/communications/templates` |
| `/api/admin/communications/templates?status=active` |
| `/api/admin/communications/announcements` |
| `/api/admin/communications/status-options?grain=family` |
| `/api/admin/communications/status-options?grain=child` |

## 2. Evidence

Measured on a production build over four open/close cycles, full URLs retained (`web/scripts/
pe3WorkspaceDataLifecycle.mjs`):

| workspace | requests per open | shape | reading |
|---|---|---|---|
| Processing | 3, 0, 0, 2 | warm + occasional refresh | healthy |
| Work Items | 4, 0, 0, 0 | warm after first | healthy |
| Operations | 7, 7, 7, 7 | flat | *(fixed in this sprint — adopted the warm primitive)* |
| **Communications** | **20, 22, 23, 22** | **plateau** | **duplicate loader** |

**Shape, not a single count, is the diagnostic.** Flat means a loader refetching; rising would mean
an accumulating effect; a plateau means a fixed amount of duplicated work per open.

### Correction to earlier reporting — this is NOT a leak

An earlier note in this program described Communications as "growing / accumulating". The
four-cycle shape disproves that: it plateaus at ~22. `templates` steps 4 → 6 **once** and then
stays. There is no unbounded growth and no listener accumulation to hunt. Anyone picking this up
should not go looking for a leak — the cost is fixed and per-open.

## 3. Root cause — duplicate loader ownership

A unified warm cache **already exists and is already correct**:

- `web/lib/communications/v2/communicationsWorkspaceWarmCache.ts` — 90 s TTL, in-flight dedup,
  owning `TEMPLATES_API`, `ANNOUNCEMENTS_API`, `PROGRAM_OPTIONS_API`, `STATUS_OPTIONS_API`,
  `LOCATION_HIERARCHY_API`.
- It is armed on nav intent by `web/app/adminV2/components/InboxModal.tsx` and
  `web/app/adminV2/components/SidebarModalNavItems.tsx` (`warmCommunicationsWorkspaceModal()`).
  That is the +0 ms burst.

The workspace components **import that cache and then also declare their own endpoint constants and
fetch them directly**:

- `web/app/adminV2/communications/TemplatesWorkspace.tsx` — declares `TEMPLATES_API` (line ~79).
- `web/app/adminV2/communications/AnnouncementsWorkspace.tsx` — declares `ANNOUNCEMENTS_API`,
  `TEMPLATES_API`, `STATUS_OPTIONS_API`, `PROGRAM_OPTIONS_API`, `LOCATION_HIERARCHY_API`
  (lines ~63–68) — the same five the cache already owns.

Those direct reads are the +6.4 s burst. Two loaders own the same data; only one of them is warm.

## 4. Disproved explanation — do not retry

**Hypothesis:** the warm cache's module-level `Map` was being instantiated per route bundle, so the
components were reading a different cache instance than the one the modal warmed.

**This was implemented, built, measured, and DISPROVED.** Routing the cache through `globalThis`
changed the request count not at all, and was reverted. (The bundle-scoping hazard is real elsewhere
in this codebase — it is why `lib/perf/processCache.ts` exists — but it is *server*-side, and it is
not what is happening here.) The cause is ordinary duplicate loader ownership.

## 5. Remedy

Route `TemplatesWorkspace` and `AnnouncementsWorkspace` through the warm cache **they already
import**: delete the local endpoint constants and their direct `fetch` calls, and read warm-first
through the cache's accessors, invalidating on mutation rather than refetching on mount.

The pattern to copy is in this repo, applied to the workspace with the same shape:

- `web/lib/scheduling/operationsWorkspaceWarmCache.ts` and its adoption in
  `web/components/adminV2/roster/RosterWorkspace.tsx` — including the mutation seam
  (`invalidateOperationsDay()`), which is the part that makes reuse *safe* rather than merely fast.
- Guards: `web/tests/runtime/operationsWorkspaceWarmLifecycle.test.ts`.

**Expected result:** ~22 requests per open → the first-burst count, and 0 on a warm reopen inside the
TTL.

## 6. Verifying a fix

```bash
cd web
node scripts/pe3WorkspaceDataLifecycle.mjs      # four open/close cycles, full URLs retained
```

Accept only if the Communications row loses its second burst and its reopen counts fall — and if the
per-open shape is reported, not just a total.
