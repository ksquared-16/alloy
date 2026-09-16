# POST-DEPLOYMENT QA — SLICE 6: SECOND PROMOTION + CHILD-GRAIN DEPLOYED CERTIFICATION

Candidate `b7e430383` · PR **#1042** · merge **`a609a4486a70721ac433124f6736adc5f4845bcd`**
Deployed and verified `a609a4486` · **No product code changed in this slice.**

## FINAL STATUS: `SLICE_6_DEPLOYED_CERTIFICATION_PARTIAL`

| Gate | Result |
|---|---|
| **P0-2** Business Process at commit | **PASS** — gap 6,562 ms → **0 ms** |
| **Attendance** participant-scope convergence | **FAIL** — root-caused; repair correct but never invoked |
| **Health** participant-scope convergence | **FAIL** — same cause |
| **Track A** Household / Children / Readiness | **ACCEPTED** — reserved-then-authoritative, no false empty |
| **P0-1** Workspace loader | **PASS** — no regression |
| **P0-5** Work View acknowledgement | **PASS** — no regression |

---

## 1. CANDIDATE LINEAGE

`13b892e25` (BP admission) + `49c2c3ebc` / `eafcd9c65` (participant scope) + evidence, reconciled with
staging (35 commits) at `b7e430383`, each of the six product files verified **UNCHANGED** by that merge.
Certification re-run on the reconciled tree: **167/167**, typecheck rc=0, build rc=0.

**Negative claims verified by diff**, not asserted: no Household/Children/Readiness spec change, no S8-2
file touched, no provisioning-answer or enrichment change (so **no Track A read**), and exactly **one**
new `.from(` in the entire diff — `process_instances`, on the settlement path.

### Treatment of the two non-product artifacts

1. **`hosted-migration-identity-census.sql.results.json`** — governed evidence from trusted-host action
   `tha_10915a4f207933`, the Slice 5 census that cleared `hosted_migration_evidence_stale` after a peer
   lane applied `20260916050000`. **Preserved** as its own clearly-labelled non-product commit
   (`4cd9e613f`) rather than discarded: it is what the migration parity gate reads. Not bundled silently.
2. **`web/next-env.d.ts`** — a defect found in my own prior work. `eafcd9c65` used `git add -A web/` and
   swept a file the production build had rewritten (`.next/dev/types` → `.next/types`). That file is
   generated, marked "should not be edited", and committing the build variant is a known way to break
   the production build. **Restored** to `origin/staging` content as `c9911f0ac`, and re-restored after
   this slice's build rewrote it again.

## 2. DEPLOYMENT PROOF

```json
{ "gitSha": "a609a4486a70721ac433124f6736adc5f4845bcd", "gitBranch": "staging",
  "vercelEnv": "preview", "nodeEnv": "production",
  "vercelDeploymentId": "dpl_B4H3cDKhav5twX5GitimM1Zu3nQV",
  "supabaseProjectRef": "ikaxilmwmrmbagoidedu" }
```

