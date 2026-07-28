/**
 * Phase 7 Slice 0 — Fidelity generation + native signing engine.
 *
 * Pure functions over PDF bytes (pdf-lib). No storage, no DB, no UI — the persistence/UI wiring lands
 * in later slices. Deterministic given the same input + injected `now` (fixed PDF dates), so output is
 * hashable and testable.
 */

import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type {
    CoordinateOverlay,
    FieldValue,
    PdfVersionRef,
    PdfVersionRole,
    SignatureAuditRow,
    SignaturePlacement,
    SignedArtifactInput,
    SignedArtifactResult,
} from "./types";

function sha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

function versionRef(role: PdfVersionRole, bytes: Uint8Array): PdfVersionRef {
    return { role, bytes, sha256: sha256(bytes), byteLength: bytes.byteLength };
}

function stampProvenance(doc: PDFDocument, documentId: string, now: string): void {
    const when = new Date(now);
    doc.setCreationDate(when);
    doc.setModificationDate(when);
    doc.setSubject(`alloy:generated_from=${documentId}`);
    doc.setProducer("alloy-fidelity-engine-v1");
}

/**
 * Fill an original PDF while preserving its layout.
 *  - AcroForm path: set each named field's value in place (exact original positions).
 *  - Overlay path: draw text at absolute coordinates (for generated placement / non-AcroForm docs).
 * Returns the POPULATED (unsigned) bytes — AcroForm fields remain present/fillable.
 */
export async function fillPdfWithFidelity(input: {
    sourcePdf: Uint8Array;
    fieldValues?: Record<string, FieldValue>;
    overlays?: CoordinateOverlay[];
    documentId: string;
    now: string;
}): Promise<{ bytes: Uint8Array; applied: string[]; missed: string[] }> {
    const doc = await PDFDocument.load(input.sourcePdf);
    const applied: string[] = [];
    const missed: string[] = [];

    if (input.fieldValues && Object.keys(input.fieldValues).length > 0) {
        const form = doc.getForm();
        const existing = new Set(form.getFields().map((f) => f.getName()));
        for (const [name, value] of Object.entries(input.fieldValues)) {
            if (!existing.has(name)) {
                missed.push(name);
                continue;
            }
            try {
                if (typeof value === "boolean") {
                    const cb = form.getCheckBox(name);
                    if (value) cb.check();
                    else cb.uncheck();
                } else {
                    form.getTextField(name).setText(String(value));
                }
                applied.push(name);
            } catch {
                // Field exists but is a type we don't set here (e.g. a signature widget) — record as missed.
                missed.push(name);
            }
        }
    }

    if (input.overlays && input.overlays.length > 0) {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const pages = doc.getPages();
        for (const ov of input.overlays) {
            const page = pages[ov.page];
            if (!page) {
                missed.push(`overlay@page${ov.page}`);
                continue;
            }
            page.drawText(ov.text, { x: ov.x, y: ov.y, size: ov.size ?? 11, font, color: rgb(0.08, 0.09, 0.16) });
            applied.push(`overlay:${ov.text.slice(0, 24)}`);
        }
    }

    stampProvenance(doc, input.documentId, input.now);
    const bytes = await doc.save({ useObjectStreams: false });
    return { bytes, applied, missed };
}

/**
 * Place signing marks on the populated PDF, then FLATTEN → immutable signed bytes.
 * Flattening bakes AcroForm values into page content and removes interactivity, so the signed
 * artifact can no longer be edited via form fields.
 */
