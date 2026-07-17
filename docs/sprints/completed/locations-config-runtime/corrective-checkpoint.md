# Locations corrective checkpoint

**Status:** Complete. Locations is frozen as Configuration Runtime Version 1.

## Decisions

1. Location identity uses the Map Pin glyph without a colored well: Bend Pine for active locations and muted neutral for inactive locations. The canonical queue-row treatment, not an icon tile, communicates selection.
2. Operational Readiness always exposes its seven authoritative dimensions. Complete, Needs setup, and Not assessed are visible; unknown dimensions remain excluded from percentage math. The current South Campus evidence reconciles 2 complete of 5 assessed dimensions to 40%, with 2 not assessed.
3. Programs no longer renders Relationships. Location identity and participation were duplicates of the selected-location context and Operating Picture.
4. Schedule Pattern creation now authors name, weekdays, and active state through the existing schedule provider. Both shell and local Add actions open the same editor.
5. Add Location, Add Program, Add Room, Add Schedule Pattern, and primary Saves use the shared Bend Pine primary button. Edit and Cancel remain secondary.

## Before / after evidence

- Location identity and Add Location before: `screenshots/selected-rows-buttons-after.png`
- Readiness before: `screenshots/overview-after.png`
- Programs before Relationships removal: `screenshots/programs-after.png`
- Corrective Overview after: `screenshots/corrective-overview-after.png`
- Programs after: `screenshots/corrective-programs-after.png`
- Frozen Version 1 Overview: `screenshots/locations-v1-overview-final.png`

## Version 1 Overview composition

- The top row answers “What is this location?”: At a Glance owns two-thirds of the workspace and Operational Readiness owns one-third.
- At a Glance is the focal operating picture: Capacity, Programs, Rooms, Hours, supporting operational labels, and room-capacity progress share one cohesive region.
- Operational Readiness exposes the authoritative dimensions behind its percentage, including assessed and not-assessed counts.
- The bottom row answers “What needs me?”: Needs Attention and How this Location Runs have equal width and equal-height card treatment.
- Attention actions sit directly beneath each issue’s problem and impact. Tours, Placement, and Access are presented as one capability list with explicit state.
- Empty attention remains honest: the attention card disappears when no actionable issue exists, and the capabilities card uses the available row.

The layout does not add a copy/apply substrate. Location-owned creation and mutation paths remain separable from any future Organization-owned pattern provider, so Organization can later create Programs, Schedules, or Tour Patterns and apply them through an authoritative provider without replacing this workspace grammar.

## Runtime acceptance

- Schedule shell action opens creation editor: PASS.
- Schedule collection action opens the same creation editor: PASS.
- Schedule create/save/local update/hard refresh: PASS.
- Schedule edit/save/local update/hard refresh: PASS.
- Temporary acceptance rows: removed.
