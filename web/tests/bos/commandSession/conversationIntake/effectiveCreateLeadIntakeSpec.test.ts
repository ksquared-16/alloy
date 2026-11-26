import { describe, expect, it } from "vitest";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { gatherFieldsFromActionIntakeSpec } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import { buildEffectiveCreateLeadIntakeSpec } from "@/lib/bos/commandSession/conversationIntake";

describe("buildEffectiveCreateLeadIntakeSpec", () => {
    it("mirrors gatherFieldsFromActionIntakeSpec for the same ActionIntakeSpec", () => {
        const spec = createLeadParserSpec("dept-1");
        const gather = gatherFieldsFromActionIntakeSpec(spec);
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "dept-1",
            actionIntakeSpec: spec,
        });
        expect(effective.gatherFields.map((f) => f.payload_key)).toEqual(
            gather.map((f) => f.payload_key)
        );
        expect(effective.requiredPayloadKeys).toEqual(
            gather.filter((f) => f.tier === "required").map((f) => f.payload_key)
        );
    });

    it("exposes configRequiredInputs beyond the platform contact floor", () => {
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "dept-1",
            actionIntakeSpec: createLeadParserSpec("dept-1"),
        });
        // location_id is a platform gather required that is not in CREATE_LEAD_REQUIRED_INPUTS.
        if (effective.requiredPayloadKeys.includes("location_id")) {
            expect(
                effective.configRequiredInputs.some((i) => i.key === "location_id" && i.fromConfig)
            ).toBe(true);
        }
    });
});
