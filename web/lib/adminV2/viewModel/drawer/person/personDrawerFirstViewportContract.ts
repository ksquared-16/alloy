/**
 * Person drawer (parent/generic chrome) first-viewport contract — current product truth.
 * Not a settings-driven layout engine. Update when first-viewport content changes.
 */
import type { PersonOperatingSectionKey } from "@/lib/admin/person/personDrawerLayoutRuntime";
import {
    PERSON_LAYOUT_VARIANT_GENERIC,
    PERSON_LAYOUT_VARIANT_PARENT,
} from "@/lib/admin/person/personDrawerLayoutRuntime";
import type {
    PersonDrawerFirstPaintDependencyKey,
    PersonDrawerFirstPaintViewportSlot,
    PersonDrawerVmSurface,
} from "@/lib/adminV2/viewModel/drawer/person/types";

export const PERSON_DRAWER_PARENT_FIRST_VIEWPORT_SLOTS: readonly PersonDrawerFirstPaintViewportSlot[] = [
    "header",
    "status",
    "title",
    "lifecycle_rail",
    "summary",
    "household",
    "household_address",
    "employee_status",
    "bos_panel",
];

export const PERSON_DRAWER_GENERIC_FIRST_VIEWPORT_SLOTS: readonly PersonDrawerFirstPaintViewportSlot[] = [
    "header",
    "status",
    "title",
];

export const PERSON_DRAWER_FIRST_PAINT_DEPENDENCIES: readonly PersonDrawerFirstPaintDependencyKey[] = [
    "record_full",
    "status_definitions",
    "composed_sections",
];

export type PersonFirstViewportPlan = {
    surface: PersonDrawerVmSurface;
    viewport_slots: PersonDrawerFirstPaintViewportSlot[];
    dependencies: PersonDrawerFirstPaintDependencyKey[];
    operating_sections: PersonOperatingSectionKey[];
    variant_key: string;
};

export function buildPersonFirstViewportPlan(surface: PersonDrawerVmSurface): PersonFirstViewportPlan {
    if (surface === "generic") {
        return {
            surface,
            viewport_slots: [...PERSON_DRAWER_GENERIC_FIRST_VIEWPORT_SLOTS],
            dependencies: [...PERSON_DRAWER_FIRST_PAINT_DEPENDENCIES],
            operating_sections: [],
            variant_key: PERSON_LAYOUT_VARIANT_GENERIC,
        };
    }
    return {
        surface: "parent",
        viewport_slots: [...PERSON_DRAWER_PARENT_FIRST_VIEWPORT_SLOTS],
        dependencies: [...PERSON_DRAWER_FIRST_PAINT_DEPENDENCIES],
        operating_sections: ["parent_summary", "household", "household_address", "employee_status"],
        variant_key: PERSON_LAYOUT_VARIANT_PARENT,
    };
}

export function resolvePersonDrawerVmSurface(input: {
    openSource?: string | null;
    presentationEmphasis?: string | null;
}): PersonDrawerVmSurface {
    const emphasis = String(input.presentationEmphasis ?? "").trim();
    if (emphasis === "guardian_communication") return "parent";
    const source = String(input.openSource ?? "").trim();
    if (
        source === "opportunity_primary_contact" ||
        source === "opportunity_household_adult" ||
        source === "person_household_link"
    ) {
        return "parent";
    }
    return "generic";
}
