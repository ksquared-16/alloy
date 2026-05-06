import { describe, expect, it } from "vitest";
import {
    buildEntityConnectionRows,
    describeDocumentOutcome,
    describeSubmissionLifecycle,
    payloadHasCapturedSignatures,
    recommendedNextAction,
} from "@/lib/forms/submissionOutcomeSummary";

describe("submissionOutcomeSummary", () => {
    it("detects signatures on payload", () => {
        expect(payloadHasCapturedSignatures(null)).toBe(false);
        expect(payloadHasCapturedSignatures({ values: {} })).toBe(false);
        expect(
            payloadHasCapturedSignatures({
                values: {},
                signatures: {
                    sig: { kind: "typed", typed_full_name: "A", acknowledged_at: new Date().toISOString() },
                },
            })
        ).toBe(true);
    });

    it("describeSubmissionLifecycle — draft vs submitted", () => {
        const d = describeSubmissionLifecycle({
            status: "draft",
            payloadHasSignatures: false,
        });
        expect(d.headline).toBe("Draft");
        expect(d.notes.some((l) => /not finished/i.test(l))).toBe(true);

        const s = describeSubmissionLifecycle({
            status: "submitted",
            payloadHasSignatures: true,
        });
        expect(s.headline).toBe("Submitted");
        expect(s.notes.some((l) => /signature/i.test(l))).toBe(true);
    });

    it("buildEntityConnectionRows marks linked vs not", () => {
        const rows = buildEntityConnectionRows({
            person_id: "p1",
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
            created_via_public_link_id: "link1",
        });
        expect(rows.find((r) => r.key === "person")?.recordId).toBe("p1");
        expect(rows.find((r) => r.key === "customer")?.recordId).toBeNull();
        expect(rows.find((r) => r.key === "public_link")?.recordId).toBe("link1");
    });

    it("describeDocumentOutcome — submitted with no document", () => {
        const o = describeDocumentOutcome({
            linkedDocumentsCount: 0,
            submissionStatus: "submitted",
            canMutate: true,
        });
        expect(o.headline.toLowerCase()).toContain("no document");
        expect(o.bullets.some((b) => /generate document/i.test(b))).toBe(true);
    });

    it("describeDocumentOutcome — submitted with linked doc", () => {
        const o = describeDocumentOutcome({
            linkedDocumentsCount: 2,
            submissionStatus: "submitted",
            canMutate: true,
        });
        expect(o.headline.toLowerCase()).toContain("stored");
        expect(o.bullets.some((b) => /2 linked/i.test(b))).toBe(true);
    });

    it("describeDocumentOutcome — draft", () => {
        const o = describeDocumentOutcome({
            linkedDocumentsCount: 0,
            submissionStatus: "draft",
            canMutate: true,
        });
        expect(o.bullets.some((b) => /submit/i.test(b))).toBe(true);
    });

    it("recommendedNextAction — draft", () => {
        const r = recommendedNextAction({
            status: "draft",
            linkedDocumentsCount: 0,
            canMutate: true,
            hasAnyCrmEntityLink: false,
        });
        expect(r.join(" ").toLowerCase()).toContain("wait");
    });

    it("recommendedNextAction — submitted no doc admin", () => {
        const r = recommendedNextAction({
            status: "submitted",
            linkedDocumentsCount: 0,
            canMutate: true,
            hasAnyCrmEntityLink: false,
        });
        expect(r.join(" ").toLowerCase()).toMatch(/review|generate/);
    });

    it("recommendedNextAction — submitted with doc", () => {
        const r = recommendedNextAction({
            status: "submitted",
            linkedDocumentsCount: 1,
            canMutate: true,
            hasAnyCrmEntityLink: false,
        });
        expect(r.join(" ").toLowerCase()).toMatch(/open|linked|workflow/);
    });

    it("recommendedNextAction — CRM hint when links exist", () => {
        const r = recommendedNextAction({
            status: "submitted",
            linkedDocumentsCount: 1,
            canMutate: false,
            hasAnyCrmEntityLink: true,
        });
        expect(r.some((l) => /open/i.test(l) && /person|crm/i.test(l))).toBe(true);
    });
});
