---
owner: platform
status: analysis
last_reviewed: 2026-07-29
---

# Deep-link duplicate provisioning composition — ownership analysis

Baseline: staging `183c7896b` (subject-authority fix included). This is the **efficiency** half of the
deep-link problem; the correctness half is frozen in [`SUBJECT-AUTHORITY.md`](./SUBJECT-AUTHORITY.md)
and must not be reopened.

---

## 1. The execution path, established

| Question | Answer |
|---|---|
| What subject does the server layout compose? | The **default**. `[workUnitSlug]/layout.tsx` passes `requestedSubjectId: null`. |
| What subject does the client then request? | The **requested** one, from `?subject_id=` via `attentionFromUrl`. |
| Which result is discarded? | The **server's**. The seed is keyed `…/provisioning-answer` (bare); K2 consumes `…?subject_id=X`; `consumeFreshProvisioning` does an exact `cache.get(url)`, so the seed is never read. |
| Why can't the layout see the requested subject? | **Structural.** A Next App Router layout receives no `searchParams`. Next 16.0.8; the repo uses only `cookies()` from `next/headers`, and there is no supported API giving a layout the request URL. |
| Where is the subject first validated? | Inside the composer — `.find()` over org-scoped `subjectRows`. Post-fix, a miss is an honest error, never a substitution. |
| Which requests are correctness-required? | Exactly one provisioning compose for the displayed subject. Authorization, tenant scope and route identity are resolved by the gate **before** any compose; the seed is purely an optimization. |

### The constraint that eliminates the obvious answers

**`layout.tsx` never renders `{children}`.** It returns only `<WorkUnitSlugRouteHost/>`,
`<ProvisioningAnswerSeed/>`, `<RouteTimingSeed/>`. The `page.tsx` segment's output is therefore
**structurally discarded** — `page.tsx` returns `null` and documents why. So "let the page own it"
is not a small change: it requires re-parenting the shell.

## 2a. Correcting the record — the "page seed lost the race" objection does not hold

Every prior document, including two I wrote, rejected the page-boundary option by citing
`page.tsx:1-8`: *"a page-segment seed hydrates in a later streaming boundary than the shell's Surface
Host, so K2's cold-load consume can fire before it lands (measured: the seed lost the race)."*
**That citation chain is circular and the measurement behind it is confounded.**

- **No commit ever landed a page seed.** `git log --follow` on `page.tsx` shows only its creation and
  the commit that added this very comment (`d1314bb57`). The page seed was an unlanded in-session
  experiment; the comment is its only surviving artifact.
- **The iter-1 seed was never mounted.** At `d1314bb57~1` the layout already discarded `children`, so
  the page-level seed component never rendered. "The seed was not consumed" is fully explained by
  *there was no seed* — no timing information was obtained at all. The ledger itself lists this as
  co-cause 1 (`RUNTIME-V1-REALIZATION-LEDGER.md:195-203`).
- **The race half was never isolated.** It is stated conditionally ("even if mounted…") and describes a
  *blocking `await` in the page*, a different design. The TTFB regression measured that blocking
  compose, not seed placement.
- **The layout was not seeding at the time**, so "the layout wins because it is the layout" was never
  the comparison being run.

**What actually produces the ordering guarantee** is not being the layout. It is being a *render-phase
write* (`useMemo`) inside `SurfaceHostProvider`'s subtree with **no intervening Suspense boundary** —
React runs an entire render pass before any effect in that commit, and K2's consume fires from an
ancestor `useEffect` (`SurfaceHostContext.tsx:55-65` → `workUnitEntryResourceClient.ts:23-28`). The
`[workUnitSlug]` segment has no `loading.tsx`, `template.tsx`, or explicit `<Suspense>`; the only
`loading.tsx` on the path sits *above* `SurfaceHostProvider` and encloses Host and page together. A
page-segment seed satisfies the identical condition **once the layout renders `{children}`**.

**Rendering `{children}` is near-zero-risk:** `page.tsx` returns `null`, so nothing double-renders. The
cost is documentation churn plus two source-text tests
(`workUnitRouteShell.test.ts:109-118` asserts `page` matches `/return null/`).

**Honest limit:** the ordering claim is now *unrefuted*, not *proven*. It should be verified once
empirically before B is trusted — the failure mode is silent (a wasted compose, not a broken page).

