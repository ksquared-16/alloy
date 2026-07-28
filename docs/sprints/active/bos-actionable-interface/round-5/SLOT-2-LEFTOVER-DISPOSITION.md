---
owner: platform
status: audit
last_reviewed: 2026-07-27
---

# Slot 2 leftover disposition audit

Audit only. Stash was **not** applied, committed, pushed, or deleted.

## Repository state (at audit)

| Field | Value |
|---|---|
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt2-bos-actionable-interface-plan` |
| Branch | `agent/cursor/2-bos-actionable-interface-plan` |
| Worktree HEAD | `0357b3ecd` — `docs(bos): slot 2 closeout — timing shipped; leftover WIP listed` |
| Working tree | clean before this doc was written |
| vs `origin/staging` | **1 behind / 0 ahead** (staging has merge commit only) |
| `origin/staging` tip | `631ef2b4e` — `Merge pull request #242 from ksquared-16/agent/cursor/2-bos-actionable-interface-plan` |
| PR #242 on staging | **yes** (`631ef2b4e` is tip / contains the merge) |
| Slot | **2 free** (sprint finished; worktree preserved) |

## Stash metadata

| Field | Value |
|---|---|
| Identifier | `stash@{0}` |
| Message | `On agent/cursor/2-bos-actionable-interface-plan: slot2-leftover-wip-not-promoted` |
| Object | `db84c265788dcb3207446e6fa56114c0bdc2ae8f` |
| Base parent (`^1`) | `39d6008aa` (pre-rebase closeout tip; stash still valid as patch set) |
| Untracked parent (`^3`) | present — 3 untracked files |
| File count | **23** (`git stash show --include-untracked --stat`) |
| Diffstat | +502 / −132 |

Exact delete command (**do not run** until Kelly authorizes):

```bash
cd /Users/Kelly/Code/alloy-worktrees/wt2-bos-actionable-interface-plan
git stash list   # confirm stash@{0} still reads slot2-leftover-wip-not-promoted
git stash drop stash@{0}
```

If other stashes were pushed ahead of it, drop by message:

```bash
git stash list | grep slot2-leftover-wip-not-promoted
# then: git stash drop stash@{N}
```

---

## Why it was not promoted

Explicit closeout choice: promote timing persistence + Round 5 commits already on the branch; leave mixed WIP out of PR #242.

Two themes were bundled in one dirty tree:

1. **Create Lead department scope** — Work Unit snapshot baked `departmentId: null`, so Form/slash often saw Person-only platform floor.
2. **Data Model / Relationships presentation** — platform edge label editing via `entity_labels` namespace — unrelated to Create Lead Round 5.

Neither theme was finished as an isolated, reviewed PR. Applying the whole stash would mix runtime provisioning, BOS UI, and Data Model settings.

---

## Out-of-stash staging defect (discovered during this audit)

**Not in the stash.** Present on `origin/staging` after PR #242:

`useCreateLeadBosSessionController.ts` calls:

```ts
const loaded = createLeadConversationIntakeAdapter.loadEffectiveSpec(...);
setEffectiveSpec(loaded);
```

while `ConversationIntakeAdapter.loadEffectiveSpec` is typed as  
`Promise<EffectiveCreateLeadIntakeSpec> | EffectiveCreateLeadIntakeSpec`.

Vercel `next build` fails:

> Argument of type `EffectiveCreateLeadIntakeSpec | Promise<...>` is not assignable to `SetStateAction<EffectiveCreateLeadIntakeSpec | null>`.

**Disposition:** separate **MISSED-DEFECT** hotfix (await / narrow return type) — **new PR**, not stash apply.  
Stash controller patch only adds GlobalAssistant `department_id` fallback; it does **not** fix the Promise typing.

---

## Full file inventory + per-file disposition

### Theme A — Create Lead department / Form scope

