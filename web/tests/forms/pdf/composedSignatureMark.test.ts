/**
 * A reserved signature block that never receives its mark is a blank on a signed document.
 *
 * The composer drew a rule and a caption and stopped, so a parent could sign the Tuition agreement,
 * watch the mark appear on screen, and receive a composed document with an empty line.
 */

import { describe, expect, it } from "vitest";

import { composeGeneratedDocument } from "@/lib/forms/pdf/generation/generatedDocumentComposer";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const schema = {
    title: "Tuition & Enrollment Agreement",
    fields: [
        { id: "parent", type: "text", label: "Parent Name" },
        { id: "sig", type: "signature", label: "By signing below, I agree.", required: true },
    ],
    sections: [{ id: "s1", title: "Agreement", field_ids: ["parent", "sig"] }],
} as unknown as FormSchemaV1;

const provenance = {
    form_definition_id: "3f682c60-6e7c-4b41-a3cb-64f35c1a6d94",
    form_definition_version_id: "b7be55c5-15fd-44bc-8b68-1938b4e1532d",
    source_document_id: null,
    source_sha256: null,
    source_title: null,
};

/** A real PNG — the composer embeds bytes, so a claim about them would prove nothing. */
function inkPng(): Uint8Array {
    return Uint8Array.from(
        Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8//8/AzpgYkAD1BEAAP//AwCJgQNiVKBaAAAAAElFTkSuQmCC",
            "base64",
        ),
    );
}

describe("the mark goes on the rule the layout reserved", () => {
    it("reserves a placement for the authored signature control", async () => {
        const composed = await composeGeneratedDocument({ schema, values: { parent: "Jo" }, provenance });
        expect(composed.signaturePlacements.map((p) => p.field_id)).toEqual(["sig"]);
        expect(composed.signaturePlacements[0].page).toBe(0);
    });

    it("grows the document when a drawn mark is placed, and not before", async () => {
        const unsigned = await composeGeneratedDocument({ schema, values: { parent: "Jo" }, provenance });
        const signed = await composeGeneratedDocument({
            schema,
            values: { parent: "Jo" },
            provenance,
            signatures: { sig: { drawnPng: inkPng() } },
        });
        expect(signed.bytes.byteLength).toBeGreaterThan(unsigned.bytes.byteLength);
        expect(signed.artifactSha256).not.toBe(unsigned.artifactSha256);
    });

    it("writes a typed name when that is what the participant gave", async () => {
        const typed = await composeGeneratedDocument({
            schema,
            values: { parent: "Jo" },
            provenance,
            signatures: { sig: { typedFullName: "Jo Rivera" } },
        });
        const unsigned = await composeGeneratedDocument({ schema, values: { parent: "Jo" }, provenance });
        expect(typed.artifactSha256).not.toBe(unsigned.artifactSha256);
    });

    it("leaves the line empty rather than substituting a stand-in for an unreadable capture", async () => {
        // The fidelity path made this decision first: the mark on paper is the mark that was made.
        const broken = await composeGeneratedDocument({
            schema,
            values: { parent: "Jo" },
            provenance,
            signatures: { sig: { drawnPng: Uint8Array.from([1, 2, 3, 4]) } },
        });
        const unsigned = await composeGeneratedDocument({ schema, values: { parent: "Jo" }, provenance });
        expect(broken.artifactSha256).toBe(unsigned.artifactSha256);
    });

    it("places a mark only on the block that owns it", async () => {
        const composed = await composeGeneratedDocument({
            schema,
            values: { parent: "Jo" },
            provenance,
            signatures: { some_other_field: { drawnPng: inkPng() } },
        });
        const unsigned = await composeGeneratedDocument({ schema, values: { parent: "Jo" }, provenance });
        expect(composed.artifactSha256).toBe(unsigned.artifactSha256);
    });
});
