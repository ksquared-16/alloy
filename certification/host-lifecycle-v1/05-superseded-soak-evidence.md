# Criteria 5 and 11 — evidence from the superseded multi-build observation

The soak started against `14b0e01dcd06` ran for **12.35 hours** and spanned three toolkits before it
was stood down under the One Soak Law. It **cannot** satisfy criterion 12 — its wall clock does not
count, and it never observed one exact build. It is preserved as
`host-soak-historical-multibuild.jsonl` (742 samples) and is strong supporting evidence for the two
criteria Host Lifecycle still owns.

```
2026-09-11T23:01:41Z .. 2026-09-12T11:22:43Z   742 samples @ 60s
```

| toolkit | n | span | cpu p50 | p90 | p99 | max | >50% | rss p50 | rss max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `14b0e01dcd06` | 285 | 4.73 h | 0.0% | 9.5% | 94.3% | 100.4% | **9** | 187 MB | 531 MB |
| `5c7b100bcd64` | 455 | 7.57 h | 0.0% | 0.4% | 1.9% | 35.4% | **0** | 181 MB | 402 MB |
| `c5d8acfcfbec` | 2 | 0.02 h | 0.0% | — | — | 0.0% | 0 | 191 MB | 191 MB |

## Criterion 5 — the bursts track workload, not maintenance

The two windows look like different machines, and the tempting read is that something between the
builds fixed the CPU. It did not. The windows had **~19× different workload**:

| toolkit | window | `runs.json` | `admission-events` | `audit` |
|---|---|---:|---:|---:|
| `14b0e01dcd06` | 23:01–03:45 | 99,289 B/h | 935 B/h | 107,163 B/h |
| `5c7b100bcd64` | 03:46–11:20 | 5,190 B/h | 76 B/h | 6,855 B/h |

All **nine** full-core samples fall inside the busy window; the quiet window has none.

```
23:03  54.3%   00:04 100.4%   01:54  97.1%   03:14  88.9%   03:19  51.5%
23:04  59.9%   00:30  58.1%   03:08  94.3%   03:17  70.7%
```

The busy window was this lane's own promotion traffic — repeated full suite sweeps, CI polling, git
and node processes — plus other lanes. So the bursts correlate with **real work**, which is what
criterion 5 explicitly does not count: it asks for no recurring **maintenance-caused** full-core
bursts.

What the idle window shows, on a post-C/G build under genuine quiet: **p50 0.0%, p90 0.4%, p99 1.9%,
zero samples above 50% across 7.57 continuous hours.** That is idle CPU inside the 0–2% target with
no full-core bursts at all.

**Stated precisely, because the distinction matters:** this is strong supporting evidence, not the
finding. Correlation with load does not by itself prove no burst was maintenance-caused, and the
7.57-hour idle window was observed on `5c7b100bcd64`, not on the final integrated build. Criterion 5
is assessed from the authoritative exact-build soak.

## Criterion 11 — recovery/event growth, proven under real workload

Over 12.35 hours on a host doing real work, the recovery ledger emitted **8 events**:

```
2026-09-12T03:46:31Z  stale_slot_pid  detected → classified → attempted → verified
2026-09-12T11:22:07Z  stale_slot_pid  detected → classified → attempted → verified
```

Two genuinely stale PID claims appeared as dev servers died. Both were repaired on the **first**
attempt and verified. Zero `recovery_exhausted`, zero repeats, zero rediscovery.

The September 11 incident rate was 24 events/minute, which over the same 12.35 hours would have been
roughly **17,800 events**. Total ledger growth was **2,382 bytes**.

The other ledgers grew with the workload that produced them, which is correct and is not
event-store churn: `runs.json` +484 KB, `audit` +561 KB, `admission-events` +5.6 KB.

## Where criterion 12 actually stands

Observed at 2026-09-12T11:23Z, after convergence:

```
toolkit/current      c5d8acfcfbec
running Gateway      c5d8acfcfbec   pid 5389, claimed 11:21:37Z
runtime generation   gen_mtxg8583_45p_acff6f69
convergence episode  cpr_tl90vv  TOOLKIT_DRIFT  1 attempt  resolved 11:23:37Z
```

**No soak process is running on the host, and `gatewayHostMutationHolder` reports FREE.**

So the criterion-12 clock has **not** started, and nothing currently protects the exact build from an
install that would invalidate it. This lane will not start one — the One Soak Law puts that with
Final Convergence, and a second soak is worse than none. Recorded here so the gap is visible rather
than assumed closed.