| File | Summary | Purpose | Staging already solved? | Disposition | Future owner (if any) | Completeness | Risk if applied later |
|---|---|---|---|---|---|---|---|
| `web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts` | Adds `departmentId` on `WorkUnitActionsProjection`; fills from work-unit dept | Bake Create Lead / Actions scope at D1 commit | **No** — staging projection has no `departmentId` | **MISSED-DEFECT** (core) / ship via **Create Lead command constraint convergence** | Create Lead command constraint convergence | Partial but coherent with companion files | Medium — touches provisioning contract; needs type+test companions |
| `web/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot.ts` | `departmentId: snapshot.actionsProjection?.departmentId` instead of hard `null` | First frame carries dept for Create Lead | **No** — staging still `departmentId: null` (lines ~143/237) | **MISSED-DEFECT** | Create Lead command constraint convergence | Complete one-liner once projection has field | Low–medium — AdminV2 reveal-sensitive path; keep UI-only aside from this field |
| `web/lib/presentation/runtime/useWorkUnitSettlement.ts` | Settle `departmentId` even when Actions already committed | Avoid null dept when rail non-empty | **No** — staging only updates dept when actions array settles | **MISSED-DEFECT** | Create Lead command constraint convergence | Complete with d5 test | Medium — settlement merge semantics |
| `web/components/presentation/rightRail/BosWorkspaceScopeSync.tsx` | **New** — publishes dept/WU into GlobalAssistant | Slash Create Lead shares Actions dept | N/A (absent) | **FUTURE-SPRINT** | Create Lead command constraint convergence | Complete small component + wiring | Medium — BOS/GlobalAssistant coupling; must not fight Commands launch context |
| `web/components/presentation/workUnit/WorkUnitSurface.tsx` | Mounts `BosWorkspaceScopeSync` from `model.departmentId` | Scope sync on Work Unit | No | **FUTURE-SPRINT** | Create Lead command constraint convergence | Complete with new component | Medium — shared Work Unit shell |
| `web/components/presentation/workspace/WorkspaceSurface.tsx` | Mounts sync from `defaultDepartmentId` when ready | Scope sync on Workspace | No | **FUTURE-SPRINT** | Create Lead command constraint convergence | Complete with new component | Medium — shared Workspace shell |
| `web/app/adminV2/components/aiCommandSurface/commandSession/useCreateLeadBosSessionController.ts` | Fallback `departmentId` ← GlobalAssistant `workspaceScope` | Slash Create Lead without null dept | **No** (fallback absent); Promise bug separate | **FUTURE-SPRINT** (dept fallback only) | Create Lead command constraint convergence | Partial — does not fix Promise/`setEffectiveSpec` | Medium — overlaps Commands/BOS launch; do not apply alone without typing fix |
| `web/lib/bos/commandSession/createLeadSectionPresentation.ts` | Person empty status includes contact OR; copy “this lead” | Operator status matches visible floor | Partially — person branch still omits contactGap on staging | **FUTURE-SPRINT** | Create Lead command constraint convergence | Small UX polish | Low |
| `web/tests/bos/commandSession/bosWorkspaceScopeSync.test.ts` | **New** source-wiring expectations | Guard sync mounts + controller fallback | N/A | **FUTURE-SPRINT** | Create Lead command constraint convergence | Complete for wiring | Low |
| `web/tests/runtime/d4SnapshotRenderer.test.ts` | Projection includes `departmentId`; asserts model.dept | Contract for baked scope | Staging tests still use `{ count, actions }` only | **FUTURE-SPRINT** (with provisioning) | Create Lead command constraint convergence | Complete | Low |
| `web/tests/runtime/d5WorkUnitSettlement.test.ts` | Dept settles independently of actions | Settlement parity | No equivalent assertion on staging | **FUTURE-SPRINT** | Create Lead command constraint convergence | Complete | Low |
| `web/tests/bos/commandSession/createLeadProductRealizationRound4.test.ts` | Renames Family→Person; expects “3 details still needed” | Align Round 4 tests to entity Form + status | Staging test title still “Family”; no status assert | **FUTURE-SPRINT** | Create Lead command constraint convergence | Complete with presentation change | Low |

**Theme A product notes**

- Alters **process/department resolution for Create Lead Form/slash** — yes.
- Does **not** change hard requiredness rules (`record_creation` policy already on staging).
- Does **not** reintroduce Placement-as-Form-section or BOS-owned field registry; it syncs **scope** into GlobalAssistant / snapshot.
- Not Processing Conversation Runtime (adapter comment already says Runtime may replace later; this is scope plumbing).
- Conflict with Commands sprint (`wt1-commands-system-inventory`): **possible** on shared Work Unit / Workspace surfaces and Create Lead launch context — coordinate; do not blind-apply.

### Theme B — Data Model / platform relationship labels

