import { describe, expect, it } from "vitest";
import {
    buildBusinessProcessWorkRuntimeFingerprint,
    parseBusinessProcessWorkRuntimeFingerprint,
} from "@/lib/lifecycle/buildBusinessProcessWorkRuntimeFingerprint";

describe("buildBusinessProcessWorkRuntimeFingerprint", () => {
    it("builds stable canonical tuple fingerprint", () => {
        expect(
            buildBusinessProcessWorkRuntimeFingerprint({
                orgId: "org-1",
                entityType: "opportunities",
                entityId: "opp-1",
                stageKey: "tour",
                templateKey: "confirm_tour_date",
            }),
        ).toBe("bp:org-1:opportunities:opp-1:tour:confirm_tour_date");
    });

    it("round-trips through parse helper", () => {
        const fingerprint = buildBusinessProcessWorkRuntimeFingerprint({
            orgId: "org-1",
            entityType: "opportunities",
            entityId: "opp-1",
            stageKey: "tour",
            templateKey: "confirm_tour_date",
        });
        expect(parseBusinessProcessWorkRuntimeFingerprint(fingerprint)).toEqual({
            orgId: "org-1",
            entityType: "opportunities",
            entityId: "opp-1",
            stageKey: "tour",
            templateKey: "confirm_tour_date",
        });
    });
});
