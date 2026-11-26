---
owner: platform
status: proposed
last_reviewed: 2026-07-25
supersedes: []
---

# Assignment Platform — Phase 2D remaining work

**Context:** Phase 2C completes the operator experience on top of the certified foundation. This list is what remains after 2C implementation.

**Active handoff (resume here):** [`assignment-platform-phase-2-handoff.md`](./assignment-platform-phase-2-handoff.md) — 2026-07-26 status: code committed on the Phase 2 branch; **browser acceptance still incomplete** (Gender Save fix unproven; Workspace create / Types CRUD / bulks unverified in live browser).

---

## Blockers observed in 2C browser cert

1. **`operational_assignment_types` not on connected DB**  
   Staging/schema cache does not expose the foundation table. Type picker opens empty; secondary `assignment.create` cannot complete until foundation + seed migrations are applied (`20260725030801_…`, `20260725190000_operational_assignment_type_defaults_v1.sql`).

2. **New Leads Focus Panel layout omits Scheduling card**  
   Kurzman opportunity Work grid cards: `current_work`, `milestones`, `billing_preview`, `children`, `household` — no `scheduling`. Children card already shows the canonical Assignment scan line; Assignment Detail / Timeline / Create UI requires a layout that includes the Scheduling card (later stage or layout assignment change).

3. **Queue preparation flakiness**  
   `All locations` often yields `preparation did not terminate within 10000 ms`. Prefer North Campus (or a concrete site) before opening rows.

---

## Phase 2D product/engineering follow-ups

| Item | Notes |
|------|--------|
| Apply foundation + type seed migrations | Unblocks type picker and typed create/duplicate |
| Layout: Scheduling card on enrollment stages that need it | Or Linked navigate from Children schedule → Scheduling |
| Full Focus Panel browser cert | Detail two-column, timeline gaps/future, create→type→save, edit secondary, archive, duplicate, set primary |
| Backfill Assignment Types on existing primary rows | Reduce “Missing assignment types” attention |
| Conflict / overlap attention | When Calculations expose overlap policy |
| Assignment Type authoring UI | From settings inventory — Organization-owned CRUD |
| Org default primary type on first create | Settings inventory §3 |
| Playwright 2C green on CI | After migrations + Scheduling card availability |

---

## Explicitly out of 2D (stay design-only / later)

- Rooms & Programs VNext implementation  
- Transition Plans / Templates (Assignment VNext)  
- Staffing / Forecasting engines  
- New Settings IA  
- Workspace shell redesign  

---

## Suggested 2D acceptance gate

1. Migrations applied; type picker lists the seven seeded types.  
2. Open a record whose Focus Panel includes Scheduling.  
3. Create secondary assignment with type → appears in Summary + Timeline.  
4. Edit / Duplicate / Archive / Make primary as certified.  
5. Workspace Assignment attention reflects real counts.  
6. Local commit only after that pass (no push).
