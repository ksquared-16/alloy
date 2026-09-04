---
owner: platform
status: sprint
last_reviewed: 2026-09-03
---

# Installed-runtime acceptance — pre-promotion baseline

Recorded BEFORE the merge, so "the running process is serving the promoted
code" is a measured before/after rather than an assertion.

Proving that a Gateway serves new code by observing that the new code is
*present in Git* is the exact mistake this baseline exists to prevent — the
running process resolves through `~/.local/share/alloy/toolkit/current`, and
until that pointer moves and the process restarts, staging can be arbitrarily
far ahead of what is being served.

## Host state at baseline

| Fact | Value |
|---|---|
| Gateway launchd label | `com.alloy.vacilando-gateway` |
| Host process | pid 61143 → `toolkit/current/lib/vacilando-gateway-host.mjs` |
| Server child | pid 61150 → `toolkit/b422578b410e/lib/vacilando-server.mjs --port 3030` |
| `toolkit/current` → | `toolkit/b422578b410e` |
| Installed source commit | `b422578b410e5169b482e151b06ff151191af424` (`origin/staging`) |
| Installed at | 2026-09-03T23:59:40Z |

## Measured "before"

```
GET /api/v2/views/home   →  {"ok":false,"error":"unknown_v2_route","path":"/api/v2/views/home"}
GET /api/lanes           →  {"ok":true,"lanes":[ … 18 real lanes … ]}
```

Browser, authenticated with the real session cookie at 1440×900:

```
login overlay hidden : true
V2 primary nav present : false     ← the promoted shell is NOT being served
lane rows rendered   : 18          ← the OLD UI is being served, with real data
```

So the gateway is healthy, authenticated and serving real runtime state — and
is demonstrably serving the **pre-promotion** bundle. Any post-promotion run
that shows `/api/v2/views/home` answering `ok:true` and `.vnav-item` present is
therefore serving promoted code, not cached Git content.

## Regression baseline (matched real git worktrees, serial)

| Tree | Result |
|---|---|
| `origin/staging` | PASS=79 FAIL=4 |
| candidate rebased onto it (`e174db0e8`) | PASS=80 FAIL=4 |

Same four known suites; one new passing suite; zero new failures.
