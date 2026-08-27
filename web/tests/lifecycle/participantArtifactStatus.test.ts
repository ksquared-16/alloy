/**
 * Five participant states, and no runtime vocabulary.
 *
 * A parent several screens into their enrollment could not tell which of their school's forms was
 * on screen, how many were left, or what this one still wanted. All of it was known; none of it was
 * said.
 */

import { describe, expect, it } from "vitest";

import { participantArtifactStatus } from "@/lib/enrollment/participantRuntime/participantArtifactStatus";

const base = {
    documentTitle: "Oregon Nonmedical Exemption",
    step: "review" as const,
    requiredUploadsOutstanding: 0,
    signatureExpected: true,
    signatureCaptured: false,
    packetTotal: 5,
    packetSatisfied: 1,
};

describe("where the parent is", () => {
    it("names the document and its place in the stack", () => {
        const s = participantArtifactStatus(base);
        expect(s.documentName).toBe("Oregon Nonmedical Exemption");
        expect(s.position).toBe("Document 2 of 5");
        expect(s.next).toBe("3 documents after this one");
    });

    it("asks for the attachments before it asks for a signature", () => {
        const s = participantArtifactStatus({ ...base, requiredUploadsOutstanding: 2 });
        expect(s.label).toBe("Ready to review");
        expect(s.remaining).toBe("2 things left to attach");
    });

    it("says a signature is required, then says it is signed", () => {
        expect(participantArtifactStatus({ ...base, step: "sign" }).label).toBe("Signature required");
        const signed = participantArtifactStatus({ ...base, step: "sign", signatureCaptured: true });
        expect(signed.label).toBe("Signed");
        expect(signed.remaining).toBe("Nothing — you can finish this one");
    });

    it("says complete when a document asks for no signature at all", () => {
        expect(participantArtifactStatus({ ...base, step: "sign", signatureExpected: false }).label).toBe("Complete");
    });

    it("says needs a change while the parent is correcting it", () => {
        const s = participantArtifactStatus({ ...base, step: "edit" });
        expect(s.label).toBe("Needs a change");
        expect(s.remaining).toBe("Change anything that isn’t right");
    });

    it("tells the parent when they are on the last one", () => {
        expect(participantArtifactStatus({ ...base, packetSatisfied: 4 }).next).toBe("This is the last one");
        expect(participantArtifactStatus({ ...base, packetSatisfied: 3 }).next).toBe("1 document after this one");
    });

    it("says nothing about position when there is only one document", () => {
        const s = participantArtifactStatus({ ...base, packetTotal: 1, packetSatisfied: 0 });
        expect(s.position).toBeNull();
    });

    it("never exposes a runtime enum to the parent", () => {
        const labels = ["review", "edit", "sign"].map((step) =>
            participantArtifactStatus({ ...base, step: step as "review" }).label,
        );
        for (const label of labels) {
            expect(label).not.toMatch(/_/);
            expect(["Ready to review", "Signature required", "Signed", "Complete", "Needs a change"]).toContain(label);
        }
    });
});
