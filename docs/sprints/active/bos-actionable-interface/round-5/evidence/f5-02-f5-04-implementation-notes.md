---
owner: platform
status: active
last_reviewed: 2026-07-27
package: F5-02 / F5-04
---

# Round 5 — F5-02 + F5-04 implementation notes

Coordinated correction: shared-draft repeater reconciliation + effective required-input / Location Form exposure.

## Hard invariant

Every hard-blocking field from the effective Create Lead intake spec must have: visible Form section, editable control, canonical option source, shared-draft storage, missing-state reconciliation, Review projection, execution payload mapping.

## F5-04 — Placement / Location

| Change | Where |
|---|---|
| Project Family / Children / Placement / Additional from effective gather | `createLeadFormSectionProjection.ts` |
| Wire progressive Form sections through projection | `useCreateLeadBosSessionController.ts` |
| Map parser `context` → entity `opportunity` (stop swallowing Location into person) | `createLeadPlatformGather.ts` `createLeadParserSpec` |
| Force `location_id` into effective required keys when platform requires Location | `buildEffectiveCreateLeadIntakeSpec.ts` |
| Mark Placement required / “Location is required” when missing | `createLeadSectionPresentation.ts` |
| Include `location_id` in platform eligibility blockers | `createLeadRequiredInputs.ts` |
| Resolve Location labels in Conversation / Review | `createLeadUnderstandingPresentation.ts` + host `optionLabels` |
| Cascade site → program → room via existing hook | `useInquiryChildPlacementCascade` (unchanged source) |

## F5-02 — Multi-adult reconciliation

| Change | Where |
|---|---|
| Merge parsed household into existing selection (stable primary IDs) | `mergeCreateLeadCommitSelections` / `applyParsedHouseholdToDraft` |
| Do not stamp flat values as `operator_entered` before parse field upserts | parse applies household without flat sync; then fields; then empty-primary fill |
| Preserve Location and other placement flats across repeater writes | `applyCreateLeadCommitSelectionToDraft` |

## Child optional UX

| Rule | Enforcement |
|---|---|
| No child row until Add child / named parse | `createEmptyCreateLeadCommitSelection().children = []`; merge skips blank children |
| Add child creates one row; Add another adds another | existing commit helpers |
| Remove empty child restores Optional | section models use `childRowCount` |
| Empty section copy | `CreateLeadBosRepeaterCards` empty hint |

## Tests

`web/tests/bos/commandSession/createLeadPlacementLocationParity.test.ts` — Location Placement, blockers, labels, multi-adult + Location, optional children.

## Browser QA

See `evidence/f5-02-f5-04-browser-qa.md` (to be filled after authenticated pass).
