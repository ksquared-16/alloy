# Surface Builder completion punch list

**Sprint:** operational-surface-realization · Surfaces / Queue Runtime follow-up  
**Status after Phases 8–13 slice:** Identity layout/edit/milestones/card-link foundations landed. **HOLD** pending authenticated browser QA.

## Done in this follow-up
- Published config authoritative: unmapped compact slots **hide** (no hardcoded contact email fallback)
- Stage variant match: preview projection promotes `active_subject.stage_key` → `stage_focus_key`
- Publish refresh: BroadcastChannel + local event + prefetch bust + live `rowConfig` overlay
- Picker: only compact-effective fields (no gray “Not in row” / unavailable siblings)
- Restored compact providers: `waitlist.positionLabel`, `waitlist.waitSince`, `opportunity.next_step`, `child.room`, Children count/names/summary
- Card Links: pure helpers + back/forward navigation runtime
- Identity Collection archetype + Gender/Age Band row packing parity (Summary/Context)
- Edit capability contract + publish validation for unsupported Editable
- Milestones platform blueprint + Enrollment reference composition
- Deterministic card grid-flow planner

## Remaining (post-sprint)

### Queue / providers
- [ ] Tour Date / Tour Time / Tour Guide — need `QueueRowContext` tour projection + SLOT wiring
- [ ] Waitlist tier / priority / override flags / reason — extend `waitlist_context` beyond position/wait_since
- [ ] Sibling vocabulary on compact row (currently hidden until SLOT + resolver exist)
- [ ] Requirements Remaining — no queue-row refKey yet
- [ ] Multi-instance `qrl:` cache versioning (layout `published_at` in cache key) for serverless fleets
- [ ] Per-row variant overlay after publish (today queue-level Default overlay; variants need re-match)

### Current / Requested / Next field model
- [ ] Rename operator labels: Requested Program/Schedule vs Current* operational enrollment truth
- [ ] Wire operational Current* from enrollment/assignment owners (today Program/Schedule are inquiry placement)

### Focus Panel Card Links
- [ ] Surface Builder UI to author `FocusPanelCardLink[]` on Focus Panel composition
- [ ] Persist links on published Focus Panel layout metadata
- [ ] Wire field / milestone / CTA click → `navigateCardLinkWithHistory` in card renderers
- [ ] Deep-link URL/`?fp_card=` hydration (optional)

### Identity / Milestones
- [ ] Milestones evidence adapters (tour/forms/placements/…) wired to Operational Context
- [ ] Milestones Focus Panel card renderer shell
- [ ] Demote remaining Children compose-path `CHILDREN_FIELD_TRUTH_META` forks where still dual
- [ ] Wire FocusPanelCardGrid to `planFocusPanelCardGridFlow` for Work mode (optional migrate from lanes)

### Surface Builder completeness
- [ ] Header surfaces publish→runtime parity audit (same overlay pattern?)
- [ ] Composite field authoring UX for Children summary formatting
- [ ] Builder preview uses identical CondensedQueueRow + projected context (eliminate sample-context drift)
- [ ] Variant editor warning when stage match keys may not be on live wire
- [ ] Builder snap targets + keyboard move for card grid-flow authoring

### Certification still owed
- [ ] Re-auth slot4 and run browser: Gender+Age Band row / swap / Program above; 1- and 4-child
- [ ] Editable contract + publish rejection for age_band Editable
- [ ] Children → Scheduling → Back → Children (Placement when linked)
- [ ] Waitlist + Tour + Program/Schedule live checks
