# POST-DEPLOYMENT REPAIR SLICE 1 — P0-1 + P0-5

Run `erun_71d72fdb1c97ec1b` · baseline `a044266c79dcd411e14dfef3b2d97eb850f4b1d1`
**Candidate `bf807ca855a463f6ac9892793626a371ead8b877`** · not merged, not promoted, not deployed.

## Files changed (4)

```
M  web/components/presentation/workspace/WorkspaceSurface.tsx
D  web/components/presentation/workspace/WorkspacePendingSurface.tsx
M  web/components/presentation/workUnit/WorkViewPillStrip.tsx
A  web/tests/runtime/workspaceLoaderOwnership.test.tsx
D  web/tests/runtime/workspaceProgressiveReveal.test.tsx
```

No other file touched. No product data, no route/query ownership, no warming policy, no readiness or
authoritative-data contract.

## P0-1 — canonical Workspace loader restored

**Ownership before:** `WorkspaceSurface` rendered a surface-local `WorkspacePendingSurface` while
`!model.ready` — org name, "Preparing your workspace…", two reserved slots styled `bg-white/60` with
`border-alloy-stone/18` **on white**, i.e. invisible. Deployed staging holds that state 5–7 s.

**Ownership after:** `<AlloyOperationalBootShell variant="workspace" chrome="content" />` — the single
canonical "Thinking" owner already rendered by `app/adminV2/loading.tsx`,
`app/adminV2/workspace/layout.tsx` and `AdminV2Shell`. Restoring it **converges** ownership; it does
not add one.

**Minimal diff:** swap the import, drop the now-unused `orgName` destructure, replace the pending
branch. The settled branch, `model.ready`, the retained scrollport and the enter choreography are
untouched.

**Was any Slice 19 gain worth keeping?** The only thing that slice added here was earlier *org-name*
identity. It is not retained, and deliberately: the canonical loader is shared by three other
surfaces, so adding identity to it is a change to that one owner and belongs to its own decision — and
the deployed evidence shows the shell already carries Alloy identity from the first frame. No
independent Runtime V2 performance work was removed; Slice 19 contained nothing else.

**Is `WorkspacePendingSurface` dead?** Yes — its only non-test caller was this branch. **Deleted**, so
there is exactly one pending presentation owner and no dormant second one to drift back into use.

## P0-5 — immediate selection acknowledgement

**The wait, exactly.** `WorkViewPill` set `aria-selected={view.isActive}` and its active styling from
the same flag. `isActive` is computed in the model builders as `l.id === snapshot.activeWorkView.id`
(`workUnitSurfaceModelFromSnapshot.ts:224/354`, `types.ts:465`) — i.e. **from the resolved destination
snapshot**. Operator intent was represented nowhere, so the control could not acknowledge until the
whole transition completed: ~5.0 s on a normal deployed click, with selection, queue and Focus Panel
all landing in the same frame.

**Ownership after.** `WorkViewPillStrip` — the existing presentation owner of this control — holds the
requested id and renders selection from `intent ?? modelActive`. The model stays the only source of
truth for routing, the queue and the Focus Panel; `onSelect` is unchanged and still does the real
move. Nothing is claimed about the destination: the chosen pill carries
`data-work-view-intent="pending"` and `aria-busy` until the model agrees, so acknowledgement can never
be mistaken for loaded content. Intent is spent the moment the model moves **at all** — landing where
asked, or elsewhere after a refusal/redirect, which takes the highlight back. The latest click
replaces the previous one.

**Click → visible acknowledgement:** previously bound to destination resolution (deployed ≈ 5,042 ms
cold / 6,326 ms repeat / 3,182 ms even after a 1.2 s warm). Now it commits **in the click's own render
pass** — proven by the test that clicks while the model is still reporting the old view and asserts
`aria-selected` has already moved. Queue-meaningful and panel-meaningful are deliberately unchanged in
this slice.

**Requests:** none added. The strip issues no fetch and gains no router/searchParams use — asserted by
test. `onPrefetch` (existing hover intent) is untouched.

## Certification

| Gate | Result |
|---|---|
| `vac run typecheck` | **0** |
| Production build (`pe3ProdBuild.sh`) | **rc=0**, peak 9.00 GB |
| `tests/runtime/workspaceLoaderOwnership.test.tsx` | **11 passed** |
| `tests/surfaces/` + the new suite | **43 files / 418 tests passed** |
| `tests/runtime/` (whole directory) | 5 files / 11 tests failing — **the known pre-existing set**, unchanged by this slice |

The pre-existing reds are the four staging-owned files failing inside staging's own
`documentActorFromAdminGate` plus the `workUnitProvisioningPrefetch` TTL expectation. The baseline had
**6 files / 12 tests** failing; this candidate has **5 / 11**, and none of the failures touch the files
changed here.

**Planted defects, both reverted.**

| Plant | Failing tests | Message |
|---|---|---|
| a surface-local pending replacement returns | *renders AlloyOperationalBootShell…*, *has no surface-local pending replacement* | `expected … to match /<AlloyOperationalBootShell variant="…/` and `not to match /Preparing your workspace/` |
| the pill derives selection from `view.isActive` again | *selection moves on click…*, *latest click wins…*, *a move the model resolves ELSEWHERE…* | `acknowledgement must not wait for the destination: expected 'a' to be 'b'` |

5 failed / 6 passed with the plants in; **11/11** after reverting.

One test assertion was corrected during the run, not the code: a `not.toContain("fetch(")` check matched
the existing `onPrefetch(` call. Replaced with a boundary-aware regex.

## Architecture guards

* No new loader, reveal owner, navigation runtime, cache or scheduler.
* Exactly one Workspace pending owner; the second is deleted.
* Work View warming policy, neighbour prewarm (S8-2) and route/query ownership unchanged.
* No optimistic business data; the destination is never claimed to be loaded.
* No fetch added anywhere.

## Out of scope, untouched

P0-2 / P0-6 (Business Process settlement) · P0-3 / P0-4 (Attendance and Health semantics) · S8-2
(open) · the 4–12× loopback-vs-staging discrepancy · the wider P1-1 certification framework.

## Composability

The candidate is clean: two presentation files plus tests, no shared-contract edits, and it does not
touch any file the remaining repairs will need (`BusinessProcessCard`, `AttendanceCard`,
`HealthSafetyCard`, the projection producers). **Ready to compose with later repairs.**

**Not deployed — so no human acceptance is claimed.** The acceptance checks remain: cold `/workspace`
on staging shows the canonical loader for the whole pending interval, and an ordinary pill click
acknowledges immediately.

## Ledger

* **P0-1 REPAIRED (certified locally, not deployed)** · **P0-5 acknowledgement REPAIRED (certified
  locally, not deployed)** — the queue/panel latency behind it is unchanged and still open
* P0-2 / P0-6 ROOT_CAUSED, untouched · P0-3 / P0-4 REPRODUCED, untouched · S8-2 OPEN, untouched
* P1-1 ROOT_CAUSED; only the tests binding these two repairs were added
