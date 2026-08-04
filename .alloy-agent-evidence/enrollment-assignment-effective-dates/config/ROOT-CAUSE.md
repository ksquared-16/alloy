# Focus Panel Assignments Linked Blocker — Root Cause

## Classification: **A — Firefly configuration repair only**

## Verified facts

| Fact | Evidence |
|------|----------|
| Published Summary before | `entity_layouts` id `6bf3b8d6-…`, **version 128**, status published |
| Card identity | Layout section key **`scheduling`**, operator title **Assignments** (catalog alias `assignments` → `scheduling`) |
| Visibility before | `sections[scheduling].metadata.focusPanelCard.visibility = "linked"` |
| Geometry before | `metadata.focusPanelLayout.grid.areas` omitted `scheduling` |
| Draft before | `null` |
| Code default | `FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION` sets `scheduling` **visible** with a grid area |
| Cause | Tenant-published LayoutDoc wholesale override; Firefly v128 intentionally parked Assignments as Linked |
| Not a key mismatch | Section key `scheduling` matches runtime registry |
| Not a runtime materialization bug | Linked filter in `deriveFocusPanelSummaryCompositionInputs` / `filterPublishedLayoutToVisibleCards` behaved correctly |

## Repair applied (canonical path)

1. `POST /api/admin/entity-layouts/{v128}/duplicate` → draft **v129**
2. `PATCH` draft: set Assignments/`scheduling` → `visible`; add grid area; reading-order rows include scheduling after household; park `milestones` as `linked` (matches code default; provider-unavailable)
3. `POST …/publish` → published **v129** id `a7ec300e-…`
4. Runtime resolver returns v129 with `scheduling` visible and present in areas

## Product vs tenant

- Canonical enrollment **preset/default remains correct** (Assignments visible).
- No shared runtime code change required for this unblock.
- Other tenants configure the same way: Surfaces → Enrollment Focus Panel Summary → move Assignments Linked → Visible → place → Publish.
