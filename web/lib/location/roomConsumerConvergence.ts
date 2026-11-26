/**
 * Room consumer-convergence ledger (Phase A, A3).
 *
 * The canonical Room provider (`resolveRoomsForLocation` / `resolveRoomById` /
 * `resolveRoomsForProgram`) is the single way to enumerate rooms. Many consumers
 * still derive rooms by querying `location_type === 'unit'` (or an `isRoom`
 * helper) directly. Phase A introduces the provider and RECORDS those sites here
 * as the migration ledger; Phase C migrates them and shrinks this list to zero;
 * Phase E removes the direct reads.
 *
 * This is a documentation artifact (the frozen baseline), not enforcement — see
 * the Phase A plan (A3). NOT offenders and intentionally excluded: `room_location_id`
 * FK columns on the childcare rule / attendance / placement / rate tables (they
 * store a room id but never query `locations`), and pure display helpers that only
 * format a type label. Grep at base 542db595f (worktree HEAD) — 12 files.
 */

export const KNOWN_ROOM_DIRECT_QUERY_OFFENDERS: readonly string[] = [
    "app/api/admin/locations/route.ts",
    "components/admin/entity/LocationDrawerContextPanel.tsx",
    "components/adminV2/settings/LocationsHierarchySettingsClient.tsx",
    "components/adminV2/settings/businessProcess/WorkViewConditionEditor.tsx",
    "components/adminV2/settings/configurationRuntime/useScopeOptions.ts",
    "components/adminV2/settings/locations/useLocationsConfigurationSettings.ts",
    "lib/admin/location/locationDrawerPresentation.ts",
    "lib/admin/locationListPresentation.ts",
    "lib/adminV2/locationsHierarchyTablePresentation.ts",
    "lib/communications/v2/audienceHierarchy.ts",
    "lib/fields/configurablePlacementFieldCatalog.ts",
    "lib/lifecycle/workViewConditionFieldRegistry.ts",
];

/** The provider entry points these offenders should converge onto in Phase C. */
export const CANONICAL_ROOM_PROVIDER_ENTRYPOINTS: readonly string[] = [
    "resolveRoomsForLocation",
    "resolveRoomById",
    "resolveRoomsForProgram",
];
