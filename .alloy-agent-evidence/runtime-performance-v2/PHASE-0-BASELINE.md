---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Runtime Performance V2 — Phase 0 baseline and recent-change regression audit

**Lane** `lane_73a897409906` · **Run** `erun_2e7ff6dfabbdccbc` · **Slot 1**, port 3011.

Companion to [`../../docs/sprints/active/runtime-performance-ux-completion/PERFORMANCE-LEDGER.md`](../../docs/sprints/active/runtime-performance-ux-completion/PERFORMANCE-LEDGER.md)
and its `DEFECT-REGISTER.md`. This file records only what was **measured on the mounted product**
this session.

---

## 0. Two facts that govern every number below

**The base was wrong when this lane was handed over.** The worktree sat on
`b502a4a77` — an *ancestor* of `origin/staging`, **1191 commits behind**. Every commit on the
branch was already merged. A "current runtime" audit from that checkout would have profiled a
product that predates Financials, Attendance, Work Items V3, Processing and the Communications
convergence — precisely the additions this sprint was opened to audit. Fast-forwarded to
`b875be32d` (0 ahead / 0 behind) before any measurement. **Nothing here was measured on the
handed-over base.**

**Timing is still not admissible on this host; counts are.** At session start: load average
**13.88 and rising** (13.88 / 8.38 / 5.55), **6 competing node processes** including a live
`next build` in a sibling worktree. `QUIET-HOST-RUNBOOK.md` §2 requires zero. This is the same
blocker that stopped the August window, and it remains **operator-owned**. Per the runbook's
standing rule, **counted evidence — request counts, duplicate counts, call sites — is not
load-sensitive and is used freely below.** Milliseconds are quoted only as ordering, never as
budgets.

**Environment:** dev server (`alloy-dev-start`), hosted Supabase `ikaxilmwmrmbagoidedu` — the same
"local server, remote database" class as the August ledger, so counts are comparable. Slot-1 QA
session minted via `vac-qa-session-mint.mjs`; `/workspace` authenticated.

---

## 1. M-1 SETTLED — six of seven "duplicate requests" were React StrictMode

The August register carried five duplicate-request defects (**D-2**, **D-4**, and the card-level
×2s) with the standing note that *"an on-mount ×2 is a development artifact until proven
otherwise"* and that they had **never been re-checked with StrictMode off**. That check is now done.

Same journey, same server, same tenant, StrictMode the only variable
(`ALLOY_DEV_STRICT_MODE=0`, verified present in the server process env):

| Work Unit entry (`/workspace` → "All") | StrictMode **on** | StrictMode **off** |
|---|---:|---:|
| API requests | **41** | **30** |
| Distinct endpoints | 34 | 29 |
| **Duplicate calls** | **7** | **1** |

Dissolved as development artifacts — **not product defects**:

| Endpoint | With StrictMode | Without |
|---|---:|---:|
| `queue-row-layout/...?processKey=enrollment` | ×2 | ×1 |
| `attendance/card?customer_member_id=...` | ×2 | ×1 |
| `health/card?customer_member_id=...` | ×2 | ×1 |
| `operational-tasks?entity_id=...` | ×2 | ×1 |
| `queues/stage-membership-ack?keys=...` | ×2 | ×1 |

**D-2 (`queue-row-layout` ×2) is closed by this evidence.** It was the StrictMode echo, not the
sequential `fetchWorkUnitSurfaceConfigBundle` pair the register hypothesised. **D-4 is closed the
same way.** The recently added Attendance and Health cards are cleared of the duplicate-fetch
charge the brief predicted they would carry.

**Recorded as method:** a duplicate-request inventory taken under StrictMode is ~23% noise on this
journey. No future count is admissible without `ALLOY_DEV_STRICT_MODE=0`.

---

## 2. What survives the StrictMode control — the real duplicate inventory

| # | Finding | Count | Where |
|---|---|---|---|
| **P2-1** | `GET /api/admin/financials/card?customer_id=…` — **twice per Work Unit entry** | ×2 (×3 under StrictMode, i.e. not a flat echo) | Work Unit entry |
| **P2-2** | `GET /api/admin/work-units/{slug}/provisioning-answer?subject_id=…` — **twice for the same subject** on one row selection | ×2 | Row selection |
| **P2-3** | `GET /api/admin/departments` ×2 on cold `/workspace` | ×2 | Workspace cold |

**P2-1 is the most expensive item measured.** Under load the two Financials calls were the two
slowest requests in the whole journey (5,596ms and 4,954ms). It is a real second call, not a
StrictMode echo — the tell is that it was ×3 with StrictMode on, where a pure echo doubles.

### Speculative prewarm is live and costs 2 of every 3 record fetches

One row selection issues **9 API calls**, of which the target subject accounts for 3. The rest
prewarm two *other* subjects:

