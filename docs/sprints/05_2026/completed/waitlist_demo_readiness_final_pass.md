# Waitlist Demo Readiness — Final Pass

**Status:** Sprint closed (Cards 0–5 — 2026-05-28)  
**Depends on:** [Waitlist priority fact truth](waitlist_priority_fact_truth_child_scope.md), [Phase 2 pilot playbook](waitlist_orchestration_phase2_pilot_playbook.md)

---

## Goal

Make the waitlist system **cleanly testable and demo-ready** without expanding into billing, scheduling, rates, or capacity.

**Non-goals:** lifecycle re-architecture, work-unit redesign, ranking engine changes, forms intake redesign, `shadow_mode: false` activation, site-scoped program/rate catalog.

---

## Card 0 — Audit summary

| Area | Finding |
|------|---------|
| Demo seeds | `placement_priority_demo_v1` (legacy metadata flags); no unified waitlist demo batch |
| Cleanup | `resetStagingDemoData` skips `placement_*` tables; org-wide wipe is unsafe for pilot |
| Markers | No `demo_batch_key` convention — **added `waitlist_demo_v1`** on `metadata.demo_batch_key` + `demo_seed_package` |
| Person drawer | `employee_placement` block exists; layout generic enough with Card 2 polish |
| Settings locations | Legacy `/admin/locations` flat list; **no AdminV2 hierarchy** until Card 3 |
| QA | `qa:waitlist:v2`, `priority-facts`, `override`, `trace` — no demo orchestrator until Card 4 |

---

## Card 1 — Controlled demo cleanup + reseed

### Batch key

`demo_batch_key: waitlist_demo_v1` (also `demo_seed_package` for compatibility with existing wipe patterns).

### Cleanup

```bash
cd web
ORG_ID=<uuid> DRY_RUN=1 npm run dev:clean:waitlist-demo
ORG_ID=<uuid> WAITLIST_DEMO_APPLY=1 npm run dev:clean:waitlist-demo
```

Deletes only rows tagged with the batch key (FK-safe order):

- `placement_overrides` → `placement_candidates` → `activity_log` (demo opps) → `opportunity_customer_members` → `opportunities` → household links → `customers` / `persons` → demo `locations` (units, then sites)

**Safety:** Requires `WAITLIST_DEMO_APPLY=1`; refuses `VERCEL_ENV=production`.

Implementation: `web/lib/orchestration/placement/waitlistDemoCleanup.ts`, `web/scripts/cleanWaitlistDemo.ts`.

### Seed

```bash
ORG_ID=<uuid> npm run dev:seed:waitlist-demo
ORG_ID=<uuid> DRY_RUN=1 npm run dev:seed:waitlist-demo   # plan only
```

**Scenarios (8):**

| Scenario | What it proves |
|----------|----------------|
| `employee_parent` | `persons.is_employee` → staff tier |
| `same_site_sibling` | Enrolled sibling + waitlisted child, same OCM site |
| `sister_site_sibling` | Enrolled at South, waitlisted at North |
| `multi_child_cohorts` | Two waitlisted children, infant + preschool |
| `manual_adjustment` | Active pin override after backfill |
| `forecast_hint` | `placement_forecast_v1` on candidate metadata |
| `general_waitlist` | Baseline waitlist family |
| `missing_site_cohort` | Diagnostic — no OCM site/cohort |

Also ensures North/South demo **sites**, patches work unit to **V2 + `shadow_mode: true`**, runs placement candidate backfill.

Implementation: `web/scripts/seedWaitlistDemo.ts`, `web/lib/orchestration/placement/waitlistDemoScenarios.ts`.

### Recommended full cycle

```bash
ORG_ID=<uuid> DRY_RUN=1 npm run dev:clean:waitlist-demo
ORG_ID=<uuid> WAITLIST_DEMO_APPLY=1 npm run dev:clean:waitlist-demo
ORG_ID=<uuid> npm run dev:seed:waitlist-demo
ORG_ID=<uuid> npm run qa:waitlist:demo
ORG_ID=<uuid> npm run qa:waitlist:priority-facts
ORG_ID=<uuid> npm run qa:waitlist:v2
```

---

## Card 2 — Person drawer layout + doctrine

### Layout

Default person drawer (`entityPresentation.persons`):

1. **Profile** — name, email, phone, status, timestamps  
2. **Employee status** — yes/no, employee ID, source (custom block)  
3. Record info, Relationships  

Reachable from opportunity drawer parent/contact links (unchanged).

### Drawer doctrine

**Person drawer = generic identity/profile drawer**, not a parent-only drawer.

| Person role | Examples |
|-------------|----------|
| Parent/guardian | Household contact |
| Employee | Staff priority flag |
| Emergency contact | Future |
| Payer | Future |
| Staff / user-linked | Future |
| External contact | Future |

**Child operational data stays out of the person drawer:**

- Waitlist/enrollment site, cohort, lifecycle → **opportunity inquiry children** section (this sprint)
- Future: dedicated **child/member drawer** for lifecycle, enrollment, attendance, billing, subsidy, medical, documents

---

## Card 3 — Settings → Locations hierarchy

**Route:** `/adminV2/settings/locations` (tile on Settings index)

Read-first tree: **address/campus → site → unit (classroom/room)** using `parent_location_id`.

- Open location in drawer for edit  
- Link to full `/admin/locations` list  
- **Add location** opens drawer (create)  
- Documents org-level cohort keys; site-scoped rates/catalog deferred  

API: `GET /api/admin/locations?hierarchy=1` includes `parent_location_id`.

---

## Card 4 — Demo walkthrough QA

```bash
cd web && ORG_ID=<uuid> npm run qa:waitlist:demo
```

Prints JSON checks + browser walkthrough (route, scenario, clicks, expected result).

**Verify manually:**

- Cohort sections and candidate rows  
- Child site/cohort on inquiry children  
- Employee / sibling / sister-site priority reason lines (shadow preview)  
- Manual pin + activity  
- Forecast hint (informational)  
- Missing site/cohort diagnostic  
- V1 fallback when V2 off (separate `qa:waitlist:v2` step)  
- **`shadow_mode: true`** on demo work unit  

---

## Card 5 — Closeout

### Remaining gaps (explicitly deferred)

- `shadow_mode: false` / live ranking pilot  
- Site-scoped program / rate / classroom catalog  
- Child/member drawer (full lifecycle surfaces)  
- HR employee sync  
- Capacity / forecasting engine  
- Packet intake → OCM promotion  

### Recommended next sprint

**Waitlist live-ranking pilot** — run strict-mode checklist from fact-truth sprint on seeded demo org, ops sign-off, enable `shadow_mode: false` on one work unit.

---

## Validation (2026-05-28)

| Check | Command |
|-------|---------|
| Demo markers unit tests | `npm run test -- tests/orchestration/placement/waitlistDemoMarkers.test.ts` |
| Priority facts | `npm run qa:waitlist:priority-facts` |
| Demo walkthrough | `npm run qa:waitlist:demo` (requires seed against live org) |
