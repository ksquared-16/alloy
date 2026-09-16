# POST-DEPLOYMENT QA — REPAIR SLICE 7: PARTICIPANT SCOPE TRANSPORT CONVERGENCE

Starting SHA `3bc2cdc5a` · repair `c6853089e` · deployed base under repair `a609a4486`
**Not merged, promoted or deployed.** Two product files changed, plus one new test file.

## FINAL STATUS: `REPAIR_SLICE_7_COMPLETE_CERTIFIED`

## 1. FILES CHANGED

| File | Change |
|---|---|
| `web/lib/presentation/runtime/useRecordWorkRuntime.ts` | takes the participation as an argument; prefers it over attention |
| `web/components/presentation/workUnit/InlineOpportunityFocusPanel.tsx` | states the participation it already computed |
| `web/tests/runtime/participantScopeTransport.test.ts` | **new** — 20 tests asserting the serialized request |

No card, no renderer, no resolver, no new subject/context system.

## 2. THE PARTICIPANT TRANSPORT MAP

| # | Boundary | Owner | Input | Output | Expected id type | Actual (deployed) | Nullable | Authority |
|---|---|---|---|---|---|---|---|---|
| 1 | selected operational subject | committed Focus (`operational.subjectId`) | committed answer | `9ab36f48…` | `process_instances.id` | **present** | no | provisioning answer |
| 2 | grain discrimination | `InlineOpportunityFocusPanel` | `operational.entityType` / `subjectGrain` | `isChildSubject = true` | — | **true** | no | committed Focus |
| 3 | settlement key derivation | same | `child.family_opportunity_id` / seed | `d097e1a8…` | `opportunities.id` | **present** | yes | answer truth, then queue seed |
| 4 | **transport hand-off** | same → `useRecordWorkRuntime` | both ids known | **only the family id was passed** | participation | **participation DROPPED** | — | **← FIRST WRONG BOUNDARY** |
| 5 | attention read | `useAttentionSubject()` | kernel attention ref | `ref?.subject` | `process_instances.id` | **null** | yes | operator-expressed attention |
| 6 | transport context | `useRecordWorkRuntime` | attention subject | `null` | — | **null** | yes | this runtime |
| 7 | URL construction | `buildOpportunityDrawerViewModelUrl` | context | URL **without** the parameter | — | **omitted** | — | client |
| 8 | route parsing | drawer route | `sp.get("attention_subject_id")` | `null` | participation | **null** | yes | server |
| 9 | participation resolution | `resolveParticipationSubjectForOpportunity` | `null` | exits on first guard | — | **never invoked** | — | `process_instances` |
| 10 | settled scope | `buildOperationalContext` | no resolved participant | `participantScope = null` | — | **null** | yes | server |
| 11 | producers | `projectFocusPanelCardProducers` | `customerMemberId = null` | `{state:"unavailable"}` | — | **unavailable** | — | server |

## 3. IDENTIFIER-SPACE MAP

| Identifier | Identifies | Owner | Source | Role here |
|---|---|---|---|---|
| `process_instances.id` | the child's **participation** | `process_instances` | child-grain queue row `entityId` | **the value that crosses the wire** |
| `opportunities.id` | the **family case** | `opportunities` | `child.family_opportunity_id` / drawer seed | the settled VM key (path segment) |
| `customer_members.id` | the **child member** | `customer_members` | `process_instances.subject_id` | **server-DERIVED only; never transported** |
| inquiry-child `id` | an intake metadata row | `opportunities.metadata` | queue enrichment | candidate presentation only, never authority |

**Why the participation is the correct identifier to transport.** It is the only one the server can
*authorize*: `process_instances` carries both `org_id` and `context_id`, so resolving it proves the
participation belongs to this org **and** this opportunity. The member id has no such relation to the
case — accepting it would mean trusting a client-named child. The Upstream Slice 5 architecture is
therefore preserved exactly: **client supplies an attention/participation identity → server resolves
under org + context → server derives `customerMemberId`.**

## 4. `useAttentionSubject` VERDICT: **WORKING CORRECTLY — NOT THE DEFECT**

