/**
 * Display helpers for enrollment packet sessions on opportunity surfaces.
 * Data source: GET `/api/admin/opportunities/:id/enrollment-packets` → `sessions[]`.
 */

export type EnrollmentPacketSessionLike = {
    status?: string;
    packet_name?: string | null;
    launch_context?: Record<string, unknown> | null;
    operator_review_status?: string | null;
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
