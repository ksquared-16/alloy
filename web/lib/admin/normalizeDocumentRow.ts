/**
 * Maps public.documents rows to a stable shape for admin UI (legacy + canonical columns).
 * All `/api/admin/related/...` document arrays use this shape so drawers and Related tabs stay consistent.
 */
export type NormalizedDocumentRow = {
    id: string;
    name: string | null;
    original_filename: string | null;
    document_type: string | null;
    status: string | null;
    uploaded_at: string | null;
    created_at: string | null;
    /** When this row came from a packet step submission via `form_submission_documents`. */
    source_form_submission_id?: string | null;
    source_form_submission_admin_path?: string | null;
    source_packet_session_admin_path?: string | null;
    /** Packet artifact from rollup (`generated_pdf` | `submitted_record`). */
    artifact_kind?: "generated_pdf" | "submitted_record" | null;
    provenance_line?: string | null;
    generation_label?: "current" | "also_generated" | null;
    generation_label_display?: string | null;
    /** `signed_url` for real documents; `submission_link` for synthetic submitted_record rows. */
    open_target?: "signed_url" | "submission_link" | null;
    is_packet_artifact?: boolean;
};

export function normalizeDocumentRow(row: Record<string, unknown>): NormalizedDocumentRow {
    const title = row.title ?? row.name;
    const orig = row.original_filename;
    const docType = row.doc_type ?? row.document_type;
    const created = row.created_at;
    const legacyUploaded = row.uploaded_at;
    const createdStr = created != null && created !== "" ? String(created) : null;
    const uploadedStr =
        legacyUploaded != null && legacyUploaded !== ""
            ? String(legacyUploaded)
            : createdStr;
    const titleStr = title != null && String(title).trim() !== "" ? String(title) : null;
    const origStr = orig != null && String(orig).trim() !== "" ? String(orig) : null;
    const sidRaw = row.source_form_submission_id;
    const subPathRaw = row.source_form_submission_admin_path;
    const packetPathRaw = row.source_packet_session_admin_path;
    const source_form_submission_id =
        typeof sidRaw === "string" && sidRaw.trim() ? sidRaw.trim() : sidRaw != null ? String(sidRaw) : null;
    const source_form_submission_admin_path =
        typeof subPathRaw === "string" && subPathRaw.trim() ? subPathRaw.trim() : null;
    const source_packet_session_admin_path =
        typeof packetPathRaw === "string" && packetPathRaw.trim() ? packetPathRaw.trim() : null;

    const artifactKindRaw = row.artifact_kind;
    const artifact_kind =
        artifactKindRaw === "generated_pdf" || artifactKindRaw === "submitted_record" ? artifactKindRaw : null;
    const provenanceLineRaw = row.provenance_line;
    const provenance_line =
        typeof provenanceLineRaw === "string" && provenanceLineRaw.trim() ? provenanceLineRaw.trim() : null;
    const genRaw = row.generation_label;
    const generation_label = genRaw === "current" || genRaw === "also_generated" ? genRaw : null;
    const genDisplayRaw = row.generation_label_display;
    const generation_label_display =
        typeof genDisplayRaw === "string" && genDisplayRaw.trim() ? genDisplayRaw.trim() : null;
    const openRaw = row.open_target;
    const open_target = openRaw === "signed_url" || openRaw === "submission_link" ? openRaw : null;
    const is_packet_artifact = row.is_packet_artifact === true;

    return {
        id: String(row.id),
        name: titleStr ?? origStr,
        original_filename: origStr,
        document_type: docType != null && String(docType) !== "" ? String(docType) : null,
        status: row.status != null && String(row.status) !== "" ? String(row.status) : null,
        uploaded_at: uploadedStr,
        created_at: createdStr,
        ...(source_form_submission_admin_path
            ? {
                  source_form_submission_id,
                  source_form_submission_admin_path,
                  ...(source_packet_session_admin_path ? { source_packet_session_admin_path } : {}),
              }
            : {}),
        ...(artifact_kind ? { artifact_kind } : {}),
        ...(provenance_line ? { provenance_line } : {}),
        ...(generation_label ? { generation_label } : {}),
        ...(generation_label_display ? { generation_label_display } : {}),
        ...(open_target ? { open_target } : {}),
        ...(is_packet_artifact ? { is_packet_artifact } : {}),
    };
}

export function normalizeDocumentRows(rows: unknown[] | null | undefined): NormalizedDocumentRow[] {
    if (!rows?.length) return [];
    return rows
        .filter((r): r is Record<string, unknown> => r != null && typeof r === "object" && "id" in r)
        .map((r) => normalizeDocumentRow(r));
}
