import { describe, expect, it } from "vitest";
import { segmentLogicalArtifacts, type ArtifactSectionInput } from "@/lib/pos/processingCase/structure/logicalArtifacts";

const S = (index: number, title: string, types: string[]): ArtifactSectionInput => ({
    title, index,
    destinations: types.map((t, i) => ({ id: `${title}-${i}`, type: t, label: `${title} ${i}` })),
});

describe("segmentLogicalArtifacts", () => {
    it("splits one submission into the agreements it actually contains", () => {
        const out = segmentLogicalArtifacts([
            S(0, "Contact Information", ["text", "text"]),
            S(1, "Health", ["text"]),
            S(2, "Tuition Agreement", ["text", "signature"]),
            S(3, "Handbook Acknowledgement", ["text", "signature"]),
            S(4, "Direct Payment", ["text", "signature"]),
        ]);
        expect(out.map((a) => a.title)).toEqual(["Contact Information", "Tuition Agreement", "Handbook Acknowledgement", "Direct Payment"]);
        expect(out.map((a) => a.unsigned)).toEqual([true, false, false, false]);
    });

    it("scopes each signature to its own artifact", () => {
        const out = segmentLogicalArtifacts([
            S(0, "Tuition Agreement", ["signature"]),
            S(1, "Handbook Acknowledgement", ["signature"]),
        ]);
        expect(out).toHaveLength(2);
        expect(out[0].signature_ids).toEqual(["Tuition Agreement-0"]);
        expect(out[1].signature_ids).toEqual(["Handbook Acknowledgement-0"]);
        // The whole point: no signature reaches into another artifact.
        expect(out[0].destination_ids).not.toContain("Handbook Acknowledgement-0");
    });

    it("gathers the unsigned collection sections into one artifact", () => {
        const out = segmentLogicalArtifacts([
            S(0, "Contact", ["text"]),
            S(1, "Emergency", ["text"]),
            S(2, "Health", ["text"]),
            S(3, "Agreement", ["signature"]),
        ]);
        expect(out[0].section_titles).toEqual(["Contact", "Emergency", "Health"]);
        expect(out[0].unsigned).toBe(true);
    });

    it("segments nothing when nothing is signed", () => {
        expect(segmentLogicalArtifacts([S(0, "Contact", ["text"]), S(1, "Health", ["text"])])).toEqual([]);
    });

    it("gives every artifact a stable id from its own lineage", () => {
        const sections = [S(0, "Contact", ["text"]), S(1, "Tuition Agreement", ["signature"])];
        expect(segmentLogicalArtifacts(sections).map((a) => a.id)).toEqual(["1:contact", "2:tuition_agreement"]);
        // Same input, same ids — reruns must preserve operator decisions.
        expect(segmentLogicalArtifacts(sections).map((a) => a.id)).toEqual(segmentLogicalArtifacts(sections).map((a) => a.id));
    });
});
