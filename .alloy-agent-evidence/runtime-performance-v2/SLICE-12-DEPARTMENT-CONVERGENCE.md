---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 12 — department configuration convergence (S6-1)

**Lane** `lane_73a897409906` · **Run** `erun_5e56b81e89dbb331` · base `a8cbb151d` · commit **`ff18bed4a`**.

No latency claim. `typecheck rc=0`; **47 tests pass** across 4 suites.

---

## 1. The existing owner

`workspaceNavTreeCache` — it fetches `/api/admin/departments` through `dedupeAdminFetch`, parses
`dj.items`, retains them as `memorySnapshot.depts`, and persists the snapshot to sessionStorage.

**Measured on the mounted tenant:** 4 departments, one carrying **30 KB** of metadata; the nav-tree
sessionStorage entry is **50 KB and already contains it** (`navSessionHasDeptMetadata: true`).

**So the bytes were never discarded at runtime — only the TYPE discarded them.**
`WorkspaceNavTreeDept` was `{ id, name, key? }`, so nothing could read the metadata that was sitting
in memory. Declaring the field is the entire retention change; no second owner, no new cache.

## 2–3. Retention and freshness

The owner now exposes exactly three things: `peekRetainedDepartmentConfig(departmentId)`,
`retainedDepartmentConfigForDepartment(id)` and `retainedDepartmentConfigIds()`.

Freshness follows the Slice 10/11 policy: **90s TTL**, expiry means *revalidate in the background*
rather than *stop answering* (`usable: true, fresh: false`), and a failed refresh leaves
`memorySnapshot` untouched so the last known value stays usable and the next call retries. **No
department publish event, BroadcastChannel or subscription was invented** — Slice 10 decided TTL plus
revalidation is sufficient for this class.

## 4. Scope / identity contract — and a design correction

**The original plan does not survive contact with the routing.** The client cannot resolve the
department for a work-unit route slug: `/workspace/work-unit/all` resolves **server-side** to
`lifecycle_wu_lead`, and no client-side mapping from `all` to a department exists. A first attempt
that looked up the nav tree by slug silently asserted nothing — measured as `dept_config` absent on
every request.

**The contract was inverted instead:** the client names the departments it *holds*
(`?dept_config=<uuid>[,<uuid>]`, bounded to 8, parsed server-side against `/^[0-9a-f-]{36}$/i`), and
**the server** matches them against the department this answer actually resolved
(`wuRow.department_id`). The client never has to know the mapping, and **an unheld department is a
hard miss** — scope mismatch cannot suppress the embed.

It rides the URL deliberately: that string is the coalescing key, the intent-warm key and the
consume-once key, and the answer's content depends on the flag — so it must be part of the identity,
or a "client holds it" answer could later be served to a client that does not. Both provisioning
paths compute it from the same owner, so a prewarm and the click that consumes it still coalesce.

## 5–7. Omission, fallback and precedence

```
omitDepartmentMetadata = clientHoldsLiveDepartmentConfig && !placement
```

**The pin is the reason for the second half.** With a governing revision (D-96) the embedded value is
live metadata with `lifecycle_builder_v1` **replaced** by the pinned payload. Substituting the
client's live copy would silently defeat the pin — the exact regression those comments exist to
prevent. So a pinned subject keeps embedding, whatever the client claims.

When it omits, the answer carries `departmentMetadataRef: { departmentId }` — a scope-exact handle,
because `OperationalContext` has no department identity of its own.

**Precedence: EMBEDDED wins; retained fills only the gap.** This is deliberately the opposite of the
instruction's default, and the lifecycle is the proof: the server omits only when it has established
the copy IS the live record, so a present embedded value may be pin-composed and is authoritative for
that subject. The two values are never merged.

## 8–9. Commit and tests

`ff18bed4a` — 9 source files + `departmentConfigConvergence.test.ts` (**11 tests**).

Covered: usable/hard-miss by department · nothing retained (cold) · only departments that actually
carry configuration are named · fresh inside TTL · **usable past TTL** · and five source locks: the
pin refusal, the scope-exact ref, the server-side department match, strict claim parsing, and the
embedded-wins precedence.

