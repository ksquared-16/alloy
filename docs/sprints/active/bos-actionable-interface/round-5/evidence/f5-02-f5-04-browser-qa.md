---
owner: platform
status: blocked
last_reviewed: 2026-07-27
package: F5-02 / F5-04
---

# Round 5 — F5-02/F5-04 authenticated browser QA

## Status

**Blocked on operator auth** (2026-07-27).

- Slot localhost `http://127.0.0.1:3012` is healthy (Next listening).
- Browser reaches `/login` (Sign In | Alloy).
- Session uses remote Supabase (`ikaxilmwmrmbagoidedu`); cert fixture users are not valid here.
- No stored browser auth state in the worktree.

## Checklist (run after Kelly signs in on :3012)

1. Open Create Lead (BOS command session).
2. Switch to Form.
3. Confirm **Placement & preferences** is visible (not Family-only).
4. Open Placement; select Location (canonical site options).
5. Confirm **Location is required** disappears from section / blockers.
6. Switch Conversation → Form; Location remains (resolved label, not raw ID).
7. Add Jenn + Trey as separate adults; both remain after Location change.
8. Children: optional empty — no invalid child row.
9. **Add child** once; remove; returns optional/empty.
10. Add two children; both remain distinct.

## Capture

Screenshots + network notes under this directory:

- `01-form-placement-visible.png`
- `02-location-selected-blocker-cleared.png`
- `03-mode-switch-location-persists.png`
- `04-two-adults.png`
- `05-children-optional-empty.png`
- `06-two-children.png`

## Automated evidence already green

```bash
cd web && npm run test -- \
  tests/bos/commandSession/createLeadPlacementLocationParity.test.ts \
  tests/bos/commandSession/createLeadMultiPersonRepeaters.test.ts \
  tests/bos/commandSession/createLeadGatherUx.test.ts \
  tests/bos/commandSession/createLeadAdapter.test.ts \
  tests/bos/commandSession/draftModeSync.test.ts
```

32/32 passed (2026-07-27).