| File | Summary | Purpose | Staging already solved? | Disposition | Future owner | Completeness | Risk |
|---|---|---|---|---|---|---|---|
| `web/lib/dataModel/platformRelationshipPresentation.ts` | **New** helpers: `relationship:` label keys, resolve overrides | Structure locked; labels editable | Absent on staging | **FUTURE-SPRINT** | Relationship Configuration V1 | Complete module | Low–medium |
| `web/app/api/admin/entity-labels/route.ts` | PUT allows validated platform relationship label keys | Persist edge presentation | No | **FUTURE-SPRINT** | Relationship Configuration V1 / Entity label configuration | Complete with helper | Medium — API contract |
| `web/lib/admin/entityLabelsResolve.ts` | Split `relationship_presentation` from entity overrides | Payload shape for Data Model UI | No `relationship_presentation` on staging | **FUTURE-SPRINT** | Entity label configuration | Complete | Medium — payload consumers must update |
| `web/lib/dataModel/dataModelWorkspaceVm.ts` | Apply presentation map to platform edges | Operator-facing edge labels | No | **FUTURE-SPRINT** | Relationship Configuration V1 | Complete | Medium |
| `web/lib/dataModel/loadDataModelEntitiesWorkspaceVm.ts` | Load presentation map from labels payload | Wire resolve → VM | No | **FUTURE-SPRINT** | Relationship Configuration V1 | Complete | Low |
| `web/components/adminV2/settings/dataModel/entities/EntityRelationshipsTab.tsx` | Platform edges label-editable via entity-labels PUT | Relationships settings UX | Staging still “not operator-configurable” for platform edges | **FUTURE-SPRINT** | Relationship Configuration V1 | Substantial UI; needs product review | Medium–high — ownership change for platform edges |
| `web/tests/dataModel/dataModelFinalPolish.test.ts` | Expectations for editable platform labels | Lock new product rule | Staging expects non-editable platform copy | **FUTURE-SPRINT** | Relationship Configuration V1 | Complete with UI | Low |
| `web/tests/admin/operationalTasksWorkspaceEnrichment.test.ts` | Mock adds `relationship_presentation: []` | Compile against new payload | N/A until resolve changes | **FUTURE-SPRINT** | Entity label configuration | Trivial companion | Low |
| `web/tests/adminV2/adminShellContextCache.test.ts` | Same mock field | Companion | N/A | **FUTURE-SPRINT** | Entity label configuration | Trivial companion | Low |
| `web/tests/lib/admin/entityLabelsOrgCache.test.ts` | Same mock field | Companion | N/A | **FUTURE-SPRINT** | Entity label configuration | Trivial companion | Low |

**Theme B notes**

- Belongs in **upcoming Relationships / Data Model work** — yes.
- Affects **entity labels and relationship labels** — yes.
- Not Create Lead requiredness; not Commands inventory core.
- Abandoned BOS assumptions? **No** — Data Model settings lane.

### Theme C — Create Lead paste / suggestion labels (test only)

| File | Summary | Purpose | Staging | Disposition | Future owner | Completeness | Risk |
|---|---|---|---|---|---|---|---|
| `web/tests/lifecycle/actionIntakePasteParser.test.ts` | Stops expecting `Parent/Guardian First Name`; expects Person “First Name” | Align suggestions with Person/Lead labels from PR #242 | Staging test still expects Parent/Guardian | **FUTURE-SPRINT** or fold into **Create Lead command constraint convergence** | Create Lead command constraint convergence | Test-only; may indicate staging unit test drift | Low if applied with matching production labels |

---

## Classification totals

| Disposition | Count (files) |
|---|---|
| `MISSED-DEFECT` | **3** core provisioning/settlement files (treat Theme A trio as one defect cluster) — listed: provisioning answer, snapshot renderer, settlement merge |
| `FUTURE-SPRINT` | **19** (remaining Theme A wiring/UI/tests + all Theme B + paste parser test) |
| `SUPERSEDED` | **0** |
| `UNSAFE` | **0** as isolated intent; **UNSAFE to apply as one stash** (mixed themes + shared surfaces) |
| `DOCS-ONLY` | **0** in stash (this disposition doc is the extract) |
| `DELETE` | **0** file-level — whole stash may be dropped after extraction |

Out-of-stash staging typing bug: **1 MISSED-DEFECT** (hotfix PR), not counted in the 23.

---

## Special questions

1. **Does any stashed change fix a defect still present on staging?**  
   **Yes.** Staging still hard-codes Work Unit `departmentId: null` and does not bake dept on `actionsProjection`. Theme A provisioning/settlement/snapshot fixes that. Separately, staging has the `loadEffectiveSpec` Promise typing build break — **not fixed by stash**.

