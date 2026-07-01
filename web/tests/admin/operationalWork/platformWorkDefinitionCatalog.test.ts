import { describe, expect, it } from "vitest";

import {
    getPlatformWorkDefinition,
    isKnownWorkDefinitionKey,
    listPlatformWorkDefinitionKeys,
    listPlatformWorkDefinitions,
} from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
import type { OperationalWorkCategory } from "@/lib/admin/operationalWork/operationalWorkTypes";

const WORK_CATEGORIES = new Set<OperationalWorkCategory>([
    "information_collection",
    "review",
    "follow_up",
    "decision",
    "resolution",
    "compliance",
    "coordination",
    "other",
]);

describe("platformWorkDefinitionCatalog", () => {
    it("has unique catalog keys", () => {
        const keys = listPlatformWorkDefinitionKeys();
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toHaveLength(6);
    });

    it("registers all required initial keys", () => {
        for (const key of [
            "manual_ad_hoc",
            "contact_family",
            "follow_up_after_tour",
            "collect_missing_information",
            "record_tour_outcome",
            "resolve_outstanding_balance",
        ]) {
            expect(isKnownWorkDefinitionKey(key)).toBe(true);
            expect(getPlatformWorkDefinition(key)).not.toBeNull();
        }
    });

    it("uses valid category, shape, and dedupe policy values", () => {
        for (const def of listPlatformWorkDefinitions()) {
            expect(WORK_CATEGORIES.has(def.category)).toBe(true);
            expect(def.default_shape).toBe("task");
            expect(["none", "definition_subject", "definition_subject_period"]).toContain(def.dedupe_policy);
            expect(def.display_name.trim().length).toBeGreaterThan(0);
            expect(def.outcome_intent.trim().length).toBeGreaterThan(0);
            expect(def.allowed_subjects.length).toBeGreaterThan(0);
        }
    });

    it("uses weak dedupe only for manual ad hoc", () => {
        expect(getPlatformWorkDefinition("manual_ad_hoc")?.dedupe_policy).toBe("none");
        for (const def of listPlatformWorkDefinitions()) {
            if (def.key === "manual_ad_hoc") continue;
            expect(def.dedupe_policy).not.toBe("none");
        }
    });

    it("rejects unknown keys", () => {
        expect(isKnownWorkDefinitionKey("custom_operator_key")).toBe(false);
        expect(getPlatformWorkDefinition("custom_operator_key")).toBeNull();
    });
});
