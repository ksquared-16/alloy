import { describe, expect, it } from "vitest";
import { resolveFormSubmissionDocumentParent } from "@/lib/forms/pdf/createGeneratedPdfForSubmission";

describe("resolveFormSubmissionDocumentParent", () => {
    it("prefers customer_member over opportunity", () => {
        expect(
            resolveFormSubmissionDocumentParent({
                person_id: "p",
                customer_id: "c",
                customer_member_id: "m",
                opportunity_id: "o",
            })
        ).toEqual({ entity_type: "customer_member", entity_id: "m" });
    });

    it("falls back to person when only person linked", () => {
        expect(
            resolveFormSubmissionDocumentParent({
                person_id: "p",
                customer_id: null,
                customer_member_id: null,
                opportunity_id: null,
            })
        ).toEqual({ entity_type: "person", entity_id: "p" });
    });

    it("returns null when nothing linked", () => {
        expect(
            resolveFormSubmissionDocumentParent({
                person_id: null,
                customer_id: null,
                customer_member_id: null,
                opportunity_id: null,
            })
        ).toBeNull();
    });
});
