---
owner: platform
status: sprint
last_reviewed: 2026-09-03
---

# Vacilando UI V2 — Data Maturity Contract

**Required artifact of the UI Foundation mission.** Every data point introduced
or re-presented by the V2 surfaces is classified here. The executable half of
this document is `apps/vacilando/public/vacilando-ui-model.mjs`: every value
reaching a V2 component passes through `field(value, MATURITY, …)` and arrives
carrying its own provenance.

## Classifications

| Class | Meaning |
|---|---|
| `LIVE` | Canonical data exists and this UI consumes it. |
| `AVAILABLE_NOT_WIRED` | A canonical source exists; the Vacilando UI does not read it yet. |
| `DERIVABLE` | Enough canonical evidence exists to compute it; no owner projects it yet. |
| `INSTRUMENTATION_REQUIRED` | The platform does not collect what this needs. |
| `PROVIDER_REQUIRED` | The provider/session must begin reporting it. |
| `PLACEHOLDER` | Represented in the design only. No reliable source exists. |

## Presentation rules — enforced in code, not by convention

1. **`LIVE` never shows a placeholder.** A live field with no value is genuinely
   missing, and covering that with a demo value would hide a real outage.
   Enforced by `PLACEHOLDER_ELIGIBLE`, which excludes `LIVE`.
2. **Production shows no invented number.** With placeholder mode off — the
   default — an absent value renders the field's own copy
   ("Not available yet", "No data yet"), in muted ink, at body size. Never a
   figure.
3. **Placeholder mode is one mechanism and it announces itself.** One flag
   (`vac.ui.placeholders`, or `?placeholders=1`) turns on the entire product's
   demo values, and while it is on every page paints a persistent banner and
   every affected value carries a `sample` chip. A screenshot taken in this mode
   cannot be mistaken for runtime truth.
4. **Components consume the same typed view model** whether a value is live,
   derived or placeholder. There are no hardcoded numbers in components; `metric()`
   accepts a field, not a number.
5. **Demo values live in exactly one object** (`DEMO` in
   `vacilando-ui-model.mjs`), so what is not yet real is enumerable by reading
   one declaration.

### Cadence key

`poll` = the 15s lane/list poll · `nav` = on navigation to the surface ·
`event` = when the underlying event occurs · `n/a` = not yet produced.

---

## Home — Needs You

| Field | Surface | Meaning | Desired source | Current source | Maturity | Cadence | Owner | Follow-up | Dev placeholder | Production |
|---|---|---|---|---|---|---|---|---|---|---|
| Lane | Home · lane tray | Which lane is blocked | lane list | lane list | LIVE | poll | `lanes.mjs` | — | n/a | shown |
| Request | Home · lane tray | What is being asked | governed action title / run `state_reason` | same | LIVE | event | `governed-action-request.mjs`, `execution-run.mjs` | — | n/a | shown |
| Age | Home | How long it has waited | `requested_at` / `updated_at` | same | LIVE | poll | as above | — | n/a | shown |
| Severity | Home | Destructive vs authorize vs answer | governed action mode | partial — `mode`/`destructive` not always set | AVAILABLE_NOT_WIRED | event | `governed-action-request.mjs` | normalize a severity on the public projection | no | defaults to `authorize` |

## Home / System — System health

| Field | Meaning | Desired source | Current source | Maturity | Cadence | Owner | Follow-up | Dev placeholder | Production |
|---|---|---|---|---|---|---|---|---|---|
| Host name | Which machine | host identity | literal "Mac mini" | AVAILABLE_NOT_WIRED | nav | `/api/host` `hostIdentity()` | read host identity into the projection | no | shown |
| CPU load % | Normalised 5m load | `os.loadavg` / cores | same | LIVE | nav | `resources.mjs` | — | n/a | shown |
| Load 1m / 5m | Raw load | `os.loadavg` | same | LIVE | nav | `resources.mjs` | — | n/a | shown |
| Cores | Core count | `os.cpus()` | same | LIVE | nav | `resources.mjs` | — | n/a | shown |
| Memory used % | Memory utilisation | `vm_stat` | same | LIVE | nav | `resources.mjs` `macMemory()` | — | n/a | shown |
| Memory used / total | Absolute memory | `vm_stat` | same | LIVE | nav | `resources.mjs` | — | n/a | shown |
| Memory pressure | Kernel pressure level | `kern.memorystatus_vm_pressure_level` | same | LIVE | nav | `resources.mjs`, `health.mjs` | — | n/a | shown |
| Swap in use / allocated | Swap level | `vm_stat` swap | same | LIVE | nav | `resources.mjs` | — | n/a | shown |
| **Swap trajectory** | Is pressure rising | rolling swapout series | none — only a live delta inside one sample | DERIVABLE | n/a | host health projection | persist a rolling host-pressure series | **yes** | "No trend yet" |
| Disk free | Headroom | `probeDisk()` | wired by `projectSystemSnapshot` | LIVE | nav | `health-probes.mjs` | — | n/a | shown |
| Active slots | Occupied capacity | admission store | `ADMISSION_OCCUPYING` count | LIVE | nav | `execution-admission.mjs` | — | n/a | shown |
| Slot capacity | Admitted total | `managedSlotCount()` | same | LIVE | nav | `managed-slots.mjs` | — | n/a | shown |
| Available slots | total − active | derived in the view model | same | LIVE | nav | view model | — | n/a | shown |
| Reserved slots | Claimed, not active | admission store | present but not always populated | DERIVABLE | nav | `execution-admission.mjs` | project a reserved count | no | "Not available yet" |
| Admission pressure | Whether to admit more | `capacity-policy` pressure | `resources.overall.slots.pressure` | LIVE | nav | `capacity-policy.mjs` | — | n/a | shown |
| Gateway health | Is the gateway responsive | `probeGateway()` | inferred from a successful snapshot | AVAILABLE_NOT_WIRED | nav | `health-probes.mjs` | call `probeGateway` in the projection | no | shown as responsive-or-unknown |
| Development servers | Running app servers | server table | `resources.overall.running_servers` | LIVE | nav | `resources.mjs` | — | n/a | shown |
| Stale processes | Leaked processes | `probeProcessTable()` | none in this projection | AVAILABLE_NOT_WIRED | n/a | `health-probes.mjs` | project a stale/failed count | no | "Not available yet" |
| Failed processes | Crashed processes | as above | none | AVAILABLE_NOT_WIRED | n/a | `health-probes.mjs` | as above | no | "Not available yet" |
| Health history | Host samples over time | platform resource history | `listPlatformResourceHistory` exists; not passed through | AVAILABLE_NOT_WIRED | n/a | `v2-api /platform/resources` | pass history into the System projection | no | honest empty state |

