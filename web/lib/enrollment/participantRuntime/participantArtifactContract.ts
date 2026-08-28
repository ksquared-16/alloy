/**
 * One contract for a document a parent reviews, whatever produced it.
 *
 * Two engines now exist and neither is going away: an Oregon government form has a real AcroForm
 * and real geometry, so it is FILLED; a hosted intake form has neither, so its completed record is
 * COMPOSED. That difference is a fact about the source, and it must not become a fact about the
 * interface — a parent should meet "Review your paperwork" and page through a document, not
 * discover which importer their school happened to use.
 *
 * So the renderer is chosen once, at the artifact boundary, and everything downstream — page
 * navigation, semantic corrections, signature capture, progression — reads this shape and never
 * branches on the engine again.
 *
 * The classification is DECLARED, never guessed. Not from a filename, not from a MIME sniff, not
 * from a title, and specifically not from `pdf_mapping_json == null` — a null mapping used to mean
 * "fall back to generic HTML", and it now legitimately means "this artifact is composed". Those two
 * readings cannot share a signal.
 *
 * Pure. No I/O.
 */

import type { FidelityPdfMapping } from "@/lib/forms/pdf/fidelityMappingContract";
import { GENERATED_DOCUMENT_COMPOSER_VERSION } from "@/lib/forms/pdf/generation/generatedDocumentComposer";

export const PARTICIPANT_ARTIFACT_RENDERERS = ["source_fidelity", "generated_document"] as const;
export type ParticipantArtifactRenderer = (typeof PARTICIPANT_ARTIFACT_RENDERERS)[number];

export interface ParticipantArtifactSignatureSlot {
    /** The authored signature control — Forms' identity, and the unit of responsibility. */
    readonly field_id: string;
    readonly page: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface ParticipantArtifact {
    /** Which packet step this is — the artifact the parent is looking at. */
    readonly session_item_id: string;
    readonly form_definition_id: string;
    /** D-94: the pinned version. A session reviews the document its own version describes. */
    readonly form_definition_version_id: string;
    readonly title: string;

    readonly renderer: ParticipantArtifactRenderer;
    /**
     * What makes this rendering reproducible.
     *
     * For a filled artifact it is the source bytes' sha — render refuses anything else. For a
     * composed one it is the composer version, because layout is part of what was signed.
     */
    readonly render_identity: string;

    readonly page_count: number;
    /** Where the bytes come from. Both engines produce a PDF; only the origin differs. */
    readonly page_source_url: string;

    /** Shown to the parent so a composed document never passes as the original. */
    readonly provenance: {
        readonly source_document_id: string | null;
        readonly source_sha256: string | null;
        readonly source_title: string | null;
        /** True only when the parent is looking at the school's own document. */
        readonly is_source_replica: boolean;
    };

    /** Every signature this artifact owns — and it owns no other artifact's. */
    readonly signatures: readonly ParticipantArtifactSignatureSlot[];
}

/**
 * The artifact a filled source document produces.
 *
 * `is_source_replica` is true here and only here: the parent really is looking at the Oregon form.
 */
export function sourceFidelityArtifact(input: {
    sessionItemId: string;
    formDefinitionId: string;
    formDefinitionVersionId: string;
    title: string;
    mapping: FidelityPdfMapping;
    pageCount: number;
    pageSourceUrl: string;
    sourceTitle: string | null;
}): ParticipantArtifact {
    return {
        session_item_id: input.sessionItemId,
        form_definition_id: input.formDefinitionId,
        form_definition_version_id: input.formDefinitionVersionId,
        title: input.title,
        renderer: "source_fidelity",
        render_identity: input.mapping.source_sha256,
        page_count: input.pageCount,
        page_source_url: input.pageSourceUrl,
        provenance: {
            source_document_id: input.mapping.source_document_id ?? null,
            source_sha256: input.mapping.source_sha256,
            source_title: input.sourceTitle,
            is_source_replica: true,
        },
        signatures: input.mapping.signature_placements.map((p) => ({ ...p })),
    };
}

/**
 * The artifact a composed document produces.
 *
 * `is_source_replica` is false, deliberately and permanently. The record is authoritative as what
 * Alloy collected; claiming it reproduces the original would be the one dishonest thing this whole
 * dual-renderer design exists to avoid.
 */
export function generatedDocumentArtifact(input: {
    sessionItemId: string;
    formDefinitionId: string;
    formDefinitionVersionId: string;
    title: string;
    pageCount: number;
    pageSourceUrl: string;
    signatures: readonly ParticipantArtifactSignatureSlot[];
    sourceDocumentId: string | null;
    sourceSha256: string | null;
    sourceTitle: string | null;
    composerVersion?: string;
}): ParticipantArtifact {
    return {
        session_item_id: input.sessionItemId,
        form_definition_id: input.formDefinitionId,
        form_definition_version_id: input.formDefinitionVersionId,
        title: input.title,
        renderer: "generated_document",
        render_identity: input.composerVersion ?? GENERATED_DOCUMENT_COMPOSER_VERSION,
        page_count: input.pageCount,
        page_source_url: input.pageSourceUrl,
        provenance: {
            source_document_id: input.sourceDocumentId,
            source_sha256: input.sourceSha256,
            source_title: input.sourceTitle,
            is_source_replica: false,
        },
        signatures: input.signatures.map((s) => ({ ...s })),
    };
}

/** A signature belongs to the artifact that reserved it, and to no other. */
export function artifactOwnsSignature(artifact: ParticipantArtifact, fieldId: string): boolean {
    return artifact.signatures.some((s) => s.field_id === fieldId);
}
