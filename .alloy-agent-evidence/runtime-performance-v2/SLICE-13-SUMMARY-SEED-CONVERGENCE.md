---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 13 — summary-document seed convergence (S5-3)

**Lane** `lane_73a897409906` · **Run** `erun_9467ccaa66258144` · base `296828028` · commit **`fbce80d9d`**.

No latency claim. `typecheck rc=0`; **57 tests pass** across 5 convergence suites.

---

## 1. Producer / consumer map

| Role | Where |
|---|---|
| Server composer | `workUnitProvisioningAnswer.ts` — `resolvePublishedFocusPanelSummaryRecord(rows, { workViewId, stageKey })` |
| Answer type | `FocusPanelSummaryDocProjection` |
| Surface model | `ProvisionedWorkUnitSurface` → `summaryDocSeed` |
| Context | `OperationalSubjectContext` |
| Panel | `InlineOpportunityFocusPanel` → `seed={operational.summaryDocSeed}` |
| Owner | `usePublishedFocusPanelSummaryDoc` (scope-keyed cache, Slice 11 freshness) |

**The identity was already in hand and thrown away:** the resolver returns an `EntityLayoutRecord`
(with `id` and `version`) and the composer took `?.doc` only.

**A runtime branch that mattered:** the hook did `if (!fetched.loaded && seed) return { doc: seed.doc, loaded: true }`.
A seed without a document would therefore have been reported as **loaded with `doc: undefined`** — a
blank Summary. Found by tracing the branch, not the type.

## 2–3. Seed contract and identity

```
before:  { doc }
after:   { id, version, doc? }        // doc omitted only when the client already holds this record
```

Identity is the authoritative `entity_layouts` row — **`id` AND `version`**, never a version alone
and never a document hash. Two published records can share a version number; matching on version
alone would serve one record's document for another.

## 4–6. Client claim, server validation, request key

The client sends `?summary_cfg=<id>:<version>[,…]` (bounded to 8, sorted). The server parses it
strictly (`/^[0-9a-f-]{36}:\d{1,9}$/i`) and omits **only** when the record *it* resolved for this
subject's scope matches a claimed pair:

```ts
const summaryHeldByClient =
    summaryRecord != null
    && typeof summaryRecord.version === "number"
    && (req.summaryConfigHeldIds ?? []).includes(`${summaryRecord.id}:${summaryRecord.version}`);
```

**This is what makes scope safe without the client knowing the scope.** A subject whose stage
resolves a different published variant yields a different `id`, so the claim cannot match and the
document is included. The client never has to model the scope axes the server uses.

The claim is part of the provisioning URL, preserving the Slice 2 coalescing law established for
`dept_config` in Slice 12: an answer that may omit the document and one that may include it are not
equivalent, so they must not share a key. It is sorted, so a prewarm and the click that consumes it
still coalesce.

## 7–9. Cold / warm / mismatch — measured

| Request | Answer | Seed | `doc` present |
|---|---:|---:|---|
| **Cold / unheld** | **100 KB** | 27 KB | **yes** (+ id, version) |
| **Warm exact match** | **72 KB** | 0 KB | **no** (identity only) |
| Wrong **version** | 100 KB | 27 KB | yes |
| Wrong **id** | 100 KB | 27 KB | yes |

**Saving 27 KB warm. Rest of the answer byte-identical.**

## 10. Pin / revision finding — proven, not assumed

**No pin mechanism exists for the Summary document.** The composer reads published org layouts
(`listOrgLayouts` → `resolvePublishedFocusPanelSummaryRecord`) and selects a *variant*; there is no
governing-revision overlay anywhere in that resolver, unlike `departmentMetadata` where the embedded
value is live metadata with `lifecycle_builder_v1` replaced by a pinned payload (Slice 12). So the
record the client holds and the record the answer resolved are the same kind of thing, and no
omission refusal is required here. Checked rather than inherited from Slice 12.

## 11–12. Commit, tests, planted defects

