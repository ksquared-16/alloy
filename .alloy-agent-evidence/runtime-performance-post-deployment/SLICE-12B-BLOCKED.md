# P0-7.6 SLICE 12B — ROUTE TIMING DEPLOYMENT + DOCUMENT INTERNAL DIAGNOSIS

**`P0_7_6_SLICE_12B_BLOCKED_STAGING_ROUTE_TIMING_NOT_ENABLED`**

The instrument is promoted. The **diagnosis cannot run**, because enabling it requires a capability this lane provably does not have — proven, not assumed.

| | |
|---|---|
| Starting SHA | `19eca7eab` · instrument `ae3795d59` · certification `b1a617fbc` |
| Candidate | **`1a89f41b2`** (staging reconciled; instrument byte-identical to `ae3795d59`) |
| PR | [**#1055**](https://github.com/ksquared-16/alloy/pull/1055) — **12/12** checks |
| **Merge SHA** | **`236578d88`** — merged to staging; candidate and instrument `ae3795d59` both contained by ancestry |
| Deployed at time of report | `29cf29abd` (the merge had not yet deployed; immaterial, since the flag is off either way) |
| Governed dependency | **`gdep_4101c86bc29562`** — `DECLARED`, run `WAITING_RESOURCE` |

---

## 1 · PROVENANCE + GATES — all green

Instrument verified intact after reconciliation, and **byte-identical** to `ae3795d59`:

| required property | present |
|---|---|
| one request-scoped collector | ✓ `routeTimingCollector = cache(` |
| layout contributor | ✓ `recordRouteTiming({ layout_… })` |
| page contributor | ✓ `recordRouteTiming({ page_… })` |
| page as final emitter | ✓ single `<RouteTimingSeed>` in `page.tsx` |
| real page-owned `compose_wall_ms` | ✓ measured around the awaited compose |
| real page-owned `seeded` | ✓ `answer != null` |
| surfaced `ProvisioningTimings` | ✓ |
| `composition_ready_ms` | ✓ `markSpan("composition_ready", t0)` |
| **stale layout authority removed** | ✓ **zero** occurrences of the literals |
| flag-off inertness | ✓ gated |

| gate | result |
|---|---|
| `routeTimingInstrumentConvergence` | **25/25** |
| Slice 11 seed convergence · Structural Commit · Presentation Truth · coherence · participant transport | **green** |
| focused totals | **213 passed / 215 across 12 files** |
| geometry browser suite | **47/47** |
| `typecheck` / `typecheck:tests` / `build` | **rc=0 / rc=0 / rc=0** |

### Known reds — three classes, recorded separately, none repaired

| class | count | status |
|---|---|---|
| provisioning TTL test hygiene | 1 | pre-existing, classified Slice 11 |
| `EXTERNAL_FINANCIALS_TEST_DEBT` | 1 | other programme |
| D1 provisioning / route-resolution | 8 | pre-existing, proven on clean checkout in 12A; **not in this run's 12-file set**, so absent from the 213/215 tally rather than fixed |

---

## 2 · PROMOTION

One canonical governed promotion. The instrument is **inert with the flag off** — every clock gated, `recordRouteTiming` returns early, the emitter renders `null`, no request added in either state — so promoting it is safe and useful independently of enablement.

## 3–4 · THE BLOCKER — proven, not inferred

### The flag is OFF on the deployed build

```
$ curl -sSI https://staging.workwithalloy.com/workspace
HTTP/2 307
x-alloy-admin-mw: redirect:/login      ← middleware RAN
                                        ← x-alloy-mw-t0      ABSENT
                                        ← x-alloy-mw-auth-ms ABSENT
```

The middleware executed and emitted its own header, and the two timing headers are absent. That is `routeTimingEnabled()` returning **false** on the deployed build — a positive proof, not an inference from silence.

### This lane has no capability to change it

`vac governed-action --list` exposes **24** actions. The complete set:

`database.read_census` · `database.apply_migration` · `database.apply_promoted_migration` · `database.repair_migration_ledger` · `platform.register_developer_application` · `environment.restore_qa_session` · `environment.restore_deployed_qa_session` · `environment.provision_qa_identity` · `environment.assign_qa_identity_access` · `environment.execute_registered_reconciliation` · `repository.push` · `repository.merge_pull_request` · `repository.close_pull_request` · `repository.delete_remote_branch` · `repository.transfer_files` · `repository.promote_metadata` · `promotion.open_pr` · `vacilando.apply_reconciliation_plan` · `vacilando.retire_worktree` · `vacilando.rebind_lane` · `capacity.set_provider_ceiling` · `host.install_toolkit` · `lane.dispatch_measurement_instruction`

**None sets an environment variable, alters project configuration, or triggers a build or redeploy.** There is no action key to file, so the requirement was declared through the dependency channel instead.

### Why a repo-side workaround was rejected

Committing the flag (env block in `next.config`, a checked-in `.env`) would enable it in **every** environment including production, which §3 explicitly forbids — *"for the STAGING Vercel project environment only… Do not enable broadly in production."* The scoping the dispatch requires is only expressible at the Vercel project level.

### 5 · TIMING-ENABLED PROOF — cannot be produced

§5 requires middleware headers **and** the `__alloy_route_timing` payload before any measurement, and defines the headers-absent case as **`HALF_INSTRUMENTED_BUILD` → do not measure**. With the flag off there is no payload at all. §6–§18 therefore cannot execute. **No timing diagnostics are reported, as instructed.**

---

## THE EXACT ACTION REQUIRED

1. Set **`ALLOY_ROUTE_TIMING=1`** on the **staging Vercel project environment only** (not production).
2. **Rebuild and redeploy staging.** Setting it on the running server is not sufficient — Edge middleware inlines `process.env` at **build** time, and the result would be a half-instrumented build: page and layout marks present, middleware auth header silently missing.
3. Confirm the deployment SHA contains the instrument (`ae3795d59`).

**Resume conditions** (declared on `gdep_4101c86bc29562`): the variable set on staging only; staging rebuilt after; `HEAD /workspace` returns **both** `x-alloy-mw-t0` and `x-alloy-mw-auth-ms`; the deployed SHA contains `ae3795d59`.

---

## AN ALTERNATIVE THAT EXISTS — offered, not taken unilaterally

The repository already contains a **PE-3 production-shaped local certification apparatus** built for this exact measurement:

| script | role |
|---|---|
| `web/scripts/pe3ProdBuild.sh` | isolated production build; **already exports `ALLOY_ROUTE_TIMING="${ALLOY_ROUTE_TIMING:-1}"`** with the comment *"must be set FOR THE BUILD: middleware is Edge, env is inlined"* |
| `web/scripts/pe3ColdLoadHarness.mjs`, `pe3ColdLoadRun.sh`, `pe3ColdLoadReport.mjs` | cold-load measurement and reporting |
| `web/scripts/pe3MiddlewareAuthProbe.mjs` | middleware auth timing, *"requires the server built/run with ALLOY_ROUTE_TIMING=1"* |
| `web/scripts/pe3HostGate.sh` | host qualification before measuring |

This path needs no Vercel change and no Director capability. Two honest caveats, which is why it is offered rather than substituted:

1. **It measures a different environment.** Local database latency, machine and cache state are not staging's. Section *shares* would be indicative; absolute milliseconds against the ≤ 2,000 ms budget would not be.
2. `pe3ProdBuild.sh` hardcodes `/Users/Kelly/...` for both `PATH` and `VAC`; this host is `/Users/vacilando/...`, so it needs a host-portability fix before it runs — a change to certification tooling that this slice's §9 ("do not optimize"; measurement infrastructure only) does not obviously authorize, and that I would not make unasked.

**Recommendation:** enable on staging, since the budget is a staging-facing product target and the local path cannot answer it in the units the target is written in.

---

## 39 · `ALLOY_ROUTE_TIMING` KEEP/DISABLE RECOMMENDATION

**Enable now, keep enabled for the duration of P0-7.6, disable and rebuild when the programme closes.** The overhead is four clock reads, one object assign, one ~15-number JSON serialization and a small inline script; 12A proved the compose timing wraps the promise the route already awaits, so it cannot serialize what it measures. Leaving it on indefinitely is still not right — it is diagnostic scaffolding, and a later slice should retire it deliberately rather than by forgetting.

---

## UPDATED P0-7.6 LEDGER

| | state |
|---|---|
| 11 document → provisioning serialization | CLOSED deployed-verified, 6,579 ms removed |
| 12A instrument convergence | **COMPLETE + CERTIFIED**; promoted here |
| **12B document internal diagnosis** | **BLOCKED — `gdep_4101c86bc29562`**, awaiting staging enablement + rebuild |
| 13 published-composition decoupling | OPEN — `composition_ready_ms` will size it, once 12B can run |
| 14 defer non-visible work | OPEN — `related/opportunity` 14.6 s, drawer body 4.2 s, communications ~5.6 s |
| 15 cache org/department-scoped reads | OPEN |
| 16 drawer VM | OPEN — 6,146 ms |
| D1 route-resolution test debt | OPEN — 8 pre-existing failures, unowned |

## TARGET STANDING

`TIME_TO_FIRST_CRITICAL_MEANING` target **≤ 2,000 ms**; deployed median **~6,250 ms**; **gap ≈ 4,250 ms**, almost entirely inside the document. The target is unchanged and unrelaxed. Which sections must leave the critical path to close it is precisely what 12B measures — and it is the one question this run could not answer.

## `READY_FOR_DOCUMENT_OPTIMIZATION = NO`

Not because the work is unclear, but because optimizing before the section breakdown exists is how this programme has previously produced confident, precise, wrong answers. The instrument is in place and promoted; it needs one configuration action to start reporting.
