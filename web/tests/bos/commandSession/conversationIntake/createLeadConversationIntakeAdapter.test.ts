import { describe, expect, it } from "vitest";

import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import { emptyBosCommandDraft } from "@/lib/bos/commandSession";
import {
    buildEffectiveCreateLeadIntakeSpec,
    createLeadConversationIntakeAdapter,
} from "@/lib/bos/commandSession/conversationIntake";

const JORDAN = ["Jordan Lee", "jordan.lee@test.com", "1231231234"].join("\n");

describe("createLeadConversationIntakeAdapter", () => {
    it("exposes create_lead as the adapter action key", () => {
        expect(createLeadConversationIntakeAdapter.actionKey).toBe("create_lead");
    });

    it("loads an effective intake spec from a platform fallback ActionIntakeSpec", () => {
        const effective = createLeadConversationIntakeAdapter.loadEffectiveSpec({
            departmentId: "dept-1",
            actionIntakeSpec: createLeadParserSpec("dept-1"),
        });
        // Sync contract — Create Lead controller setState must not receive a Promise.
        expect(effective).not.toBeInstanceOf(Promise);
        expect(effective.actionKey).toBe("create_lead");
        expect(effective.gatherFields.length).toBeGreaterThan(0);
        expect(effective.requiredPayloadKeys).toContain("first_name");
        expect(effective.actionIntakeSpec).toBeTruthy();
    });

    it("parses an operator turn into a draft and builds an understanding summary", () => {
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "dept-1",
            actionIntakeSpec: createLeadParserSpec("dept-1"),
        });
        const draft = createLeadConversationIntakeAdapter.parseOperatorTurn({
            text: JORDAN,
            draft: emptyBosCommandDraft(),
            effectiveSpec: effective,
        });
        expect(draft.values.some((v) => v.fieldKey === "first_name")).toBe(true);

        const summary = createLeadConversationIntakeAdapter.buildUnderstandingSummary({
            draft,
            effectiveSpec: effective,
        });
        expect(summary.lines.length).toBeGreaterThan(0);
        expect(summary.evidenceNotes.some((n) => /Jordan/i.test(n.value))).toBe(true);

        const clarification = createLeadConversationIntakeAdapter.nextClarification({
            draft,
            effectiveSpec: effective,
            workspace: { departmentId: "dept-1" },
        });
        // Platform contact floor is satisfied; location (platform gather required) may still clarify.
        if (clarification) {
            expect(clarification.missingRequiredKeys).toContain("location_id");
            expect(clarification.prompt).toMatch(/location/i);
        }
        const resolution = createLeadConversationIntakeAdapter.syncDraftResolution({
            draft,
            effectiveSpec: effective,
            workspace: { departmentId: "dept-1" },
        });
        expect(resolution.blockers.every((b) => b.code === "missing_required_input")).toBe(true);
    });

    it("asks for missing required details after a partial turn", () => {
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "dept-1",
            actionIntakeSpec: createLeadParserSpec("dept-1"),
        });
        const draft = createLeadConversationIntakeAdapter.parseOperatorTurn({
            text: "Jordan Lee",
            draft: emptyBosCommandDraft(),
            effectiveSpec: effective,
        });
        const clarification = createLeadConversationIntakeAdapter.nextClarification({
            draft,
            effectiveSpec: effective,
            workspace: { departmentId: "dept-1" },
        });
        expect(clarification).not.toBeNull();
        expect(clarification!.prompt.length).toBeGreaterThan(0);
        expect(clarification!.missingRequiredKeys.length).toBeGreaterThan(0);
    });

    it("builds review via the same draft fingerprint path as the command adapter", () => {
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "dept-1",
            actionIntakeSpec: createLeadParserSpec("dept-1"),
        });
        const draft = createLeadConversationIntakeAdapter.parseOperatorTurn({
            text: JORDAN,
            draft: emptyBosCommandDraft(),
            effectiveSpec: effective,
        });
        const preview = createLeadConversationIntakeAdapter.buildReview({
            draft,
            effectiveSpec: effective,
            workspace: { departmentId: "dept-1", workUnitId: "wu-1" },
        });
        expect(preview.title).toBeTruthy();
        expect(preview.draftFingerprint).toBeTruthy();
        expect(preview.summaryLines.length).toBeGreaterThan(0);
    });

    it("summarizes location by option label, not raw site id", () => {
        const effective = buildEffectiveCreateLeadIntakeSpec({
            departmentId: "dept-1",
            actionIntakeSpec: createLeadParserSpec("dept-1"),
            fieldOptions: {
                location_id: [{ value: "site-north-uuid", label: "North Campus" }],
            },
        });
        const draft = {
            ...emptyBosCommandDraft(),
            values: [
                {
                    fieldKey: "location_id",
                    value: "site-north-uuid",
                    state: "confirmed" as const,
                    optionResolved: true,
                    evidence: [
                        {
                            kind: "system_default" as const,
                            note: "From your location",
                            at: new Date().toISOString(),
                        },
                    ],
                },
            ],
        };
        const summary = createLeadConversationIntakeAdapter.buildUnderstandingSummary({
            draft,
            effectiveSpec: effective,
        });
        expect(summary.lines.some((line) => line.includes("North Campus"))).toBe(true);
        expect(summary.lines.some((line) => line.includes("site-north-uuid"))).toBe(false);
        expect(summary.evidenceNotes.some((n) => n.value === "North Campus")).toBe(true);
    });
});