**The pin lock binds** — removing `&& !placement` fails exactly *"never omits when a pinned revision
governs this subject"*, and nothing else.

## 10–13. Bytes

| Path | Before | After |
|---|---:|---:|
| Warm provisioning (subject A) | 99 KB | **70 KB** |
| Warm provisioning (subject B) | 97 KB | **67 KB** |
| `departmentMetadata` in answer | 30 KB | **0** (+ ~60-byte ref) |
| Rest of the answer | — | **byte-identical** |
| Mounted warm session, provisioning total | 1383 KB | **1086 KB** |

**No new request was introduced** — the saving is not relocation. The only addition is the
`dept_config` query parameter (~40 bytes per request).

**Cold/deep-link:** with `/api/admin/departments` blocked, **0 of 7** provisioning requests asserted,
average **90 KB** (the copy stays embedded), and Current Work rendered with its full action set, 6
cards, 7 rows — **no blank, no wait, no extra fetch**.

## 14–15. Current Work equivalence and deep link

Warm (retained) vs cold (embedded), same subject:
**`CURRENT WORK EQUIVALENT: true`** — identical text, identical buttons
(`Contact Family`, `Tour ▾`, `Move to Waitlist`, `Add Child`, `Record outcome`), identical card count.

Deep link into `/workspace/work-unit/all` without workspace boot: correct in both variants — when the
owner happens to be populated it asserts truthfully, and when it cannot populate it embeds.

## 16. Failed revalidation

Proven at the owner: an entry older than the TTL still reports `usable: true` and returns its
metadata (`fresh: false`), and a failed `loadWorkspaceNavTree({force})` leaves `memorySnapshot`
untouched so the value remains usable and retryable.

## 17. Slice 8 mutation — convergence unchanged

`ensure → verify (clean) → mount → real three-step Move to Waitlist → converge → reset → ensure →
verify (clean, no findings)`.

| | Result |
|---|---|
| Counts | New **3 → 2**, Waitlist **16 → 17**, All unchanged |
| Row | Lead → **Waitlist** at ~5s |
| Pills | converge at ~7.5s |
| Cards / rows | **6 / 7** throughout |

Identical to the Slice 8 baseline. **Retained department configuration did not make subject runtime
truth stale** — which was the explicit risk this rerun existed to test.

## 18. Frame harness

Across A→B→C→A, rapid A→B→C→D and the refusal sequence: **rows 7/7 in every leg**, **one panel
height in every leg**, Financials reserved at 325/120 with no 69px collapse, no stale values, titles
forward-only, refusal containment intact.

More legs landed on refusal subjects than in Slice 4 because `reset`+`ensure` mints fresh records and
shifted the row indices the harness selects by position — the invariants are what matter and they
held.

## 19–20. Status

**S6-1: CLOSED.** Retention, freshness, omission, scope-exactness, fallback and precedence are
implemented and certified; warm answers drop ~30 KB with no new request and no cold-path cost.

**S5-3: unchanged — still one prerequisite.** The provisioning seed still ships a bare `{doc}` and
must carry `{id, version}` before `(scope, version)` omission is expressible. Slice 12 did not touch
it.

## 21. Ranking

| Rank | ID | State |
|---|---|---|
| ~~P2~~ | S6-1 | **CLOSED** `ff18bed4a` |
| P2 | S5-3 | one prerequisite: seed `{id, version}` |
| P2 | S9-1 · S8-2 | carried |
| P3 | S8-3 | repair specified, needs failure-path tests |
| P2/P3 | S5-4 · S4-1 · F-2 · S3-4 · D-2/R-005 | carried |
| — | S7-1 | closed on the Focus Panel owner; generalisation per-owner |

## 22. Recommended Slice 13

**S5-3** — the last payload item, and now genuinely mechanical: add `{id, version}` to the seed, then
omit the document when the client's `(scope, version)` matches. The owner side was certified in
Slice 11 and the omission protocol shape is now proven twice (Slice 6's `process`, Slice 12's
department metadata).

**Then S4-1** — five cards, contract already exported, the cheapest remaining improvement.

The two prefetch questions (**S8-2**, **S5-4**) still need the quiet-host window and should not be
attempted before it.
