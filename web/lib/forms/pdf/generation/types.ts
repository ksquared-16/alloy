/**
 * Phase 7 Slice 0 — Fidelity generation + native signing engine (types).
 *
 * Contained engine proving the two hardest Phase 7 capabilities before they sit on the critical path:
 *  1. Fill an original PDF with collected values while preserving its visual layout (fidelity).
 *  2. Place a real signature (typed / drawn / initials) at the correct location, flatten to an
 *     IMMUTABLE signed artifact, and retain unsigned+signed version lineage + signing evidence.
 *
 * This is engine + proof only (no production UI). Slice 4 wires it into the participant journey.
 */

export type FieldValue = string | boolean | number;

/** Draw text at an absolute PDF coordinate (origin bottom-left, points) — the non-AcroForm / generated path. */
export type CoordinateOverlay = {
    /** 0-indexed page. */
    page: number;
    x: number;
    y: number;
    size?: number;
    text: string;
};

export type SignatureMarkKind = "typed" | "drawn" | "initials";

/** Where and how to place one signing mark on the document. */
export type SignaturePlacement = {
    /** 0-indexed page. */
    page: number;
    /** Rect in PDF points (origin bottom-left). */
    x: number;
    y: number;
    width: number;
    height: number;
    kind: SignatureMarkKind;
    /** Full typed name (kind: typed) or initials text (kind: initials). */
    typedName?: string;
    /** PNG bytes of a drawn signature (kind: drawn). */
    drawnPng?: Uint8Array;
    /** Identifies which signer/requirement this mark satisfies (for evidence). */
    signerRole?: string;
};

/** ESIGN/UETA-aligned signing evidence — mirrors the existing `form_submission_signatures` shape. */
export type SignerEvidence = {
    signerName: string;
    signerId?: string | null;
    /** The signer affirmatively acknowledged intent to sign electronically. */
    intentAcknowledged: boolean;
    acknowledgedAt: string; // ISO
    signerIpHash?: string | null;
};

export type SignedArtifactInput = {
    sourcePdf: Uint8Array;
    /** Provenance: the source document this artifact was generated from. */
    documentId: string;
    /** AcroForm field name → value (fidelity fill path). */
    fieldValues?: Record<string, FieldValue>;
    /** Coordinate text overlays (generated-placement path). */
    overlays?: CoordinateOverlay[];
    /** Signing marks to place (ordered; supports multiple signers). */
    signatures: SignaturePlacement[];
    evidence: SignerEvidence;
    /** Injected clock for deterministic output/hashing (ISO). */
    now: string;
};

export type PdfVersionRole = "source" | "populated" | "signed";

export type PdfVersionRef = {
    role: PdfVersionRole;
    bytes: Uint8Array;
    sha256: string;
    byteLength: number;
};

/** One audit row per placed signature, aligned to `form_submission_signatures` columns. */
export type SignatureAuditRow = {
    signature_kind: SignatureMarkKind;
    typed_full_name: string | null;
    has_drawn_asset: boolean;
    signer_id: string | null;
    signer_acknowledged_at: string;
    signer_ip_hash: string | null;
    metadata: {
        document_id: string;
        signer_role: string | null;
        placement: { page: number; x: number; y: number; width: number; height: number };
    };
};

export type SignedArtifactResult = {
    /** source → populated (unsigned, fields still present) → signed (flattened, immutable). */
    versions: PdfVersionRef[];
    lineage: {
        document_id: string;
        source_sha256: string;
        populated_sha256: string;
        signed_sha256: string;
        generated_at: string;
        /** Immutable = flattened: the signed version has no fillable AcroForm fields. */
        signed_is_flattened: boolean;
    };
    audit: SignatureAuditRow[];
    /** AcroForm fields that were set vs. requested-but-not-found (honesty about fidelity). */
    fill_report: { applied: string[]; missed: string[] };
};
