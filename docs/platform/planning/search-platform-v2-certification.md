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

## NOT certified in the browser — tenant lacks the data

Test 9 measured this rather than assuming it:

| Case | Requirement | Tenant reality |
|---|---|---|
| Case 3 (sibling schedules) | ≥2 siblings with different schedules | **0** subjects have any schedule context |
| Case 4 (three processes) | ≥1 subject in ≥3 processes | **0**; every subject has exactly one (Enrollment) |
| Duplicate-name disambiguation | ≥2 accessible same-named people | **0** duplicate display names |
| Permission-restricted absence | a restricted operator | not exercised — no second QA identity with narrower scope |
| Staff | canonical staff model | none exists in the platform |

**These four are proven by automated tests only.**

**Correction to an earlier framing in this report's first draft:** the repository
DOES have a sanctioned disposable fixture mechanism for exactly this —
`certification/alloy-certify`, an isolated local operator tenant (Supabase project
`alloy-cert`, seeded org `northwind-early-learning`, ports 544xx), explicitly "no
production tenant, no shared hosted tenant".

So this is **actionable certification debt, not an absent capability**. Closing it
means seeding four fixtures into the local cert tenant — sibling schedules, a
subject in ≥3 processes, two same-named accessible children, and a site-restricted
operator — and re-running `search-v2-certification.spec.ts` against it.

It was NOT done inside this promotion closeout because bringing up the cert stack
touches the one shared local Docker stack and port 3011, which slot 1 currently
holds. That is a scheduling conflict, not a technical blocker, and it is a
separate certification pass rather than a merge prerequisite.

---

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