The symptom pointed here and the hook is right. `ATTENTION_SCOPE.SURFACE` sets `subject: null`
deliberately — *"A surface movement abandons the lens/subject/aspect of the surface it leaves"* — and
`ATTENTION_SCOPE.LENS` does the same. Only `ATTENTION_SCOPE.SUBJECT` sets it, and that is emitted by
`openRecord` (a click) and by the entry gesture **when a subject is named in the entry**.

A plain navigation to `/workspace/work-unit/waitlist` names no subject, so only a SURFACE movement
occurs. The surface then commits its **configured default subject** — which is what renders the panel
— without moving attention to it. The entry gesture states this in its own comment:

> *"A finer SUBJECT movement pins the exact Record of Attention. **Without it the surface commits its
> configured DEFAULT subject**."*

So attention holding no subject on cold entry is **by design**: it is the *operator-expressed* Record
of Attention, not the surface's default. Repairing the hook would have meant writing a default into a
global whose whole contract is that it records what the operator did — and would have changed
`recommitForTruthMovement`, which branches on `current.subject`. **The hook was not repaired.**

Tested across the required cases: child-grain selected subject, case grain, subject switch, no
participant, stale/previous subject, latest-click-wins — all in §7 below.

## 5. THE FIRST INCORRECT BOUNDARY, AND THE REPAIR

**Boundary 4.** `InlineOpportunityFocusPanel` computes `isChildSubject`, holds the participation in
`operationalSubjectId`, derives `settlementSubjectId` *from* it — and then passes the runtime only the
family id, leaving it to recover the child from a global that is null by design on this path. **The
panel knew the answer and did not say it.**

```ts
// before
} = useRecordWorkRuntime(settlementSubjectId);

// after
} = useRecordWorkRuntime(settlementSubjectId, isChildSubject ? operationalSubjectId : null);
```

```ts
// useRecordWorkRuntime — stated wins, attention remains the fallback
const attentionSubjectFromKernel = useAttentionSubject();
const attentionSubjectId = participationId?.trim() || attentionSubjectFromKernel;
```

The stated value is not merely more *available*, it is more **current**: it comes from committed
Focus, which is the latest commit by construction, while attention is a global a cold entry never
writes. The fallback keeps every caller that states nothing (the modal drawer product) behaving
exactly as before.

### Request, before → after

```
before   /api/admin/view-models/drawer/opportunity/d097e1a8-…
after    /api/admin/view-models/drawer/opportunity/d097e1a8-…?attention_subject_id=9ab36f48-…
```

The path segment is unchanged — still the **family** case. Only the query gains the participation.

### Route / resolver / settled scope, before → after

| | before | after |
|---|---|---|
| route `attentionSubjectId` | `null` | `9ab36f48…` |
| resolver | exits on first guard | queries `process_instances` under org + context |
| `participantScope.customerMemberId` | `null` | `bf7bb266…`, **server-derived** |
| Attendance / Health producer | `{state:"unavailable"}` | `{state:"ready", data: VM}` |

## 6. SECURITY / AUTHORITY PROOF

| Requirement | How it holds |
|---|---|
| no trusted client `customer_member_id` | asserted by test: neither the runtime nor the URL builder contains `customer_member_id`/`customerMemberId` |
| no bypass of `process_instances` resolution | the route still calls the resolver; the client only names an id |
| no cross-org | resolver `.eq("org_id", orgId)` |
| no cross-opportunity/context | resolver `.eq("context_id", opportunityId)` — a foreign participation resolves to `null` |
| foreign participation rejected | unchanged from Slice 5: `maybeSingle()` over the three-way key returns nothing |
| queue preview never authority | the participation comes from committed Focus; intake metadata is used only to borrow a name/photo |
| no stale prior-subject scope | `transportContext` is a `useMemo` over the resolved value; no ref holds a prior participation (asserted) |
| latest-subject-wins | `if (gen !== fetchGenRef.current) return;` intact (asserted); a late response for a superseded subject cannot land |

**The repair widens no authority.** It adds one *claim* to a request; every check that validates that
claim is unchanged and still server-side.

## 7. CERTIFICATION — 20 TESTS ON THE SERIALIZED REQUEST

`web/tests/runtime/participantScopeTransport.test.ts`. These assert the **artifact the deployed defect
was visible in** — the URL — rather than handing an id to a downstream function.

1. **the gate** — a child-grain panel produces `attention_subject_id` on the real URL
2. **the deployed defect reproduced** — no stated participation and no attention yields exactly the
   request captured on staging: `/api/admin/view-models/drawer/opportunity/d097e1a8-…` with no query
