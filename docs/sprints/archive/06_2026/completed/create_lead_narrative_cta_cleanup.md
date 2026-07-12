# Create Lead Action Workspace — Narrative + CTA Cleanup

**Path:** `docs/sprints/06_2026/completed/create_lead_narrative_cta_cleanup.md`  
**Date:** 2026-06-08  
**Status:** Complete

## Goal

Make Create Lead feel like BOS prepared the lead and the operator approves it — less wizard, more operational handoff. Keep the stable BOS Action Workspace shell (no cloud shell revisit).

---

## Delivered

| Area | Change |
|------|--------|
| **BOS identity** | Genie lamp (`BosGenieLampIcon`) on header badge, guidance/suggestions panels, paste analyze CTA, success state |
| **Flow** | Gather (paste → suggestions → form) is review/edit; optional **Review details** read-only preview; primary CTA **Create Lead** skips forced summary |
| **Step rail** | Labels: Gather → Review/Edit → Create → Continue |
| **Execution loader** | `BosExecutionLoader` — canonical neural pulse + phased progress (reuse for future BOS actions) |
| **Success** | Structured `BosRecommendation` (readiness, blockingRequirements, actionKey); Schedule Tour gated on child/program/location/start date; Send Welcome `coming_soon`; Required Information follow-ups |
| **Action rails** | `WorkspaceActionRailButton` + `WorkspaceCommandRailActionsSection` align department and work-unit Actions panels |
| **Backend** | Unchanged — still `onSubmit` → existing execute path |

---

## Create Lead form source of truth (audit)

**Doctrine:** AI extracts values → platform maps values → configured form renders values. AI does not invent the form.

| Layer | Source | Notes |
|-------|--------|-------|
| **Field manifest** | `web/lib/admin/actions/createLeadPlatformGather.ts` — `CREATE_LEAD_GATHER_FIELDS` | Hardcoded platform gather manifest (not layout JSON) |
| **Sections / labels** | `gatherSections()` from same module | Person / Child / Context grouping |
| **Parser mapping** | `createLeadParserSpec()` + `CREATE_LEAD_PAYLOAD_KEY_BY_RULE` | AI/paste extraction maps into fixed `payload_key` slots |
| **Suggestions UI** | `bosSuggestionsFromExtraction()` | Confidence badges; explicit Apply — no auto-apply |
| **Gather UI** | `ActionWorkspaceGatherFields.tsx` | Renders manifest fields; placement selects for site/program/room |
| **Execute payload** | `mapCreateLeadGatherToExecutePayload()` | Platform minimum validation via `validateCreateLeadPlatformMinimum()` |
| **Lifecycle spec API** | Not used in current workspace | Prior sprint used `fetchActionIntakeSpec`; workspace cutover uses platform gather manifest |

**Not layout/config-driven** for Create Lead gather/review fields today. Future convergence can align manifest with layout runtime field catalog without changing execute contract.

---

## Key files

- `web/components/admin/opportunity/actions/CreateLeadModal.tsx`
- `web/components/admin/actions/BosExecutionLoader.tsx`
- `web/lib/admin/actions/createLeadBosGuidance.ts`
- `web/lib/admin/actions/createLeadPlatformGather.ts`
- `web/lib/admin/actions/actionWorkspaceTypes.ts`

---

## Manual test

1. Workspace → Create Lead
2. Paste inquiry → Analyze with BOS → review suggestions → Apply
3. Edit form if needed → **Create Lead** (not forced review)
4. Neural loader → success with gated recommendations
5. **Open Lead** → drawer opens; BOS rail returns

Optional: **Review details** → read-only summary → **Create Lead**

---

## Tests

```bash
cd web && npm run test -- tests/admin/actions/actionWorkspaceFoundation.test.ts
cd web && npx tsc --noEmit
```
