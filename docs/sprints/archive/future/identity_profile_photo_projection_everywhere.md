---
owner: platform
status: proposed
last_reviewed: 2026-07-27
supersedes: []
---

# Future sprint — Identity profile photo projection everywhere

**Status:** Forward-looking / **not in scope** for Assignment Platform Phase 2 closeout.  
**Date:** 2026-07-27  
**Prerequisite:** Surfaces → Runtime avatar contract (canonical `persons.metadata.profile_photo_document_id` + signed `photo_url`) is already the upload/persist authority.

---

## Problem

Operators can upload a child profile photo from Surfaces → context facts, and Work Unit Children summary can **display** that photo. Projection is still incomplete: several operator surfaces that show the same child still fall back to initials or omit the avatar entirely, even when a canonical photo exists.

This is a **shared identity projection** gap — not an Assignment-only feature.

### Observed (2026-08, EPP / Waitlist runtime)

Upload persists the durable pointer `persons.metadata.profile_photo_document_id` and returns a **short-lived signed URL** (≤ ~15 minutes). Signed URLs are intentionally **not** written back to `persons.metadata.photo_url`. Focus Panel keeps the signed URL in session/client state, so the face appears immediately after upload — then vanishes on refresh, remount, or expiry.

`resolveProfilePhotosForActor` (mint a fresh actor-scoped URL from the document id) exists and is covered by unit tests, but is **not yet wired** into opportunity / `_inquiry_children` loads (`opportunityEntityRecord` still uses `warmPersonPhotoUrl` against metadata URL keys). Evidence adapters also drop legacy signed URLs on purpose. This is **not** a localhost-only quirk; localhost remounts just make it more visible.

---

## Goal

One canonical person profile photo resolves consistently everywhere the shared Avatar / identity chrome is used for that person (or child member linked to that person).

---

## In scope (future)

1. **Projection inventory** — list every live operator surface that shows a child/person face or initials and classify: already shared `IdentityAvatar` / `CardAvatar`, custom avatar, or initials-only.
2. **Read-model convergence** — ensure Assignment Roster, Room Board subject chips, Household / Children Focus Panel depths, queue preview rows (if they show faces), and person drawer chrome all read the same photo URL resolver (`resolveIdentityPhotoUrlFromMetadata` / inquiry-child photo helpers).
3. **Warm refresh** — after upload/clear, invalidate or patch every open projection that already shows that person (not session-only composer preview).
4. **Missing `person_id` remediation** — backfill or ensure-person for historical `customer_members` that only carry `display_name` (Almead-class rows), so photo storage can bind.
5. **Surfaces authoring** — keep upload/remove on Surfaces → context facts; Work Unit summary stays display + zoom only (no inline upload).
6. **Certification** — browser proof matrix: upload once → photo visible on summary, focused child, Assignments roster, Room Board (where faces appear), person drawer.

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

---

## Suggested entry points (when scheduled)

- `web/lib/adminV2/runtime/focusPanel/persistPersonProfilePhoto.ts`
- `web/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl.ts`
- `web/lib/scheduling/roster/buildAssignmentRosterReadModel.ts`
- `web/components/admin/focusPanel/identity/IdentityAvatar.tsx`
- Surfaces Children composer (context facts) vs Work Unit `ChildrenCard` summary (display-only)

---

## Notes from Phase 2

- Lennon/Wrigley Kurzman already have `customer_members.person_id`; Kai/Rayia Almead historically did not (display_name-only members) — ensure-person exists for upload bind.
- Create Lead staging fixes (`work_unit_id` bind, `chk_pcs_source_kind`) do not change photo projection; Create Lead already creates child `person_id` on healthy paths.