3. the request stays keyed on the **family** case, never the participation
4. cold entry has no attention subject — and the stated participation rescues exactly that case
5. after a click, stated and attention **agree** — no contradiction to resolve
6. case grain fabricates nothing (URL and call site both asserted)
7. identifier semantics — the participation crosses, the member id does not; the server still derives
8. subject switch A→B transports B; child→case retains nothing; case→child carries the new one
9. staleness and latest-wins guards intact
10. the caller contract — the panel states it, the runtime prefers it, attention remains the fallback

## 8. PLANTED-DEFECT EVIDENCE — THE CERTIFICATION HOLE, DEMONSTRATED

| Plant | **New transport gate** | **Old phase-convergence test** |
|---|---|---|
| drop `attention_subject_id` from the real URL builder | **5 of 20 FAIL** | **16/16 PASS** |
| drop the panel's stated participation | **1 of 20 FAIL** | **16/16 PASS** |

**The old gate stays green under both plants** — including the one that reproduces the exact deployed
failure. That is why Upstream Slice 5 certified green and shipped inert: a downstream resolver test
cannot certify a transport contract when the defect prevents the resolver from being invoked at all.

Both files restored; all suites green afterwards.

## 9. GATES

| Gate | Result |
|---|---|
| Transport suite (new) | **20/20 pass** |
| Full regression — transport, phase convergence, Repair Slice 4 admission, Slice 5 resolver, P0-1, P0-3/P0-4, producer parity, root readiness, drawer-attention authorization | **187/187 pass**, 14 files |
| `vac run typecheck` | **rc=0** |
| `vac run build` | **rc=0** |
| New requests | **0** — one query parameter on an existing request |
| Request-shape impact | one `attention_subject_id` param on the child-grain settled request only |

## 10. EXPECTED DEPLOYED TRANSITIONS

| Card | before (measured `a609a4486`) | expected after |
|---|---|---|
| Attendance | READY explanatory at 18,992 ms → **`unavailable`** at 30,262 ms | READY → **READY** (same or richer) |
| Health | READY required-information at 18,992 ms → **`unavailable`** at 30,262 ms | READY → **READY** (same or richer) |

Missing health requirements may stay missing and a child with no enrolment keeps its explanation —
those are valid domain truth. What must not recur is `unavailable` **caused by a lost participant**.

## 11. P1-1 — CERTIFICATION DEBT (MUST_FIX_BEFORE_PROGRAMME_CLOSE)

> **A downstream resolver test cannot certify a transport contract if the production defect can
> prevent the resolver from being invoked.** Certification must cover the whole chain: source state →
> transport derivation → **serialized request** → route parsing → authoritative resolver. Asserting
> the receiver handles a value it was handed proves nothing about whether the value is ever sent.

Recorded with its planted-defect result (§8), which is the evidence for the rule rather than an
assertion of it. Not implemented as a full programme here.

## 12. LEDGER

| Finding | Status |
|---|---|
| P0-1 Workspace loader | CLOSED — deployed-verified |
| P0-2 Business Process at commit | CLOSED — deployed-verified |
| P0-5 Work View acknowledgement | CLOSED — deployed-verified |
| P0-3 / P0-4 presentation contract | CLOSED |
| **Attendance / Health participant scope** | **REPAIRED end-to-end — id space (Slice 5) + transport (this slice); deployed verification owed** |
| P0-6 Focus Panel settlement | expected to close with the above; deployed verification owed |
| Household / Children / Readiness on a child lens | ACCEPTED as settlement-only (Track A) — not reopened |
| S8-2 | BENEFICIAL / KEEP — untouched |
| Current Work line on the commit BP card | OPEN — pinned, non-blocking, unattributed |

### Exact remaining blockers

**None in product.** One verification: a cold child-grain walkthrough on a deployed build carrying
this candidate, checking that Attendance and Health hold their explanatory READY state across
settlement, and that the request carries `attention_subject_id`.

### `READY_FOR_FINAL_REPAIR_PROMOTION`: **YES**

This is intended to be the last product repair before one final promotion, deployed verification and
the human walkthrough. Final programme completion remains reserved for that walkthrough and the
certification closeout; this slice does not claim it.