## Lane — progress

| Field | Meaning | Desired source | Current source | Maturity | Cadence | Owner | Follow-up | Dev placeholder | Production |
|---|---|---|---|---|---|---|---|---|---|
| **Progress %** | Provider's estimate of completion | provider milestone report | `run.progress_estimate.percent` | **LIVE** (contract shipped) — `PROVIDER_REQUIRED` per lane until providers adopt it | event (milestones) | `execution-run.mjs` | adopt `--progress` in the worker package | no | shown, or "Progress estimate unavailable" |
| Progress confidence | low / medium / high | provider | `progress_estimate.confidence` | LIVE / PROVIDER_REQUIRED | event | `execution-run.mjs` | as above | no | rendered as bar texture |
| Progress summary | Current phase | provider | `progress_estimate.summary`, falling back to `latest_progress.summary` | LIVE | event | `execution-run.mjs` | — | no | shown |
| Progress source | provider_estimate / deterministic / operator / derived | reporter | `progress_estimate.source` | LIVE | event | `execution-run.mjs` | — | no | shown in the label |
| Progress updated | Freshness | reporter | `progress_estimate.updated_at` | LIVE | event | `execution-run.mjs` | — | no | shown |
| Remaining work | What is left | provider | `progress_estimate.remaining_work` | PROVIDER_REQUIRED | event | `execution-run.mjs` | providers rarely send it yet | no | omitted |
| **ETA** | When it will finish | a real estimator | **none** | **PLACEHOLDER** | n/a | none | do not ship until an estimator exists | **no** | **never shown** |

## Lane — identity and inspector

| Field | Meaning | Current source | Maturity | Owner | Follow-up | Production |
|---|---|---|---|---|---|---|
| Canonical state | What the lane is doing | `canonicalLaneWorkState()` | LIVE | `gateway-view.mjs` | — | shown |
| Provider | Which engine | `laneProviderLabel()` | LIVE | `gateway-view.mjs` | — | shown |
| Model | Which model | `agent_telemetry.agent.model` | AVAILABLE_NOT_WIRED | `lane-telemetry.mjs` | telemetry does not always carry a model | omitted when absent |
| Slot | Runtime slot | `lane.slot` | LIVE | `lanes.mjs` | — | shown |
| Slot capacity (x / y) | Slot in context | `executionCapacity.total` | AVAILABLE_NOT_WIRED | `managed-slots.mjs` | pass the total into the lane view | shows bare slot |
| Context % | Provider context used | `agent_telemetry.context.percent_used` | LIVE | `lane-telemetry.mjs` | — | shown, else "Not reported" |
| Started | Run start clock | `run.started_at` | LIVE | `execution-run.mjs` | — | shown |
| Branch / ahead / behind | Git posture | `lane.git`, `lane.source_control` | LIVE | `source-control.mjs` | — | shown in Inspector › Git |
| Browser session | QA identity state | `attachLaneBrowserAuth` | LIVE | `browser-auth.mjs` | — | shown in Inspector › Browser |
| Endpoint / localhost | Lane app URL | `renderLaneLocalhost` | LIVE | `lane-app-url.mjs` | — | shown in Inspector › Environment |

## Home — AI usage

