/** Read / merge placement cascade metadata on field_definitions.config. */

import type { PlacementOptionSource } from "@/lib/fields/inquiryChildPlacementFieldMetadata";

export function getOptionSourceFromConfig(config: Record<string, unknown> | null | undefined): PlacementOptionSource | null {
    if (!config || typeof config !== "object") return null;
    const v = (config as Record<string, unknown>).option_source;
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (
        t === "locations"
        || t === "programs_for_location"
        || t === "rooms_for_location_program"
        || t === "option_set"
    ) {
        return t;
    }
    return null;
}

export function getDependsOnFieldKeyFromConfig(config: Record<string, unknown> | null | undefined): string {
    if (!config || typeof config !== "object") return "";
    const v = (config as Record<string, unknown>).depends_on_field_key;
    return typeof v === "string" ? v.trim() : "";
}

export function buildConfigWithPlacementMetadata(
    existing: Record<string, unknown> | null | undefined,
    patch: {
        option_source?: PlacementOptionSource | null;
        depends_on_field_key?: string | null;
        option_set_key?: string | null;
    },
): Record<string, unknown> {
    const base =
        existing != null && typeof existing === "object" && !Array.isArray(existing)
            ? { ...existing }
            : {};

    if (patch.option_source) {
        base.option_source = patch.option_source;
    } else if (patch.option_source === null) {
        delete base.option_source;
    }

    const depends = (patch.depends_on_field_key ?? "").trim();
    if (depends) {
        base.depends_on_field_key = depends;
    } else if (patch.depends_on_field_key === null) {
        delete base.depends_on_field_key;
    }

    const setKey = (patch.option_set_key ?? "").trim();
    if (setKey) {
        base.option_set_key = setKey;
    } else if (patch.option_set_key === null) {
        delete base.option_set_key;
    }

    return base;
}
