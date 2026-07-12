# Handoff — Process Runtime Stabilization (V1 closeout)

**Status:** ✅ **Closed** — stabilization sprint complete on `origin/staging`.
**Date:** 2026-07-06
**Staging tip at closeout:** `3c7dd4a91` (`fix(queues): infer QueueItemsResult through Work View filter helper`)

This is a **stabilization** record, not an architecture sprint. Enrollment is the first configured
process proving the generic runtime; the work here makes operator surfaces agree after record create.

Canonical runtime reference (updated in same closeout):
[`docs/platform/runtime/enrollment-process-runtime.md`](../platform/runtime/enrollment-process-runtime.md)
— see **Process Runtime V1 — operator surface convergence**.

---

## 1. Purpose

Close the Process Runtime stabilization sprint by ensuring:

1. One operator truth chain from **Create Record → Open Record** (no forked counts or stale caches).
2. Work View totals match canonical queue filtering (including `limit=1` exact totals).
3. Queue-membership mutations bust operator read caches so Workspace / Work Unit surfaces refresh.
4. Operational reset clears **`process_instances`** alongside other runtime rows while preserving config.
5. Staging deploys cleanly (TypeScript / Vercel build).

**Explicitly out of scope (next sprint):** stage movement, Work Unit Header, Actions, Communications,
Waitlist flows, Enrollment materialization E2E — operator experience validation only.

---

## 2. Architecture touched (no redesign)

| Layer | Role in this sprint |
|---|---|
| **Operational projection** | Single evaluator for Work View predicates; queue-route filter helper |
| **Queue API** | Work View filter pass + true filtered total at `limit=1` |
| **Process instances** | Runtime primitive cleared by operational reset |
| **Create Lead** | Cache invalidation + Focus Panel href in success payload |
| **Presentation runtime** | Client cache bust + refetch hooks after mutations |
| **Reset scripts** | `process_instances` in delete order + verification |

No new tables. No process engine edits. No configuration schema changes.

---

## 3. Operator truth chain (what now converges)

```
Create Record
      ↓
Process Instance
      ↓
Queue Membership
      ↓
Work Views
      ↓
Queue Rows
      ↓
Metrics
      ↓
Workspace
      ↓
Focus Panel
      ↓
Open Record
```

**Key behavioral guarantees:**

- **Work View totals** derive from the same predicate filter applied to queue rows
  (`applyWorkViewFilterToQueueItemsResult`). Pill / header counts use `QueueItemsResult.total`.
- **Metrics vs queue counts** may intentionally differ when config uses different grains (case row vs
  participant/child). Documented in `operatorRuntimeReadCacheBust.ts` and canonical runtime doc.
- **Cache invalidation** on `create_lead`: server queue cache, client fetch dedupe, OIP warm cache;
  hooks in `useWorkspaceSurfaceRuntime`, `useWorkUnitSurfaceRuntime`, `useOperationalAnswers`.
- **Open Record** navigates to config-resolved Work Unit Focus Panel route, not legacy drawer.

---

## 4. Commits on staging (stabilization slice)

| SHA | Summary |
|---|---|
| `ff83e5733` | **Primary stabilization** — Work View exact totals, queue cache invalidation, operator cache bust, Open Record routing, projection/queue filter alignment |
| `2d3f0913f` | **Reset cleanup** — `process_instances` in operational reset plan, execute, verification |
| `7be5135b0` | QueueItemsResult shape preservation (intermediate TS fix) |
| `3c7dd4a91` | **Deployment fix** — Work View filter helper generic preserves `queue` on `QueueItemsResult` |

Ancestor context (pre-stabilization, already on staging): `ce7ae24c4` (golden path projection + Work View
queue filtering), `ff83e5733` merge base `5223b5d00`.

---

## 5. Files changed (by area)

### Queue + projection
- `web/lib/lifecycle/operationalProjection.ts` — `applyWorkViewFilterToQueueItemsResult`, fetch cap
- `web/app/api/admin/queues/[workUnitId]/[queueKey]/route.ts` — Work View filter integration

### Create Lead + Open Record
- `web/lib/admin/actions/executeAdminAction.ts` — server cache invalidation on create
- `web/lib/admin/actions/entryLifecycleActions.ts` — success payload fields
- `web/lib/platform/commands/createLead/createLeadSuccess.ts`
- `web/lib/platform/commands/createLead/resolveCreatedRecordProcessContextHref.ts`
- `web/components/platform/commands/createLead/CreateLeadCommandSurface.tsx`
- `web/components/presentation/rightRail/CreateLeadEventHost.tsx`

