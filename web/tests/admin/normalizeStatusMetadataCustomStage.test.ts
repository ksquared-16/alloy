import { describe, expect, it } from "vitest";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";
import { ENROLLMENT_OPERATOR_STAGE_METADATA_KEY } from "@/lib/lifecycle/enrollmentOperatorStage";

describe("normalizeStatusDefinitionMetadata custom builder stages", () => {
    it("preserves enrolling on status_definitions.metadata", () => {
        const out = normalizeStatusDefinitionMetadata({
            [ENROLLMENT_OPERATOR_STAGE_METADATA_KEY]: "enrolling",
        });
        expect(out[ENROLLMENT_OPERATOR_STAGE_METADATA_KEY]).toBe("enrolling");
    });
});