| | Description |
|---|---|
| **A — page resolves search params, passes a seed downward** | Impossible as stated: the page's output is discarded, and React data flow is parent→child, so a page cannot hand anything to its layout. |
| **B — move composition to the page boundary** | Layout renders `{children}` and stops composing; `page.tsx` — which **does** receive `searchParams` — composes the requested subject once and seeds it. The Host stays in the layout. **See §2a: the recorded objection to this does not hold.** |
| **B′ — move the *Host* to the page as well** | Not needed. The ordering guarantee is not a property of *being the layout* (§2a), so the Host need not move — which also avoids risking the shell's mount stability. Listed only to record that it was considered and is unnecessary. |
| **C — extend the seed contract with a validated subject** | The contract is not the blocker; the subject never reaches the server. Contract work alone changes nothing. |
| **D — middleware forwards the subject as a request header** | Middleware already runs on this route and already builds `NextResponse.next({ request: { headers } })`. It would forward `subject_id`/`work_view_id`, which the layout reads via `headers()` and passes to the composer, which validates exactly as today. |
| **E — skip the server compose on subject deep links; one client compose** | Guarantees one compose, but the layout must *know* it is a deep link — the same blocker. Reduces to D for the detection signal. |
| **F — subject in the path** | Retired by doctrine: the `:recordId` segment was deleted in `558e4ae2a` (RA-2) precisely because it "selected the DEFAULT subject rather than the requested record". Reinstating it also fights `attention.ts`, where lens/subject/aspect are uniformly query-projected. |
| **G — double-key the existing seed** *(additional)* | The composed answer already names `answer.recordOfAttention.id`. Seed under the bare key **and** that subject's key. Zero new mechanism, zero risk (`seedProvisioning` never clobbers a fresher entry). |

## 3. Comparison

| | A | B | **B′** | C | **D** | E | F | **G** |
|---|---|---|---|---|---|---|---|---|
| One-compose guarantee | — | partial (race) | **yes** | no | **yes** | yes | yes | only when link names the default |
| Authorization safety | — | same | same | same | **same** — composer still the only validator | same | same | same |
| Tenant isolation | — | same | same | same | **same** — `gate.orgId` from session, never the header | same | same | same |
| Initial HTML usefulness | — | worse | same | — | **same** | worse (no seed) | same | same |
| TTFB | — | same | same | — | **same** | better | same | same |
| First truthful card | — | risk | better | — | **better** | worse | better | better on that one case |
| Record switching | — | risk | **RISK: Host re-parenting may break mount stability** | — | **unaffected** | unaffected | unaffected | unaffected |
| Back/forward, refresh | — | risk | risk | — | unaffected | unaffected | unaffected | unaffected |
| Stale / invalid subject | — | — | — | — | **honest error (unchanged)** | same | same | same |
| Cacheability | — | same | same | — | header enters the cache key — must be declared | same | same | same |
| Failure handling | — | — | — | — | **header absent → today's behaviour exactly** | — | — | seed absent → today |
| Architectural precedent | — | — | none | — | **none in repo** (`headers()` unused) | — | retired by RA-2 | existing seed API |
| New coordinator risk | — | none | none | — | **none** | none | none | none |
| Child-surface reuse | — | — | good | — | good | — | — | neutral |

## 4. Recommendation — **B**, after one empirical check

**Implement B: the layout renders `{children}` and stops composing; `page.tsx` composes the requested
subject once and seeds it.** Ownership lands exactly where the data already is. No new transport, no
middleware state, no coordinator, and nothing to keep in sync.

Sequence — the first step is a measurement, not a commit:

1. **Verify the ordering claim once.** Render `{children}`, put a seed in the page, and confirm the
   page's render-phase write precedes K2's consume on a cold deep link (structurally: zero
   `provisioning-answer` network requests for the displayed subject). If it does not hold, B is dead
   and **D** is the fallback — the analysis below stands unchanged.
2. Move the compose to the page with `searchParams.subject_id` → `requestedSubjectId`.
3. Delete the layout's compose so no default-subject answer is produced on any path.
4. Certify one-compose / one-subject / zero-discarded, plus the full scenario matrix.

**D remains the documented fallback**, and its analysis is unchanged: it works, introduces no
middleware-owned application state (the header transports a value the request already carries, read
once, validated by the same composer authority), and degrades to today's behaviour when absent. It is
second choice only because B needs no transport at all.

**G was implemented and then reverted.** It is a real, free, zero-risk win *only while B does not
exist* — and it would be redundant machinery the moment B lands. Recorded here rather than shipped.

**Why not the others:** **A** is impossible (page output discarded, and data flows parent→child);
**C** does not address the blocker; **E** reduces to D for the detection signal; **F** was retired by
RA-2 doctrine and fights `attention.ts`'s uniform query projection.

**Not claimed:** that B improves cold timing measurably on this host. Its guarantee is structural —
one compose, one subject, no discarded answer.

## 5. Correction to previously published documents

`PE3-ARCHITECTURE-OPTIONS.md` §2 O1 ("Rejected on existing evidence") and
`CP1-ENRICHED-VM-WATERFALL.md` §5, both written by me, rejected the page-boundary option on the
circular citation described in §2a. **Those rejections are withdrawn.** The tracker's D-005 decision
record cites the same "iter-1/iter-2 measurements" and should be read with §2a alongside it.
