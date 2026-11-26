# POST-DEPLOYMENT QA — SLICE 8: FINAL REPAIR PROMOTION + DEPLOYED PRODUCT VERIFICATION

Candidate `39e30c560` · PR **#1044** · merge **`88a4667a86851933854da93d8aa998e9a11003ff`**
Deployed and verified in **`8356c02f5b47e3de22f15b8272f8ce0aca18a330`**
**No product code changed in this slice.**

## FINAL STATUS: `SLICE_8_DEPLOYED_PRODUCT_PASS`

| Gate | Result |
|---|---|
| **Transport** — `attention_subject_id` on the real request | **PASS** |
| **Attendance** — READY → READY | **PASS** |
| **Health** — READY → READY | **PASS** |
| **P0-6** coherence | **PASS** — no LESS_INFORMATIVE, no CONTRADICTORY, no FALSE_EMPTY |
| **P0-1** Workspace loader | **PASS** |
| **P0-2** Business Process at commit | **PASS** |
| **P0-5** Work View acknowledgement | **PASS** |

---

## 1. LINEAGE AND PROMOTION

Candidate `39e30c560` = Repair Slice 7 (`c6853089e`) reconciled with staging. Provenance **asserted,
not assumed** — each element checked present in the candidate:

* Slice 7 transport — runtime prefers the stated participation; panel states it
* Slice 5 server resolver — still scoped to `org_id` **and** `context_id`, still invoked by the route
* Slice 4 — `business_process` in `COMMIT_CRITICAL_CARD_SPECS`
* **no** Track A commit-path read · **no** S8-2 change (both confirmed by diff)

Promotion scope: 2 product files + 1 test. CI **11/11 pass**. Certification re-run on the reconciled
tree: 187/187, typecheck rc=0, build rc=0.

## 2. DEPLOYMENT PROOF — AND A SHA THAT NEEDED CHECKING

```json
{ "gitSha": "8356c02f5b47e3de22f15b8272f8ce0aca18a330", "gitBranch": "staging",
  "gitMessage": "Merge pull request #1043 … Access & Identity V2",
  "vercelEnv": "preview", "nodeEnv": "production",
  "vercelDeploymentId": "dpl_FJebmKVKxQvgtQy6SDjEL1jpyaFx",
  "supabaseProjectRef": "ikaxilmwmrmbagoidedu" }
```

The deployed SHA is **not** this merge. PR #1043 from another lane merged *after* #1044 and deployed
first. `git merge-base --is-ancestor 88a4667a 8356c02f` proves **my merge is an ancestor of the
deployed build**, so the repair is live. A poller waiting for the literal merge SHA would have hung
forever on a build that was never going to deploy — the ordering had to be checked, not assumed.

### The subject, proven from authoritative runtime state

`window.__ALLOY_FOCUS_SETTLEMENT_DIAG__`, read from the panel itself — **not** queue preview:

```json
{ "isChildSubject": true, "entityType": "child",
  "subjectGrain": { "grain": "child", "subjectType": "child" },
  "operationalSubjectId": "9ab36f48-7bd0-4a4e-8538-2afb46a8c9a8" }
```

## 3. TRANSPORT GATE — **PASS** (the primary Slice 7 deployment gate)

```
/api/admin/view-models/drawer/opportunity/d097e1a8-c3c0-4c51-a113-2275b009b9a9
  ?attention_subject_id=9ab36f48-7bd0-4a4e-8538-2afb46a8c9a8
```

| Check | Result |
|---|---|
| `attention_subject_id` present | **true** (Slice 6: absent) |
| opportunity id (path) | `d097e1a8…` — the family case, unchanged |
| transported id | `9ab36f48…` |
| **equals the row entity** (the participation) | **true** |
| **equals the `customer_member_id`** | **false** |
| server-derived member | `bf7bb266…`, reached the participant-scoped cards |

The last two rows are the ones that matter beyond mere presence. The transported value is the
**participation**, and it is **not** the member id the cards already know — so the server still
resolves under `org_id` + `context_id` and derives the member itself. A repair that appeared to work by
sending the wrong identifier would have failed this gate.

## 4 & 5. ATTENDANCE AND HEALTH — **PASS**

| | Attendance | Health |
|---|---|---|
| first meaningful (14,743 ms) | "ATTENDANCE — TODAY · No record · **This child has no active enrolment, so attendance cannot be recorded…**" | "HEALTH & SAFETY · REQUIRED INFORMATION · Physical/health assessment **Missing** · Immunization record **Missing**…" |
| settled (35,966 ms) | **unchanged** | **unchanged** |
| `data-*-empty` token, ever | **none** | **none** |

**The Slice 6 failure is gone.** Both cards now hold their explanatory READY state across the drawer-VM
settlement that previously destroyed it. No empty-state token appears at any point in the run, which is
the strongest available signal that the producers returned `ready` with a payload rather than
`unavailable` with `data: null`.

The child still has no active enrolment and the health requirements are still missing — that is valid
domain truth and is exactly what the cards say. What no longer happens is `unavailable` **caused by a
lost participant**.

