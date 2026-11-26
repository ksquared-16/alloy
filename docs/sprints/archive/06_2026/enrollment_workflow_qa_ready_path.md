# Enrollment Workflow QA — Ready Path

**Status:** Active — June 2026 (post Configuration Workspace V3).

Assumes configuration foundation is stable:

- Fields registry (F1), entity catalog (E1), placement hardening (E2)
- Configuration Workspace V1/V2/V3
- Enrollment placement doctrine (`docs/system/enrollment-placement-doctrine.md`)
- Business Processes own stage rollups, operating plan, and process actions

## Configuration verification (before workflow QA)

Complete this checklist before running the enrollment walkthrough.

| Area | Verify |
|------|--------|
| **Location** | Each QA site exists; site workspace shows Programs, Rooms, Schedules cards |
| **Program** | Per-site offerings configured (e.g. North Campus: Infant, Preschool) |
| **Room** | Classroom rows under site with program category; required at Enrolling per doctrine |
| **Schedule** | Org schedule option list configured; Location workspace shows org offerings note |
| **Fields** | Child has Location, Program, Room, Schedule with operator labels (not internal keys); **Lead has Location** (`opportunity.location_id`) |
| **Forms** | Create Lead / Add Child forms include placement fields |
| **Layouts** | Drawer layouts present for Opportunity + Child; fields from registry appear |
| **Business Processes** | Enrollment: Family track (Lead→Decision), Child track (Waitlist→Enrolled); Decision split understood |

### Placement requiredness by phase (doctrine)

| Phase | Required | Not required |
|-------|----------|--------------|
| Lead | Family, **Lead Location** (`opportunity.location_id`) | Program, Room, Schedule (child placement) |
| Qualification / Tour / Decision | Program | Room, Schedule |
| Enrolling / Enrolled | Program, Room, Schedule | — |

## Prerequisites (configuration)

1. **Locations → Programs** — each site used in QA has at least one active Program (e.g. North Campus: Infant, Preschool).
2. **Statuses** — vocabulary only; stage assignment lives in **Business Processes → Stage Membership**.
3. **Business Processes** — Enrollment process stages configured: Lead → Qualification → Tour → Decision → Waitlist → Enrolling → Enrolled (or tenant equivalent).
4. **Fields** — Child has Location, Program, Room, Schedule visible with operator labels (not internal keys).
5. **Actions** — Create Lead, Add Child, tour/decision actions enabled in Process Actions.

## QA walkthrough

### 1. Location and Program baseline

- [ ] Open **Configuration → Locations**
- [ ] Select North Campus (or test site) in site tabs
- [ ] Confirm **Programs** card lists offerings (Infant, Preschool, etc.)
- [ ] Confirm **Rooms** card lists classrooms; room table has category/capacity
- [ ] Confirm **Schedules** card shows organization offerings note

### 2. Create Lead

- [ ] Create Lead assigned to **North Campus**
- [ ] **Expected:** Lead drawer shows Location = North Campus; Program/Room/Schedule not required
- [ ] Confirm status reflects Lead stage rollup

### 3. Add Child — location inheritance

- [ ] Add child from Lead/opportunity drawer
- [ ] **Expected:** Location defaults to North Campus (inherited)
- [ ] **Expected:** Program dropdown shows North Campus programs only
- [ ] Select a program and save — child row shows Program label (not internal key)

### 4. Program cascade on override

- [ ] Add second child (or edit child)
- [ ] Change **Location** to South Campus (if configured)
- [ ] Confirm non-blocking mismatch notice (lead stays North)
- [ ] Confirm **Program** options refresh to South Campus
- [ ] Prior invalid program clears if not offered at new site
- [ ] Save — child keeps South location; lead unchanged

### 5. Qualification → Tour

- [ ] Move lead status to Qualification rollup stage
- [ ] Confirm workspace queue/stage reflects Business Process membership
- [ ] Schedule or record tour; advance to Tour stage

### 6. Decision split

- [ ] At Decision stage, split children (if applicable)
- [ ] Confirm each child row retains own Location/Program

### 7. Waitlist / Enrolling

- [ ] Move child track to Waitlist or Enrolling per process
- [ ] Confirm workspace queue appearance matches stage rollup (not manual work-unit config)
- [ ] Drawer shows Program label (not “Desired Program”)

### 8. Enrolled

- [ ] Complete enrollment path to Enrolled
- [ ] **Expected:** Program, Room, and Schedule populated; status = Enrolled rollup
- [ ] Confirm placement fields persist in drawer and queue preview

### 9. Multi-location family edge case

- [ ] Lead at North Campus
- [ ] Child A at North, Child B at South (override)
- [ ] Mismatch notice on Child B only
- [ ] Sibling A unchanged

### 10. Field registry convergence spot-check

- [ ] Create a custom field on Child in **Fields**
- [ ] Confirm it appears in Layouts picker, Forms Builder, BP stage requirements (without catalog edit)

### 11. Lead Location (native reference — June 2026 closeout)

- [ ] **Settings → Fields → Lead** — **Location** visible (`opportunity.location_id`, not hidden integration field)
- [ ] **Settings → Business Processes → Lead stage** — **Location** available as Off / Recommended / Required (`opportunity:location`); Child Location not forced on Lead stage
- [ ] **Settings → Layouts** — add **Lead Location** (`opportunity.location_id`) to opportunity drawer layout
- [ ] Open lead drawer → edit **Location** via site picker → save
- [ ] Confirm DB: `opportunities.location_id` updated (not `field_values`)
- [ ] **Add Child** with blank child location → inherits lead location on OCM
- [ ] **Add Child** with explicit child location → OCM updated; lead `location_id` unchanged

### 12. Work Intent runtime (Operating Plan — June 2026 closeout)

- [ ] Create or open a Lead in Lead stage
- [ ] **Purpose** appears under lifecycle rail (from stage Operating Plan)
- [ ] **Work card** appears in drawer body (e.g. Make Contact) — not duplicated in Tasks summary strip
- [ ] Select **Left Voicemail** (retry outcome) → work stays open; attempt count increments
- [ ] Select **Reached Family** (close outcome) → work closes; status/stage advances if configured
- [ ] Advance to **Qualification** → next stage primary work spawns (stage-entry)
- [ ] Create ad hoc operational task → appears in **Tasks** strip only, not Work card

## Known interim limitations

- Schedule preference uses org-wide option list (`childcare_schedule_type`), not per-location offerings
- Room required at placement, not early lead intake
- Work Units are runtime lanes — not configured directly
- Attention org bucket labels: advanced **Attention defaults**; stage rules in **Operating Plan**

## If QA fails

| Symptom | Check |
|---------|--------|
| Program empty | Location has programs in Locations settings |
| Program shows wrong site | Child location_id vs lead location inheritance |
| Status wrong stage | Business Processes → Stage Membership included statuses |
| Field missing in BP/Forms | Fields registry F1 — `field_definitions` active |
| “Desired Program” label | E2 label normalization — should say **Program** |
