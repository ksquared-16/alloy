import { describe, expect, it } from "vitest";
import {
    buildBusinessProcessWorkRuntimeFingerprint,
    parseBusinessProcessWorkRuntimeFingerprint,
} from "@/lib/lifecycle/buildBusinessProcessWorkRuntimeFingerprint";

describe("buildBusinessProcessWorkRuntimeFingerprint", () => {
    it("builds durable semantic fingerprint (stage is not encoded)", () => {
        expect(
            buildBusinessProcessWorkRuntimeFingerprint({
                orgId: "org-1",
                entityType: "opportunities",
                entityId: "opp-1",
                stageKey: "tour",
                templateKey: "confirm_tour_date",
            }),
        ).toBe("bpw:org-1:opportunities:opp-1:confirm_tour_date");
    });

    it("round-trips through parse helper", () => {
        const fingerprint = buildBusinessProcessWorkRuntimeFingerprint({
            orgId: "org-1",
            entityType: "opportunities",
            entityId: "opp-1",
            stageKey: "tour",
            templateKey: "confirm_tour_date",
            workDefinitionKey: "contact_family",
        });
        expect(parseBusinessProcessWorkRuntimeFingerprint(fingerprint)).toEqual({
            orgId: "org-1",
            entityType: "opportunities",
            entityId: "opp-1",
            stageKey: null,
            semanticWorkKey: "contact_family",
            templateKey: "contact_family",
            format: "semantic",
        });
    });
});