### Cache bust
- `web/lib/admin/operatorRuntimeReadCacheBust.ts`
- `web/lib/workspace/workUnitQueueItemsServerCache.ts`
- `web/lib/workspace/workspaceAdminFetchDedupe.ts`
- `web/lib/metrics/oipWorkspaceWarmCache.ts`
- `web/lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts`
- `web/lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts`
- `web/lib/presentation/runtime/useOperationalAnswers.ts`
- `web/lib/presentation/runtime/useWorkViewTotals.ts`

### Reset
- `web/scripts/resetOperationalState.ts`
- `web/scripts/demoRuntimeCleanupExecute.ts`
- `web/scripts/lib/demoRuntimeCleanupPlan.ts`
- `web/scripts/lib/demoRuntimeCleanupScope.ts`

### Metrics (grain note only)
- `web/lib/metrics/resolvers/enrollmentParticipantMetrics.ts`

---

## 6. Runtime ownership (unchanged doctrine)

| Concern | Owner |
|---|---|
| Process instance rows | `process_instances` table + `lib/process/processInstances.ts` |
| Membership rule | `enrollmentEffectiveStageMembership` / engine `effectiveStage()` |
| Work View predicates | `operationalProjection.ts` + `evaluateWorkViewFiltersV1` |
| Queue row API | `getWorkUnitQueueItems` → queue route |
| Work View totals | Same queue API path with Work View filter (`total` field) |
| Participant metrics | `enrollmentParticipantMetrics` (child/participant grain) |
| Create Lead | `executeCreateLeadAction` → `applyCreateLeadChildParticipation` |
| Open Record route | `resolveCreatedRecordProcessContextHref` |
| Operational reset | `resetOperationalState.ts` → `enrollment_runtime_reset` |

---

## 7. Tests added / exercised

| Test file | Covers |
|---|---|
| `tests/lifecycle/operationalProjection.test.ts` | Work View filter helper, true filtered total |
| `tests/queues/queueRoutes.test.ts` | Queue route Work View filter + exact total at limit=1 |
| `tests/workspace/workUnitQueueItemsServerCache.test.ts` | Server cache invalidation |
| `tests/workspace/workspaceAdminFetchDedupe.test.ts` | Client dedupe bust |
| `tests/platform/commands/createLead/resolveCreatedRecordProcessContextHref.test.ts` | Open Record href |
| `tests/platform/commands/createLead/createLeadSuccessRefresh.test.ts` | Success payload refresh fields |
| `tests/scripts/enrollmentRuntimeReset.test.ts` | FK order incl. `process_instances` |

**Closeout test run (2026-07-06):** 49 tests passed across the files above.

---

## 8. Verification performed

### Automated
- Vitest stabilization suite (49 tests) — pass
- `npx tsc --noEmit` — pass (pre-push / Vercel build path)
- Vercel deploy fix verified via `3c7dd4a91` (QueueItemsResult generic)

### Manual / script (org `93667019-bd28-49b5-a688-acc9bb1e0a19`)
- Operational reset dry-run + execute — `process_instances: N → 0 OK`
- Post-reset: opportunities = 0, config preserved (departments, work_units, status/fields/actions)
- Post create (1 lead + 1 child): `process_instances = 1`, Work View lead row = 1
- Final reset — org left empty for next sprint

---

## 9. Operational reset (updated contract)

```bash
# Dry-run
RESET_ORG_ID=<org> npm run dev:reset:operational-state

# Execute
CONFIRM_RESET_OPERATIONAL_STATE=true RESET_ORG_ID=<org> \
  npm run dev:reset:operational-state -- --execute
```

**Clears (org-scoped):** `opportunities`, `opportunity_customer_members`, `operational_tasks`,
**`process_instances`**, plus related runtime rows via FK-safe delete order.

**Preserves:** all configuration — departments, work_units, status definitions, fields, layouts,
actions, locations, form definitions, etc.

Runbook cross-ref: `docs/sprints/archive/07_2026/platform_reset_runbook.md`.

---

## 10. Known limitations (future work)

| Limitation | Notes |
|---|---|
| Form-intake → OCM only | Does not create `process_instances`; admin Create Lead does |
| OCM fallback reads | Legacy rows without PI; flags documented in canonical runtime doc |
| Work View filter fetch cap | 500 base rows before in-memory predicate; large lanes may need server pushdown |
| Legacy status-based queue lanes | Stage-based doctrine path is correct; V2 pipeline lanes deferred |
| Grain divergence | Metrics (participant) vs queue rows (case) — intentional, not a bug |
| Stage movement | **Next sprint** — not part of this closeout |

---

## 11. V1 freeze verdict

**Process Runtime V1 stabilization is closed.** Staging is the source of truth for the completed work.

Next sprint begins operator experience validation:

Create Lead → Move through Process Stages → verify queue movement, metrics, Work Views, Focus Panel,
Actions, Communications, Waitlist, Enrollment.

Do not extend this handoff with next-sprint implementation detail.