export async function placeSignaturesAndFlatten(input: {
    populatedPdf: Uint8Array;
    signatures: SignaturePlacement[];
    documentId: string;
    now: string;
}): Promise<{ bytes: Uint8Array; flattened: boolean }> {
    const doc = await PDFDocument.load(input.populatedPdf);
    const pages = doc.getPages();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);

    for (const sig of input.signatures) {
        const page = pages[sig.page];
        if (!page) continue;
        if (sig.kind === "drawn") {
            if (sig.drawnPng) {
                const png = await doc.embedPng(sig.drawnPng);
                page.drawImage(png, { x: sig.x, y: sig.y, width: sig.width, height: sig.height });
            }
        } else {
            // typed / initials: fit the text to the mark height.
            const text = sig.typedName ?? "";
            const size = Math.max(8, Math.min(sig.height * 0.7, 22));
            page.drawText(text, { x: sig.x, y: sig.y + sig.height * 0.15, size, font, color: rgb(0.05, 0.1, 0.35) });
        }
    }

    // Flatten the AcroForm so field values become immutable page content.
    let flattened = false;
    const form = doc.getForm();
    if (form.getFields().length > 0) {
        form.flatten();
        flattened = true;
    }

    stampProvenance(doc, input.documentId, input.now);
    const bytes = await doc.save({ useObjectStreams: false });
    return { bytes, flattened };
}

/** True when the PDF has zero fillable AcroForm fields (i.e. it is immutable/flattened). */
export async function hasNoFillableFields(pdf: Uint8Array): Promise<boolean> {
    const doc = await PDFDocument.load(pdf);
    return doc.getForm().getFields().length === 0;
}

/**
 * Read back AcroForm text-field values (fidelity check for the unflattened/populated version — its
 * values live in field objects, not the page content stream, so they aren't in text extraction).
 */
export async function readTextFieldValues(pdf: Uint8Array): Promise<Record<string, string>> {
    const doc = await PDFDocument.load(pdf);
    const form = doc.getForm();
    const out: Record<string, string> = {};
    for (const field of form.getFields()) {
        const name = field.getName();
        try {
            out[name] = form.getTextField(name).getText() ?? "";
        } catch {
            // non-text field — skip
        }
    }
    return out;
}

function buildAudit(input: SignedArtifactInput): SignatureAuditRow[] {
    return input.signatures.map((sig) => ({
        signature_kind: sig.kind,
        typed_full_name: sig.kind === "drawn" ? null : (sig.typedName ?? null),
        has_drawn_asset: sig.kind === "drawn" && !!sig.drawnPng,
        signer_id: input.evidence.signerId ?? null,
        signer_acknowledged_at: input.evidence.acknowledgedAt,
        signer_ip_hash: input.evidence.signerIpHash ?? null,
        metadata: {
            document_id: input.documentId,
            signer_role: sig.signerRole ?? null,
            placement: { page: sig.page, x: sig.x, y: sig.y, width: sig.width, height: sig.height },
        },
    }));
}

/**
 * Full engine: source → populated (unsigned) → signed (flattened, immutable), with hashed version
 * lineage and per-signature audit evidence. Intent acknowledgement is required to sign.
 */
export async function buildSignedArtifact(input: SignedArtifactInput): Promise<SignedArtifactResult> {
    if (!input.evidence.intentAcknowledged) {
        throw new Error("Cannot sign: signer has not acknowledged intent to sign electronically.");
    }

    const populated = await fillPdfWithFidelity({
        sourcePdf: input.sourcePdf,
        fieldValues: input.fieldValues,
        overlays: input.overlays,
        documentId: input.documentId,
        now: input.now,
    });

    const signed = await placeSignaturesAndFlatten({
        populatedPdf: populated.bytes,
        signatures: input.signatures,
        documentId: input.documentId,
        now: input.now,
    });

    const versions: PdfVersionRef[] = [
        versionRef("source", input.sourcePdf),
        versionRef("populated", populated.bytes),
        versionRef("signed", signed.bytes),
    ];

    return {
        versions,
        lineage: {
            document_id: input.documentId,
            source_sha256: versions[0]!.sha256,
            populated_sha256: versions[1]!.sha256,
            signed_sha256: versions[2]!.sha256,
            generated_at: input.now,
            signed_is_flattened: signed.flattened,
        },
        audit: buildAudit(input),
        fill_report: { applied: populated.applied, missed: populated.missed },
    };
}
