import { describe, expect, it } from "vitest";
import { buildPacketReviewInsightV1 } from "@/lib/forms/packets/buildPacketReviewInsightV1";
import { PACKET_REVIEW_INSIGHT_CONTRACT_VERSION } from "@/lib/forms/packets/packetReviewInsightTypes";
import { fixtureRollup } from "@/tests/forms/packetReviewRollupFixture";

describe("buildPacketReviewInsightV1", () => {
    it("clean submitted packet → ready for review", () => {
        const rollup = fixtureRollup();
        const clean = {
            ...rollup,
            operator_review: { ...rollup.operator_review, warnings: [] },
            linkage_summary: {
                any_intake_needs_review: false,
                steps_missing_crm_fk: 0,
                steps: [],
            },
            steps: rollup.steps.map((s) => ({
                ...s,
                intake_meta: { intake_needs_review: false, intake_review_reason: null, intake_resolution_path: null },
            })),
        };
        const insight = buildPacketReviewInsightV1(clean);
        expect(insight.contract_version).toBe(PACKET_REVIEW_INSIGHT_CONTRACT_VERSION);
        expect(insight.readiness_state).toBe("ready_for_review");
        expect(insight.summary_bullets.length).toBeGreaterThanOrEqual(2);
        expect(insight.summary_bullets.some((b) => b.includes("Enrollment Packet"))).toBe(true);
        expect(insight.key_changes).toHaveLength(0);
        expect(insight.attention_items).toHaveLength(0);
        expect(insight.checklist.find((c) => c.key === "ready_to_decide")?.status).toBe("ok");
        expect(insight.human_authority_note).toContain("nothing applies automatically");
    });

    it("warning and linkage issue → needs attention", () => {
        const insight = buildPacketReviewInsightV1(fixtureRollup());
        expect(insight.readiness_state).toBe("needs_attention");
        expect(insight.key_changes.some((c) => c.includes("Name mismatch"))).toBe(true);
        expect(insight.attention_items.length).toBeGreaterThan(0);
        expect(insight.review_paths).toContain("Investigate linkage and intake flags");
        expect(insight.checklist.find((c) => c.key === "crm_linkage")?.status).not.toBe("ok");
    });

    it("incomplete packet → incomplete readiness", () => {
        const rollup = fixtureRollup();
        const incomplete = {
            ...rollup,
            status: "in_progress" as const,
            progress: { ...rollup.progress, submitted_steps: 1 },
        };
        const insight = buildPacketReviewInsightV1(incomplete);
        expect(insight.readiness_state).toBe("incomplete");
        expect(insight.suggested_focus.toLowerCase()).toContain("remaining steps");
        expect(insight.checklist.find((c) => c.key === "steps_submitted")?.status).toBe("attention");
    });

    it("submitted_record without PDF → confidence note", () => {
        const insight = buildPacketReviewInsightV1(fixtureRollup());
        expect(
            insight.confidence_notes.some((n) =>
                n.toLowerCase().includes("submitted form record on file")
            )
        ).toBe(true);
        expect(insight.confidence_notes.some((n) => n.includes("Acknowledgement"))).toBe(true);
    });

    it("uses generic packet wording (not enrollment-only contract fields)", () => {
        const insight = buildPacketReviewInsightV1(fixtureRollup());
        expect(insight).toHaveProperty("readiness_state");
        expect(insight).toHaveProperty("summary_bullets");
        expect(insight).not.toHaveProperty("enrollment_context");
        expect(insight.summary_bullets.join(" ")).not.toMatch(/enrollment-only/i);
        expect(insight.suggested_focus.toLowerCase()).not.toContain("chat");
    });

    it("is deterministic for the same rollup input", () => {
        const rollup = fixtureRollup();
        const a = buildPacketReviewInsightV1(rollup);
        const b = buildPacketReviewInsightV1(rollup);
        expect(a).toEqual(b);
    });
});