2. **Does any stashed change alter Create Lead requiredness or process/department resolution?**  
   **Requiredness rules:** no. **Department/process resolution for intake Form/slash:** yes (Theme A).

3. **Does any stashed change reintroduce BOS-owned field or section logic?**  
   **No** Placement section / BOS field registry. Scope sync + Person status copy only.

4. **Does any stashed change affect entity labels or relationship labels?**  
   **Yes** — Theme B.

5. **Does any belong in upcoming Relationships/Data Model work?**  
   **Yes** — Theme B entire set → **Relationship Configuration V1** / **Entity label configuration**.

6. **Would applying the stash conflict with the current Commands sprint?**  
   **Possibly.** Slot 1 `commands-system-inventory` shares Work Unit / execute / Create Lead adjacency. Blind `stash apply` on WorkUnitSurface / WorkspaceSurface / Create Lead controller is unsafe without coordination. Theme B is lower conflict risk with Commands.

7. **Are any tests or documentation worth preserving if code is discarded?**  
   **Yes.** d4/d5 department assertions, `bosWorkspaceScopeSync` wiring test, Data Model polish expectations, and this disposition doc. Round 4 Person status expectation + paste parser Person labels are worth keeping as acceptance notes even if code is rewritten.

8. **Safe to delete the stash after extracting valuable notes?**  
   **Yes**, after this file is retained in git (or another durable archive) and Theme A/B are filed as named future sprints. Deleting the stash without a durable copy of Theme A patches would lose the only implementation of the department bake.

---

## Missed-defect assessment

| Defect | On staging now? | In stash? | Recommended action |
|---|---|---|---|
| Work Unit `departmentId` always null → Create Lead Person-only floor | **Yes** | **Yes** (Theme A core) | New sprint / hotfix PR: Create Lead command constraint convergence — **cherry-pick Theme A only**, do not apply Theme B |
| `setEffectiveSpec(loadEffectiveSpec(...))` Promise typing — Vercel build fail | **Yes** | **No** | Immediate separate hotfix PR on staging |
| Person empty status omits contact OR in person branch | Minor UX | Yes (presentation) | Bundle with Theme A |
| Paste parser test expects Parent/Guardian | Test drift risk | Yes (test only) | Bundle with Create Lead label convergence |

---

## Future-sprint extraction list

1. **Create Lead command constraint convergence**  
   Theme A files (provisioning, snapshot, settlement, BosWorkspaceScopeSync + mounts, controller dept fallback, section presentation, related tests).  
   Also absorb staging Promise typing hotfix if not already shipped.

2. **Relationship Configuration V1** (+ **Entity label configuration**)  
   Theme B files (`platformRelationshipPresentation`, entity-labels PUT, resolve payload split, Relationships tab, VM loaders, Data Model tests).

3. **Commands configuration**  
   Coordinate only — do not dump stash here; Commands owns execute inventory, not this WIP.

4. **Processing Conversation Runtime**  
   None of the stash is Runtime work.

---

## Unsafe / superseded list

- **SUPERSEDED:** none verified.
- **UNSAFE as a unit:** applying all 23 files together (cross-theme + shared shells).
- **UNSAFE alone:** controller dept fallback without fixing Promise typing (build still red).

---

## Recommended final action

1. **Do not** `stash apply` / `stash pop` on this worktree.
2. Open a **staging hotfix** for `loadEffectiveSpec` / `setEffectiveSpec` typing (out of stash).
3. Schedule **Create Lead command constraint convergence** and cherry-pick **Theme A only** from stash (or re-implement from this inventory).
4. Schedule **Relationship Configuration V1** for **Theme B** (separate PR).
5. After Theme A/B are either landed or deliberately rewritten, and this disposition doc is on a durable branch/staging docs path:  
   `git stash drop` for `slot2-leftover-wip-not-promoted`.
6. Preserved worktree may be **removed later** once stash is dropped and no agent needs the branch tip; branch remains on origin until remote cleanup.

---

## Commands to inspect (read-only; already used)

```bash
git stash show --include-untracked --stat 'stash@{0}'
git diff 'stash@{0}^1' 'stash@{0}'
git ls-tree -r --name-only 'stash@{0}^3'
git show origin/staging:web/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot.ts | rg departmentId
```
