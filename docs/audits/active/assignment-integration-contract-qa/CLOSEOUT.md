---
owner: platform
status: closed
last_reviewed: 2026-07-27
supersedes: []
---

# Assignment Platform — Integration contract closeout (slot 5)

**Date:** 2026-07-27  
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt5-assignment-platform-phase-2`  
**Branch:** `agent/cursor/5-assignment-platform-phase-2`  
**Port:** 3015  
**Promotion:** Authorized by Kelly — merge to `staging`, then `alloy-sprint-finish 5`.

This closeout covers the **integration / contract** pass on Assignment Platform Phase 2 (no new product capabilities; fix platform contract violations + operator UX polish on identity photos). Broader Phase 2 checklist items (Studio Types DB apply, bulk commands, full browser pack) remain for a follow-on sprint — see handoff.

---

## What shipped in this promotion

### 1. Surfaces → Runtime avatar (canonical persist)

- Upload / bind / clear via `persistPersonProfilePhoto.ts` → `persons.metadata.profile_photo_document_id` + signed `photo_url`
- `POST /api/admin/customer-members/[id]/ensure-person` find-or-create + stamp `customer_members.person_id` when missing
- `IdentityAvatarEditable` / `ChildProfileAvatarComposer` persist canonically (not preview-only)
- Evidence prefers raw `person_id` (`buildChildrenCardEvidence`)

### 2. Work Unit Children summary = display only

- Summary / context live paths do **not** expose Add/Change/Remove photo
- Upload/remove only on Surfaces → context facts (`composingChildrenSurface`)
- Roster row avatar column alignment fixed in `alloyOsRuntime.css`

### 3. Avatar zoom

- `IdentityAvatar` click-to-zoom dialog (Escape / backdrop / Close)
- Initials-only avatars remain non-interactive
- Styles: `.identity-avatar-zoom*` in `alloyOsRuntime.css`

### 4. Locations Pattern Save + Workspace bootstrap

- Pattern detail: header Save (Studio-like); empty hours allowed; sticky footer removed (`LocationScheduleTemplateDetailPanel`)
- Scheduling Workspace: shared site bootstrap + `siteBootstrapSeqRef` stale guard (already on branch)

### 5. Forward work documented

- Future sprint: `docs/sprints/archive/future/identity_profile_photo_projection_everywhere.md`  
  (Roster / Room Board / drawers / warm refresh / missing `person_id` remediation)

---

## Migrations included (must apply on staging DB)

| Migration | Purpose |
|-----------|---------|
| `20260725030801_operational_assignment_foundation_v1.sql` | Assignment foundation tables |
| `20260725190000_operational_assignment_type_defaults_v1.sql` | Type defaults |
| `20260726190000_assignment_commitment_kind_v1.sql` | `commitment_kind` |
| `20260726200000_assignment_proposed_consistency_trigger_v1.sql` | Proposed consistency trigger |

App merge without applying these leaves Studio Types / commitment behavior broken on the connected staging schema.

---

## Validation

| Check | Result |
|-------|--------|
| Focused unit: `persistPersonProfilePhoto` / surface avatar runtime | Present; re-run on promote |
| Scheduling convergence test (Pattern header Save / bootstrap) | On branch |
| Full browser cert (auth + hard refresh zoom/summary) | Incomplete this session (auth stale); operator may re-prove on staging after deploy |
| `npm run typecheck` | Required before merge |

### Follow-up (2026-07-27 evening)

Staging regression: display-only summary change also stripped `savePhoto` from **ChildFocusEdit** and gated live Focus Panel upload to Surfaces-composing only. Hotfix restores upload on focused child + Edit; summary roster stays display-only. Surfaces builder now passes `customerMemberId` for ensure-person.

---

## Explicitly not claimed done

- Full Assignment Phase 2 operator checklist (Add Assignment all entry points, Studio Types live DB, bulks, full screenshot pack)
- Photo projection on Assignment Roster / Room Board chips (future sprint)
- Vacilando mission package for this slot (none registered under `vacilando/missions` for wt5)

---

## Slot close

After PR merges to `staging`:

```text
alloy-sprint-finish 5
```
