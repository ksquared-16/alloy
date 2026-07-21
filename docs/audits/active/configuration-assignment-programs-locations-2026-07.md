---
owner: engineering
status: awaiting-operator-approval
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
phase: configuration-assignment-prototype-stage-1
---

# Configuration Assignment Reference — Programs → Locations (Stage 1)

## Gate

**Stage 1 only.** Interactive non-mutating prototype inside the real Alloy shell.  
**Do not begin Stage 2** until the operator approves this interaction.

Platform term remains **Assignment**. Operator language for Programs:

- Add to Locations
- Make available at Locations
- Available at N Locations

## Interaction contract

```text
Create or select Organization Program
  → Choose one or many Locations (search, select all, clear, status chips)
  → Review preview
  → Apply (fixture session only)
  → Success + return to origin
```

Editing (separate surfaces, not save-time scope quiz):

- Edit Organization definition → impact before save
- Edit {Location} configuration → local offering / description / restore

## QA routes (localhost:3014)

Prefer `http://127.0.0.1:3014` for auth.

| Scenario | Route / action |
|----------|----------------|
| Org Program → Add to Locations | `/organization/programs?programId=<published>&section=assignment` · rail **Add to Locations** |
| Location → Use existing | `/organization/locations?locationId=<site>&tab=programs` · **Add Program** · Use existing |
| Location → Create new | same · **Create a new Program** |
| Org definition edit impact | Programs `section=assignment` · **Open ownership edit prototype** · Edit Organization definition |
| Location configuration edit | Location Program detail · **Edit configuration** |
| Restore inheritance | Location ownership edit · Restore Organization default |

## Components reused

- `ConfigurationPrimaryButton` / `SecondaryButton`, `ConfigObjectHeader`, `ConfigEditorSection`
- `config-runtime-input` (River Stone), Bend Pine action primitives
- Configuration Continuity URL selection (`programId` / `section`, `locationId` / `tab`)
- `LocationAddProgramPanel` → mounts shared flow
- `ProgramsPublicationWorkspace` assignment section → shared flow
- `ConfigOwnershipSourceBadge` inside ownership prototype

## New modules

| Path | Role |
|------|------|
| `web/lib/configRuntime/programLocationAvailabilityPrototypeModel.ts` | Fixture adapter, preview, session apply, vocabulary |
| `web/components/adminV2/settings/programs/ProgramLocationAvailabilityFlow.tsx` | Shared wizard |
| `web/components/adminV2/settings/programs/ProgramOwnershipEditPrototype.tsx` | Ownership edit prototype |

## Interaction-state map

| Step | State | UI |
|------|-------|-----|
| context | program identity / create fields / choose path | Step 1 |
| locations | selectedLocationIds + search + bulk | Step 2 |
| review | PrototypePreviewResult | Step 3 |
| success | PrototypeApplyResult (sessionStorage) | Step 4 |
| ownership choose/org/location | separate edit surfaces | Edit prototype |

## Operator copy (canonical)

- “Make available at Locations”
- “{Program} will be made available at N Locations.”
- “N Locations will use the Organization definition.”
- “N Locations already have local configuration and will retain it.”
- “N selected Locations are blocked and will not be changed.”
- “{Program} is now available at N Locations.”
- Status chips: Organization definition · Available at Location · Inherits Organization · Locally configured · Not available · Blocked · Restore Organization default

## Known unsupported (Stage 1)

- No production `assign` / create-publish-assign mutation
- No durable audit / invalidation for Apply
- Blocked Locations are fixture rules (~every 17th + archive/inactive ids)
- Org impact counts (32 / 3) are prototype fixture numbers on ownership edit
- Retry affordance copy only — not wired
- BOS not in scope

## Confirmation — no production mutation

`PROGRAM_LOCATION_AVAILABILITY_STAGE === "prototype"`.  
`Apply` writes `sessionStorage` key `alloy.programLocationAvailability.prototype.v1` only.  
Location `onComplete` skips invalidation for `prototype-*` / `__draft__*` ids.

## Screenshots

`.alloy-agent-evidence/program-location-availability-prototype/`

| File | Scenario |
|------|----------|
| `03-location-add-choose.png` | Location → Add Program choose path |
| `04-location-use-existing.png` | Use existing catalog (drafts allowed in prototype) |
| `05-location-locations.png` | Location-direction Location picker |
| `06-location-review.png` | Location-direction review |
| `07-location-success.png` | Location-direction success |
| `08-ownership-choose.png` | Ownership edit choose surface |
| `10-ownership-location.png` | Location configuration edit |
| `11-ownership-saved.png` | Location configuration saved (fixture) |
| `13-org-add-to-locations.png` | Org Program → Add to Locations context |
| `14-org-locations.png` / `14b-org-select-all.png` | Org Location picker + select all |
| `15-org-review.png` | Org review |
| `16-org-success.png` | Org success |
| `19–22-location-create-*.png` | Create new Program from Location |

## Stages 2–4 (blocked on approval)

Backend authority audit → production command → frontend wire → E2E certification.  
See user sprint brief; not started.

## BOS (future only)

Same preview + same command; never a separate bulk-write path.
