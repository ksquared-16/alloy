import type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import type { PacketArtifactKind } from "@/lib/forms/packets/documentProvenanceDisplay";
import {
    formatPacketDocumentProvenanceLine,
    formatShortDate,
} from "@/lib/forms/packets/documentProvenanceDisplay";
import { FORMS_REVIEW_EMPTY } from "@/lib/forms/review/formsReviewPresentation";

/** Unified display row for packet review and opportunity Documents intake outputs. */
export type IntakeArtifactDisplayItem = {
    key: string;
    title: string;
    kind: PacketArtifactKind;
    provenance: DocumentProvenanceV1 | null;
    /** When structured provenance is unavailable (legacy rows). */
    provenanceFallbackLine?: string | null;
    generationLabel: "current" | "also_generated" | null;
    submissionPath: string | null;
    packetSessionPath?: string | null;
    documentId: string | null;
    openTarget: "signed_url" | "submission_link";
};

/** One-line legend for PDF currentness (shown when any PDF has generation_label). */
export const INTAKE_ARTIFACT_CURRENTNESS_LEGEND =
    "The latest generated PDF for each form is labeled Current PDF. Earlier files from the same step are labeled Earlier PDF.";

export type IntakeDocumentsEmptyStateKey =
    | "none"
    | "no_pdfs_only_records"
    | "no_records_only_pdfs"
    | "pending_generation";

export function resolveIntakeDocumentsEmptyState(options: {
    total: number;
    pdfCount: number;
    recordCount: number;
    /** Any step expects PDF but index has no PDF yet */
    pendingPdfGeneration?: boolean;
}): { key: IntakeDocumentsEmptyStateKey; message: string } {
    const { total, pdfCount, recordCount, pendingPdfGeneration } = options;
    if (total > 0) {
        return { key: "none", message: "" };
    }
    if (pendingPdfGeneration) {
        return {
            key: "pending_generation",
            message:
                "Submitted forms are on file. Generated PDFs will appear here once processing finishes.",
        };
    }
    if (recordCount > 0 && pdfCount === 0) {
        return {
            key: "no_pdfs_only_records",
            message:
                "No generated PDFs yet. Submitted form records are listed below when present.",
        };
    }
    if (pdfCount > 0 && recordCount === 0) {
        return {
            key: "no_records_only_pdfs",
            message: FORMS_REVIEW_EMPTY.noArtifacts,
        };
    }
    return { key: "none", message: FORMS_REVIEW_EMPTY.noDocuments };
}

export function intakeArtifactGroupTitle(kind: PacketArtifactKind): string {
    return kind === "generated_pdf" ? "Generated PDFs" : "Submitted records";
}

export function intakeArtifactGroupDescription(kind: PacketArtifactKind): string {
    return kind === "generated_pdf" ?
            "PDFs produced from submitted answers in this flow."
        :   "Form submissions captured without a separate PDF file.";
}

export function provenanceFormOrigin(provenance: DocumentProvenanceV1): string {
    const name =
        typeof provenance.form_name === "string" && provenance.form_name.trim() ?
            provenance.form_name.trim()
        :   "Form";
    return `From ${name}`;
}

export function provenanceVersionLabel(provenance: DocumentProvenanceV1): string | null {
    if (provenance.version_number == null || Number.isNaN(Number(provenance.version_number))) {
        return null;
    }
    return `Version ${provenance.version_number}`;
}

export function provenanceTimingLines(provenance: DocumentProvenanceV1): string[] {
    const lines: string[] = [];
    if (provenance.submission_submitted_at) {
        lines.push(`Submitted ${formatShortDate(provenance.submission_submitted_at)}`);
    }
    if (provenance.generated_at) {
        lines.push(`Generated ${formatShortDate(provenance.generated_at)}`);
    }
    return lines;
}

export function provenanceFallbackLineFromProvenance(provenance: DocumentProvenanceV1): string {
    return formatPacketDocumentProvenanceLine(provenance);
}

export function intakeArtifactFromIndexEntry(
    entry: import("@/lib/forms/packets/packetReviewRollupTypes").PacketReviewDocumentIndexEntryV1
): IntakeArtifactDisplayItem {
    const isPdf = entry.kind === "generated_pdf" && entry.document_id;
    return {
        key: `${entry.kind}-${entry.form_submission_id}-${entry.document_id ?? "rec"}`,
        title: entry.title,
        kind: entry.kind,
        provenance: entry.provenance,
        generationLabel: isPdf ? entry.provenance.generation_label : null,
        submissionPath: entry.admin_links.submission_path,
        packetSessionPath: entry.admin_links.packet_session_path,
        documentId: entry.document_id,
        openTarget: isPdf ? "signed_url" : "submission_link",
    };
}

function isDocumentProvenanceV1(value: unknown): value is DocumentProvenanceV1 {
    return value != null && typeof value === "object" && "form_submission_id" in value;
}

/** Map normalized related-document row when enriched from packet rollup. */
export function intakeArtifactFromNormalizedRow(row: {
    id: string;
    name: string | null;
    artifact_kind?: "generated_pdf" | "submitted_record" | null;
    provenance_line?: string | null;
    document_provenance?: unknown;
    generation_label?: "current" | "also_generated" | null;
    source_form_submission_admin_path?: string | null;
    source_packet_session_admin_path?: string | null;
    open_target?: "signed_url" | "submission_link" | null;
}): IntakeArtifactDisplayItem | null {
    const kind = row.artifact_kind;
    if (kind !== "generated_pdf" && kind !== "submitted_record") return null;
    const title = (row.name && String(row.name).trim()) || "Untitled";
    const provenance = isDocumentProvenanceV1(row.document_provenance) ? row.document_provenance : null;
    return {
        key: row.id,
        title,
        kind,
        provenance,
        provenanceFallbackLine: row.provenance_line ?? null,
        generationLabel: row.generation_label ?? null,
        submissionPath: row.source_form_submission_admin_path ?? null,
        packetSessionPath: row.source_packet_session_admin_path ?? null,
        documentId: kind === "generated_pdf" ? row.id : null,
        openTarget: row.open_target ?? (kind === "generated_pdf" ? "signed_url" : "submission_link"),
    };
}

export function partitionIntakeArtifacts<T extends { artifact_kind?: string | null; is_packet_artifact?: boolean }>(
    documents: T[]
): { intake: T[]; other: T[] } {
    const intake: T[] = [];
    const other: T[] = [];
    for (const doc of documents) {
        if (
            doc.is_packet_artifact ||
            doc.artifact_kind === "generated_pdf" ||
            doc.artifact_kind === "submitted_record"
        ) {
            intake.push(doc);
        } else {
            other.push(doc);
        }
    }
    return { intake, other };
}
