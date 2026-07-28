# Commands contextual-ownership acceptance — msn_188e8bea6fb6de28dd21

**Date:** 2026-07-28  
**Slot:** 1 (`wt1-commands-system-inventory`)  
**Branch:** `agent/cursor/1-commands-system-inventory`  
**Base commit for pass:** `c5e1831b0` (product-boundary correction)  
**Scope:** Prove useful Command configuration exists in owning products — **not** another architecture phase.

---

## Decision (stop rule)

**Business Process ownership is real and usable** for curated Process Actions + runtime `command_set_v1` authority.  
**Surface Command exposure configuration is absent** from `/organization/surfaces` (layout composition only).

Per decision rule: **do not certify contextual ownership complete.**  
**Recommend a separate `Surface Command Exposure` realization slice.**  
Do **not** reopen `/organization/commands` as org configuration.

Architecture (Registry → Runtime → adapters → `command_set_v1` → BOS gating → safety) remains certified from prior mission delivery. This pass does **not** retract architecture certification.

---

## 1. Business Process ownership verdict — **PASS (usable, with honesty notes)**

### Live UI (Enrollment / Process Actions)

| Check | Result |
|-------|--------|
| Process editor loads Actions / Process Actions | **Yes** — `LifecycleActionsMatrix` on Business Process editor |
| Select / enable supported Commands | **Yes** — curated base set (Create Lead via `create_record` → `create_lead`, Close Lead, Add Parent/Child, Schedule Tour, Enroll/Waitlist, Message, …) |
| Remove / disable selected | **Yes** — enable toggle + placement checkboxes |
| Ordering editable | **Limited** — `display_order` on save; no free-form catalog reorder UI for full Capability Registry |
| Save + reload preserve selection | **Yes** — Focus Panel Manage for Create Lead toggled off→on; afterClick/afterReload both `true` (live session) |
| Explicit-empty V1 | **Runtime-proven** — `resolveBusinessProcessCommandSelection` + tests |
| Legacy fallback | **Runtime-proven** — authority `legacy_compatibility` when V1 absent |
| New saves write V1 | **Yes** — `ensureProcessCommandSetV1OnSave` on lifecycle builder / stage persist |
| Stages recommend ⊂ process set | **Runtime-proven** — `evaluateStageActionsForProcess` + publish `stage_orphan` |
| Work Templates cannot invent unselected | **Runtime-proven** — `processCommandSetAuthoring` P6.S3 gating |
| Unsupported not published as runnable | **Honesty** — Capability Registry maturity; Process Actions only offers curated runnable keys |
| No stable keys as normal admin inputs | **Yes** — human labels in Process Actions |

### Honesty notes (not a second product blocker)

1. **P6.S4 full Capability Registry picker UX remains deferred.** Process Actions is a **fixed base-action matrix**, not a full select/remove/reorder of every registry Command.
2. Process Actions primarily persists **definitions/placements** (`lifecycle-actions-matrix`); V1 is stamped/maintained on process save and upserts catalog keys — it does **not** remove keys when stages drop them (explicit empty preserved).
3. Internal diagnostics for Create lead showed **“Not currently selected by a Business Process via command_set_v1”** while org placements still exist — live Enrollment may still resolve Create lead via **legacy compatibility + placements** until a V1-stamped save includes it. Runtime tests prove V1 authority when present.

### Persistence evidence (Create lead / Process Actions)

- Surface: Enrollment Process → Actions tab → Create Lead placements.
- Toggle: Focus Panel Manage **off → on**; save; reload → remained **on**.
- Restored Close Lead to Off/Disabled after an earlier save side-effect.
- Storage path: department lifecycle actions matrix API → `action_definitions` / `action_placements` (org-owned rows), not Surfaces product UI.

---

## 2. Surface ownership verdict — **FAIL (narrow product blocker)**

`/organization/surfaces` offers only:

- Focus Panels (composition / modes / publish)
- Queue Rows (presentation / fields)
- Workspaces (header / summaries)
- Work Units (header / metrics)
- Operational Intelligence

**No** Command exposure controls for Queue row / Focus Panel Manage / Record menu / Workspace / Global create.

| Check | Result |
|-------|--------|
| Meaningful bounded exposure decisions in Surfaces | **No** |
| Create lead operational exposures (observed via diagnostics + Process Actions) | Side panel/rail, Work unit primary, Workspace home, Department workspace (legacy), Queue row (inactive) — **stored**, not Surfaces-edited |
| System-owned vs org-owned | Placements include org-owned rows; some system defaults — **editable today under Process Actions / developer Action Buttons**, not Surfaces |
| Org-owned exposure edit + persist in Surfaces | **Absent** |
| Human-readable labels | Process Actions / diagnostics use human labels; Surfaces N/A |
| Duplicate placements grouped | Diagnostics groups duplicates; Surfaces N/A |
| Surfaces uses process-selected set | Surfaces does not configure Commands at all |
| Unavailable remain non-runnable | Runtime / registry honesty — not Surfaces |
| Narrow layout usable for exposure | N/A — no exposure UI |

**Existing storage for the future slice:** `action_placements` (+ definition activation), already written by Process Actions and developer `/adminV2/settings/actions`. Surfaces should **configure presentation/exposure in context**, not invent a Commands catalog.

Screenshot: `qa/missions/commands-ownership-acceptance/ownership-acceptance-surfaces-no-command-exposure.png`

---

## 3. Automation boundary verdict — **PASS (deferred product honesty)**

