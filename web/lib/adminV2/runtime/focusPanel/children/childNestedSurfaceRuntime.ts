/**
 * `child_surface` compatibility authoring seed.
 *
 * Runtime presentation reads canonical `children_surface` through
 * identitySurfaceCompat. New code should import child field capabilities from
 * childIdentityFieldRuntime.ts.
 */

import type { NestedSurfaceFieldMode } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";

export const CHILD_SURFACE_ID = "child_surface" as const;

/** Expanded evidence sections owned by domain modules — not configurable in composer V1. */
export const CHILD_DOMAIN_LOCKED_EVIDENCE_SECTIONS = [
    { key: "medical", label: "Medical" },
    { key: "documents", label: "Documents" },
    { key: "pickup_instructions", label: "Pickup instructions" },
] as const;

export type ChildDomainLockedSectionKey = (typeof CHILD_DOMAIN_LOCKED_EVIDENCE_SECTIONS)[number]["key"];

const DEFAULT_CHILD_FIELD_MODE_KEYS = [
    "child.display_name",
    "child.date_of_birth",
    "child.age",
    "inquiry_child.program",
    "child.room",
    "inquiry_child.schedule_type",
    "child.start_date",
    "child.readiness_summary",
] as const;

/** Default field modes for child_surface authoring seed. */
export function defaultChildFieldModes(): Record<string, NestedSurfaceFieldMode> {
    const modes: Record<string, NestedSurfaceFieldMode> = {};
    for (const key of DEFAULT_CHILD_FIELD_MODE_KEYS) {
        modes[key] = { displayed: true, editable: false };
    }
    modes["inquiry_child.program"] = { displayed: true, editable: false };
    modes["child.room"] = { displayed: true, editable: false };
    modes["inquiry_child.schedule_type"] = { displayed: true, editable: false };
    modes["child.start_date"] = { displayed: true, editable: false };
    return modes;
}
