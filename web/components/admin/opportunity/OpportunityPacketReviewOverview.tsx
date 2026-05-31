"use client";

import { useCallback, useEffect, useState } from "react";

import {
    enrollmentPacketReviewedHeadSession,
    enrollmentPacketReviewedStatusLabel,
    enrollmentPacketSessionsPendingReview,
    enrollmentPacketSubjectLine,
} from "@/lib/admin/opportunity/enrollmentPacketSummaryPresentation";
import {
    OpportunityPacketPendingReviewList,
    type OpportunityPacketPendingSession,
} from "@/components/admin/opportunity/OpportunityPacketPendingReviewList";
import { OpportunityPacketReviewModal } from "@/components/admin/opportunity/OpportunityPacketReviewModal";
import { ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW } from "@/lib/admin/actions/enrollmentActionClient";

type ReviewWarning = { kind?: string; message?: string; field_key?: string };

type EnrollmentPacketSessionRow = OpportunityPacketPendingSession & {
    operator_review_warnings?: ReviewWarning[] | null;
    warning_count?: number;
};

type Props = {
    opportunityId: string;
    canMutate: boolean;
    onInvalidate: () => void;
    /** `inquiry_summary` — compact, no outer margins; `overview_tab` — legacy banner spacing */
    placement?: "overview_tab" | "inquiry_summary";
};

export function OpportunityPacketReviewOverview({
    opportunityId,
    canMutate,
    onInvalidate,
    placement = "overview_tab",
}: Props) {
    const compact = placement === "inquiry_summary";
    const statusMargin = compact ? "mt-1" : "mb-3";

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [sessions, setSessions] = useState<EnrollmentPacketSessionRow[]>([]);
    const [open, setOpen] = useState(false);
    const [activeSession, setActiveSession] = useState<EnrollmentPacketSessionRow | null>(null);

    const load = useCallback(async (): Promise<EnrollmentPacketSessionRow[]> => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/enrollment-packets`, {
                credentials: "include",
            });
            const j = (await res.json().catch(() => ({}))) as {
                sessions?: EnrollmentPacketSessionRow[];
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Could not load packets");
            const next = Array.isArray(j.sessions) ? j.sessions : [];
            setSessions(next);
            return next;
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Load failed");
            setSessions([]);
            return [];
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const onOpp = (ev: Event) => {
            const ce = ev as CustomEvent<{ id?: string }>;
            const id = typeof ce.detail?.id === "string" ? ce.detail.id : "";
            if (id && id === opportunityId) void load();
        };
        if (typeof window === "undefined") return;
        window.addEventListener("adminv2:opportunity-updated", onOpp as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onOpp as EventListener);
    }, [opportunityId, load]);

    useEffect(() => {
        const onOpenReview = (ev: Event) => {
            const ce = ev as CustomEvent<{ opportunity_id?: string }>;
            const id = typeof ce.detail?.opportunity_id === "string" ? ce.detail.opportunity_id.trim() : "";
            if (!id || id !== opportunityId || open) return;
            void load().then((loaded) => {
                const pendingNow = enrollmentPacketSessionsPendingReview(loaded) as EnrollmentPacketSessionRow[];
                if (pendingNow.length > 0) {
                    setActiveSession(pendingNow[0]!);
                    setOpen(true);
                }
            });
        };
        if (typeof window === "undefined") return;
        window.addEventListener(ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW, onOpenReview as EventListener);
        return () =>
            window.removeEventListener(ADMINV2_OPEN_ENROLLMENT_PACKET_REVIEW, onOpenReview as EventListener);
    }, [opportunityId, load, open]);

    const pending = enrollmentPacketSessionsPendingReview(sessions) as EnrollmentPacketSessionRow[];
    const reviewedHead = enrollmentPacketReviewedHeadSession(sessions);

    const openReview = (session: EnrollmentPacketSessionRow) => {
        setActiveSession(session);
        setOpen(true);
    };

    const onReviewApplied = async () => {
        setActiveSession(null);
        onInvalidate();
        window.dispatchEvent(
            new CustomEvent("adminv2:opportunity-updated", {
                detail: { id: opportunityId, action_key: "review_enrollment_packet" },
            })
        );
        await load();
    };

    if (loading) {
        return (
            <p className={`${statusMargin} text-[11px] text-alloy-midnight/55`} role="status">
                Loading packets…
            </p>
        );
    }
    if (err) {
        return (
            <p className={`${statusMargin} text-[11px] text-red-700`} role="alert">
                {err}
            </p>
        );
    }
    if (pending.length === 0) {
        if (reviewedHead) {
            const st = enrollmentPacketReviewedStatusLabel(reviewedHead.operator_review_status);
            return (
                <p
                    className={
                        compact ?
                            `${statusMargin} text-[11px] leading-snug text-alloy-midnight/70`
                        :   `${statusMargin} rounded-md border border-alloy-stone/20 bg-alloy-stone/[0.03] px-3 py-2 text-[11px] text-alloy-midnight/70`
                    }
                >
                    <span className="font-medium text-alloy-midnight/80">Packet</span>
                    <span className="text-alloy-midnight/60"> · {enrollmentPacketSubjectLine(reviewedHead)}</span>
                    <span className="text-alloy-midnight/55"> · {st}</span>
                </p>
            );
        }
        return null;
    }

    return (
        <>
            <OpportunityPacketPendingReviewList
                sessions={pending}
                compact={compact}
                onReview={openReview}
            />
            <OpportunityPacketReviewModal
                open={open}
                session={activeSession}
                canMutate={canMutate}
                onClose={() => {
                    setOpen(false);
                    setActiveSession(null);
                }}
                onReviewApplied={onReviewApplied}
            />
        </>
    );
}
