import type { DocumentProvenanceV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

export function formatPacketReviewProvenanceLine(provenance: DocumentProvenanceV1): string {
    const parts = [`From ${provenance.form_name}`, `v${provenance.version_number}`];
    if (provenance.submission_submitted_at) {
        parts.push(`submitted ${formatShortDate(provenance.submission_submitted_at)}`);
    }
    if (provenance.generated_at) {
        parts.push(`generated ${formatShortDate(provenance.generated_at)}`);
    }
    return parts.join(" · ");
}

export function formatShortDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

export function operatorReviewStatusLabel(status: string | null): string {
    if (status == null) return "Needs review";
    const s = status.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Matches review PATCH gate on completed sessions. */
export function isPacketReviewAwaitingDecision(
    sessionStatus: string,
    operatorReviewStatus: string | null
): boolean {
    return (
        sessionStatus === "completed" &&
        (operatorReviewStatus == null ||
            operatorReviewStatus === "needs_review" ||
            operatorReviewStatus === "needs_correction")
    );
}

export function artifactKindBadgeClass(kind: string): string {
    switch (kind) {
        case "generated_pdf":
            return "border-emerald-200 bg-emerald-50 text-emerald-900";
        case "submitted_record":
            return "border-sky-200 bg-sky-50 text-sky-900";
        case "pending":
            return "border-amber-200 bg-amber-50 text-amber-950";
        default:
            return "border-[#e6e8ec] bg-[#f4f6f9] text-[#59678b]";
    }
}
