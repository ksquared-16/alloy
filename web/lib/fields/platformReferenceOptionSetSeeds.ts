/**
 * Platform reference-backed option set seeds — shared between migration and tests.
 * Phase 1: vocabulary only; runtime resolution wired in Phase 2.
 */
import type { OptionSetConfig } from "@/lib/fields/optionSetConfig";

export type PlatformReferenceOptionSetSeed = {
    set_key: string;
    label: string;
    sort_order: number;
    config: OptionSetConfig;
};

export const PLATFORM_REFERENCE_OPTION_SET_SEEDS: readonly PlatformReferenceOptionSetSeed[] = [
    {
        set_key: "schools",
        label: "Schools",
        sort_order: 100,
        config: {
            version: 1,
            mode: "reference",
            reference: {
                entity: "locations",
                value_field: "id",
                label_field: "label",
                filters: [{ field: "location_type", operator: "eq", value: "site" }],
            },
        },
    },
    {
        set_key: "programs",
        label: "Programs",
        sort_order: 110,
        config: {
            version: 1,
            mode: "reference",
            reference: {
                entity: "location_program_categories",
                value_field: "id",
                label_field: "label",
            },
            cascade: {
                depends_on: [{ bind_to_filter: "location_id" }],
            },
        },
    },
    {
        set_key: "rooms",
        label: "Rooms",
        sort_order: 120,
        config: {
            version: 1,
            mode: "reference",
            reference: {
                entity: "locations",
                value_field: "id",
                label_field: "label",
                filters: [{ field: "location_type", operator: "eq", value: "unit" }],
            },
            cascade: {
                depends_on: [
                    { bind_to_filter: "parent_location_id" },
                    { bind_to_metadata: "category", optional: true },
                ],
            },
        },
    },
] as const;

export const PLATFORM_REFERENCE_OPTION_SET_KEYS = PLATFORM_REFERENCE_OPTION_SET_SEEDS.map((s) => s.set_key);