Verified 2026-09-16T19:56:32Z. **Checked, not assumed:** `/api/build-info` first returned
`23731d75491c`, which is *not* this merge. `origin/staging` **is** `a609a4486`, and `23731d754`
(PR #1041, another lane) is an **ancestor** of it — the previous deployment, not a missing promotion.

### The subject, and how its grain was proven

| | |
|---|---|
| Work Unit | Enrollment · `waitlist` |
| row / attention entity | `9ab36f48-7bd0-4a4e-8538-2afb46a8c9a8` |
| settled drawer VM keyed on | `d097e1a8-c3c0-4c51-a113-2275b009b9a9` |
| Attendance / Health card subject | `bf7bb266-31b3-4cb3-ad9e-77d94fee4d12` |

**Child grain is proven from the panel, never from queue preview.** Two independent signals: the
participant-scoped cards name a **member** (`bf7bb266`) that is not the row entity, and the settled
drawer VM is keyed on a **different** id (`d097e1a8`) than the row — which happens only on the child
branch of `InlineOpportunityFocusPanel` (`isChildSubject ? familyOpportunityId : operationalSubjectId`).
So `9ab36f48` is the participation and `d097e1a8` is its family case.

## 3. P0-2 — BUSINESS PROCESS · **PASS**

| Milestone | deployed now | prior deployed |
|---|---:|---:|
| first cards | 18,992 ms | 13,551 ms |
| **BP first present** | **18,992 ms** | 20,113 ms |
| **BP first meaningful** | **18,992 ms** | 20,113 ms |
| **semantic gap** | **0 ms** | 6,562 ms |

The gap collapsed to the commit frame. The card states authoritative stage meaning at first-card
commit: *"ENROLLMENT · Lead Aug 7 · Tour North Campus · Decision Sep 12 · Waitlist Wrigley · Enrolling
Lennon · Enrolled Sep 12 · LEAD Waitlist · Manage…"* — the rail, participants and process name all
present, i.e. richer than the minimum this gate required.

**Current Work line absent from the commit BP card** (`current_work_line_in_bp: false`) — the known
pinned NON-BLOCKING finding from Repair Slice 4, recorded and not gated, exactly as instructed.

## 4 & 5. ATTENDANCE AND HEALTH · **FAIL** — and the repair is not the reason

| | Attendance | Health |
|---|---|---|
| 18,992 ms | "ATTENDANCE — TODAY · No record · **This child has no active enrolment, so attendance cannot be recorded…**" | "HEALTH & SAFETY · REQUIRED INFORMATION · Physical/health assessment **Missing** · Immunization record **Missing**…" |
| 30,262 ms | "Attendance is **not available for this child**" · token `unavailable` | "Health information is **not available for this child**" · token `unavailable` |

30,262 ms is precisely when the drawer VM lands (start 18,976 ms, duration 11,018 ms).

### THE CAUSE, captured directly

```
/api/admin/view-models/drawer/opportunity/d097e1a8-c3c0-4c51-a113-2275b009b9a9
```

**No `attention_subject_id` query parameter at all.**

So `resolveParticipationSubjectForOpportunity` receives `participationId: null` and returns on its
first guard. **The repair is correct and is never invoked.**

Upstream Slice 5 repaired *"the id is sent but cannot be matched across id spaces"* — a real defect,
proven from the code, and genuinely fixed. The deployed behaviour on this path is a **different**
defect one step earlier: *"the id is never sent."* Both had to be fixed; only one was visible from
the code, because the composer's fallback is written as though the parameter always arrives.

**Why my own tests could not catch this.** `participantScopePhaseConvergence.test.ts` supplies
`selectedParticipationId` directly to `buildOperationalContext`. It therefore **assumes the very thing
that does not happen**. The tests were right about the boundary they exercised and blind to the one
that actually fails — the same shape as the Repair Slice 4 lesson, one layer further out.

### Smallest next repair boundary — NOT patched

The client must send `attention_subject_id` when the panel is scoped to a child.
`useRecordWorkRuntime` builds `transportContext` as
`{ work_unit_id: "", department_id: "", attention_subject_id: attentionSubjectId }`, and
`fetchOpportunityDrawerViewModelClient` only appends the parameter when that value is non-empty. So
`attentionSubjectId` — from `useAttentionSubject()` — is null/empty on this path, **while the panel
demonstrably holds a scoped child** (its cards name member `bf7bb266`). That contradiction is the
whole next investigation: one question, one owner, no product change made here.

## 6. TRACK A — ACCEPTED (observation only, no product change)

| Card | first present | first meaningful | final | transition |
|---|---:|---:|---|---|
| Household | 30,262 ms | 30,262 ms | "Needs contact · Kurzman household · Updated Sep 12, 2026 · KK Kelly Kurzman Primary" | `RESERVED_TO_MEANINGFUL` |
| Children | 30,262 ms | 30,262 ms | "Needs info · 17 children · 1 enrolled, 1 waitlisted" | `RESERVED_TO_MEANINGFUL` |
| Readiness | — | — | never mounted (reserved throughout) | `RESERVED` |

**FALSE-EMPTY CHECK: CLEAN.** No "No household", no "No children linked", no readiness or completion
claim derived from incomplete family truth. Each card was reserved while unknown and authoritative once
known — which is exactly the contract the master decision accepted. The delayed settlement is real and
is for the human walkthrough to judge; it presents no false operational meaning.

## 7. P0-6 — PER-CARD SEMANTIC SETTLEMENT (cold child-grain, deployed)

| Card | first mount | first meaningful | transition |
|---|---:|---:|---|
| Business Process | 18,992 | 18,992 | **MEANINGFUL_AT_COMMIT** |
| Financials | 18,992 | 18,992 | **SAME MEANING** — arrives complete |
| Attendance | 18,992 | 18,992 | **LESS INFORMATIVE** at 30,262 ✗ |
| Health & Safety | 18,992 | 18,992 | **LESS INFORMATIVE** at 30,262 ✗ |
| Household | 30,262 | 30,262 | RESERVED_TO_MEANINGFUL ✓ |
| Children | 30,262 | 30,262 | RESERVED_TO_MEANINGFUL ✓ |
| Readiness | — | — | RESERVED ✓ |
| Current Work | — | — | never mounted — **expected**: globally `supersededBy: business_process` |

**Coherence: NOT YET.** Five of eight behave to contract. The two LESS INFORMATIVE transitions are the
Attendance/Health failure above, and they are the only thing standing between this panel and a coherent
settlement story. **P0-6 is not closed**, and is not claimed closed from card count or geometry — the
count is a flat 6→8 throughout, which is precisely why it proves nothing.

## 8. PRIOR DEPLOYED REGRESSIONS — BOTH PASS

**P0-1 Workspace loader**, one cold load, 345 frames sampled:

| | |
|---|---:|
| "Preparing your workspace…" frames | **0** |
| `WorkspacePendingSurface` frames | **0** |
| boot-shell frames | 173 |
| first boot shell | 1,003 ms |

**P0-5 Work View acknowledgement**, row-bearing views only, in-page rAF recorder:

| View | rows | click → `aria-selected` |
|---|---:|---:|
| New | 3 | **82 ms** |
| Registration | 1 | **140 ms** |
| Waitlist | 16 | **139 ms** |

All three under the 150 ms gate. No regression from either prior repair.

## 9. PERFORMANCE — OBSERVATIONAL ONLY

40 requests · 828 KB (prior: 39 / 1,006 KB).

| Request | start | duration | prior |
|---|---:|---:|---:|
| `provisioning-answer` | 10,733 ms | **8,140 ms** | 5,765 ms |
| `view-models/drawer/opportunity` | 18,976 ms | **11,018 ms** | 6,327 ms |
| `opportunity-drawer-body` | 30,108 ms | — | 4,758 ms |

The path remains **server-response bound**, and the drawer VM is now the single largest wait on it.
These are single runs against a different subject and a different tenant state from the prior baseline,
so the deltas are **not** reported as change and no optimization is proposed. Recorded for the next
performance decision, not acted on.

## 10. S8-2

`S8-2_BENEFICIAL / KEEP`. This deployment produced no contradictory evidence. No policy change, no
further investigation.

## 11. P1-1 — CERTIFICATION DEBT, UPDATED FROM ACTUAL EVIDENCE

Preserved from prior slices: deployed staging is the acceptance environment; component tests require
real admission proof; producer-transition tests must cross real phases; fixtures must be
production-shaped; harnesses need planted-defect validation; canonical enum/value assertions must come
from an authority rather than a plausible literal; source-presence grep is not behavioural certification.

**New, and earned by this slice:**

8. **A test that supplies an input assumes that input arrives.** `participantScopePhaseConvergence`
   passes `selectedParticipationId` straight into the context builder, so it could never fail on a
   client that omits `attention_subject_id`. A phase-transition test must assert the **transport**
   carries the value, not merely that the receiver handles it.
9. **A repair proven from code can still be inert in production.** Both the id-space mismatch and the
   missing parameter were real; fixing the one the code revealed changed nothing observable, because a
   guard earlier in the path short-circuits first. Deployed verification is not a formality after a
   well-evidenced repair — this is the second consecutive slice where it overturned the expected result.

Not implemented here, as instructed.

## 12. LEDGER

| Finding | Status |
|---|---|
| P0-1 Workspace loader | **CLOSED** — deployed-verified twice |
| P0-5 Work View acknowledgement | **CLOSED** — deployed-verified twice |
| **P0-2 Business Process at commit** | **CLOSED — deployed-verified, gap 0 ms** |
| P0-3 / P0-4 presentation contract | CLOSED |
| **Attendance / Health settle `unavailable`** | **OPEN — id-space half repaired and deployed; missing `attention_subject_id` is the remaining half** |
| P0-6 Focus Panel settlement | **OPEN** — blocked only by the line above |
| Household / Children / Readiness on a child lens | **ACCEPTED** as settlement-only; no false empty deployed |
| S8-2 | BENEFICIAL / KEEP |
| Current Work line on the commit BP card | OPEN — pinned, non-blocking, unattributed |

### Exact remaining blockers

1. **`attention_subject_id` is not sent** on the child-scoped settled request. One question:
   why does `useAttentionSubject()` yield nothing while the panel holds a scoped child?
2. **P0-6** closes when (1) does.

### `READY_FOR_FINAL_HUMAN_WALKTHROUGH` — **NO**

Three of the four original operator complaints are now fixed and deployed-verified: the blank white
workspace, the dead five-second click, and the six-second Business Process absence. But a walkthrough
today would still show Attendance and Health *losing knowledge they had just displayed* — the exact
complaint that opened this programme — and that is the one defect an operator is most likely to notice
and least likely to forgive. One bounded investigation stands between here and a walkthrough worth
Kelly's time.

**Final programme completion remains reserved for the human staging walkthrough and certification
closeout. This slice does not claim it.**