`fbce80d9d` — 6 source files + `summaryDocSeedConvergence.test.ts` (**10 tests**).

**Both mandated plants bind:**

| Plant | Result |
|---|---|
| **version-only matching** (`.some(v => v.endsWith(':' + version))`) | **2 tests fail**, incl. *"claims id:version pairs, never versions alone"* |
| **claim dropped from the request key** | **2 tests fail**, incl. *"changes the URL…"* and *"distinguishes different held identities"* |

Also locked: server compares against its own resolution; identity is always carried while only the
document is omitted; strict parsing; a doc-less seed is never treated as rendered; an omitted
document is resolved from what is already held rather than refetched.

## 13–16. Journey bytes and the no-new-fetch rule

Mounted, five selections after boot:

| | Result |
|---|---|
| provisioning requests asserting `summary_cfg` | **21 of 21** |
| **layout fetches** | **2 total** (1 at boot, 1 for a genuinely new stage scope) |
| provisioning total | 821 KB across 21 requests (~39 KB avg) |

**The bytes were removed, not relocated.** Layout fetches did not grow per selection — the hook
resolves an omitted document from the slot already holding that `id:version`, across scopes, because
scope selects *which* record applies and does not change what a record *is*.

**No new request was introduced**; the only addition is the `summary_cfg` parameter.

**Cold/deep-link remains self-contained:** with no claim, the answer carries `id + version + doc`, so
Focus Panel settlement needs no extra configuration fetch.

## 17. Invalidation regression

With the warm omitted-doc path active, firing the Slice 11 runtime event produced **exactly one
scoped layout refetch and nothing else**. Continuity byte-identical: rows 7 → 7, cards 6 → 6, same
subject, same header, same card composition, same panel height. No Work Unit teardown, no VM or
provisioning storm.

## 18. Frame harness

Across A→B→C→A, rapid A→B→C→D and the refusal sequence: **rows 7/7 and one panel height in every
leg**, Financials reserved at 325/120 with no collapse, no stale values, titles forward-only, refusal
containment intact, and **no summary-card disappearance** (6 cards on every valid subject).

## 19–20. Status

**S5-3: CLOSED.**

| Rank | ID | State |
|---|---|---|
| ~~P2~~ | S5-3 | **CLOSED** `fbce80d9d` |
| ~~P2~~ | S6-1 | CLOSED (Slice 12) |
| P2 | S9-1 · S8-2 | carried |
| P3 | S8-3 | repair specified, needs failure-path tests |
| P2/P3 | S5-4 · S4-1 · F-2 · S3-4 · D-2/R-005 | carried |
| — | S7-1 | closed on the Focus Panel owner; generalisation per-owner |

## 21. Recommended Slice 14

**S4-1 — reserved-geometry adoption for the five remaining cards.** It is the only contained,
implementable item left: the contract is already exported, the pattern is certified, and Slice 3
measured the latent collapse. Everything else outstanding either needs the **quiet-host window**
(S8-2 sibling prefetch, S5-4 Activity prefetch, D-2/R-005) or is a small follow-up with a failure
path to test (S8-3).

## 22. Is direct payload-convergence work COMPLETE?

**Yes, for everything the evidence supports.** The three duplications this programme proved by hash
are all closed:

| | Was | Now |
|---|---:|---:|
| `process` record (Slice 6) | 26 KB | 0 |
| `departmentMetadata` (Slice 12) | 30 KB | 0 warm |
| summary `doc` (Slice 13) | 27 KB | 0 warm |
| **Provisioning answer** | **~126 KB** | **~72 KB warm** (−43%) |

What remains in the answer is subject-specific truth. The two large items still untouched — the
drawer VM's overlapping workspace regions and `activity?limit=100` — are **not** duplication of the
same bytes: the drawer VM was deliberately held while this boundary moved, and Activity has no cursor
so it cannot be reduced without a load-more contract. **Both are policy questions for the quiet-host
window, not payload convergence.** Further shrinking of genuinely subject-scoped fields is not
supported by any evidence this programme has produced.
