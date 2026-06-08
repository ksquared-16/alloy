import { describe, expect, it } from "vitest";
import {
    buildConnectedSystemsBullets,
    formVersionHasDocumentMapping,
    parseOperatorContext,
    resolveAfterSubmissionParagraph,
    resolvePurposeParagraph,
    resolveWhoCompletesParagraph,
} from "@/lib/forms/operatorFormGuidance";

describe("operatorFormGuidance", () => {
    it("parses operator_context from metadata", () => {
        const m = {
            operator_context: {
                purpose: "Collect meds info",
                who_completes: "Parents",
                after_submission: "File in binder",
                connected_notes: "Talk to enrollment lead",
            },
        };
        expect(parseOperatorContext(m)).toEqual({
            purpose: "Collect meds info",
            who_completes: "Parents",
            after_submission: "File in binder",
            connected_notes: "Talk to enrollment lead",
        });
    });

    it("returns null when operator_context missing", () => {
        expect(parseOperatorContext({ demo: true })).toBeNull();
        expect(parseOperatorContext(undefined)).toBeNull();
    });

    it("detects document mapping when engine present", () => {
        expect(formVersionHasDocumentMapping(null)).toBe(false);
        expect(formVersionHasDocumentMapping({})).toBe(false);
        expect(formVersionHasDocumentMapping({ engine: "stub_v1" })).toBe(true);
    });

    it("resolves purpose from context, description, or default", () => {
        expect(resolvePurposeParagraph({ purpose: "P" }, null, "N")).toBe("P");
        expect(resolvePurposeParagraph(null, "From DB", "N")).toBe("From DB");
        expect(resolvePurposeParagraph(null, null, "Enrollment")).toContain("Enrollment");
    });

    it("resolves who completes and after submission with defaults", () => {
        expect(resolveWhoCompletesParagraph({ who_completes: "Staff" }, "center")).toBe("Staff");
        expect(resolveWhoCompletesParagraph(null, "state")).toContain("regulatory-style");
        expect(resolveAfterSubmissionParagraph({ after_submission: "X" })).toBe("X");
        expect(resolveAfterSubmissionParagraph(null)).toContain("submissions");
    });

    it("builds connected systems bullets", () => {
        const all = buildConnectedSystemsBullets({
            leadCaptureConfigured: true,
            documentGenerationConfigured: true,
            operatorNotes: "Custom",
        });
        expect(all.some((b) => b.id === "intake")).toBe(true);
        expect(all.some((b) => b.id === "docs")).toBe(true);
        expect(all.some((b) => b.id === "workflow")).toBe(true);
        expect(all.some((b) => b.id === "custom")).toBe(true);
    });
});
