/**
 * `child_surface` compatibility authoring seed.
 *
 * Runtime presentation reads canonical `children_surface` through
 * identitySurfaceCompat. New code should import child field capabilities from
 * childIdentityFieldRuntime.ts.
 */

import type { NestedSurfaceFieldMode } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import {
    CHILD_FOCUS_FIELD_DEFS,
    type ChildFocusFieldKey,
} from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";

export {
    CHILD_FOCUS_FIELD_DEFS,
    CHILD_UNSUPPORTED_SAVE_FIELD_KEYS,
    childFocusViewFromConfig,
    isChildFocusFieldSaveSupported,
    orderedChildEditFieldKeys,
    type ChildFocusFieldDef,
    type ChildFocusFieldKey,
    type ChildFocusFieldRow,
    type ChildFocusView,
} from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";

export const CHILD_SURFACE_ID = "child_surface" as const;

/** Expanded evidence sections owned by domain modules — not configurable in composer V1. */
export const CHILD_DOMAIN_LOCKED_EVIDENCE_SECTIONS = [
    { key: "medical", label: "Medical" },
    { key: "documents", label: "Documents" },
    { key: "pickup_instructions", label: "Pickup instructions" },
] as const;

export type ChildDomainLockedSectionKey = (typeof CHILD_DOMAIN_LOCKED_EVIDENCE_SECTIONS)[number]["key"];

/** Default field modes for child_surface authoring seed. */
export function defaultChildFieldModes(): Record<string, NestedSurfaceFieldMode> {
    const modes: Record<string, NestedSurfaceFieldMode> = {};
    for (const key of Object.keys(CHILD_FOCUS_FIELD_DEFS)) {
        modes[key] = { displayed: true, editable: false };
    }
    modes["inquiry_child.program"] = { displayed: true, editable: false };
    modes["child.room"] = { displayed: true, editable: false };
    modes["inquiry_child.schedule_type"] = { displayed: true, editable: false };
    modes["child.start_date"] = { displayed: true, editable: false };
    return modes;
}
