"use client";

import {
    enrollmentPacketLinkageHint,
    enrollmentPacketPendingStatusLabel,
    enrollmentPacketProgressLine,
    enrollmentPacketSubjectLine,
    enrollmentPacketTimestampsLine,
    enrollmentPacketWarningCount,
    type EnrollmentPacketSessionLike,
} from "@/lib/admin/opportunity/enrollmentPacketSummaryPresentation";

export type OpportunityPacketPendingSession = EnrollmentPacketSessionLike & {
    id: string;
    admin_packet_review_path: string;
};

type Props = {
    sessions: OpportunityPacketPendingSession[];
    compact?: boolean;
    onReview: (session: OpportunityPacketPendingSession) => void;
};

export function OpportunityPacketPendingReviewList({ sessions, compact = false, onReview }: Props) {
    if (sessions.length === 0) return null;

    const listMargin = compact ? "mt-1" : "mb-3";

    return (
        <div className={listMargin} role="list" aria-label="Packets pending review">
            {sessions.length > 1 ?
                <p
                    className={
                        compact ?
                            "mb-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-900/80"
                        :   "mb-2 text-[11px] font-medium uppercase tracking-wide text-amber-900/80"
                    }
                >
                    {sessions.length} packets need review
                </p>
            : null}
            <ul className={compact ? "space-y-1.5" : "space-y-2"}>
                {sessions.map((session) => {
                    const warnCount = enrollmentPacketWarningCount(session);
                    const timestamps = enrollmentPacketTimestampsLine(session);
                    const progress = enrollmentPacketProgressLine(session);
                    const linkage = enrollmentPacketLinkageHint(session);
                    const statusLabel = enrollmentPacketPendingStatusLabel(session);

                    return (
                        <li
                            key={session.id}
                            role="listitem"
                            className={
                                compact ?
                                    "flex flex-wrap items-center justify-between gap-1.5 rounded border border-amber-200/70 bg-amber-50/80 px-2 py-1.5 text-[11px] text-alloy-midnight"
                                :   "flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-alloy-midnight"
                            }
                        >
                            <div className="min-w-0 flex-1">
                                <div className="font-semibold text-alloy-midnight">
                                    {session.packet_name?.trim() || "Enrollment packet"}
                                </div>
                                <div className="text-alloy-midnight/75">{enrollmentPacketSubjectLine(session)}</div>
                                <div className="mt-0.5 text-[10px] text-alloy-midnight/60">
                                    <span className="text-amber-900">{statusLabel}</span>
                                    {progress ?
                                        <>
                                            {" · "}
                                            {progress}
                                        </>
                                    : null}
                                    {warnCount > 0 ?
                                        <>
                                            {" · "}
                                            <span className="font-medium text-amber-900">
                                                {warnCount} hint{warnCount === 1 ? "" : "s"}
                                            </span>
                                        </>
                                    : null}
                                </div>
                                {timestamps ?
                                    <div className="mt-0.5 text-[10px] text-alloy-midnight/55">{timestamps}</div>
                                : null}
                                {linkage ?
                                    <div className="mt-0.5 text-[10px] text-alloy-midnight/55">{linkage}</div>
                                : null}
                            </div>
                            <button
                                type="button"
                                className={
                                    compact ?
                                        "shrink-0 rounded border border-alloy-stone/40 bg-white px-2 py-0.5 text-[10px] font-semibold text-alloy-blue hover:bg-alloy-stone/10"
                                    :   "shrink-0 rounded border border-alloy-stone/40 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-blue hover:bg-alloy-stone/10"
                                }
                                onClick={() => onReview(session)}
                            >
                                Review
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
