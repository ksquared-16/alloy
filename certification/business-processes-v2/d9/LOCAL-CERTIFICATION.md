# BP V2 D9: BOS default activation on record entry. Local certification

| | |
|---|---|
| Lane / branch | `lane_581d120e4e41` / `agent/business-processes` |
| Start | Deployed `502d597537a7` (revalidated via `/api/build-info`); lane merged with `origin/staging` (`fe8a4fe45`) |
| Hosted defect evidence | `qar_08296c326232` (`d6d7/hosted-qar_08296c326232/bos-observation.json`) |

## Activation contract (traced)

**Owner.** `BosPresentationControllerProvider` (`web/contexts/BosPresentationControllerContext.tsx`) holds the state. It is mounted in `AdminV2Shell` above every workspace route, and `CommandRailBosMount` renders it.

| Situation | Before D9 |
|---|---|
| First entry, no preference | `preferred` starts as `SSR_PREFERRED = "floating"`. With nothing stored, an effect keeps re-applying `recommendBosPresentation()`, which is always `"floating"`. **Nothing about record entry opens it**: it is simply the default |
| Explicit invocation | Launcher "Open BOS" → `openFloating()`. `BosCommandSessionProvider.ensureBosOpen` → `openFloating()` (command sessions). Both store `floating` (sessionStorage, per tab) |
| Operator close | Rail header Close → `closeToLauncher()` stores `closed` |
| Intentional reopen | Launcher again (stored `floating`) |
| Record switch | The provider sits above the route, so state carries across records. The stored choice wins; with none, the float stays |
| Refresh / navigation | Reads the stored choice; with none, the default is floating again |
| Deliberately configured BOS-first experience | **Doctrine**: `navigation-and-workspace-doctrine.md` § BOS names floating the **default**, and `adaptiveWorkspacePresentation.test.ts` pins `recommendBosPresentation → floating`. No tenant configuration, URL parameter or subject rule asks for BOS on record entry |

**Ask BOS.** The registry action (queue row / drawer) seeds the assistant thread (`triggerBosDrawerAssistHandoff`). It never changed the presentation; it relied on BOS already being open.

**Why Assignments looked different on hosted.** The rail was mounted floating, but its placement was not yet trusted (`resolveFloatingExposure`), so it was `visibility: hidden`. That is the same default, just not exposed yet.

## Repair: scoped to the record-entry boundary; the global default is unchanged

Changing the global default would remove the documented floating default from the Workspace, Communications and the other shell surfaces. So the correction applies only where the operator has opened a record.

- **Controller.** In `BosPresentationControllerContext.tsx`, `presentedPreferred = recordSurfaceActive && !preferenceChosen ? "closed" : preferred`.
  - It reuses the existing three states: an unchosen default on a Work Unit surface is presented as `closed`, which shows the existing launcher.
  - `preferenceChosen` is set by what the operator already stores: a preference read at hydration, `setPreferred` (open, close, pin), or `restoreDefaultWidth`.
  - The rule writes nothing.
- **Signal.** `BosRecordSurfaceBridge` (`web/components/adminV2/`), mounted inside the runtime kernel in `AdminV2WorkspaceClientProviders`.
  - It reports `setRecordSurfaceActive(true)` while **committed Focus** is a Work Unit and the operator is not moving to the Workspace. That is the Surface Host's own exclusion.
  - It does not use the pathname: record selection moves the address with `history.pushState`/`replaceState`.
- **Ask BOS.** `AskBosHandoffListener` now calls the existing `openFloating()` when the assistant is closed, so the explicit invocation lands in a visible assistant.

**Not added:** a new controller, panel, toggle, persistence mechanism, or any change to BOS permissions, inference, agent routing, conversation data or backend services.

## Rendered proof: `web/tests/bos/bosRecordEntryPresentation.test.tsx` (9/9)

These run the real provider, `CommandRailBosMount`, launcher (`BosPresentationControls`), rail header Close (`BosRailHeader`), bridge and `AskBosHandoffListener`. The committed Focus the bridge reads is driven by the test.

| # | Scenario | Result |
|---|---|---|
| 1 | Fresh tab, Enrollment record, no preference | no rail; launcher offered; nothing stored |
| 2 | Refresh | no rail |
| 3 | Switch records (×3) | no rail |
| 7/8 | Click "Open BOS" → floating, stores `floating`; click the rail's Close → launcher, stores `closed` | pass |
| — | Operator-opened rail stays open across a record switch and a refresh | pass |
| — | A stored `pinned` choice is honoured on a record | pass |
| 11 | Workspace with no choice: floating default preserved | pass |
| — | Workspace → record → Workspace: the default returns on the Workspace and stays off the record | pass |
| 11 | Ask BOS on a record opens the assistant | pass |

**Counterfactual** (same test, base controller): tests 1, 2 and 3 **fail**, because the rail floats over the record; the explicit-open tests fail because the base rail was already open with no launcher. Workspace-default and pinned pass on both.

**Unchanged suites:**
- `tests/bos/bosProviderExposureWiring.test.tsx` (11/11);
- `tests/presentation/adaptiveWorkspacePresentation.test.ts` (13/13), including "defaults recommendation to floating".

## Gates

| Gate | Result |
|---|---|
| `npm run -s prebuild` | pass |
| eslint (changed files) | 0 errors. One pre-existing unused-import warning in `AskBosHandoffListener.tsx` |
| Scoped `tsc` (controller, bridge, listener) | 0 errors. The test file's scoped `tsc` is killed by the host watchdog (exit 144); CI's Full graph is authoritative |
| Covering regression (188 files: BOS, shell, kernel, Business Processes, Access; head vs base) | **0 new failures**. 13 Access lock failures (`catalogVocabularyReconciliation`, `financialsRoleEditorGroup`, `grantSeedEnumeration`, `orgParameterizedRpcBoundary`, `permissionEnforcementTruth`) fail identically on a full-tree base without D9: pre-existing, migration-tree locks this change does not touch |