```
provisioning-answer?subject_id=eb5394c7…   ← target
view-models/drawer/opportunity/eb5394c7…   ← target
queues/stage-membership-ack
financials/card?customer_id=50b19065…
provisioning-answer?subject_id=8baf8418…   ← speculative sibling
view-models/drawer/opportunity/8baf8418…   ← speculative sibling
provisioning-answer?subject_id=d097e1a8…   ← speculative sibling
view-models/drawer/opportunity/d097e1a8…   ← speculative sibling
provisioning-answer?subject_id=eb5394c7…   ← DUPLICATE of the target (P2-2)
```

This is **R-018 / D-3**, still open, still exactly as the register described. It stays open for the
same reason: the historical note says the prewarm buys ~46ms on record switch, and removing it is a
**latency** trade that cannot be settled on an unqualified host. **Do not remove it on count alone.**

---

## 3. P0 — one misconfigured stage destroys the entire Work View

**The most operator-damaging defect found this session, and it is not a latency problem.**

Selecting a queue row whose stage is `decision` **unmounts the whole surface**: all 7 queue rows and
all 6 Focus Panel cards disappear, replaced by

> **This Work View can't be shown until its configuration is fixed.**
> *stage "decision" offers no reachable primary action — the answer will not claim operational on
> identity alone*

The subject is never committed. Screenshot: `shot-2-after-enter.png`.

**Row selection itself is healthy** — this was isolated by stage, not assumed:

| Row | Subject | Stage | Result |
|---|---|---|---|
| idx 3 | `d097e1a8…` | `waitlist` | ✅ committed, 7 rows, 6 cards |
| idx 4 | `468a5a95…` | `lead` | ✅ committed, 7 rows, 6 cards |
| idx 1 | `eb5394c7…` | `decision` | ❌ **0 rows, 0 cards**, not committed |
| idx 2 | `8baf8418…` | `decision` | ❌ **0 rows, 0 cards**, not committed |

**2 of the 7 rows in "All" are load-bearing mines.** The tenant configuration defect is real — stage
`decision` genuinely has no reachable primary action — but the **blast radius is the runtime's
fault**: one subject's unprovisionable answer tears down a cohort of seven and the operator loses
their queue, their scroll position and their panel.

This violates three stated laws at once: *prior valid content is held until replacement is ready*,
*no false empty states*, *no unnecessary remounts*. The failure belongs to the subject, and it must
be contained to that subject's panel.

**Not repaired in this pass** — the repair is a containment boundary in the Work View surface, which
is a runtime-ownership change and belongs in a ranked slice with its own regression test, not in a
discovery commit.

---

## 4. Search sub-slice — the click path has four silent-return sites

The reported operator bug ("search returns a record, clicking does nothing") was **not reproduced**
on this base; much of the path has been repaired since the report (`resolveSubjectDestination` now
returns a `durable_record` for child, person *and* household, and no longer requires a host —
`searchDestinations.ts` documents both fixes).

What remains is the **defect class** the brief names — *"unsupported entity → explicit safe
behavior, not silent no-op"*. Every failure in the click path is a bare `return`:

| # | Site | Condition | Behaviour |
|---|---|---|---|
| 1 | `GlobalSearchBox.openSubject` | no destination carries `primary` | nothing, panel stays open |
| 2 | `GlobalSearchBox.openDestination` | `durable_record` with an unrecognised grain | nothing, **no dismiss** |
| 3 | `GlobalSearchBox.openDestination` | `target: "route"` with empty `href` | falls through, silent return |
| 4 | `OperatorFocusAttentionListener` | `!hostSlug \|\| !hostId` | movement dropped, no feedback |

Site 4 is the one the code itself documents as intentional ("*no operational surface to move to*") —
correct as a decision, **wrong as an operator experience**: it is indistinguishable from a dead
click. Ranked P0 for *feedback*, not for navigation correctness.

**Hypothesis worth testing next:** a `decision`-stage search hit reaches §3's failure, which would
make the original report and the P0 above the same defect.

---

## 5. Counted baseline (StrictMode off, hosted Supabase, unqualified host)

| Journey | API requests | Distinct | Duplicate calls |
|---|---:|---:|---:|
| `/workspace` cold | 26 | 26 | 0 |
| `/workspace` warm (full reload) | 26 | 26 | 0 |
| Work Unit entry ("All") | 30 | 29 | 1 |
| Row selection (healthy stage) | 9 | 8 | 1 |

Workspace entry is clean — the August fixes hold. The cost has moved into **record selection**,
where 6 of 9 calls are speculative or duplicated.

---

## 6. What is blocked, and on whom

| Item | Blocked on |
|---|---|
| Every cold/warm **millisecond**, the production build, D-3/R-018 and R-005 A/B experiments | **Operator** — pausing competing sessions long enough for `pe3HostGate.sh` to pass. Unchanged since August. |
| Server/database call-count decomposition (Phase 2) | `ALLOY_ROUTE_TIMING=1` must be set **at build time**; requires the production build above. |

**The measuring server is currently running with `ALLOY_DEV_STRICT_MODE=0`.** Restart it without
that variable before any behavioural QA — it is a measurement setting, not a product setting.
