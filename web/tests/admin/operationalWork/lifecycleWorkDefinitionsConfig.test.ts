import { describe, expect, it } from "vitest";

import {
    LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY,
    parseLifecycleWorkDefinitionsV1,
} from "@/lib/admin/operationalWork/lifecycleWorkDefinitionsConfig";

describe("parseLifecycleWorkDefinitionsV1", () => {
    it("returns null for missing or invalid metadata", () => {
        expect(parseLifecycleWorkDefinitionsV1(null)).toBeNull();
        expect(parseLifecycleWorkDefinitionsV1({})).toBeNull();
        expect(parseLifecycleWorkDefinitionsV1({ [LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY]: { version: 2 } })).toBeNull();
    });

    it("accepts valid v1 config with definitions and stage bindings", () => {
        const parsed = parseLifecycleWorkDefinitionsV1({
            [LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY]: {
                version: 1,
                definitions: {
                    contact_family: {
                        enabled: true,
                        display_name_override: "Call the family",
                        due_policy_override: { kind: "offset_from_create", days: 2 },
                    },
                    follow_up_after_tour: { enabled: false },
                },
                stage_bindings: {
                    tour: {
                        available_definition_keys: ["manual_ad_hoc", "record_tour_outcome", "follow_up_after_tour"],
                    },
                },
            },
        });

        expect(parsed?.version).toBe(1);
        expect(parsed?.definitions.contact_family?.enabled).toBe(true);
        expect(parsed?.definitions.contact_family?.display_name_override).toBe("Call the family");
        expect(parsed?.definitions.contact_family?.due_policy_override).toEqual({ kind: "offset_from_create", days: 2 });
        expect(parsed?.definitions.follow_up_after_tour?.enabled).toBe(false);
        expect(parsed?.stage_bindings.tour?.available_definition_keys).toEqual([
            "manual_ad_hoc",
            "record_tour_outcome",
            "follow_up_after_tour",
        ]);
    });

    it("strips unknown definition keys and stage binding keys", () => {
        const parsed = parseLifecycleWorkDefinitionsV1({
            [LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY]: {
                version: 1,
                definitions: {
                    contact_family: { enabled: true },
                    operator_custom_work: { enabled: true },
                },
                stage_bindings: {
                    tour: {
                        available_definition_keys: ["contact_family", "unknown_key"],
                    },
                },
                triggers: [{ event: "stage_entered" }],
            },
        });

        expect(parsed?.definitions.contact_family).toBeDefined();
        expect((parsed?.definitions as Record<string, unknown>).operator_custom_work).toBeUndefined();
        expect(parsed?.stage_bindings.tour?.available_definition_keys).toEqual(["contact_family"]);
    });

    it("ignores definition entries without boolean enabled", () => {
        const parsed = parseLifecycleWorkDefinitionsV1({
            [LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY]: {
                version: 1,
                definitions: {
                    contact_family: { enabled: "yes" },
                },
            },
        });
        expect(parsed).toBeNull();
    });
});
