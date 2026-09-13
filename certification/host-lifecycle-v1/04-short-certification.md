# Host Lifecycle V1 — short-form live certification

**Status: PROMOTED_SOAK_PENDING.** Not `COMPLETE_PROMOTED`: criterion 12 is 24 hours of wall clock,
and criterion 5 is not yet proven (below).

## The final candidate

```
staging            14b0e01dcd06b4461d2dd9193d2e73e2569019fc
toolkit/current    14b0e01dcd06
running Gateway    14b0e01dcd06   pid 29807, converged 16:01:21 local
runtime generation gen_mtxg858a_o0l_17ec9cce
```

Converged through the canonical `TOOLKIT_DRIFT → converge_toolkit_then_restart` path. No manual
restart at any point in this sprint; four convergences, all steward-driven.

## Controls, run from the installed bytes

| suite | result |
|---|---|
| `development-recovery-convergence` (A/B) | 8/8 |
| `development-collector-isolation` (D/E) | 7/7 |
| `development-runtime-generation` (F) | 7/7 |
| `development-reconcile-efficiency` (C) | 6/6 |
| `development-teardown-and-admission` (G) | 13/13 |

Full sweep of every `development-*`, `governed-*` and `qa-*` suite against pristine `origin/staging`:
**identical failure list, identical counts — zero regressions.** The 29 pre-existing failures are
unchanged and untouched.

## Live proofs on the running candidate

**Host health / admission (G) — active.**
```
state PRESSURED · admits_new_work true · reason "free memory 17.0%"
load 7.15/12 cpus · rss 40 MB · owned 0 · stale-generation 0 · recovery backlog 2
```
PRESSURED admits: it sheds speculative work first and never refuses legitimate work. Correct.

**Teardown verification (G) — passes.**
```
lane_db3431e755a8 · slot 5 · port 3015 → ok, survivors [], checked {owned_processes, pid_claim, port}
```

**Ownership (F) — valid.** 3 PID claims, all resolving to live processes, 0 stale. 0
previous-generation owned records.

**Recovery / event growth (A/B) — zero.** `recovery-events.jsonl` grew **0 bytes** over the
observation window on a healthy host. Before this sprint it grew 24 events/minute indefinitely.

**RSS — bounded.** 157–310 MB across the window, oscillating with GC, no monotonic climb.

## Criterion 5 is NOT yet proven, and this is why

Ten samples, 12 seconds apart, of the running server:

```
28.8%  0.0%  0.1%  7.3%  0.0%  0.0%  79.0%  0.1%  0.9%  0.0%
```

Eight of ten are at or below 1% — against roughly 10% sustained before C, since a 1016 ms reconcile
every 10 seconds is ~10% of one core continuously. That part is real and large.

But **two bursts remain, one of them 79%**, and they are not yet attributed. I will not call
criterion 5 met on ten samples. Candidates still to eliminate: the 30-second targeted reconcile
(which still reads compute holders), the 30-second conductor tick, the Host Steward cadence, and
ordinary SSE/lane serving — which would be legitimate work rather than maintenance. The criterion is
specifically about *maintenance-caused* bursts, so attribution matters more than the peak.

A measurement caveat that must travel with these numbers: macOS `ps %cpu` is a decaying average, not
an instantaneous sample. The 24-hour soak samples the same way once a minute, so the distribution
will be interpretable even though any single figure is not.

## Where the 12 criteria stand

| # | criterion | state |
|---|---|---|
| 1 | stale PID reconciled once and converges | **met** — control R1 |
| 2 | ten further passes emit zero duplicates | **met** — control R2 |
| 3 | cheap reconcile p95 < 25 ms | **met** — 21.8 ms warm, from 1043 ms |
| 4 | healthy no-op does zero persistent writes | **met** — control R3 |
| 5 | idle CPU ~0–2%, no recurring maintenance bursts | **not proven** — median ~0%, bursts remain unattributed |
| 6 | heavy collectors bounded and off the event loop | **met** — controls C1–C3 |
| 7 | Docker unavailable is modelled with bounded retries | **met** — controls C4–C6 |
| 8 | worktree/repo observation cached/incremental | **met** — Engineering Health TTL cache, isolated |
| 9 | teardown proves zero owned survivors | **met** — controls T1–T6, live proof above |
| 10 | restart makes prior-generation ownership stale | **met** — controls G1–G7 including PID reuse |
| 11 | zero event-store growth on a healthy idle host | **indicated** — 0 bytes observed; the soak is the proof |
| 12 | 24-hour soak | **running** — started against this candidate |

## Soak evidence chain

| file | candidate | note |
|---|---|---|
| `host-soak-prefix-C-G.jsonl` | `aecc4d9ec42c` | pre-fix: 103.6% CPU on the first sample, 72 open episodes, 0 terminal |
| `host-soak-interim-fefda677.jsonl` | `fefda677a196` | superseded by the backlog fix |
| `host-soak.jsonl` | **`14b0e01dcd06`** | **authoritative**, 60s interval, 24 hours |

The soak is deliberately **not** a work freeze. Normal Vacilando operation continues; the probe
records owned-process count, stale ownership, recovery backlog and ledger sizes alongside CPU and
RSS, so concurrent workload stays visible in the evidence rather than invalidating it. If ordinary
downstream work pushes a threshold over, that is criterion-12 evidence and the soak restarts from a
corrected candidate.
