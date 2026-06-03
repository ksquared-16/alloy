import { describe, expect, it } from "vitest";

import {
    LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY,
} from "@/lib/admin/operationalWork/lifecycleWorkDefinitionsConfig";
import {
    resolveEffectiveWorkDefinitions,
    resolveWorkDefinition,
} from "@/lib/admin/operationalWork/resolveWorkDefinition";

describe("resolveWorkDefinition", () => {
    it("returns catalog defaults when no metadata", () => {
        const defs = resolveEffectiveWorkDefinitions({});
        expect(defs.length).toBeGreaterThan(0);
        const contact = defs.find((d) => d.key === "contact_family");
        expect(contact?.display_name).toBe("Contact family");
        expect(contact?.enabled).toBe(true);
        expect(contact?.due_policy).toEqual({ kind: "offset_from_create", days: 1 });
    });

    it("applies enable/disable from metadata", () => {
        const metadata = {
            [LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY]: {
                version: 1,
                definitions: {
                    contact_family: { enabled: false },
                    resolve_outstanding_balance: { enabled: true },
                },
            },
        };

        const enabledOnly = resolveEffectiveWorkDefinitions({ departmentMetadata: metadata });
        expect(enabledOnly.some((d) => d.key === "contact_family")).toBe(false);
        expect(enabledOnly.some((d) => d.key === "resolve_outstanding_balance")).toBe(true);

        const withDisabled = resolveEffectiveWorkDefinitions({
            departmentMetadata: metadata,
            includeDisabled: true,
        });
        const disabledContact = withDisabled.find((d) => d.key === "contact_family");
        expect(disabledContact?.enabled).toBe(false);
    });

    it("applies simple overrides from metadata", () => {
        const metadata = {
            [LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY]: {
                version: 1,
                definitions: {
                    contact_family: {
                        enabled: true,
                        display_name_override: "Reach out",
                        default_title_override: "Call today",
                        assignee_policy_override: { kind: "creator" },
                    },
                },
            },
        };

        const def = resolveWorkDefinition("contact_family", { departmentMetadata: metadata });
        expect(def?.display_name).toBe("Reach out");
        expect(def?.default_title).toBe("Call today");
        expect(def?.assignee_policy).toEqual({ kind: "creator" });
        expect(def?.metadata_overrides?.display_name).toBe("Reach out");
    });

    it("filters by stage binding from metadata", () => {
        const metadata = {
            [LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY]: {
                version: 1,
                definitions: {},
                stage_bindings: {
                    tour: {
                        available_definition_keys: ["manual_ad_hoc", "record_tour_outcome"],
                    },
                },
            },
        };

        const tourDefs = resolveEffectiveWorkDefinitions({
            departmentMetadata: metadata,
            stageKey: "tour",
        });
        const tourKeys = tourDefs.map((d) => d.key);
        expect(tourKeys).toContain("manual_ad_hoc");
        expect(tourKeys).toContain("record_tour_outcome");
        expect(tourKeys).not.toContain("contact_family");

        expect(
            resolveWorkDefinition("contact_family", {
                departmentMetadata: metadata,
                stageKey: "tour",
            }),
        ).toBeNull();
    });

    it("uses platform default stage bindings when metadata has no stage_bindings", () => {
        const tourDefs = resolveEffectiveWorkDefinitions({ stageKey: "tour" });
        const tourKeys = tourDefs.map((d) => d.key);
        expect(tourKeys).toContain("record_tour_outcome");
        expect(tourKeys).toContain("follow_up_after_tour");
    });

    it("always allows manual ad hoc when stage filter applies", () => {
        const metadata = {
            [LIFECYCLE_WORK_DEFINITIONS_METADATA_KEY]: {
                version: 1,
                definitions: {},
                stage_bindings: {
                    tour: { available_definition_keys: ["record_tour_outcome"] },
                },
            },
        };

        const def = resolveWorkDefinition("manual_ad_hoc", {
            departmentMetadata: metadata,
            stageKey: "tour",
        });
        expect(def?.key).toBe("manual_ad_hoc");
    });

    it("does not instantiate work — returns policy config only", () => {
        const def = resolveWorkDefinition("contact_family");
        expect(def).toBeDefined();
        expect(def).toHaveProperty("due_policy");
        expect(def).not.toHaveProperty("status");
        expect(def).not.toHaveProperty("work");
    });

    it("returns null for unknown keys", () => {
        expect(resolveWorkDefinition("not_a_real_key")).toBeNull();
    });
});
