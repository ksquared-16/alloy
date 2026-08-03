import { describe, expect, it } from "vitest";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import {
    buildEffectiveCreateLeadIntakeSpec,
    createLeadConversationIntakeAdapter,
    describeConversationParseCoverage,
} from "@/lib/bos/commandSession/conversationIntake";
import { emptyBosCommandDraft } from "@/lib/bos/commandSession";

describe("spec-driven create lead clarification", () => {
    it("uses effective field labels in clarification prompts", () => {
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "dept-1",
            actionIntakeSpec: createLeadParserSpec("dept-1"),
        });
        const draft = createLeadConversationIntakeAdapter.parseOperatorTurn({
            text: "Sam",
            draft: emptyBosCommandDraft(),
            effectiveSpec: effective,
        });
        const clarification = createLeadConversationIntakeAdapter.nextClarification({
            draft,
            effectiveSpec: effective,
            workspace: { departmentId: "dept-1" },
        });
        expect(clarification).not.toBeNull();
        expect(clarification!.prompt).not.toMatch(/first_name|last_name|payload/i);
        expect(clarification!.prompt).toMatch(/I still need/i);
    });

    it("documents bounded parse coverage without dropping Form-only fields", () => {
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "dept-1",
            actionIntakeSpec: createLeadParserSpec("dept-1"),
        });
        const coverage = describeConversationParseCoverage(effective);
        expect(coverage.parseablePayloadKeys.length).toBeGreaterThan(0);
        expect(coverage.guidance.length).toBeGreaterThan(0);
        for (const key of coverage.formOnlyPayloadKeys) {
            expect(effective.gatherFields.some((f) => f.payload_key === key)).toBe(true);
        }
    });
});
