# Communications Preview VM Doctrine

**Status:** Canonical embedded workspace pattern (July 2026).  
**Origin:** Communications Activity Sprint — Focus Panel Activity `activity_embed`.  
**Scope:** How embedded operator workspaces load inside an already-selected record context without a second loading shell.

---

## Doctrine

```
Selected Record (queue row / Focus Panel selection)
        ↓
Preview VM (minimum truthful snapshot on selection payload)
        ↓
Immediate render (embedded workspace — no blank shell)
        ↓
Background hydrate (prefetch full workspace VM)
        ↓
Full Workspace VM (authoritative threads, timeline, consent, tasks)
        ↓
Warm cache on revisit (same selection signature)
```

---

## Why this exists

Activity and future embedded workspaces are **selection surfaces**, not cold-entry routes. The operator has already chosen a record; switching to Communications, Documents, or Processing inside the Focus Panel must feel instant.

Preview VM carries the **minimum truthful** state needed for first paint:

- Family label and roster hints
- Eligible / disabled recipients
- Recent threads (capped)
- Recent timeline events (capped)
- Composer defaults (channel, selected recipients)

Full VM revalidates in the background without clearing valid warm state on warm navigation.

---

## Communications reference implementation

| Layer | Module | Role |
|-------|--------|------|
| Preview resolve | `resolveFamilyCommunicationWorkspacePreview.ts` | Builds `FamilyCommunicationWorkspacePreviewVM` |
| Preview attach | Drawer / Focus Panel VM compose | `communicationsPreviewVm` on selected payload |
| Bootstrap | `FamilyCommunicationWorkspace.tsx` | `workspaceFromPreview()` for first paint |
| Warm cache | `drawerFamilyWorkspacePrefetchCache.ts` | Keyed by customer/entity + thread + channel |
| Prefetch | Row select + Activity tab click | Schedules full VM fetch before operator switches tab |
| Timing marks | `drawerFamilyWorkspacePrefetchTiming.ts` | Dev-only `performance.mark` — not console logging |
| Presentation | `FamilyCommunicationWorkspaceView.tsx` | `activity_embed` branch only |

**Out of scope for Preview VM:** send runtime, provider bindings, compliance enforcement, Settings UI, Command Center modal layout.

---

## Cache and invalidation rules

1. **Key:** `{ customerId | entityType+entityId, composerChannel, threadId }`
2. **Warm hit:** Render immediately; background `force` refresh may update in place
3. **Invalidation:** After confirmed send — `invalidateDrawerFamilyWorkspaceCache(scope)`
4. **Do not:** Clear valid displayed data before replacement is ready on warm navigation (AdminV2 runtime performance doctrine)

---

## Intended reuse (future embedded workspaces)

This doctrine is the **canonical embedded workspace pattern** for:

| Surface | Expected embed |
|---------|----------------|
| **Processing** | Case workspace inside Focus Panel Activity |
| **Documents** | Document queue / packet review embed |
| **Scheduling** | Tour / appointment context embed |
| **Billing** | Invoice / payment context embed |
| **Attendance** | Check-in / absence context embed |
| **Future embedded workspaces** | Any record-scoped operator panel inside Focus Panel |

Each domain should define:

1. A **Preview VM** type (capped, truthful minimum)
2. A **Full VM** type (authoritative operational detail)
3. A **prefetch cache** keyed by selection + mode
4. A **`surfaceVariant`** (or equivalent) gate so modal/full-page paths stay unchanged

Do **not** fork parallel load paths per surface. Extend this pattern.

---

## Performance validation

| Signal | Expected |
|--------|----------|
| First Activity paint | Preview VM renders channels, recipients, topic rail without full fetch wait |
| Warm load | Second visit to same family uses cache; no blank shell |
| Background hydrate | Full VM replaces preview tail without flicker |
| Timing marks (dev) | `preview_vm_ready` → `workspace_mounted` → `warm_cache_hit` |

Contract tests: `drawerFamilyWorkspacePrefetchTiming.contract.test.ts`, `familyWorkspaceActivityEmbed.contract.test.ts`.

---

## Related docs

- `communications-activity-sprint-closeout.md` — sprint outcomes
- `docs/platform/modules/communications-platform.md` — Activity embed section
- `docs/platform/governance/runtime-ownership-migration-map.md` — ownership table
- `web/lib/communications/v2/familyWorkspace/THREAD_SEMANTICS.md` — transport vs operator model
- `docs/system/adminv2-runtime-performance-doctrine.md` — reveal and warm-navigation rules