| Field | Desired source | Current source | Maturity | Owner | Follow-up | Dev placeholder | Production |
|---|---|---|---|---|---|---|---|
| Runs | provider round-trips + lane runs | `usage.collectUsage()` — Director round-trips only | LIVE (partial) | `usage.mjs` | include lane provider usage | yes | shown |
| Provider | provider id | `collectUsage()` | LIVE | `usage.mjs` | — | n/a | shown |
| Model | model id | not carried | AVAILABLE_NOT_WIRED | `lane-telemetry.mjs` | carry model into usage rows | no | "Model not reported" |
| Input tokens | provider usage | Director round-trips only | AVAILABLE_NOT_WIRED | `usage.mjs` | aggregate lane provider usage | yes | "Not available yet" |
| Output tokens | as above | as above | AVAILABLE_NOT_WIRED | `usage.mjs` | as above | yes | "Not available yet" |
| **Cache tokens** | provider cache read/write | **none** | INSTRUMENTATION_REQUIRED | `usage.mjs` | record cache token fields | yes | "Not available yet" |
| Total tokens | input + output | derived | AVAILABLE_NOT_WIRED | view model | follows the two above | yes | "Not available yet" |
| Estimated cost | provider-reported cost | authoritative-only; `PRICING` is empty by design | AVAILABLE_NOT_WIRED | `usage.mjs` | normalize provider pricing | yes | "Cost not reported" |
| Runtime | sum of durations | per-call durations exist; no total | DERIVABLE | `usage.mjs` | project a total | yes | "Not available yet" |
| Context utilisation | fleet context pressure | per-lane only | AVAILABLE_NOT_WIRED | `lane-telemetry.mjs` | aggregate across lanes | yes | "Not available yet" |
| Retries / errors | failed calls | `collectUsage().failures` | LIVE | `usage.mjs` | — | yes | shown |
| Window (7d / 30d) | historical aggregation | **none** — today only | INSTRUMENTATION_REQUIRED | `usage.mjs` | retain daily usage rollups | no | card states "showing today" |

## Home — AI effectiveness

Every field below is currently unbacked. The projection returns `{}` rather than
a plausible object, and the UI renders the governed unavailable state.

| Field | Desired source | Maturity | Owner | Follow-up | Dev placeholder | Production |
|---|---|---|---|---|---|---|
| Runs completed | run terminal events | DERIVABLE | run-outcome projection | count COMPLETE from the event log | yes | "Not available yet" |
| **Autonomous completion %** | run outcome + intervention events | INSTRUMENTATION_REQUIRED | effectiveness metrics | define an intervention event | yes | "Not available yet" |
| Human interventions | operator actions on a run | INSTRUMENTATION_REQUIRED | effectiveness metrics | as above | yes | "Not available yet" |
| Approval interruptions | governed action count per run | DERIVABLE | governed actions | project per-run counts | yes | "Not available yet" |
| Retry / rework rate | recoveries + re-sends per run | INSTRUMENTATION_REQUIRED | effectiveness metrics | define rework | yes | "Not available yet" |
| Average runtime | started_at → completed_at | DERIVABLE | run-outcome projection | compute the mean | yes | "Not available yet" |
| Commits produced | per-lane commits | AVAILABLE_NOT_WIRED | `source-control.mjs` | aggregate | yes | "Not available yet" |
| Tests run / passed | validation broker results | INSTRUMENTATION_REQUIRED | validation broker | record results per run | yes | "Not available yet" |
| Certifications | certification outcomes | INSTRUMENTATION_REQUIRED | certification owner | emit a certification event | yes | "Not available yet" |
| Promotions | merges to staging | AVAILABLE_NOT_WIRED | `source-control.mjs` | aggregate promotion events | yes | "Not available yet" |

## Activity

| Field | Current source | Maturity | Owner | Follow-up | Production |
|---|---|---|---|---|---|
| Event stream | run event log + run transitions + SCM/admission/resource events + resolved governed actions | LIVE | `ui-v2-views.projectActivityFeed` | — | shown |
| Lane label | lane list join | LIVE | `lanes.mjs` | — | shown |
| Kind | `classifyEvent()` | LIVE | `ui-v2-views.mjs` | — | shown |
| Outcome | event type / governed status | LIVE | `ui-v2-views.mjs` | — | shown |
| Provider filter | provider on the event | AVAILABLE_NOT_WIRED | event producers | stamp provider on run events | filter modelled, no values yet |
| Lane-scoped Activity tab | the same feed, filtered | AVAILABLE_NOT_WIRED | `ui-v2-views.mjs` | pass `lane_id` through | tab shell states this |

## Lane tabs not yet implemented

| Tab | Maturity | Owner that will fill it | Production |
|---|---|---|---|
| Files | INSTRUMENTATION_REQUIRED | `source-control.mjs` checkpoint readiness already attributes changed paths | shell states it |
| Commits | AVAILABLE_NOT_WIRED | `source-control.mjs` | shell states it |
| Runs | AVAILABLE_NOT_WIRED | `execution-run.listExecutionRunsForLane()` | shell states it |

---

## Audit

To list every field and its classification as rendered, `collectFields(vm)` walks
a view model and returns each field with its `state` and `maturity`; the
`data-maturity` attribute is also present on every `.vmetric` and `.vrow` in the
DOM, so a live page can be audited directly:

```js
[...document.querySelectorAll('[data-maturity]')]
  .map(el => [el.dataset.maturity, el.className, el.textContent.trim()])
```
