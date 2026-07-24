import type { FormSubmissionLinkedDocument } from "@/lib/admin/forms/formsAdminDb";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { buildFormPdfIdempotencyKey, parseFormPdfMappingJson } from "@/lib/forms/pdf/pdfMappingContract";
import type { DocumentProvenanceV1, PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

export type PdfDocumentRow = {
    id: string;
    name: string | null;
    title: string | null;
    original_filename: string | null;
    created_at: string | null;
    metadata: Record<string, unknown> | null;
    template_key: string | null;
};

export function parseSubmissionIntakeMeta(payload: unknown): {
    intake_needs_review: boolean;
    intake_review_reason: string | null;
    intake_resolution_path: string | null;
} {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { intake_needs_review: false, intake_review_reason: null, intake_resolution_path: null };
    }
    const rec = payload as Record<string, unknown>;
    const meta =
        rec.meta && typeof rec.meta === "object" && !Array.isArray(rec.meta) ? (rec.meta as Record<string, unknown>) : {};
    return {
        intake_needs_review: meta.intake_needs_review === true,
        intake_review_reason: typeof meta.intake_review_reason === "string" ? meta.intake_review_reason : null,
        intake_resolution_path: typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path : null,
    };
}

export function submissionHasCrmFk(sub: {
    person_id?: string | null;
    customer_id?: string | null;
    customer_member_id?: string | null;
    opportunity_id?: string | null;
} | null | undefined): boolean {
    if (!sub) return false;
    return !!(sub.person_id || sub.customer_id || sub.customer_member_id || sub.opportunity_id);
}

export function hasUsablePdfMapping(pdfMappingJson: unknown): boolean {
    return parseFormPdfMappingJson(pdfMappingJson) != null;
}

export function adminSubmissionPath(formDefinitionId: string, submissionId: string): string {
    return `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(formDefinitionId)}/submissions/${encodeURIComponent(submissionId)}`;
}

export function adminPacketSessionPath(packetSessionId: string): string {
    return `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(packetSessionId)}`;
}

export function normalizeOperatorReviewWarnings(raw: unknown): { kind: string; message: string; field_key?: string }[] {
    if (!Array.isArray(raw)) return [];
    const out: { kind: string; message: string; field_key?: string }[] = [];
    for (const w of raw) {
        if (!w || typeof w !== "object" || Array.isArray(w)) continue;
        const o = w as Record<string, unknown>;
        const message = typeof o.message === "string" ? o.message.trim() : "";
        if (!message) continue;
        out.push({
            kind: typeof o.kind === "string" ? o.kind : "unknown",
            message,
            ...(typeof o.field_key === "string" && o.field_key.trim() ? { field_key: o.field_key.trim() } : {}),
        });
    }
    return out;
}

export function normalizeOperatorReviewStatus(raw: unknown): PacketReviewRollupV1["operator_review"]["status"] {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (
        s === "needs_review" ||
        s === "approved" ||
        s === "rejected" ||
        s === "needs_correction"
    ) {
        return s;
    }
    return null;
}

export type ArtifactKind = "generated_pdf" | "submitted_record" | "pending" | "not_started";

export function resolveArtifactKind(params: {
    itemStatus: string;
    submissionStatus: string | null;
    hasPdfMapping: boolean;
    generatedPdfCount: number;
    operatorReviewStatus: string | null;
    sessionStatus: string;
}): { kind: ArtifactKind; label: string; helper_text: string | null } {
    const itemSubmitted = params.itemStatus === "submitted";
    const subSubmitted = params.submissionStatus === "submitted";

    if (!itemSubmitted && !subSubmitted) {
        if (params.itemStatus === "pending" || params.itemStatus === "active") {
            return { kind: "pending", label: "In progress", helper_text: null };
        }
        return { kind: "not_started", label: "Not started", helper_text: null };
    }

    if (params.generatedPdfCount > 0) {
        return { kind: "generated_pdf", label: "Generated PDF", helper_text: null };
    }

    if (params.hasPdfMapping) {
        const awaiting =
            params.sessionStatus === "completed" &&
            (params.operatorReviewStatus == null || params.operatorReviewStatus === "needs_review");
        return {
            kind: "submitted_record",
            label: "Submitted form record",
            helper_text: awaiting ? "PDF generates after packet approval" : "PDF not generated yet — open submission to generate",
        };
    }

    return { kind: "submitted_record", label: "Submitted form record", helper_text: null };
}

/** Latest by created_at is current; older generated PDFs are also_generated. */
export function assignGenerationLabels(
    docs: Array<{ id: string; created_at: string | null }>
): Map<string, "current" | "also_generated"> {
    const sorted = [...docs].sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return tb - ta;
    });
    const map = new Map<string, "current" | "also_generated">();
    sorted.forEach((d, i) => {
        map.set(d.id, i === 0 ? "current" : "also_generated");
    });
    return map;
}

export function documentDisplayName(doc: PdfDocumentRow): string | null {
    const t = doc.title?.trim() || doc.name?.trim() || doc.original_filename?.trim();
    return t || null;
}

export function buildDocumentProvenanceV1(input: {
    formDefinitionId: string;
    formName: string;
    formDefinitionVersionId: string;
    versionNumber: number;
    formSubmissionId: string;
    submissionSubmittedAt: string | null;
    generatedAt: string | null;
    templateKey: string | null;
    idempotencyKey: string | null;
    generationLabel: "current" | "also_generated";
}): DocumentProvenanceV1 {
    return {
        form_definition_id: input.formDefinitionId,
        form_name: input.formName,
        form_definition_version_id: input.formDefinitionVersionId,
        version_number: input.versionNumber,
        form_submission_id: input.formSubmissionId,
        submission_submitted_at: input.submissionSubmittedAt,
        generated_at: input.generatedAt,
        template_key: input.templateKey,
        idempotency_key: input.idempotencyKey,
        generation_label: input.generationLabel,
    };
}

export function resolveIdempotencyKeyForDocument(
    doc: PdfDocumentRow,
    junctionMeta: Record<string, unknown> | null,
    fallback?: { formSubmissionId: string; formDefinitionVersionId: string; templateKey: string }
): string | null {
    const fromDoc =
        doc.metadata && typeof doc.metadata.idempotency_key === "string" ? doc.metadata.idempotency_key : null;
    if (fromDoc) return fromDoc;
    const fromJunction =
        junctionMeta && typeof junctionMeta.idempotency_key === "string" ? junctionMeta.idempotency_key : null;
    if (fromJunction) return fromJunction;
    if (fallback) {
        return buildFormPdfIdempotencyKey({
            formSubmissionId: fallback.formSubmissionId,
            formDefinitionVersionId: fallback.formDefinitionVersionId,
            templateKey: fallback.templateKey,
        });
    }
    return null;
}

export function listGeneratedPdfDocuments(
    linked: FormSubmissionLinkedDocument[],
    docRowsById: Map<string, PdfDocumentRow>
): Array<{ linked: FormSubmissionLinkedDocument; doc: PdfDocumentRow }> {
    const out: Array<{ linked: FormSubmissionLinkedDocument; doc: PdfDocumentRow }> = [];
    for (const entry of linked) {
        if (entry.role !== "generated_pdf") continue;
        const doc = docRowsById.get(entry.document.id);
        if (doc) out.push({ linked: entry, doc });
    }
    return out;
}
