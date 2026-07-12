# Command Surface V3 — Wire Create Lead Into Real Operator Entry Points

**Status:** First end-to-end operator wiring of the platform Command Surface (June 2026). Builds
on V2 (`command_surface_v2.md`, commit `81d25c87`) and the platform command namespace
(commit `5d6a7075`). **No BOS fork, no duplicated create-lead execution, no
`/api/admin/actions/execute` bypass, no protected modal rewrite.**

**Convergence decision (this sprint): Option A.** Keep the rich, protected `CreateLeadModal` as
the intake **body**; route every entry point's *execution* and *success/refresh* through one
platform-owned host. The literal visual swap of the modal chrome for `CommandSurfaceShell`
remains deferred (see "Deferred" below) to avoid regressing the modal's paste-parse / field
confidence / multi-member commit / record-resolution intake.

**Code anchors:**
- `web/lib/platform/commands/createLead/executeCreateLeadCommand.ts` — shared client adapter
- `web/components/platform/commands/createLead/CreateLeadCommandSurface.tsx` — platform host
- `web/lib/platform/commands/createLead/createLeadSuccess.ts` — standardized success contract
- `web/lib/platform/commands/createLead/createLeadCommandModel.ts` — shared command model

---

## Phase 1 — Shared Create Lead execution adapter

`executeCreateLeadCommand(input)` is the single client entry point that runs Create Lead. It
POSTs to `POST /api/admin/actions/execute` against the registered `create_lead` action and
normalizes the HTTP envelope into the platform `ActionResult` contract
(`ActionResultOk` / `ActionResultError`).

- Reuses the same execute route + registered action as the legacy `executeCreateLeadFromModal`
  helper — **no forked mutation path** and no server business logic added on the client.
- Resolves the created opportunity id from `data.affected_id`, falling back to
  `execution_result.opportunity_id` / `.id`.
- Never throws on a handled failure: returns `ActionResultError` with operator-safe copy
  (including a connection-failure case at `status: 0`) so hosts can show recovery copy.

Guarded by `executeCreateLeadCommand.test.ts`.

---

## Phase 2 — Work Unit Actions → Create Lead

The Work Unit page (`work-unit/[workUnitId]/page.tsx`, **runtime-protected**) now renders the
platform host `CreateLeadCommandSurface` instead of wiring `CreateLeadModal` +
`executeCreateLeadFromModal` directly:

- context resolution = `open`, required subject = none (the command model already starts at
  required inputs — `createLeadCommandModel.test.ts`),
- confirm executes through the shared adapter (registered `create_lead`),
- success opens the created Lead drawer via `onOpenCreatedRecord` and refreshes via
  `onRefresh` over the standardized `refreshTargets` (focus-panel/queue invalidation, not a
  full reload).

Protected drawer/work-unit/reveal suite was run; no V3-caused regressions (pre-existing
baseline failures reported separately).

---

## Phase 3 — BOS Create Lead proposal → Command Surface

BOS Create Lead is **not** a separate mutation path — it is the same `CreateLeadModal`
workspace, launched (via the `adminv2:open-create-lead` listener on the department page) and now
hosted by `CreateLeadCommandSurface`. Therefore BOS confirm executes through the **same** shared
adapter and standardized success as manual/Work Unit. The command model still provides the BOS
preview/required-input derivation:

- complete parse → `deriveCreateLeadCommandFromBosProposal` reaches preview/confirm,
- incomplete parse → surfaces missing inputs in operator language (no raw payload keys).

BOS remains an entry point, not its own lifecycle.

---

## Phase 4 — Manual Create Lead alignment

Adopted at every render site (Work Unit page, department page,
`WorkspaceRootActionsRail`): all three now render `CreateLeadCommandSurface` and none reference
`executeCreateLeadFromModal` or `<CreateLeadModal>` directly (guarded by
`createLeadCommandSurfaceWiring.test.ts`).

`CreateLeadCommandSurface` hosts the unchanged `CreateLeadModal` and owns only execution +
success. Modal internals are not rewritten.

**Deferred (documented):** replacing the modal's visible workspace shell with
`CommandSurfaceShell` + `useCommandSurfaceController`. Deferred because the modal owns a rich
intake (paste-parse, field confidence, multi-member commit, record resolution) and its own
overlay chrome; swapping it now would regress that intake. Files involved when undertaken:
- `web/components/admin/opportunity/actions/CreateLeadModal.tsx`
- `web/components/platform/commands/CommandSurfaceShell.tsx`
- `web/lib/platform/commands/surface/useCommandSurfaceController.ts`

---

## Phase 5 — Success / refresh standardization

`buildCreateLeadSuccess({ result, knownInputs })` produces one descriptor used by the host:
`createdRecordId`, `entityType: "opportunity"`, `nextSurface: "focus_panel"`, `refreshTargets`,
and operator copy. Hosts open the created record via `onOpenCreatedRecord` and refresh via
`onRefresh`, preferring per-target invalidation over a full reload where the runtime supports it
(Work Unit uses `invalidate`; department/root preserve their existing `router.refresh`).

---

## Phase 6 — Tests

- `executeCreateLeadCommand.test.ts` — POSTs registered `create_lead` to the canonical execute
  route; normalizes success/failure; operator-safe network-failure copy; **no duplicate
  mutation path**.
- `createLeadCommandSurfaceWiring.test.ts` — all three entry points render the platform host;
  none use the legacy direct helper/modal; host delegates execution (no direct `fetch`).
- `createLeadCommandModel.test.ts` (existing) — Work Unit starts at required inputs; BOS
  complete → preview, incomplete → missing inputs; operator-safe copy; standardized success.

Full `tests/adminV2/actions/` suite green (18 files / 130 tests). Touched-file typecheck clean.

---

## Completion criteria status

| Criterion | Status |
|---|---|
| Create Lead usable from Work Unit Actions | ✅ via `CreateLeadCommandSurface` |
| BOS Create Lead proposal uses the Command Surface path | ✅ same host + shared adapter |
| Execution goes through registered command runtime | ✅ `executeCreateLeadCommand` → registered `create_lead` |
| Success opens/refreshes created record where possible | ✅ standardized success/refresh |
| No existing Create Lead path regresses | ✅ modal internals untouched; suites green |
