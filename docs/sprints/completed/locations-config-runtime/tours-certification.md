# Tours certification

**Status:** Complete and acceptance-tested for Configuration Runtime V1.

## Certified behavior

- The Location owns recurring Tour Windows; no runtime or ownership architecture changed.
- Empty state explains the first step and keeps Add Tour Window in context.
- Existing rows show day, time, timezone, approval mode, active state, duration, buffer, and booking limit.
- Add and Edit use the same focused field grammar. Edit remains attached to the selected window rather than opening a separate settings page.
- Primary save uses the canonical Bend Pine action. Activate/deactivate and Edit are secondary actions.
- Creating, editing, activating/deactivating, and deleting refresh the local collection and the Overview Tours readiness consumer.

## Mutation certification

- Create: day, start/end, timezone, duration, buffer, maximum bookings, approval requirement, and active state — response PASS; local PASS; hard refresh PASS.
- Edit: all exposed fields — response PASS; local PASS; hard refresh PASS.
- Active toggle — response PASS; local PASS; hard refresh PASS.
- Delete — response PASS; local removal PASS; readiness update PASS.
- Temporary acceptance window removed.

## Evidence

- `screenshots/131-tours-final.png`
- `screenshots/132-tours-create-final.png`
- `screenshots/111-tours-edit-final.png`
- `screenshots/112-tours-hard-refresh-final.png`
