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

**Typecheck: NOT PROVEN LOCALLY.** `tsc` is SIGTERM-killed (exit 144) in this
sandbox with no output. `web/tsconfig.search.json` is committed so CI can run it.
CI is the only real typecheck here.

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

**These four are proven by automated tests only.** Certifying them live needs
either a seeded fixture tenant or additional data in the shared tenant, plus a
second restricted QA identity. That is the main outstanding certification debt.

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

## Caveat on this run

Playwright's error output printed a Supabase session cookie into the run log
while diagnosing a failure. The affected local/staging session should be treated
as exposed and rotated. Subsequent commands filtered that output.
