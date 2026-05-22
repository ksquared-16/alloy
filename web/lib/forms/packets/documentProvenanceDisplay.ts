import type { DocumentProvenanceV1, PacketReviewDocumentIndexEntryV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { legacyArtifactKindBadgeClass } from "@/lib/forms/review/formsReviewBadgeStyles";

export type PacketArtifactKind = "generated_pdf" | "submitted_record";

/** Stable synthetic row id for non-PDF packet steps (no `documents` row). */
export function syntheticSubmittedRecordRowId(formSubmissionId: string): string {
    return `packet-submitted-record:${formSubmissionId}`;
}

export function isSyntheticPacketDocumentId(id: string): boolean {
    return id.startsWith("packet-submitted-record:");
}

export function formatShortDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

/** Shared provenance line for review UI and opportunity Documents tab. */
export function formatPacketDocumentProvenanceLine(provenance: DocumentProvenanceV1): string {
    const formName =
        typeof provenance.form_name === "string" && provenance.form_name.trim() ?
            provenance.form_name.trim()
        :   "Form";
    const parts: string[] = [`From ${formName}`];
    if (provenance.version_number != null && !Number.isNaN(Number(provenance.version_number))) {
        parts.push(`v${provenance.version_number}`);
    }
    if (provenance.submission_submitted_at) {
        parts.push(`submitted ${formatShortDate(provenance.submission_submitted_at)}`);
    }
    if (provenance.generated_at) {
        parts.push(`generated ${formatShortDate(provenance.generated_at)}`);
    }
    return parts.join(" · ");
}

/** Currentness heuristic labels (latest PDF = current). */
export function generationLabelDisplay(label: "current" | "also_generated"): string {
    return label === "current" ? "Current generated PDF" : "Also generated";
}

export function artifactKindDisplayLabel(kind: PacketArtifactKind): string {
    return kind === "generated_pdf" ? "Generated PDF" : "Submitted form record";
}

/** Alloy-aligned artifact badge classes (shared with Forms review primitives). */
export function artifactKindBadgeClass(kind: string): string {
    return legacyArtifactKindBadgeClass(kind);
}

/** Map rollup `documents_index` entry to a row shape for `normalizeDocumentRow`. */
export function packetDocumentIndexEntryToRow(entry: PacketReviewDocumentIndexEntryV1): Record<string, unknown> {
    const isPdf = entry.kind === "generated_pdf" && entry.document_id;
    const id = isPdf ? entry.document_id! : syntheticSubmittedRecordRowId(entry.form_submission_id);
    const submittedAt = entry.provenance.submission_submitted_at ?? null;
    const generation_label = isPdf ? entry.provenance.generation_label : null;

    return {
        id,
        title: entry.title,
        name: entry.title,
        document_type: entry.kind,
        status: null,
        created_at: submittedAt,
        uploaded_at: submittedAt,
        artifact_kind: entry.kind,
        provenance_line: formatPacketDocumentProvenanceLine(entry.provenance),
        generation_label,
        generation_label_display: generation_label ? generationLabelDisplay(generation_label) : null,
        open_target: isPdf ? "signed_url" : "submission_link",
        is_packet_artifact: true,
        source_form_submission_id: entry.form_submission_id,
        source_form_submission_admin_path: entry.admin_links.submission_path,
        source_packet_session_admin_path: entry.admin_links.packet_session_path,
    };
}

/** Enrich an existing `documents` table row loaded via packet submission linkage. */
export function enrichPacketPdfRowFromIndexEntry(
    row: Record<string, unknown>,
    entry: PacketReviewDocumentIndexEntryV1
): Record<string, unknown> {
    return {
        ...row,
        artifact_kind: "generated_pdf" as const,
        provenance_line: formatPacketDocumentProvenanceLine(entry.provenance),
        generation_label: entry.provenance.generation_label,
        generation_label_display: generationLabelDisplay(entry.provenance.generation_label),
        open_target: "signed_url" as const,
        is_packet_artifact: true,
        source_form_submission_id: entry.form_submission_id,
        source_form_submission_admin_path: entry.admin_links.submission_path,
        source_packet_session_admin_path: entry.admin_links.packet_session_path,
    };
}
