# SLICE 15 — ELIGIBLE ENROLLMENT CHILDREN REQUEST CONVERGENCE (S8-3)

Run: `erun_75c7f50d53d4cfc2` · Lane: `lane_73a897409906` · Worktree: `wt1-work-unit-grade-a` (slot 1, port 3011)
Implementation + tests: `64d79c578`

## 1. Old caller map

| Caller | Path | Result contract | Failure handling |
|---|---|---|---|
| **A** `eligibleEnrollmentChildrenWarmCache` | `prefetchEligibleEnrollmentChildren` → `speculativeFetch` | `WarmEligibleEnrollmentChildren \| null` | every failure → `null`; entry kept for the TTL on an API refusal, deleted on throw |
| **B** `CurrentWorkSubjectSelectorPanel` | `peekEligibleEnrollmentChildren` → on miss, its **own raw `fetch`** | `LoadState` (`loading`/`ready`/`none`/`error`) | reads the envelope's `error.message`; transport `catch` → default copy |
| Warm trigger | `warmCurrentWorkCapabilitiesForActions` / `warmCurrentWorkCapabilityOnIntent` (`subject_selector` branch) | calls A | best-effort |

The race: intent warms → operator clicks before the warm settles → peek misses (the warm value lands
only on resolution) → the panel starts a second, equivalent backend operation.

**The panel was not careless.** It needed strictly more than A returned. Panel states and their sources
before this slice:

| State | Source |
|---|---|
| `loading` | no warm peek hit yet |
| `ready` | `json.data.subjects` non-empty and `status !== "none"` |
| `none` | `status === "none"` or zero subjects; message from `json.data.message`, else default copy |
| `error` (API) | `!res.ok \|\| json.ok === false`; message from **`json.error.message`**, else default copy |
| `error` (transport) | `fetch` threw; default copy |

Caller A collapsed the middle two of those into one `null`. Joining it as it stood would have thrown
away the operator-facing sentence — which is exactly why this repair was deferred.

## 2. Result-contract change

`eligibleEnrollmentChildrenWarmCache` now returns the authoritative outcome and leaves presentation to
the caller:

```ts
export type EligibleEnrollmentChildrenOutcome =
    | { ok: true; value: WarmEligibleEnrollmentChildren }
    | { ok: false; failure: "api" | "transport"; code: string | null; message: string | null };
```

`failure: "api"` is the server answering `{ ok: false, error }` (or a non-2xx envelope) — its `message`
is operator-safe and the panel shows it verbatim. `failure: "transport"` is no envelope at all, so
there is no server sentence and the caller supplies its own copy.

`prefetchEligibleEnrollmentChildren` is unchanged for its callers: a `value | null` **compatibility
projection** over the same operation. No warm caller learns command-panel semantics.

Caching rule, stated: **a success is held for the TTL and is what `peek` serves; a refusal is dropped on
resolution.** The old code kept an API refusal's entry for 45 s, which would have replayed the refusal;
the new one retries.

## 3. Convergence implementation

`loadEligibleEnrollmentChildren(opportunityId)` is the single code path that performs the network
operation. Intent prewarm reaches it through the projection; the panel calls it directly, in both the
cold branch and the warm re-verify branch. The panel's own `fetch` for this answer is gone.

**Request identity is the family opportunity id** — the only parameter that changes this answer (the
route takes no others; org comes from the session). Slice 9's law is respected: the map is keyed by that
id, and nothing coalesces across subjects. The panel additionally compares the id it requested against
the id it is rendering before applying a result.

No new cache. No new inflight registry. No new endpoint. No runtime added.

**One defect fixed in passing:** the old loader read an unparseable body as `{}`, which fell through to
`status: "none"` — a failure silently becoming *"no eligible child is available"*. It is now a transport
failure. Error must not become empty, and it did.

## 4. Implementation commit

`64d79c578` — perf(runtime): give eligible-children one request owner (S8-3)

## 5. Tests

`web/tests/runtime/eligibleEnrollmentChildrenRequestConvergence.test.tsx` — **15 tests, green**. They
render the REAL panel in jsdom and count real network operations, because the defect is a second network
operation and no source assertion can observe one.

| # | Matrix item | Result |
|---|---|---|
| 1 | prewarm already settled → panel opens | 1 total request, **0 new** |
| 2 | **prewarm in flight → panel opens (primary S8-3)** | panel joins; **exactly 1** operation; correct final state |
| 3 | panel first, no prewarm | 1 request through the owner |
| 4 | success with children | two options + "Select all eligible" |
| 5 | zero eligible | `subject-blocked` with the **server's own sentence**; cached and peekable as `none` |
| 6 | API failure with message | `subject-blocked` showing *"You do not have access to this family."*; **not** cached |
| 7 | transport failure | failure state, not stuck loading, cache unpoisoned |
| 8 | retry | second attempt issues a **new** request and can succeed |
| 9 | scope separation | two families, two operations, neither consumes the other's children |
| 10 | rapid open/close/reopen | no second operation while equivalent request is in flight; a late answer for the previous subject never paints the current one |

Plus five owner-contract tests: code+message preserved, transport ≠ api, unparseable body ≠ empty, the
`value \| null` projection still holds for warm callers, and a guard that the panel grows no fetch of its
own for this answer.

