# Locations corrective checkpoint

**Status:** Five required corrections complete before Rooms and Schedule certification.

## Decisions

1. Active Location glyphs now mirror the operator identity treatment: a neutral well with Bend Pine glyph; selected rows receive a stronger Bend Pine well; inactive rows remain muted.
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

## Runtime acceptance

- Schedule shell action opens creation editor: PASS.
- Schedule collection action opens the same creation editor: PASS.
- Schedule create/save/local update/hard refresh: PASS.
- Schedule edit/save/local update/hard refresh: PASS.
- Temporary acceptance rows: removed.
