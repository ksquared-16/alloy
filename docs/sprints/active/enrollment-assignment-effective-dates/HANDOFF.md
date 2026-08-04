# Enrollment Assignment & Effective Dates — Durable Handoff

**Sprint:** enrollment-assignment-effective-dates  
**Finished:** 2026-08-03  
**Merged to staging:** 2026-08-04  
**Provider:** cursor · **Slot:** 3 · **Port:** 3013

## Environment

| Field | Value |
|-------|-------|
| Root class | managed-worktree |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt3-enrollment-assignment-effective-dates` |
| Branch | `agent/cursor/3-enrollment-assignment-effective-dates` |
| Certified staging base | `4888371af23f274753932b0f50bfdb131cfcbc2c` |
| PR tip at merge | `49c9a02cda7cd8449d42319501020fc2b3632fa9` |
| **Merge commit** | `51f12253989206a364e162dafa3544a13a207107` |
| **origin/staging after merge** | `51f12253989206a364e162dafa3544a13a207107` |
| PR | [#321](https://github.com/ksquared-16/alloy/pull/321) — **MERGED** |
| Parallel land branch | `agent/cursor/3-enrollment-assignment-land` — **not merged** (not a promotion vehicle) |
| Auth | `qa-slot3-performance@example.com` storage present/valid |
| Seeded family | Kurzman `df771481-841f-4329-b7bb-c0a03d9fb621` |

## Configuration root cause (Classification **A**)

Firefly’s published Enrollment Focus Panel Summary **v128** set Assignments (`scheduling`) to **Linked** and omitted it from `metadata.focusPanelLayout.grid.areas`. The published LayoutDoc correctly overrode code defaults (which already mark Assignments **visible**). This is a **tenant published-configuration** issue, not a runtime materialization defect and not a broken enrollment preset.

| | Version / id |
|--|--|
| Before | published **v128** `6bf3b8d6-94f8-4dd3-9c51-4dae96ad9dff` — scheduling `linked` |
| After | published **v129** `a7ec300e-cbe2-451d-b4fe-c7e47e3f2afc` — scheduling `visible` + grid area |

Repair used the canonical admin entity-layouts duplicate → draft PATCH → publish path. No Firefly-only runtime bypass. Other tenants: Surfaces → Enrollment Focus Panel Summary → Assignments Visible → place → Publish.

Evidence: `.alloy-agent-evidence/enrollment-assignment-effective-dates/config/ROOT-CAUSE.md` (retained; do not delete).

## Authority decisions (accepted)

1. **Requested Start** = `process_instances.metadata.start_date` — never rewritten by commitment.
2. **Start Date** = earliest qualifying **committed** `schedule_assignments.start_date` (`effectiveDateAuthority`); agreement fallback only when no OA row.
3. **Enrollment Date** = process-instance stamp via configured paperwork-completion outcome target `stamp_enrollment_date`.
4. **`commitment_kind`** = proposed vs committed assignment state only.
5. **Requested days** = `requested_days_per_week` on participation metadata (1–7); preferred weekdays reuse `weekdays`.
6. **Quote** = immutable snapshot on PI metadata (`assignment_quote_snapshots`); not ledger.
7. **Household primary** = `patchHouseholdPrimaryContact` / `PATCH …/household-primary-contact`.

## Migrations

None.

## Certification (at promotion)

| Suite | Result |
|-------|--------|
| Focused enrollment + household tests | **53 passed** (post-rebase) |
| Production typecheck | **passed** |
| PR #321 required CI | **all green** (docs lint, production graph, full graph, P1, Vercel ×2) |
| Browser matrix | **20/20** Kurzman |
| `alloy-sprint-finish 3` | passed at original closure |

## Intentional deferrals (not sprint failures)

- Full “sent” quote lifecycle beyond generated / accepted / superseded snapshots
- Dedicated quote table (metadata snapshots are durable for V1)
- BOS slash adapter for make_primary / assignment quote
- Focus Panel Household secondary-adult summary composition
- Host-local full `next build` under memory pressure (CI/Vercel is the compile gate)
- Pre-existing `focusPanelMutation.saveInquiryChild` event-count assert

## Promotion outcome

**Merged** via PR #321 merge commit `51f12253989206a364e162dafa3544a13a207107` on 2026-08-04. Product is on `origin/staging`. Parallel `enrollment-assignment-land` was not merged.
