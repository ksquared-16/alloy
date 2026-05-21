"use client";

import { useCallback, useEffect, useState } from "react";

import { OpportunityPacketReviewOverview } from "@/components/admin/opportunity/OpportunityPacketReviewOverview";
import {
    enrollmentPacketHasSummaryContext,
    type EnrollmentPacketSessionLike,
} from "@/lib/admin/opportunity/enrollmentPacketSummaryPresentation";

const GROUP_LABEL =
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45";

type Props = {
    opportunityId: string;
    canMutate: boolean;
    onInvalidate: () => void;
    onGoToTab: (tab: "activity" | "documents") => void;
    /** When false, defers enrollment-packets probe until summary column is visible. */
    fetchEnabled?: boolean;
};

/**
 * Inquiry summary right column — enrollment packet status + Activity/Documents shortcuts.
 * Packet data: `GET /api/admin/opportunities/:id/enrollment-packets`.
 * Hidden when load completes with no packet sessions (avoids empty whitespace).
 */
export function OpportunityInquirySummaryActivity({
    opportunityId,
    canMutate,
    onInvalidate,
    onGoToTab,
    fetchEnabled = true,
}: Props) {
    const [loadState, setLoadState] = useState<"loading" | "ready">("loading");
    const [hasSessions, setHasSessions] = useState(false);
    const [hasPacketSummary, setHasPacketSummary] = useState(false);

    const probeSessions = useCallback(async () => {
        setLoadState("loading");
        try {
            const res = await fetch(
                `/api/admin/opportunities/${encodeURIComponent(opportunityId)}/enrollment-packets`,
                { credentials: "include" }
            );
            const j = (await res.json().catch(() => ({}))) as { sessions?: EnrollmentPacketSessionLike[] };
            const sessions = res.ok && Array.isArray(j.sessions) ? j.sessions : [];
            setHasSessions(sessions.length > 0);
            setHasPacketSummary(enrollmentPacketHasSummaryContext(sessions));
        } catch {
            setHasSessions(false);
            setHasPacketSummary(false);
        } finally {
            setLoadState("ready");
        }
    }, [opportunityId]);

    useEffect(() => {
        if (!fetchEnabled) {
            setLoadState("ready");
            setHasSessions(false);
            setHasPacketSummary(false);
            return;
        }
        void probeSessions();
    }, [fetchEnabled, probeSessions]);

    useEffect(() => {
        const onOpp = (ev: Event) => {
            const ce = ev as CustomEvent<{ id?: string }>;
            const id = typeof ce.detail?.id === "string" ? ce.detail.id : "";
            if (id && id === opportunityId) void probeSessions();
        };
        if (typeof window === "undefined") return;
        window.addEventListener("adminv2:opportunity-updated", onOpp as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onOpp as EventListener);
    }, [opportunityId, probeSessions]);

    if (loadState === "loading") return null;
    if (!hasSessions) return null;

    return (
        <div
            className="mt-2 border-t border-alloy-stone/10 pt-2"
            data-inquiry-summary-group="activity"
            data-opportunity-inquiry-summary-activity="true"
        >
            <div className={GROUP_LABEL}>Activity</div>
            {hasPacketSummary ? (
                <OpportunityPacketReviewOverview
                    opportunityId={opportunityId}
                    canMutate={canMutate}
                    onInvalidate={() => {
                        onInvalidate();
                        void probeSessions();
                    }}
                    placement="inquiry_summary"
                />
            ) : null}
            <p className={`${hasPacketSummary ? "mt-1" : ""} text-[11px] leading-snug text-alloy-midnight/60`}>
                Send new packets from the toolbar (
                <span className="font-medium text-alloy-midnight/75">Send enrollment packet</span>
                ).{" "}
                <button
                    type="button"
                    className="font-semibold text-alloy-blue hover:underline"
                    onClick={() => onGoToTab("activity")}
                >
                    Activity
                </button>
                {" · "}
                <button
                    type="button"
                    className="font-semibold text-alloy-blue hover:underline"
                    onClick={() => onGoToTab("documents")}
                >
                    Documents
                </button>{" "}
                for launches and linked files.
            </p>
        </div>
    );
}
