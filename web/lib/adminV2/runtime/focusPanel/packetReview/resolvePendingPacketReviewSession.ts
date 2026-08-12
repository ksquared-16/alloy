import {
    enrollmentPacketSessionsPendingReview,
    type EnrollmentPacketSessionLike,
} from "@/lib/admin/opportunity/enrollmentPacketSummaryPresentation";

/**
 * Which packet session the `review_enrollment_packet` action should open.
 *
 * Separated from the surface so the choice is testable without a browser, and so there is ONE
 * answer. The action is server-gated on `opportunityHasReviewableEnrollmentPacket`, so by the time
 * an operator can click it a pending session exists — but the gate and this resolver read different
 * stores at different moments, and "the button appeared, then the modal opened on nothing" is a
 * worse failure than the button never appearing.
 */

/**
 * A session the review modal can actually open.
 *
 * `id` and `admin_packet_review_path` are REQUIRED, because the modal loads the review rollup from
 * that path. A session missing either is not "a session with a small gap" — it is one the operator
 * cannot review, and handing it over produces a modal that opens onto a load error.
 */
export type PacketReviewSession = EnrollmentPacketSessionLike & {
    id: string;
    admin_packet_review_path: string;
};

export type PacketReviewSessionsResponse = {
    sessions?: Array<EnrollmentPacketSessionLike & Record<string, unknown>>;
    error?: string;
};

function isReviewable(session: EnrollmentPacketSessionLike & Record<string, unknown>): session is PacketReviewSession {
    return (
        typeof session.id === "string"
        && session.id.trim().length > 0
        && typeof session.admin_packet_review_path === "string"
        && session.admin_packet_review_path.trim().length > 0
    );
}

/** The first session still awaiting operator review AND openable, or null when none is. */
export function resolvePendingPacketReviewSession(
    sessions: ReadonlyArray<EnrollmentPacketSessionLike & Record<string, unknown>> | null | undefined,
): PacketReviewSession | null {
    if (!sessions?.length) return null;
    const pending = enrollmentPacketSessionsPendingReview(sessions as EnrollmentPacketSessionLike[]);
    for (const session of pending as Array<EnrollmentPacketSessionLike & Record<string, unknown>>) {
        if (isReviewable(session)) return session;
    }
    return null;
}

/** `GET /api/admin/opportunities/:id/enrollment-packets` — the one packet read for review. */
export async function fetchPacketReviewSessions(
    opportunityId: string,
): Promise<Array<EnrollmentPacketSessionLike & Record<string, unknown>>> {
    const id = opportunityId.trim();
    if (!id) return [];
    const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(id)}/enrollment-packets`, {
        credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as PacketReviewSessionsResponse;
    if (!res.ok) throw new Error(json.error ?? "Could not load packets");
    return Array.isArray(json.sessions) ? json.sessions : [];
}
