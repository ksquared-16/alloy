# `POST /api/admin/actions/execute` — Envelope Consumer Audit

> Phase 2B working note. Inventory of every consumer of the action-execute endpoint
> and the response shape each one currently expects, used to drive full normalization
> to the standard contract (`{ ok, data, correlation_id }` / `{ ok, error, correlation_id }`).
>
> See `docs/api/api-response-contract.md` for the contract and helpers.

## Producer

| File | Notes |
| --- | --- |
| `web/app/api/admin/actions/execute/route.ts` | `POST` handler. Two execution paths: registered actions via `runRegisteredAction`, all other keys via `executeAdminAction`. |

### Pre-2B response shapes (mixed)

- **Success (additive, Phase 2A):** `{ ok: true, data: { execution_result, affected_id? }, execution_result, affected_id?, correlation_id }` — both the canonical `data` and legacy top-level fields.
- **Execution failure:** `{ ok: false, error: <string>, execution_result: null, completion_requirements?, effective_requirements?, action_preflight?, blockers?, correlation_id }` — **bare string `error`** plus rich top-level preflight fields.
- **Bad request / invalid JSON:** `{ error: <string> }` (HTTP 400) — bare string, no `ok`, no `correlation_id`.
- **Auth gate (401/403):** produced by shared `requireAdminOrOps` / `adminContextFailureResponse` (out of scope — shared infrastructure).

## Consumers (15 fetch call sites across 6 files)

| # | File / call site | Expects | Reads on success | Reads on failure |
| --- | --- | --- | --- | --- |
| 1 | `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` · `confirm_tour` POST | legacy error string + `{ok}` | `json.ok` | `json.error` (string) |
| 2 | `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` · main mutating POST | **mixed** | `json.ok`, `json.execution_result` | `json.error` (string), `json.completion_requirements`, `json.action_preflight` |
| 3 | `web/lib/admin/actions/entryLifecycleActionClient.ts` · `postAdminActionExecute` | `{ok}` + legacy error string | `json.ok`, `json.execution_result` | `json.error` (string) |
| 4 | `web/lib/admin/actions/submitAddPersonFromDrawer.ts` | `{ok}` + legacy error string | `json.ok`, `json.execution_result` | `json.error` (string) |
| 5 | `web/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals.tsx` · `executeOpportunityHeaderAction` | **mixed** | `json.ok`, `json.execution_result` | `json.error` (string), `json.action_preflight`, `json.completion_requirements` |
| 6 | `web/components/admin/AdminEntityDrawerLegacy.tsx` · header action (~L4556) | **mixed** | `json.ok`, `json.execution_result` (`.kind`/`.row`/`.workflow_run_id`) | `json.error` (string), `json.action_preflight`, `json.completion_requirements` |
| 7 | `web/components/admin/AdminEntityDrawerLegacy.tsx` · schedule tour outcome (~L19177) | `{ok}` + legacy error string | `json.ok`, `json.execution_result` | `json.error` (string) |
| 8 | `web/components/admin/AdminEntityDrawerLegacy.tsx` · record_tour_outcome (~L19237) | `{ok}` + legacy error string | `json.ok` | `json.error` (string) |
| 9 | `web/components/admin/AdminEntityDrawerLegacy.tsx` · contact_attempted (~L19277) | `{ok}` + legacy error string | `json.ok`, `json.execution_result` | `json.error` (string) |
| 10 | `web/components/admin/AdminEntityDrawerLegacy.tsx` · mark_lost (~L19325) | `{ok}` + legacy error string | `json.ok`, `json.execution_result` | `json.error` (string) |
| 11 | `web/components/admin/AdminEntityDrawerLegacy.tsx` · add_note (~L19377) | `{ok}` + legacy error string | `json.ok`, `json.execution_result` | `json.error` (string) |
| 12 | `web/components/admin/AdminEntityDrawerLegacy.tsx` · update_status_add_note (~L19447) | `{ok}` + legacy error string | `json.ok`, `json.execution_result` | `json.error` (string) |
| 13 | `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` · queue row registry action (~L6389) | `{ok}` + legacy error string | `json.ok`, `json.execution_result` (`.kind`/`.href`/`.drawer`) | `json.error` (string) |
| 14 | `web/app/adminV2/workspace/.../page.tsx` · contact_attempted modal (~L7655) | `{ok}` + legacy error string | `json.ok` | `json.error` (string) |
| 15 | `web/app/adminV2/workspace/.../page.tsx` · add_note modal (~L7736) | `{ok}` + legacy error string | `json.ok` | `json.error` (string) |

### Indirect consumers (call the lib wrappers above, not the endpoint directly)

- `web/app/adminV2/workspace/.../page.tsx` — `executeCreateLeadFromModal`, `executeMarkLostFromModal` (via `entryLifecycleActionClient`).
- Various drawer modals route through `applyRegistryResolvedActionClient` and `submitAddPersonFromDrawer`.

### Tests that mock the HTTP response body

- `web/tests/admin/actions/submitAddPersonFromDrawer.test.ts` — success `{ ok:true, execution_result }`, failure `{ ok:false, error:"Not found" }`.
- `web/tests/admin/actions/scheduleTourWorkUnitActions.test.ts` — success `{ ok:true, execution_result:{ kind:"noop" } }`.
- `web/tests/api/contractRoutes.test.ts` — Phase 2A additive-success assertions.

> NB: server-lib tests that read `executeAdminAction(...).execution_result` /
> `runRegisteredAction(...)` exercise the **library result**, not the HTTP envelope, and
> are unaffected by this change.

## Normalization plan (Phase 2B)

1. **Route:** all route-constructed failures use `apiError(code, message, status, details?, { request, correlationId })`.
   - `details` carries `{ completion_requirements?, effective_requirements?, action_preflight?, blockers? }` when present.
   - Code is derived from the preserved HTTP status; failures carrying preflight/completion/blocker context use the stable `ACTION_BLOCKED` code.
   - Success uses `apiOk({ execution_result, affected_id? }, { request, correlationId })` — canonical `data` only (legacy top-level fields dropped now that all consumers are migrated).
   - Auth-gate responses (401/403) remain owned by shared `requireAdminOrOps` / `adminContextFailureResponse`.
2. **Consumers:** unwrap intentionally — `json.data?.execution_result` on success, `json.error?.message` on failure, and `json.error?.details?.{action_preflight,completion_requirements}` for blocked preflight surfaces.
3. **Tests:** update the three HTTP-body mocks above and add normalized-failure coverage.
