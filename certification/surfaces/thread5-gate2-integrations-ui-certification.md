# Thread 5 Gate 2 — Integrations UI, mounted certification

**Terminal status: `THREAD5_GATE2_INTEGRATIONS_UI_BLOCKED`** — superseded; see the continuation at the end of this record.

Not blocked by a defect. Blocked by a data precondition Surfaces cannot satisfy and must not
manufacture: the platform application catalog is empty, so the half of the surface that begins at
"an installation exists" was never reachable to certify.

## Environment

| | |
| --- | --- |
| staging SHA certified | `3792e4be25e38269ee02fc7d607df0f44e85e089` (PR #895) |
| installed toolkit | `f04486b45a14` |
| running Gateway | `f04486b45a14` (PID 39850, started 08:57, from `toolkit/current`) |
| toolkit drift | **RESOLVED before certification** — see below |
| Surfaces lane | `lane_faacca6079ad`, status ACTIVE |
| slot / port | 6 / 3016 |
| worktree | `wt6-surfaces-faacca`, clean |
| branch (registered == actual) | `agent/speculation-may-prepare-intent-may-mutate` |
| QA identity | `qa-slot1-product@example.com` via `alloy_staging_web` |

### Toolkit drift disposition

The handoff recorded installed `f04486b45a14` against a Gateway reporting `52d0f3cffbd1`. That
reading predates the install: the toolkit directory was written 08:56 and the Gateway process
restarted 08:57 from `toolkit/current`, which resolves to `f04486b45a14`. Steward reports healthy
across 50 cycles with 0 executed and 0 refused — it proposed no `converge_toolkit_then_restart`,
which it would have had drift survived. `vac health` reports `gateway.responsive` and
`toolchain.activation` HEALTHY.

No steward convergence was required, and none was performed. Gateway behaviour is therefore
admissible as certification evidence.

### Lane drift disposition

The old fleet audit recorded registered `agent/tour-outcome-certified-after-fix` against actual
`agent/speculation-may-prepare-intent-may`. That is stale: the binding now records
`agent/speculation-may-prepare-intent-may-mutate` and the worktree is on the same branch, so
registered and actual agree. The branch was 55 behind staging and **0 ahead** — fully merged — so it
was reset to `origin/staging` rather than papered over. Classification: **HEALTHY**.

## Existing UI inventory

`web/app/adminV2/settings/organization/integrations` — 1,152 lines, matching the handoff's ~1,150.

| file | lines |
| --- | --- |
| `InstallationDetail.tsx` | 373 |
| `AddIntegrationWizard.tsx` | 277 |
| `AccessEditor.tsx` | 212 |
| `IntegrationsClient.tsx` | 193 |
| `documentation/page.tsx` | 86 |
| `page.tsx` | 11 |

Navigation: `lib/adminV2/configurationModeNav.ts` → Organization → Integrations, testId
`config-mode-nav-integrations`.

APIs consumed — all under one prefix, none outside it:

```
/api/admin/integrations/applications
/api/admin/integrations/capabilities
/api/admin/integrations/installations
/api/admin/integrations/installations/:id
/api/admin/integrations/installations/:id/activity
/api/admin/integrations/installations/:id/credentials
/api/admin/integrations/installations/:id/credentials/:credentialId
/api/admin/integrations/locations
/api/admin/integrations/openapi
```

Server boundary: `authorizeIntegrationsAdmin` — exact permission membership
(`integrations.read` / `integrations.manage`, no prefix implication), 401 unauthenticated,
403 forbidden, and a failed grants read denies.

## Active producer-model dependency: ZERO

Searched the surface and every API it calls for `attendance_integration_producers`,
`attendance_integration_producer_sites`, `attendance_integration_mappings`, `producer_id`,
`resolveIntegrationProducer`, `hashProducerCredential`, `producerAdministration`.

- Integrations UI: **0 hits**
- `app/api/admin/integrations/**`: **0 hits**

Two repo-wide hits survive, both in `attendanceIngestAuthor.ts` and `attendanceAuthorityAdapter.ts`,
and both are prose explaining the retirement ("No `attendance_integration_producers` row is
consulted, created, or implied"). Historical comments are not active dependence.

Confirmed independently on the deployed database rather than taken on trust:

- retired producer tables present: **none of the three exist**
- `producer_id` columns in `public`: **0**

Canonical model in use by those APIs: `developer_applications`, `app_installations`,
`app_credentials`, `integration_resource_refs`.

## Derived matrix and results — 13 PASS · 0 FAIL · 9 BLOCKED

Derived from the surface's own testids and contract boundaries. No scenario count was assumed; there
is no canonical 24-scenario matrix.

| id | operator goal | result | evidence |
| --- | --- | --- | --- |
| G2-D1 | discover Integrations in settings nav | **PASS** | `config-mode-nav-integrations` present |
| G2-D2 | direct route loads for an authorized operator | **PASS** | `organization-integrations` rendered |
| G2-L1 | list or intentional empty state, never a blank page | **PASS** | `integrations-empty-state` = 1 |
| G2-L2 | installations render recognizable identity/state | **PASS** | 0 rows, consistent with an empty catalog |
| G2-M1 | surface consumes only canonical integration APIs | **PASS** | 4 calls, all `/api/admin/integrations/*`, all 200 |
| G2-P1 | no retired producer vocabulary on the surface | **PASS** | 0 "producer" mentions in rendered text |
| G2-A1 | launch the add-integration flow | **PASS** | `add-integration-wizard` opened |
| G2-A2 | applications resolve from the canonical model | **PASS** | `wizard-no-applications` — honest none-state, not a crash |
| G2-A3 | validation prevents advancing without a selection | **PASS** | `wizard-next` disabled |
| G2-S1 | admin APIs deny an unauthenticated caller | **PASS** | installations/applications/capabilities/locations all **401** |
| G2-S2 | direct route cannot be reached without a session | **PASS** | redirected to `/login`, surface not rendered |
| G2-S3 | the same routes succeed for a granted operator | **PASS** | all **200** — the deny is about identity, not a broken route |
| G2-E1 | unknown installation fails cleanly | **PASS** | **404** `{"error":"That integration does not exist."}`, no stack or payload leak |
| G2-T1 | detail governed by canonical installation id | BLOCKED | no installation exists |
| G2-T2 | no producer identifiers in detail | BLOCKED | no installation exists |
| G2-T3 | health/state presented | BLOCKED | no installation exists |
| G2-X1 | access region reachable | BLOCKED | no installation exists |
| G2-X2 | capability editor loads with resolved scopes | BLOCKED | no installation exists |
| G2-C1 | no secret material before an explicit reveal | BLOCKED | no credential exists |
| G2-C2 | no raw service/admin secret leak | BLOCKED | no credential exists |
| G2-N1 | refresh retains a coherent surface | BLOCKED | no detail to refresh |
| G2-N2 | detail → back returns to the list | BLOCKED | no detail to leave |

Artifacts in `certification/surfaces/thread5-gate2/`: `gate2-mounted-matrix.mjs`,
`gate2-permission-boundary.mjs`, `G2-D2-list.png`, `G2-A1-wizard.png`. Raw results and network log:
`thread5-gate2-mounted-results.json`.

## Why the nine are BLOCKED, and who owns it

```
developer_applications          EMPTY   (no rows at all, any status)
app_installations (this org)    0
app_credentials                 0
integration_resource_refs       0
```

`listApprovedApplications` reads `developer_applications WHERE status = 'active'`. The route that
serves it says what it is: *"The applications an operator may connect. A chooser, not tenant CRUD."*
There is no admin route to create one, by design, and no seed ships in `supabase/` or `scripts/`.

So the wizard's `wizard-no-applications` state is **correct behaviour against an empty catalog**, and
every scenario downstream of "an installation exists" is unreachable from Surfaces.

Classification: **ENVIRONMENT_DEFECT** — a certification-environment data precondition.
Owner: **Documentation/API**, which owns the integration model and the application catalog.
It is explicitly **not** a Surfaces defect, and Surfaces did not manufacture data to clear it.

## Defects found

None owned by Surfaces. Nothing in the executed set failed. No contract defect was observed: every
API answered correctly, including the deny and not-found paths.

## Changes made

None to product code. This was a read-only certification, as the instruction anticipated. The only
repository changes are this record, the census artifact, and the mounted results.

## Thread 5 disposition

Backend/model convergence remains **COMPLETE_PROMOTED** and is independently corroborated here:
producer tables absent, `producer_id` columns 0, canonical model in use end-to-end.

Gate 2 cannot be declared certified while the detail, access and credential flows have never been
mounted. The existing surface is nonetheless validated as far as an empty catalog permits, and
nothing found argues for a greenfield rebuild.

## Recommended next action

Register one active `developer_applications` row in staging through the developer-platform path
(Documentation/API owns it), then re-run this matrix. The nine BLOCKED scenarios are scripted and
will execute unchanged — `gate2-mounted-matrix.mjs` derives everything from the installation ids the
list returns.

---

# Gate 2 — final mounted certification (continuation)

**Terminal status: `THREAD5_GATE2_SURFACE_DEFECT_FOUND` → repaired, promoted, re-proven.**

The nine scenarios blocked in the first pass all executed. One real Surfaces defect was found by
pressing the product rather than reading it, and one foreign-domain defect was found and handed on.

## Environment

| | |
| --- | --- |
| staging at start | `581fe3b4f50fd82178960be2e3872add889f47c9` (PR #898) |
| staging after repair | `2378af6875a0278142ffe16b93619ef0c6716007` (PR #899) |
| installed toolkit | `581fe3b4f50f` |
| running Gateway | `581fe3b4f50f` — installed 10:06:24, Gateway restarted 10:07 from `toolkit/current` |
| toolkit drift | **none**; steward healthy, 50 cycles, 0 executed, 0 refused |
| lane / slot / port | `lane_faacca6079ad` · 6 · 3016 · registered == actual branch · clean |
| QA identity | `qa-slot1-product@example.com` |

## Prerequisite visibility (Phase 2)

Mounted wizard showed **Alloy Certification Sandbox · active · alloy-platform**,
`wizard-no-applications` = 0, and `wizard-next` disabled before selection → enabled after. The prior
data blocker is cleared.

## Installation created through the UI (Phase 4)

No API or DB pre-creation. The wizard walked application → capabilities (3 offered) → locations
(org-wide) → review, and Create issued:

```
201 POST /api/admin/integrations/installations
```

**Installation id: `5bdc7c1e-86ca-45f9-a18d-7d00fd7b6923`** — exactly one row.

## Existing matrix, rerun unchanged (Phase 3)

`gate2-mounted-matrix.mjs`, byte-identical to the committed copy: **17 PASS · 0 FAIL · 0 BLOCKED**,
against 9 PASS + 9 BLOCKED before.

One scenario in that file — `G2-N2` (detail → back) — is unreachable as written: `G2-N1` reloads and
lands on the list, which removes the `installation-back` precondition. Classified
**QA_HARNESS_DEFECT**, proven separately below rather than papered over, and left in place because
the instruction forbids editing the matrix absent a harness defect finding.

## Deeper proofs

| id | goal | result | evidence |
| --- | --- | --- | --- |
| G2-T4 | detail shows canonical application identity | PASS | "Alloy Certification Sandbox" |
| G2-T5 | no producer identifier in detail | PASS | 0 mentions, no `producer_id` |
| G2-N2 | detail → back returns to the list | PASS | proven directly; list root + 1 row |
| G2-N3 | refresh **while on detail** | PASS | coherent surface after reload |
| G2-X3 | access change persists via canonical API | PASS | granted `locations.read` → `200 PATCH` |
| G2-X4 | persisted access survives full reload | PASS | `locations.read` still checked |
| G2-X5 | revocation of a grant also persists | PASS | `200 PATCH`, state restored |
| G2-S4 | write API refuses anonymous | PASS | `PATCH installation` → **401** |
| G2-S5 | credential write refuses anonymous | PASS | `POST credentials` → **401** |
| G2-C3 | no secret before issue | PASS | none rendered |
| G2-C4 | issue reveals secret once via canonical API | PASS | `201 POST …/credentials`, 52-char secret |
| G2-C5 | secret **not** re-exposed after refresh | PASS | absent after navigation |
| G2-C6 | rotation issues a new secret + overlap | PASS | differs from first; overlap stated |
| G2-C7 | no service-role/admin secret leak | PASS | no leak markers |
| G2-S1/S2/S3, G2-E1 | permission + error matrix | PASS | 401 anon / 200 granted / `/login` / clean 404 |

## Defect 1 — SURFACE_PRESENTATION_DEFECT (Surfaces, fixed)

`G2-C8` failed: after revoking, **Rotate and Revoke stayed enabled**. The buttons gated on
`!installation.credential`, and a revoked credential is still returned so the surface can name it.

Pressed in that state: `500 {"error":"credential_not_active"}`, credential unchanged
(`status: revoked`), health `needs_attention / no_active_credential`. So nothing was resurrected —
never a security hole, just a dead control that spent a round trip to say no.

Fixed in **PR #899** by gating on an active credential, mirroring the server's own predicate.
`rotating` stays actionable (overlap window); `Issue` stays available so an operator can recover.
The regression test fails against the shipped gating.

## Defect 2 — DOCUMENTATION_API_CONTRACT_DEFECT (Documentation/API, handed on)

`credential_not_active` is a business-rule refusal answered with **HTTP 500**. A 500 implies server
fault and will trip alerting that should stay quiet; 409/422 is the honest code. **Not repaired
inside Surfaces.**

## Certification data disposition

| | |
| --- | --- |
| developer application `alloy-cert-sandbox` | **retained** — global certification fixture, not deleted |
| installation `5bdc7c1e-…` | **retained** — deterministic reusable certification state |
| capabilities | restored to `context.read` only (the as-installed set) |
| credential `860cd137-…` | **revoked** through the product's own control; record retained with `status: revoked` |

All state was created and left through canonical APIs. No direct DB writes, no cleanup by SQL.

## Post-repair recertification on the deployed runtime

Deployment was **proven from runtime evidence, not merge status**. `GET /api/build-info` on staging:

```json
{"gitSha":"2378af6875a0278142ffe16b93619ef0c6716007","gitBranch":"staging",
 "gitMessage":"Merge pull request #899 … fix(integrations): rotate and revoke need an active credential…",
 "vercelDeploymentId":"dpl_GE8VpYoxqGQeRSYFA5zDLPyyoobL"}
```

That `gitSha` is exactly PR #899's merge commit, so the runtime under test contains the repair.

The matrix was rerun **byte-identical** to the committed copy.

| suite | result |
| --- | --- |
| `gate2-mounted-matrix.mjs` (unchanged) | **17 PASS · 0 FAIL · 0 BLOCKED** |
| `gate2-permission-boundary.mjs` | **4 PASS** |
| `gate2-deep-scenarios.mjs` (T4/T5, N2/N3, X3/X4/X5, S4/S5) | **9 PASS** |
| `gate2-credential-gate.mjs` (C8/C9, the repaired gate) | **2 PASS** |
| **total** | **32 PASS · 0 FAIL · 0 BLOCKED** |

The repaired gate, observed live:

```
label: "Credentials  Revoked · ends zXZ4 · never used"
rotate_disabled = true    revoke_disabled = true    issue_disabled = false
```

### Disposition of the nine previously BLOCKED scenarios

All nine executed and passed. They were blocked only by the empty application catalog, which
Developer Application Registration V1 (PR #898) cleared.

| scenario | before | after |
| --- | --- | --- |
| G2-T1 detail governed by canonical installation id | BLOCKED | **PASS** |
| G2-T2 no producer identifiers in detail | BLOCKED | **PASS** |
| G2-T3 health/state presented | BLOCKED | **PASS** |
| G2-X1 access region reachable | BLOCKED | **PASS** |
| G2-X2 capability editor loads with resolved scopes | BLOCKED | **PASS** |
| G2-C1 no secret before an explicit reveal | BLOCKED | **PASS** |
| G2-C2 no raw service/admin secret leak | BLOCKED | **PASS** |
| G2-N1 refresh retains a coherent surface | BLOCKED | **PASS** |
| G2-N2 detail → back returns to the list | BLOCKED | **PASS** (proven directly; see harness note) |

C3–C7 (issue → reveal-once → rotate → no-leak) were proven on `581fe3b4f` before the repair. The
repair changed only button gating, not issue/reveal/rotate, so those results stand; C8/C9 are the
ones re-proven on `2378af687`.

**Terminal: `THREAD5_GATE2_INTEGRATIONS_UI_CERTIFIED`.**
