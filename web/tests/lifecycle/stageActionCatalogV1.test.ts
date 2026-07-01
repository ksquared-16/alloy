import { describe, expect, it } from "vitest";
import {
    parseStageActionCatalogV1,
    candidateActionForKey,
} from "@/lib/lifecycle/stageActionCatalogV1";

describe("parseStageActionCatalogV1", () => {
    it("returns null for invalid input", () => {
        expect(parseStageActionCatalogV1(null)).toBeNull();
        expect(parseStageActionCatalogV1({})).toBeNull();
        expect(parseStageActionCatalogV1({ version: 2 })).toBeNull();
        expect(parseStageActionCatalogV1({ version: 1 })).toBeNull();
    });

    it("parses a valid catalog", () => {
        const raw = {
            version: 1,
            candidate_actions: [
                { action_key: "waitlist_child", recommendation: "recommended" },
                { action_key: "enroll_child", recommendation: "ready", override_label: "Enroll Now" },
            ],
        };
        const result = parseStageActionCatalogV1(raw);
        expect(result).not.toBeNull();
        expect(result?.candidate_actions).toHaveLength(2);
        expect(result?.candidate_actions[0]?.action_key).toBe("waitlist_child");
        expect(result?.candidate_actions[0]?.recommendation).toBe("recommended");
        expect(result?.candidate_actions[1]?.override_label).toBe("Enroll Now");
    });

    it("skips entries missing action_key", () => {
        const raw = {
            version: 1,
            candidate_actions: [
                { action_key: "", recommendation: "ready" },
                { action_key: "waitlist_child", recommendation: "recommended" },
            ],
        };
        const result = parseStageActionCatalogV1(raw);
        expect(result?.candidate_actions).toHaveLength(1);
    });

    it("defaults invalid recommendation to ready", () => {
        const raw = {
            version: 1,
            candidate_actions: [
                { action_key: "enroll_child", recommendation: "unknown_value" },
            ],
        };
        const result = parseStageActionCatalogV1(raw);
        expect(result?.candidate_actions[0]?.recommendation).toBe("ready");
    });
});

describe("candidateActionForKey", () => {
    const catalog = parseStageActionCatalogV1({
        version: 1,
        candidate_actions: [
            { action_key: "waitlist_child", recommendation: "recommended" },
        ],
    });

    it("finds an action in the catalog", () => {
        expect(candidateActionForKey(catalog, "waitlist_child")).not.toBeNull();
    });

    it("returns null for unknown key", () => {
        expect(candidateActionForKey(catalog, "enroll_child")).toBeNull();
    });

    it("returns null for null catalog", () => {
        expect(candidateActionForKey(null, "waitlist_child")).toBeNull();
    });
});
