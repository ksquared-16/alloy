---
owner: engineering
status: qa-certification
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
port: 3014
scope: Continuity + Locations inheritance + nested concerns + Configuration Object Runtime (pre-Programs)
---

# Organization Runtime — Operator QA Certification

**Mode:** Certification (not architecture, not Programs).  
**Localhost:** http://localhost:3014  
**Branch:** `agent/cursor/4-org-runtime-realization`

Use DevTools console + Network. Note route, steps, expected vs observed, console errors, failed requests.

---

## Login

1. Open http://localhost:3014/login  
2. Sign in with a **portal-eligible** staging/local admin (or ops) account for the org under test.  
3. After login, go to http://localhost:3014/organization  

Slot QA identity *alias* (label only): `ALLOY_SLOT_4_QA_IDENTITY` — passwords are never stored in config. Optional capture: `alloy-agent-login 4`.

**Seed:** No special seed for this certification. Use existing org data with ≥2 Locations and nested concern content where possible (rooms/programs/schedule/placement/access).

---

## Checklist

### Organization / Continuity

- [ ] `/organization` loads (domain cards / landing)
- [ ] First nav to Locations feels continuous (soft-nav; no full app remount flash if Continuity applies)
- [ ] Repeat nav Organization → Locations → Organization — selection/context retained where expected
- [ ] Browser **Back** restores prior Organization/Locations state without blank flash
- [ ] Browser **Forward** restores forward target correctly
- [ ] Hard refresh on Organization recovers cleanly

### Locations

- [ ] `/organization/locations` loads collection + detail without a prolonged full-page “Loading locations” gate (warm Continuity / peek)
- [ ] Programs concern shows existing location offerings (not false-empty when API/schema drifts)
- [ ] Switch Location A → B — detail updates; no stale A content stuck
- [ ] Switch concerns/tabs (overview, rooms, programs, schedule, tours, placement, access, …)
- [ ] Concern switch + Location switch interleaved — no cross-talk / wrong cache
- [ ] Retained selection: leave Locations, soft-return — same location (+ tab/item if retained) restores
- [ ] Hard refresh with `?locationId=` (and tab if present) restores selection from URL
- [ ] Browser history: location/tab changes participate in Back/Forward

### Editing

- [ ] Enter edit on a safe field
- [ ] **Save** — persists; UI reflects saved value; no double-refresh thrash
- [ ] **Cancel** — discards draft; prior value restored
- [ ] After save, soft-nav away and back — saved value still shown

### Performance / polish

- [ ] Perceived speed acceptable on Location switch and concern switch
- [ ] No false **empty** states while loading
- [ ] No large layout shifts / content jump on reveal
- [ ] No loading flash that clears valid warm content before replacement is ready
- [ ] Console clean of runtime exceptions / failed module imports on happy path
- [ ] Network: no obvious duplicate storm on single Location or concern change

### Out of scope (do not block on)

- Programs as Configuration Object consumer (Checkpoint D)
- Commercial / Tuition / Funding migration
- Configuration Object harness on nav

---

## Startup verification (agent)

| Check | Result |
|-------|--------|
| Server | toolkit-owned `alloy-dev-start` on **3014** |
| `/login` | 200 |
| `/organization`, `/organization/locations` (unauth) | 307 → `/login` |
| `verify:module-imports` | ok |
| Auth storage | operator signs in (or `alloy-agent-login 4`) |

---

## Feedback loop

Report issues with: **route**, **steps**, **expected**, **observed**, **console**, **network**.  
Agent stays in implementation mode for focused fixes + local commits only (no push/merge).
