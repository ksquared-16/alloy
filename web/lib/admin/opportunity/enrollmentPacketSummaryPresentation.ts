/**
 * Display helpers for enrollment packet sessions on opportunity surfaces.
 * Data source: GET `/api/admin/opportunities/:id/enrollment-packets` → `sessions[]`.
 */

export type EnrollmentPacketSessionLike = {
    id?: string;
    status?: string;
    packet_name?: string | null;
    launch_context?: Record<string, unknown> | null;
    operator_review_status?: string | null;
    operator_review_warnings?: { message?: string }[] | null;
    warning_count?: number;
    created_at?: string | null;
    completed_at?: string | null;
    submitted_step_count?: number;
    step_count?: number;
    crm_snapshot?: {
        opportunity_id?: string | null;
        customer_id?: string | null;
        person_id?: string | null;
        customer_member_id?: string | null;
    } | null;
};

export function enrollmentPacketSubjectLine(session: EnrollmentPacketSessionLike): string {
    const lc = session.launch_context;
    const label = lc && typeof lc.label === "string" && lc.label.trim() ? lc.label.trim() : null;
    return label || (session.packet_name?.trim() ? session.packet_name.trim() : "") || "Enrollment packet";
}

export function enrollmentPacketReviewedStatusLabel(
    operatorReviewStatus: string | null | undefined
): "Approved" | "Rejected" | null {
    if (operatorReviewStatus === "approved") return "Approved";
    if (operatorReviewStatus === "rejected") return "Rejected";
    return null;
}

export function enrollmentPacketSessionsPendingReview(
    sessions: EnrollmentPacketSessionLike[]
): EnrollmentPacketSessionLike[] {
    return sessions.filter(
        (s) =>
            s.status === "completed" &&
            (s.operator_review_status == null ||
                s.operator_review_status === "needs_review" ||
                s.operator_review_status === "needs_correction")
    );
}

export function enrollmentPacketReviewedHeadSession(
    sessions: EnrollmentPacketSessionLike[]
): EnrollmentPacketSessionLike | null {
    const head = sessions[0] ?? null;
    if (!head || head.status !== "completed") return null;
    const label = enrollmentPacketReviewedStatusLabel(head.operator_review_status);
    return label ? head : null;
}

export function enrollmentPacketHasSummaryContext(sessions: EnrollmentPacketSessionLike[]): boolean {
    return (
        enrollmentPacketSessionsPendingReview(sessions).length > 0 ||
        enrollmentPacketReviewedHeadSession(sessions) != null
    );
}

export function enrollmentPacketWarningCount(session: EnrollmentPacketSessionLike): number {
    if (typeof session.warning_count === "number" && session.warning_count >= 0) {
        return session.warning_count;
    }
    return session.operator_review_warnings?.length ?? 0;
}

export function enrollmentPacketPendingStatusLabel(session: EnrollmentPacketSessionLike): string {
    if (session.operator_review_status === "needs_correction") return "Needs correction";
    return "Needs review";
}

function formatEnrollmentPacketTimestamp(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

/** Created / submitted timestamps for pending session rows. */
export function enrollmentPacketTimestampsLine(session: EnrollmentPacketSessionLike): string | null {
    const parts: string[] = [];
    if (session.created_at) parts.push(`Created ${formatEnrollmentPacketTimestamp(session.created_at)}`);
    if (session.completed_at) parts.push(`Submitted ${formatEnrollmentPacketTimestamp(session.completed_at)}`);
    return parts.length > 0 ? parts.join(" · ") : null;
}

/** Short linkage hint from crm_snapshot on enrollment-packets rows. */
export function enrollmentPacketLinkageHint(session: EnrollmentPacketSessionLike): string | null {
    const snap = session.crm_snapshot;
    if (!snap) return null;
    if (snap.person_id) return "Child / person linked";
    if (snap.customer_member_id) return "Family member linked";
    if (snap.customer_id) return "Customer linked";
    if (snap.opportunity_id) return "Opportunity linked";
    return null;
}

export function enrollmentPacketProgressLine(session: EnrollmentPacketSessionLike): string | null {
    const submitted = session.submitted_step_count;
    const total = session.step_count;
    if (typeof submitted !== "number" || typeof total !== "number" || total <= 0) return null;
    return `${submitted} of ${total} steps submitted`;
}