The pre-existing `moveToWaitlistCommandPerformanceProjection` and `enrollmentCommandSurfaceWaitlistTour`
suites also pass unchanged (28 tests across the three files).

## 6. Planted duplicate defect

Restored the panel's independent raw fetch on a warm miss — the S8-3 defect itself.

* **2. PRIMARY S8-3** failed: `the panel must JOIN the in-flight warm, not start a second equivalent operation: expected [ …(2) ] to have a length of 1 but got 2`
* **10. rapid reopen** failed the same way (2 operations).
* **5. zero eligible** failed as a side effect: `expected undefined to be 'none'` — a panel with its own fetch never populates the warm cache.

## 7. Planted error-collapse defect

Collapsed the owner's API refusal to `{ code: null, message: null }`, with the panel's real
implementation restored so nothing masked it.

* **6. THE REPAIR-SAFETY TEST** failed: `collapsing the envelope's error to null is exactly what made this repair wait: expected 'Could not load children for this fami…' to contain 'You do not have access to this family.'`
* **8. retry** and the owner-contract test failed with it.

3 failed / 12 passed under that plant; 6 failed / 9 passed under both; **15/15 after restoring**. Each
plant was verified on the mutated line, not by grep, and the tree was confirmed back at HEAD afterwards.

## 8. Mounted request count — before and after

Same host, same session, same operator flow: select the family, **hover** "Move to Waitlist" on the
Process Card (this is the intent that warms), wait 90 ms so the click lands mid-flight, click, and
capture every `eligible-enrollment-children` request with its full URL.

| Leg | Base (`HEAD~1` files) | Repaired |
|---|---|---|
| Intent-prewarmed open (`37b9593d`) | **2** requests, same URL, 220 ms apart | **1** |
| Warm reopen (close, reopen) | 0 | **0** |
| Different subject (`cdebb801`) | **2** | **1** |
| Total across the three legs | **4** | **2** |

In every leg the panel reached `data-work-action-panel-state="subject-selector"` with its eligible child
rendered, so the request that was removed was the duplicate and nothing else. Slice 8's ×2 observation is
reproduced exactly and then closed.

**No latency claim is made.** Timing remains BLOCKED pending a quiet host; the benefit claimed here is
structural: one owner, one backend operation per effective request, preserved foreground error semantics.

## 9. Warm reopen

0 requests, both before and after — that path already worked through the peek, and the repair does not
disturb it.

## 10. Scope safety

The two subjects issued two distinct requests carrying their own opportunity ids
(`37b9593d-…` and `cdebb801-…`), and each panel rendered its own family's child
(*Pathb Certopp* vs *Patha Certfree*). Test 9 holds the same property deterministically.

## 11. Error-path evidence — stated honestly

**Test only, by choice.** The structured-failure and transport-failure paths are covered
deterministically in tests 6, 7, 8 and the owner-contract tests. They were **not** exercised against the
mounted app: there is no safe failure fixture for this endpoint, and breaking a real read endpoint on
shared infrastructure to watch an error state would be the wrong trade. Nothing was mutated for this
slice — eligible-children is a read path and only reads occurred.

## 12. S8-3 — **CLOSED**

All ten success criteria met: one inflight owner for prewarm and foreground load; a settled warm creates
no new request; panel-first works; zero-result stays distinct from failure; the structured API error stays
visible; transport failure stays retryable; identity is scope-safe; both planted defects fail their tests;
and no new cache, inflight registry or runtime exists.

## 13. Remaining map

| Item | State |
|---|---|
| S8-2 / R-018 sibling prefetch | OPEN — untouched |
| S5-4 Activity prefetch | OPEN — untouched |
| S9-1 post-mutation generation | OPEN — untouched |
| F-2 location hierarchy | OPEN — untouched |
| S3-4 | OPEN — untouched |
| D-2 / R-005 | OPEN — untouched |
| Reserved geometry (S4-1) | CLOSED (Slice 14) |
| Payload convergence (S5-3, S6-1) | CLOSED (Slices 12–13) |
| Configuration freshness | CLOSED (Slice 11) |
| **S8-3** | **CLOSED (this slice)** |

## 14. Is contained implementable runtime work complete?

**Not yet — but this was the last one whose repair was fully specified.** Every remaining item above
needs either a decision this lane has not been given (S8-2/R-018, D-2/R-005, F-2, S3-4) or a measurement
that the quiet-host block forbids (S9-1, S5-4). Nothing remains that is both specified and implementable
without one of those two inputs.

## 15. Quiet-host experiments still outstanding

1. Any latency attribution at all — every slice since Phase 0 has deferred it.
2. S5-4: whether Activity prefetch pays for itself, which is a time question by definition.
3. S9-1: the post-mutation refresh generation window.
4. The reserved-geometry window for Attendance, Health and Current Work (Slice 14 §5) — needs a
   participant-scoping surface, not a quiet host, but is measurement all the same.

## 16. Recommended next step

**S8-2 / R-018 (sibling prefetch).** It is the only remaining open item whose cause is already
attributed rather than needing a policy decision, and it sits in the same coalescing machinery this
slice just proved out — so the next slice can be as small as this one.
