---
owner: platform
status: sprint
last_reviewed: 2026-08-10
supersedes: []
---

# Search Platform V2 — certification report

**Branch:** `agent/claude/6-search-platform` · **Base:** `origin/staging` @ `e26cb49db`
**Environment:** slot 6 dev server (`localhost:3016`), Next.js dev mode, **remote**
Supabase, live shared tenant (Firefly Early Learning). QA identity
`qa-slot6-experimental@example.com`.
**Evidence:** `web/playwright/evidence/search-v2/*.png`

No fixtures were seeded. All managed worktrees write the same live tenant, so
seeding the Smith household would have polluted shared data. Certification ran
against whatever the tenant actually contains, and the gaps that creates are
recorded honestly below rather than papered over.

---

## Automated

**53 tests pass** (`web/tests/search/`):

| Suite | Tests | Covers |
|---|---|---|
| `searchQueryIntent.test.ts` | 14 | intent split, Tenant A/B anti-hardcoding control |
| `searchPlatformV2.test.ts` | 27 | all five scenarios, duplicate names, permissions, configuration, doctrine |
| `searchProcessConfigurationCache.test.ts` | 5 | cache TTL and both isolation axes (org, access scope) |
| `searchRouteContract.test.ts` | 7 | auth-before-search, scope pass-through, error non-leakage |

Plus 82 pass across the search-adjacent suites (`tests/admin/globalSearch`,
`tests/adminV2/globalRecordSearchWarmPrefetch`) with no regressions.

**Typecheck: PROVEN BY CI, not locally.** `tsc` is SIGTERM-killed (exit 144) in
this sandbox with no output, so CI is the only authoritative gate. It caught five
real TS2345/TS2322 errors in `tests/search/searchPlatformV2.test.ts` that no local
run could have surfaced — `openDim` was inferred with literal `siteScope: "all"`,
which became the `run()` helper's parameter type and made every restricted-scope
call unassignable. Fixed by typing both fixtures and the parameter as
`AdminAccessScopeDimensions`.

Authoritative CI state on head `0a0b4513c`, rebased onto `origin/staging`
`5318035cd`:

| Gate | Result |
|---|---|
| Production graph (production TypeScript) | **pass** |
| Full graph (tests + scripts TypeScript) | **pass** |
| Docs lint (narrow blocking) | **pass** |
| Docs lint fixtures | **pass** |
| P1 certification gates | **pass** |
| Trust Adoption certification | **pass** |
| Trust DB certification | **pass** |

`mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, 0 commits behind staging.

---

## Browser — certified against the live tenant

All 9 certification tests pass (`search-v2-certification.spec.ts`).

| # | Scenario | Result |
|---|---|---|
| 1 | Child subject + recognition + destinations | **PASS** — `Lennon Kurzman / Child · Kurzman Family / Enrollment — Waitlist`, destination pills rendered |
| 2 | Household subject | **PASS** — `Kurzman Family / Household / 2 children` |
| 3 | Schedule intent does not break the query | **PASS** — `Lennon schedule` still returns Lennon (V1 returned nothing for this shape) |
| 4 | Process intent by configured label | **PASS** — `Lennon enrollment` keeps Lennon, promotes Enrollment |
| 5 | Household query returns members at child grain | **PASS** — household + both children + both parents, each child with its own process context; household carries no schedule |
| 6 | Campus subjects | **PASS** — North / South / West Campus |
| 7 | Keyboard select and open | **PASS** — ↑↓ + Enter dismisses and opens the canonical surface in place |
| 8 | Empty state | **PASS** — "No matching results." |
| 9 | Tenant certifiability report | **PASS** |

Process labels ("Enrollment") and stage labels ("Waitlist") were resolved from
**real `process_instances` rows joined to published configuration** — not from
anything hardcoded.

---

## Browser certification — COMPLETE (disposable tenant)

Run against the disposable certification tenant (`certification/alloy-certify`,
org `northwind-early-learning`, LOCAL Supabase on 54422) with the fixtures in
`certification/search-platform/`. Evidence:
`certification/evidence/search-platform/`.

| Scenario | Result |
|---|---|
| Sibling schedule grain — `Joe Smith schedule` | **PASS** — Joe's own `Mon / Wed / Fri`, promoted by intent |
| Sibling schedule grain — `Smith schedule` | **PASS** — Joe `Mon / Wed / Fri`, Emma `Tue / Thu`, household shows "2 children with active schedules" and carries NO schedule |
| Multi-process child | **PASS** — one Joe subject with Enrollment / Annual Registration / Subsidy Renewal, configured stage labels (Enrolling, Needs documents, Review due) |
| Duplicate-name disambiguation | **PASS** — Smith vs Rivers household, no ids or schema words in operator text |
| Permission-restricted absence | **PASS** — Lakeside Joe and his household absent for the restricted operator |
| Restricted positive control | **PASS** — the same operator DOES see Riverside subjects, so the absence above is scope, not emptiness |
| Consumer regression (API) | **PASS** — every subject exposes a primary destination naming a real record |
| Consumer regression (POS surface) | **PASS** — surface renders against Search V2 |

Process and stage labels were resolved from a genuinely **published** revision,
not a hand-written projection.

**No fake Schedule destination was introduced.** Schedule ranks and displays as a
context; the destinations on a child row remain `Enrollment` and `Household`.

## Performance baseline

Measured on the certification tenant with a LOCAL database, 30 warm samples over
10 distinct queries:

| Metric | Value |
|---|---|
| Cold request | **827 ms** |
| Warm min | **54 ms** |
| Warm **p50** | **63 ms** |
| Warm p95 | **258 ms** |
| Warm max | **306 ms** |
| Warm mean | **105 ms** |
| Samples / results | 30 requests, 90 results |

This settles the previous sprint's open question. There, p50 was ~1.9 s against a
REMOTE Supabase; here the same code answers in 63 ms against a local one. The
latency was environment round-trip, not Search work — so no speculative caching
was added on the strength of a benchmark.

Almost no request crossed the 250 ms `[admin-timing]` warn threshold, which is
why the server log is nearly silent: only the p95 outliers would have logged.

**Production-build measurement was NOT obtained.** `next build` was SIGTERM-killed
on this host (exit 144), the same resource ceiling that kills `tsc`. The numbers
above are a dev-server build against a local DB and should be read as a
lower-bound baseline, not a production claim.

## Defects found BY certification

1. **A child with no `persons` row opened the household.** Real children in this
   tenant have `person_id = null`. My subject resolver went person → household,
   dropping V1's middle step, so clicking a child opened the FAMILY. Restored
   person → participation record → household. Two regression tests added.
   Before the fix: Enter dismissed the dropdown and nothing opened. After: the
   drawer opens and binds to the correct record (BOS reports
   `Subject: Kurzman Family`).

2. **Search took ~1.4s server-side, including for zero results.** Measured, then
   root-caused from the dev-server log rather than guessed — the configuration
   read sat on the critical path of every keystroke against a remote DB at
   ~400-500ms per round trip. Now cached for 30s, keyed by org and access
   fingerprint. Warm `total_ms`: **374-431ms**, from 1078-1544ms.

3. **Redundant recognition metadata.** `North Campus · Campus · North Campus` and
   `Primary Contact · … / Primary contact · …`. Both suppressed.

---

## Performance measured

| Metric | Value |
|---|---|
| Server-side `total_ms`, warm | **374-431ms** |
| Server-side `total_ms`, before optimisation | 1078-1544ms |
| Server-side `total_ms`, cold cache | 1196-2939ms |
| Client-observed p50 (dev mode, incl. ~380ms proxy) | ~1.8s |
| Next.js compile contribution | ~4ms (negligible) |

The residual client-observed latency is dev-mode overhead plus remote-DB RTT, not
search work. This has **not** been measured against a production build or a
co-located database, and should be before any performance claim is made publicly.

---

## Credential exposure on this run — disposition

While diagnosing a Playwright failure, the framework's error log printed the
signed-in Supabase session cookie (project ref `ikaxilmwmrmbagoidedu`) into the
run output. Note the session belonged to the **operator's own account**, not the
`qa-slot6-experimental@example.com` alias the toolkit names — sign-in was manual.
All subsequent commands filtered that output, and the secret was not re-read.

**Done:** the captured storage state at
`~/.local/state/alloy-dev/auth/slot6/storage-state.json` was deleted, so no tool
will silently reuse the exposed session (`alloy-agent-ready 6` now reports
`auth state: missing`).

**Not sufficient on its own.** Deleting the local copy does not revoke anything
server-side, and the refresh token in that session outlives the ~1h access token.
The toolkit exposes no logout/revoke command (`alloy-agent-*` has login, close,
browser-stop — nothing that invalidates a session).

**Minimum operator action required:** revoke that user's sessions in Supabase —
Dashboard → Authentication → Users → the account → sign out all sessions (or a
password change, which also revokes refresh tokens). This cannot be done from the
agent without the operator's credentials.

**Prevention:** Playwright's `apiRequestContext` error output includes request
headers. Certification specs that hit authenticated endpoints should scrub
output, or the runner should set a redaction filter, so a future failure does not
reprint a session.
