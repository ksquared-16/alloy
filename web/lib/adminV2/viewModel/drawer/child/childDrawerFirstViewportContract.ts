/**
 * Child drawer (person child chrome) first-viewport contract — current product truth.
 */
import { PERSON_LAYOUT_VARIANT_CHILD } from "@/lib/admin/person/personDrawerLayoutRuntime";
import type {
    ChildDrawerFirstPaintDependencyKey,
    ChildDrawerFirstPaintViewportSlot,
} from "@/lib/adminV2/viewModel/drawer/child/types";

export const CHILD_DRAWER_FIRST_VIEWPORT_SLOTS: readonly ChildDrawerFirstPaintViewportSlot[] = [
    "header",
    "title",
    "header_chips",
    "lifecycle_rail",
    "child_summary",
    "household",
    "medical",
    "bos_panel",
];

export const CHILD_DRAWER_FIRST_PAINT_DEPENDENCIES: readonly ChildDrawerFirstPaintDependencyKey[] = [
    "record_full",
    "status_definitions",
    "composed_sections",
];

export type ChildFirstViewportPlan = {
    viewport_slots: ChildDrawerFirstPaintViewportSlot[];
    dependencies: ChildDrawerFirstPaintDependencyKey[];
    variant_key: string;
};

export function buildChildFirstViewportPlan(): ChildFirstViewportPlan {
    return {
        viewport_slots: [...CHILD_DRAWER_FIRST_VIEWPORT_SLOTS],
        dependencies: [...CHILD_DRAWER_FIRST_PAINT_DEPENDENCIES],
        variant_key: PERSON_LAYOUT_VARIANT_CHILD,
    };
}

export function isChildDrawerVmOpen(input: {
    openSource?: string | null;
    presentationEmphasis?: string | null;
}): boolean {
    const emphasis = String(input.presentationEmphasis ?? "").trim();
    if (emphasis === "child_lifecycle") return true;
    return String(input.openSource ?? "").trim() === "opportunity_inquiry_child";
}
