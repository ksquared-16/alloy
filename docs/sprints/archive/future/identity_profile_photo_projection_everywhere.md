---
owner: platform
status: partial
last_reviewed: 2026-08-11
supersedes: []
---

# Future sprint — Identity profile photo projection everywhere

**Status:** **Partially landed (2026-08-11)** — opportunity / Focus Panel children + household persons, child-grain queue rows, and Assignment roster now project via `resolveProfilePhotosForActor` + `RESOLVED_PHOTO_URL_KEY`. Remaining surfaces (Room Board chips, person drawer chrome warm refresh, Surfaces authoring polish) stay forward-looking.  
**Date:** 2026-07-27 (updated 2026-08-11)  
**Prerequisite:** Surfaces → Runtime avatar contract (canonical `persons.metadata.profile_photo_document_id` + request-scoped signed URL) is already the upload/persist authority.

---

## Problem

Operators can upload a child profile photo from Surfaces → context facts, and Work Unit Children summary can **display** that photo. Projection was incomplete: several operator surfaces that show the same child still fell back to initials or omitted the avatar entirely, even when a canonical photo exists.

This is a **shared identity projection** gap — not an Assignment-only feature.

### Observed (2026-08, EPP / Waitlist runtime) — addressed for core paths

Upload persists the durable pointer `persons.metadata.profile_photo_document_id` and returns a **short-lived signed URL** (≤ ~15 minutes). Signed URLs are intentionally **not** written back to `persons.metadata.photo_url`.

**Landed:** Opportunity / `_inquiry_children` + `_opportunity_persons` / `_customer_persons` hydrate, Focus Panel client save merge (`resolved_photo_url`), child-grain queue `row_subject.image_url` → CondensedQueueRow, and Assignment roster `imageUrl` now call `resolveProfilePhotosForActor` (keyed by **person_id**) and inject `resolved_photo_url`.

---

## Goal

One canonical person profile photo resolves consistently everywhere the shared Avatar / identity chrome is used for that person (or child member linked to that person).

---

## Landed (2026-08-11)

1. **Opportunity hydrate** — `opportunityEntityRecord` drawer_visible / full / relationship overlay project photos via `projectResolvedProfilePhotosOntoRows` (`person_id` key).
2. **Focus Panel save merge** — `savePersonChildPhoto` writes `resolved_photo_url` (session preview kept; signed URL not durable metadata).
3. **Queue rows** — child-grain `QueueRowSubjectPresentation.image_url` + CondensedQueueRow AvatarChip img-or-initials; batch resolve in `enrichOpportunityRows` when DocumentActor is present.
4. **Assignment roster** — `buildAssignmentRosterReadModel` / `resolvePersonNames` uses `resolveProfilePhotosForActor`.

Helper: `web/lib/documents/projectPersonProfilePhotos.ts`.

---

## Still in scope (future)

1. **Projection inventory** — remaining live surfaces (Room Board subject chips, person drawer chrome) not yet on the same path.
2. **Warm refresh** — after upload/clear, invalidate or patch every open projection that already shows that person (not session-only composer preview).
3. **Missing `person_id` remediation** — backfill or ensure-person for historical `customer_members` that only carry `display_name` (Almead-class rows), so photo storage can bind.
4. **Surfaces authoring** — keep upload/remove on Surfaces → context facts; Work Unit summary stays display + zoom only (no inline upload).
5. **Certification** — browser proof matrix: upload once → photo visible on summary, focused child, Assignments roster, Room Board (where faces appear), person drawer.

## Out of scope

- New media/CDN platform or schema migration beyond existing `persons.metadata` pointer.
- Redesign of Assignment Workspace / Room Board layouts.
- Bulk photo import or AI face recognition.

---

## Acceptance sketch

| # | Proof |
|---|--------|
| 1 | Surfaces context facts: upload + remove still work |
| 2 | Work Unit Children summary: photo displays; no Add/Change/Remove; click photo zooms |
| 3 | Assignments Roster row for same child shows the same image |
| 4 | Opening the person/child identity chrome shows the same image |
| 5 | Clear photo → initials everywhere within one refresh cycle |
| 6 | Queue child-grain row shows image when `resolved_photo_url` projected |

---

## Suggested entry points (when scheduled)

- `web/lib/documents/projectPersonProfilePhotos.ts` — batch projection helper
- `web/lib/adminV2/runtime/focusPanel/persistPersonProfilePhoto.ts`
- `web/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl.ts`
- `web/lib/scheduling/roster/buildAssignmentRosterReadModel.ts`
- `web/components/admin/focusPanel/identity/IdentityAvatar.tsx`
- Surfaces Children composer (context facts) vs Work Unit `ChildrenCard` summary (display-only)

---

## Notes from Phase 2

- Lennon/Wrigley Kurzman already have `customer_members.person_id`; Kai/Rayia Almead historically did not (display_name-only members) — ensure-person exists for upload bind.
- Create Lead staging fixes (`work_unit_id` bind, `chk_pcs_source_kind`) do not change photo projection; Create Lead already creates child `person_id` on healthy paths.
