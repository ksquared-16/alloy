import { describe, expect, it } from "vitest";
import {
    buildLinkageReviewCalloutReasons,
    submissionDetailLinkageCalloutVisible,
    submissionListLinkageBadge,
} from "@/lib/forms/submissionLinkageReviewUx";

const attachEmpty = {
    person_id: null as string | null,
    customer_id: null as string | null,
    customer_member_id: null as string | null,
    opportunity_id: null as string | null,
};

describe("submissionLinkageReviewUx", () => {
    it("submissionListLinkageBadge — draft rows show no badge", () => {
        expect(
            submissionListLinkageBadge({
                status: "draft",
                payloadMeta: { intake_needs_review: true },
                attachRow: attachEmpty,
            }).kind
        ).toBe("none");
    });

    it("submissionListLinkageBadge — Needs review when intake_needs_review", () => {
        const b = submissionListLinkageBadge({
            status: "submitted",
            payloadMeta: {
                intake_resolution_path: "matched_email",
                intake_needs_review: true,
            },
            attachRow: { ...attachEmpty, person_id: "p1" },
        });
        expect(b.kind).toBe("needs_review");
        expect(b.kind === "needs_review" && b.tooltip.length).toBeGreaterThan(0);
    });

    it("submissionListLinkageBadge — Needs review for ambiguous path", () => {
        const b = submissionListLinkageBadge({
            status: "submitted",
            payloadMeta: { intake_resolution_path: "ambiguous_contact" },
            attachRow: { ...attachEmpty, person_id: "p1" },
        });
        expect(b.kind).toBe("needs_review");
    });

    it("submissionListLinkageBadge — Link CRM when missing attach only", () => {
        const b = submissionListLinkageBadge({
            status: "submitted",
            payloadMeta: {},
            attachRow: attachEmpty,
        });
        expect(b.kind).toBe("needs_crm_link");
    });

    it("submissionListLinkageBadge — no badge for clean auto-created enrollment lead", () => {
        expect(
            submissionListLinkageBadge({
                status: "submitted",
                payloadMeta: {
                    intake_resolution_path: "created_records",
                    intake_opportunity_match: "created",
                    intake_auto_operationalized: true,
                    intake_needs_review: false,
                },
                attachRow: { ...attachEmpty, person_id: "p1", customer_id: "c1", opportunity_id: "o1" },
            }).kind
        ).toBe("none");
    });

    it("submissionListLinkageBadge — no badge when submitted and clear", () => {
        expect(
            submissionListLinkageBadge({
                status: "submitted",
                payloadMeta: {
                    intake_resolution_path: "matched_email",
                    intake_needs_review: false,
                },
                attachRow: { ...attachEmpty, person_id: "p1" },
            }).kind
        ).toBe("none");
    });

    it("submissionDetailLinkageCalloutVisible — hides after operator confirmation-style meta", () => {
        const attach = { ...attachEmpty, person_id: "p1" };
        expect(
            submissionDetailLinkageCalloutVisible({
                status: "submitted",
                payloadMeta: {
                    intake_resolution_path: "matched_email",
                    intake_needs_review: false,
                    intake_review_result: "confirmed",
                },
                attachRow: attach,
            })
        ).toBe(false);
    });

    it("submissionDetailLinkageCalloutVisible — hides after manual correction meta when attach exists", () => {
        const attach = { ...attachEmpty, customer_member_id: "m1" };
        expect(
            submissionDetailLinkageCalloutVisible({
                status: "submitted",
                payloadMeta: {
                    intake_resolution_path: "manually_linked",
                    intake_needs_review: false,
                    intake_review_result: "corrected",
                },
                attachRow: attach,
            })
        ).toBe(false);
    });

    it("submissionDetailLinkageCalloutVisible — shows when ambiguous path", () => {
        expect(
            submissionDetailLinkageCalloutVisible({
                status: "submitted",
                payloadMeta: { intake_resolution_path: "ambiguous_contact" },
                attachRow: { ...attachEmpty, person_id: "p1" },
            })
        ).toBe(true);
    });

    it("buildLinkageReviewCalloutReasons — returns bullets when blocked", () => {
        const reasons = buildLinkageReviewCalloutReasons(
            {
                intake_resolution_path: "matched_email",
                intake_needs_review: true,
                intake_review_reason: "Auto-created member needs check.",
            },
            { ...attachEmpty, person_id: "p1" }
        );
        expect(reasons.length).toBeGreaterThan(0);
        expect(reasons.some((r) => /document/i.test(r) || /linked/i.test(r))).toBe(true);
    });
});