- Command Runtime accepts `origin: "automation"` (adapters map origin).
- Execute route maps automation/workflow origin into Command Runtime when facade-supported.
- **No** Automation org UI found that defines executors or bypasses Runtime.
- **No** dependency on standalone Organization Commands configuration product.
- Full Automation “invoke existing Command” authoring product is **deferred** — out of scope for this acceptance pass.

---

## 4. Diagnostics boundary verdict — **PASS**

| Check | Result |
|-------|--------|
| `/organization` has no Commands domain | **Yes** — domains: … Automation → Business Processes → Surfaces … |
| Ops nav: Automation → Processes → Surfaces | **Yes** (`configurationModeNav.ts`) |
| Ordinary admin nav reaches `/organization/commands` | **No** — only `CONFIGURATION_MODE_INTERNAL_NAV_ITEMS` |
| Diagnostics read-only | **Yes** — overlay / placements / process usage inspection only |
| Clearly internal / platform-oriented | **Yes** — banner + “Command capability diagnostics” |
| `/settings/actions` → `/adminV2/settings/actions` | **Yes** — HTTP 307 |
| `/configuration/commands` | **Keep as internal compatibility alias** to `/organization/commands` (bookmarks / old links). Not a public org product. Retire later only if alias traffic is gone — do not present as operator config. |

Screenshot: `ownership-acceptance-organization-no-commands.png`, `ownership-acceptance-diagnostics-create-lead.png`

Residual copy nits (non-blocking): detail still says “Enablement and where it appears are organization settings below” while sections are read-only — cleanup can ride with Surface slice or diagnostics polish.

---

## 5. End-to-end Create lead proof — **PARTIAL (runtime + route; live operator invoke not re-run this session)**

**Proven in tests / code:**

1. Process selection authority for `create_lead` when present in `command_set_v1`.
2. Stage evaluation / non-eligibility when unselected (`processRuntimeCommandConsumption`).
3. `POST /api/admin/actions/execute` delegates facade-supported keys (incl. RegisteredAction `create_lead`) through `executeCommandInvocation` **exactly once**.
4. RegisteredAction adapter → canonical lead executor path (existing P1/P9 suite).

**Not re-proven live in this session:** full browser operator click Create lead → record create → event/projection (server instability mid-pass; earlier Process Actions persistence already exercised). Rely on green Commands runtime regression (262 tests) + focused authority suite.

---

## 6. Non-runnable honesty proof — **PASS (runtime)**

- Unselected by process → not eligible (`processRuntimeCommandConsumption`).
- Stage orphan → blocked on publish (`processCommandSetAuthoring` / `validateProcessCommandSetsForPublish`).
- Unsupported / placeholder → Capability Registry maturity; diagnostics show Archive Lead / placeholders as Not yet supported.
- Surfaces / BOS do not invent process selection (prior BOS gating tests green in Commands suite).

---

## 7–8. Screenshots & persistence

| Artifact | Path |
|----------|------|
| Org grid without Commands | `qa/missions/commands-ownership-acceptance/ownership-acceptance-organization-no-commands.png` |
| Surfaces without Command exposure | `…/ownership-acceptance-surfaces-no-command-exposure.png` |
| Diagnostics Create lead (read-only) | `…/ownership-acceptance-diagnostics-create-lead.png` |
| Process Actions persistence | Session evidence: Create Lead Focus Panel Manage afterClick/afterReload `true` |

---

## 9. Remaining gap (single narrow blocker)

### `Surface Command Exposure` realization slice

**Missing controls (in Surfaces context):**

- Toggle / place process-selected Commands on: Queue row, Focus Panel Manage, Record menu, Workspace, Global create (bounded set).
- Clear system-owned vs organization-owned exposure.
- Group or hide duplicate `action_placements`.
- Consume **effective process-selected Command set** — never invent Commands.

**Existing storage:** `action_placements` / `action_definitions` (already used by Process Actions + `/adminV2/settings/actions`).

**Required UX:** Surface- or process-bound exposure editor in Surfaces (or Surface-linked Process context), **not** a resurrected `/organization/commands` catalog.

**Optional follow-up (not this blocker):** P6.S4 full process Command picker for entire Capability Registry; diagnostics copy cleanup.

---

## 10. Tests

```text
# Commands + BOS regression
vitest tests/platform/commands/ + processCommandSetAuthority + queryBosSlashCatalog
→ 26 files, 262 passed

# Focused ownership / authority
processCommandSetAuthoring, processCommandSetAuthority,
processRuntimeCommandConsumption, evaluateStageActionsForProcess,
executeCommandInvocation, organizationRuntime
→ 53 passed (5 files in last focused run; org domains assert no Commands key)

# Work Template constraint (authoring gating)
processCommandSetAuthoring P6.S3 — passed

# Known residual (not used as certification of Surface ownership)
resolveCanonicalWorkTemplateActionOptions alternate-path waitlist grouping — 1 failing assertion
(pre-existing / non-blocking for Surface gap decision; primary WT gating tests pass)
```

---

## 11. Typecheck

```text
cd web && npm run typecheck  # production / tsconfig.build.json — pass (exit 0)
```

---

## 12. Evidence changed

- This file
- Screenshots under `qa/missions/commands-ownership-acceptance/`
- P10 amended with ownership-acceptance outcome

---

## 13–16. Git

Recorded at commit time in the final report. Nothing pushed.

---

## 17. Final recommendation

**Open narrow `Surface Command Exposure` realization slice.**  
Do **not** integrate as “contextual ownership complete.”  
Do **not** reopen standalone Organization Commands configuration.
