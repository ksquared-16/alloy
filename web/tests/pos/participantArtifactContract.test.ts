/**
 * One shape for a document the parent reviews, whichever engine produced it.
 *
 * The renderer difference is a fact about the SOURCE — an Oregon form has real geometry, a hosted
 * intake form has none — and it must not become a fact about the interface.
 */
import { describe, it, expect } from "vitest";
import {
    sourceFidelityArtifact,
    generatedDocumentArtifact,
    artifactOwnsSignature,
    type ParticipantArtifact,
} from "@/lib/enrollment/participantRuntime/participantArtifactContract";
import { GENERATED_DOCUMENT_COMPOSER_VERSION } from "@/lib/forms/pdf/generation/generatedDocumentComposer";

const SHA = "b".repeat(64);
const filled = sourceFidelityArtifact({
    sessionItemId: "item-1", formDefinitionId: "def-1", formDefinitionVersionId: "ver-1",
    title: "Oregon Certificate of Immunization Status", pageCount: 2, pageSourceUrl: "/doc/1",
    sourceTitle: "oregon-cis",
    mapping: {
        engine: "fidelity_v1", source_document_id: "11111111-2222-4333-8444-555555555555",
        source_sha256: SHA, acro_fields: { "Signature1": { field_id: "f1" } },
        signature_placements: [{ field_id: "sig_cis", page: 0, x: 142, y: 100, width: 228, height: 30 }],
    },
});
const composed = generatedDocumentArtifact({
    sessionItemId: "item-2", formDefinitionId: "def-2", formDefinitionVersionId: "ver-2",
    title: "Tuition & Enrollment Agreement", pageCount: 1, pageSourceUrl: "/doc/2",
    signatures: [{ field_id: "sig_tuition", page: 0, x: 64, y: 469, width: 260, height: 34 }],
    sourceDocumentId: "doc-2", sourceSha256: SHA, sourceTitle: "School Of Enrichment Admissions Packet",
});

describe("both engines produce the same shape", () => {
    it("gives Runtime every field it needs without knowing the engine", () => {
        for (const a of [filled, composed] as ParticipantArtifact[]) {
            expect(a.session_item_id).toBeTruthy();
            expect(a.form_definition_version_id, "D-94: the pinned version").toBeTruthy();
            expect(a.page_count).toBeGreaterThan(0);
            expect(a.page_source_url).toBeTruthy();
            expect(a.render_identity, "what makes this rendering reproducible").toBeTruthy();
            expect(a.signatures.length).toBe(1);
        }
    });

    it("pins a filled artifact to the source BYTES and a composed one to the LAYOUT", () => {
        // Render refuses drifted bytes; a moved page break changes which page a signature sits on.
        expect(filled.render_identity).toBe(SHA);
        expect(composed.render_identity).toBe(GENERATED_DOCUMENT_COMPOSER_VERSION);
    });
});

describe("a composed record must never pass as the original", () => {
    it("claims replica status only when the parent sees the school's own document", () => {
        expect(filled.provenance.is_source_replica).toBe(true);
        expect(composed.provenance.is_source_replica).toBe(false);
    });

    it("keeps provenance on both so lineage survives either way", () => {
        expect(composed.provenance.source_sha256).toBe(SHA);
        expect(composed.provenance.source_title).toBe("School Of Enrichment Admissions Packet");
    });
});

describe("signature responsibility is artifact-specific", () => {
    it("owns its own signature and no other artifact's", () => {
        expect(artifactOwnsSignature(filled, "sig_cis")).toBe(true);
        expect(artifactOwnsSignature(composed, "sig_tuition")).toBe(true);
        // The control that matters: one signature can never satisfy another artifact.
        expect(artifactOwnsSignature(filled, "sig_tuition")).toBe(false);
        expect(artifactOwnsSignature(composed, "sig_cis")).toBe(false);
    });

    it("carries a real rectangle from both engines", () => {
        expect(filled.signatures[0]).toMatchObject({ page: 0, width: 228 });
        expect(composed.signatures[0], "reserved by the layout, since the source had no geometry")
            .toMatchObject({ page: 0, width: 260 });
    });
});

describe("the renderer is declared, never guessed", () => {
    it("does not read a null mapping as a renderer choice", () => {
        // `pdf_mapping_json == null` used to mean "fall back to generic HTML" and now legitimately
        // means "this artifact is composed". Those two readings cannot share a signal.
        expect(composed.renderer).toBe("generated_document");
        expect(filled.renderer).toBe("source_fidelity");
    });
});