| | Slice 6 (`a609a4486`) | Slice 8 (`8356c02f`) |
|---|---|---|
| Attendance | READY → **`unavailable`** at 30,262 ms | READY → **READY** |
| Health | READY → **`unavailable`** at 30,262 ms | READY → **READY** |

## 6. P0-6 — PER-CARD SEMANTIC TABLE · **COHERENT**

| Card | first mount | first meaningful | transition |
|---|---:|---:|---|
| Business Process | 14,743 | 14,743 | **MEANINGFUL_AT_COMMIT** |
| Financials | 14,743 | 14,743 | **SAME MEANING** |
| Attendance | 14,743 | 14,743 | **SAME MEANING** (READY held) |
| Health & Safety | 14,743 | 14,743 | **SAME MEANING** (READY held) |
| Household | 21,591 | 21,591 | **RESERVED_TO_MEANINGFUL** — allowed (Track A) |
| Children | 21,591 | 21,591 | **RESERVED_TO_MEANINGFUL** — allowed (Track A) |
| Readiness | — | — | **RESERVED** — allowed (Track A) |
| Current Work | — | — | never mounted — **expected**: globally `supersededBy: business_process` |

**Forbidden transitions: none observed.** No LESS_INFORMATIVE, no CONTRADICTORY, no FALSE_EMPTY.
Household reads "Needs contact · Kurzman household"; Children reads "Needs info · 17 children ·
1 enrolled, 1 waitlisted" — authoritative, never a false "No children linked".

**Five of eight cards are meaningful at the commit frame**, and the three that are not are reserved
under the accepted Track A contract rather than asserting anything false.

## 7. CLOSED-P0 SPOT CHECKS — ALL PASS

**P0-1** — one cold `/workspace` load, 351 frames:

| | |
|---|---:|
| "Preparing your workspace…" frames | **0** |
| `WorkspacePendingSurface` frames | **0** |
| boot-shell frames | 105 |
| first boot shell | 840 ms |

**P0-2** — first cards 14,743 ms · BP present **14,743 ms** · BP meaningful **14,743 ms** · **gap 0 ms**.

**P0-5** — click → `aria-selected`, row-bearing views only: **111 ms**, **94 ms**, **74 ms**. All under 150 ms.

## 8. PERFORMANCE — OBSERVATION ONLY

39 requests · 1,011 KB. rows 14,743 ms · first cards 14,743 ms · settled 35,966 ms.

| Request | start | duration | Slice 6 |
|---|---:|---:|---:|
| `provisioning-answer` | 9,077 ms | 5,558 ms | 8,140 ms |
| `view-models/drawer/opportunity` | 14,730 ms | 6,641 ms | 11,018 ms |
| `opportunity-drawer-body` | 21,433 ms | 4,532 ms | — |

Faster than the Slice 6 run on every comparable request, but these are **single runs against a
different deployed build, a different tenant state and a different hour**. That is not evidence of
improvement and **no optimization is proposed**. Recorded for the human walkthrough to judge perceived
performance, which remains the only acceptance that matters here.

## 9. LEDGER

| Finding | Status |
|---|---|
| P0-1 Workspace loader | **CLOSED** — deployed-verified three times |
| P0-2 Business Process at commit | **CLOSED** — deployed-verified twice |
| P0-5 Work View acknowledgement | **CLOSED** — deployed-verified three times |
| P0-3 / P0-4 presentation contract | **CLOSED** |
| **Attendance / Health participant scope** | **CLOSED — deployed-verified end to end** |
| **P0-6 Focus Panel settlement** | **CLOSED** — coherent, no forbidden transition |
| Household / Children / Readiness on a child lens | **ACCEPTED** (Track A) — reserved-then-authoritative, no false empty |
| S8-2 | BENEFICIAL / KEEP — untouched |
| Current Work line on the commit BP card | **OPEN** — pinned, non-blocking, unattributed |

### Remaining PRODUCT blockers

**None.** Every P0 raised by the original Human QA is closed and deployed-verified. The single open
item is the pinned, non-blocking Current Work line in the commit Business Process card, which was
explicitly excluded from repair and does not block a walkthrough.

### `READY_FOR_FINAL_HUMAN_WALKTHROUGH`: **YES**

All four original operator complaints are fixed and verified in the environment the operator uses:

1. the blank white workspace on entry — **gone** (0 frames of the rejected treatment)
2. the click that did nothing for five seconds — **74–111 ms** acknowledgement
3. Business Process absent for six seconds after its siblings — **meaningful at the commit frame**
4. cards losing knowledge they had just displayed — **Attendance and Health hold their meaning**

What the walkthrough should still judge, because automation cannot: whether ~14.7 s to first cards and
~36 s to full settlement *feel* acceptable, and whether Household and Children arriving at 21.6 s under
the accepted Track A contract is tolerable in practice.

**Overall programme completion is NOT declared here.** It remains reserved for the final human staging
walkthrough and the P1-1 certification closeout.
