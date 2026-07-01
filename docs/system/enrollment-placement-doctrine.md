# Enrollment Placement Doctrine

**Status:** Active — Configuration Workspace V3 (June 2026).

**Canonical platform doc:** `docs/platform/core/placement-system.md` (ownership boundaries, cascade, future placements table).

Canonical operator chain:

**School / Location → Program → Room → Schedule**

Internal storage may use `desired_program_category_id`, `program_room_cohort_key`, etc. Operators see **Location**, **Program**, **Room**, **Schedule** only.

## Ownership

| Concept | Operator label | MVP storage | Configured in |
|---------|----------------|-------------|---------------|
| Location | School / Location | `opportunities.location_id` (lead default) · `OCM.location_id` (child authority) | Lead intake / Child OCM |
| Program | Program | `desired_program_category_id` | **Location** → `location_program_categories` |
| Room | Room | `program_room_cohort_key` / unit `locations.id` | **Location** hierarchy (unit rows) |
| Schedule | Schedule | `desired_schedule_type` | Org option set interim; location-owned future |

See `web/lib/fields/enrollmentPlacementDoctrine.ts` for code constants.

## Requirements by process phase

Rationale: early lead work needs **where** (Location) before **what program**. Physical placement (Room + Schedule) is an enrollment commitment, not intake curiosity.

### Lead

| Field | Required | Rationale |
|-------|----------|-----------|
| Family (customer) | Yes | Identity anchor for inquiry |
| Location | Yes | Site context for staff and downstream program offerings |
| Program | No | Families may not know program yet |
| Room | No | Placement not decided |
| Schedule | No | Preference optional |

### Qualification

| Field | Required | Rationale |
|-------|----------|-----------|
| Program | Yes | Staff must qualify fit for a program offering at the location |
| Room | No | Still pre-placement |
| Schedule | No | Preference may be captured but not required |

### Tour

| Field | Required | Rationale |
|-------|----------|-----------|
| Program | Yes | Tour is program-contextual |
| Room | No | May preview rooms but not assigned |
| Schedule | No | |

### Decision

| Field | Required | Rationale |
|-------|----------|-----------|
| Program | Yes | Decision split paths assume program context per child |
| Room | No | Placement follows decision |
| Schedule | No | |

### Placement / Enrolling

| Field | Required | Rationale |
|-------|----------|-----------|
| Program | Yes | Confirmed offering |
| Room | Yes | Physical classroom assignment |
| Schedule | Yes | Operational schedule commitment |

### Enrolled

| Field | Required | Rationale |
|-------|----------|-----------|
| Program | Yes | Active enrollment record |
| Room | Yes | |
| Schedule | Yes | |

## Runtime gaps (MVP)

| Gap | Impact | Mitigation |
|-----|--------|------------|
| Schedule is org-wide option set | Not location-scoped | Document interim; show "organization schedule offerings" in Location workspace |
| Room not enforced at lead intake | By design | BP stage requirements can recommend Program earlier; Room enforced at Enrolling via requirements |
| `desired_program_type` legacy key | Internal compat for room cascade | Hidden from operator pickers; category id canonical |
| Layout runtime repeater | No live location→program cascade | Add Child + drawer are authoritative intake paths |
| Phase requiredness | Not all enforced automatically in runtime | Business Process stage requirements + operator training; future: stage-gated validation |

## Configuration chain

```
Fields (registry)
  → Layouts (presentation)
  → Forms (collection)
  → Business Processes (stage requiredness, operating plan, actions)
  → Runtime (drawer, queues, attention)
```

## Related

- `configuration-workspace-v1-doctrine.md`
- `configuration-ownership-doctrine.md`
- `docs/sprints/06_2026/enrollment_workflow_qa_ready_path.md`
