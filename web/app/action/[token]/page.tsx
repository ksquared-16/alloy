"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ActionLinkDetailsPanel from "@/components/action/ActionLinkDetailsPanel";
import type { ActionLinkDisplayDetails } from "@/lib/actionLinkDisplayDetails";

const ACTION_COPY: Record<string, { title: string; subtitle: string; primaryCta: string }> = {
    customer_cancel: { title: "Cancel appointment", subtitle: "Review your booking below, then confirm if you want to cancel.", primaryCta: "Confirm cancellation" },
    customer_reschedule: { title: "Reschedule appointment", subtitle: "Review your current booking, then choose a new time.", primaryCta: "Continue to calendar" },
    vendor_accept_job: { title: "Accept this job", subtitle: "Review the visit details below, then confirm to claim the job.", primaryCta: "Claim job" },
};
const DEFAULT_ACTION_COPY = { title: "Confirm action", subtitle: "Confirm the action below.", primaryCta: "Confirm" };

/** Workflows emit `reschedule_schedule`; book-v2 + consume-reschedule use the same guided flow as `customer_reschedule`. */
function isScheduleRescheduleLink(actionType: string, entityType: string): boolean {
    return (
        entityType === "schedule" &&
        (actionType === "customer_reschedule" || actionType === "reschedule_schedule")
    );
}

function getActionCopy(actionType: string) {
    return ACTION_COPY[actionType] ?? DEFAULT_ACTION_COPY;
}

function ActionIcon({ actionType }: { actionType: string }) {
    const iconClass = "w-5 h-5";
    if (actionType === "customer_cancel") {
        return (
            <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        );
    }
    if (actionType === "customer_reschedule" || actionType === "reschedule_schedule") {
        return (
            <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        );
    }
    if (actionType === "vendor_accept_job") {
        return (
            <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
        );
    }
    return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
    );
}

type LinkMeta = {
    id: string;
    org_id: string | null;
    action_type: string;
    entity_type: string;
    entity_id: string;
    expires_at: string;
    consumed_at: string | null;
    created_at: string;
    metadata?: Record<string, unknown>;
    details?: ActionLinkDisplayDetails;
};

type Status = "loading" | "ready" | "expired" | "consumed" | "not_found" | "success" | "error" | "already_assigned";

export default function ActionConfirmPage() {
    const params = useParams();
    const router = useRouter();
    const token = typeof params?.token === "string" ? params.token : "";
    const [status, setStatus] = useState<Status>("loading");
    const [meta, setMeta] = useState<LinkMeta | null>(null);
    const [cancelReason, setCancelReason] = useState("Confirmed by user");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!token) {
            setStatus("not_found");
            return;
        }
        fetch(`/api/action/${encodeURIComponent(token)}`)
            .then(async (res) => {
                if (res.status === 404) {
                    setStatus("not_found");
                    return { skip: true };
                }
                if (res.status === 410) {
                    setStatus("expired");
                    return { skip: true };
                }
                if (res.status === 409) {
                    setStatus("consumed");
                    return { skip: true };
                }
                if (!res.ok) {
                    setStatus("error");
                    return { skip: true };
                }
                return res.json();
            })
            .then((data) => {
                if (data && (data as { skip?: boolean }).skip) return;
                if (data && (data as LinkMeta).action_type) {
                    setMeta(data as LinkMeta);
                    setStatus("ready");
                } else {
                    setStatus("error");
                }
            })
            .catch(() => setStatus("error"));
    }, [token]);

    const handleConfirm = useCallback(() => {
        if (!token || submitting || status !== "ready") return;
        setSubmitting(true);
        const body: Record<string, unknown> =
            meta?.action_type === "customer_cancel" && meta?.entity_type === "schedule"
                ? { canceled_by: "customer", cancel_reason: cancelReason }
                : {};
        fetch(`/api/action/${encodeURIComponent(token)}/consume`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
            .then((res) => {
                if (res.ok) {
                    setStatus("success");
                } else {
                    setStatus("error");
                    setSubmitting(false);
                }
            })
            .catch(() => {
                setStatus("error");
                setSubmitting(false);
            });
    }, [token, meta, cancelReason, submitting, status]);

    const handleAcceptJob = useCallback(() => {
        if (!token || submitting || status !== "ready") return;
        setSubmitting(true);
        fetch("/api/action-links/consume-accept-job", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
        })
            .then((res) => res.json())
            .then((data: { ok?: boolean; reason?: string; action_link_result?: { accept_result?: string } }) => {
                if (data.ok && data.action_link_result?.accept_result === "already_assigned") {
                    setStatus("already_assigned");
                } else if (data.ok) {
                    setStatus("success");
                } else {
                    setStatus("error");
                }
                setSubmitting(false);
            })
            .catch(() => {
                setStatus("error");
                setSubmitting(false);
            });
    }, [token, submitting, status]);

    if (status === "loading") {
        return (
            <div className="min-h-screen bg-gradient-to-b from-white to-alloy-stone/10 flex items-center justify-center p-6">
                <div className="max-w-lg w-full text-center text-alloy-midnight/70">Loading…</div>
            </div>
        );
    }

    const pageBg = "min-h-screen bg-gradient-to-b from-white to-alloy-stone/10 flex items-center justify-center p-6 relative";
    const cardClass = "max-w-lg w-full mx-auto bg-white rounded-xl border border-alloy-stone/25 shadow-sm overflow-hidden relative z-10";
    const headerClass = "px-6 py-4 border-b border-alloy-stone/20 bg-alloy-stone/5";
    const bodyClass = "px-6 py-5";
    const backLink = (
        <Link href="/" className="text-alloy-blue hover:underline text-sm inline-block mt-4">
            Back
        </Link>
    );

    if (status === "not_found") {
        return (
            <div className={pageBg}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[420px] h-[320px] rounded-full bg-alloy-stone/10 blur-3xl" />
                </div>
                <div className={cardClass}>
                    <div className={headerClass}>
                        <h1 className="text-lg font-semibold text-alloy-midnight">Link not found</h1>
                    </div>
                    <div className={`${bodyClass} text-center`}>
                        <p className="text-alloy-midnight/70 text-sm">This link is invalid or has been removed.</p>
                        {backLink}
                    </div>
                </div>
            </div>
        );
    }

    if (status === "expired") {
        return (
            <div className={pageBg}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[420px] h-[320px] rounded-full bg-alloy-stone/10 blur-3xl" />
                </div>
                <div className={cardClass}>
                    <div className={headerClass}>
                        <h1 className="text-lg font-semibold text-alloy-midnight">Link expired</h1>
                    </div>
                    <div className={`${bodyClass} text-center`}>
                        <p className="text-alloy-midnight/70 text-sm">This link has expired and can no longer be used.</p>
                        {backLink}
                    </div>
                </div>
            </div>
        );
    }

    if (status === "consumed") {
        return (
            <div className={pageBg}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[420px] h-[320px] rounded-full bg-alloy-stone/10 blur-3xl" />
                </div>
                <div className={cardClass}>
                    <div className={headerClass}>
                        <h1 className="text-lg font-semibold text-alloy-midnight">Already used</h1>
                    </div>
                    <div className={`${bodyClass} text-center`}>
                        <p className="text-alloy-midnight/70 text-sm">This link has already been used.</p>
                        {backLink}
                    </div>
                </div>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className={pageBg}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[420px] h-[320px] rounded-full bg-alloy-stone/10 blur-3xl" />
                </div>
                <div className={cardClass}>
                    <div className={headerClass}>
                        <h1 className="text-lg font-semibold text-alloy-midnight">Something went wrong</h1>
                    </div>
                    <div className={`${bodyClass} text-center`}>
                        <p className="text-alloy-midnight/70 text-sm">We couldn’t complete your request. Please try again or go home.</p>
                        {backLink}
                    </div>
                </div>
            </div>
        );
    }

    if (status === "success") {
        const at = meta?.action_type ?? "";
        let title = "Done";
        let message = "Your request was completed.";
        if (at === "vendor_accept_job") {
            title = "Job claimed";
            message = "You’ve accepted this job. It’s now assigned to you.";
        } else if (at === "customer_cancel") {
            title = "Appointment canceled";
            message = "Your booking has been canceled.";
        }
        return (
            <div className={pageBg}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[420px] h-[320px] rounded-full bg-alloy-stone/10 blur-3xl" />
                </div>
                <div className={cardClass}>
                    <div className={headerClass}>
                        <h1 className="text-lg font-semibold text-alloy-midnight">{title}</h1>
                    </div>
                    <div className={`${bodyClass} text-center`}>
                        <p className="text-alloy-midnight/70 text-sm">{message}</p>
                        {backLink}
                    </div>
                </div>
            </div>
        );
    }

    if (status === "already_assigned") {
        return (
            <div className={pageBg}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[420px] h-[320px] rounded-full bg-alloy-stone/10 blur-3xl" />
                </div>
                <div className={cardClass}>
                    <div className={headerClass}>
                        <h1 className="text-lg font-semibold text-alloy-midnight">Already claimed</h1>
                    </div>
                    <div className={`${bodyClass} text-center`}>
                        <p className="text-alloy-midnight/70 text-sm">This job was already accepted by another vendor.</p>
                        {backLink}
                    </div>
                </div>
            </div>
        );
    }

    if (status !== "ready" || !meta) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-white to-alloy-stone/10 flex items-center justify-center p-6">
                <div className="max-w-lg w-full text-center text-alloy-midnight/70">Loading…</div>
            </div>
        );
    }

    const expiresAt = new Date(meta.expires_at);
    const isExpired = expiresAt <= new Date();
    const linkStatus = meta.consumed_at ? "Already used" : isExpired ? "Expired" : "Valid";
    const copy = getActionCopy(
        isScheduleRescheduleLink(meta.action_type, meta.entity_type) ? "customer_reschedule" : meta.action_type
    );
    const details: ActionLinkDisplayDetails = meta.details ?? {
        start_at: null,
        end_at: null,
        timezone: null,
        service_label: null,
        job_title: null,
        job_description: null,
        visit_type: null,
        location_summary: null,
        house_detail_lines: [],
        price_display: null,
        schedule_id: null,
        job_id: null,
    };
    const detailsHeading = meta.entity_type === "job" ? "Job details" : "Current appointment";

    return (
        <div className={pageBg}>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[420px] h-[320px] rounded-full bg-alloy-stone/10 blur-3xl" />
            </div>
            <div className={cardClass}>
                <div className={headerClass}>
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-alloy-stone/15 flex items-center justify-center text-alloy-midnight">
                            <ActionIcon actionType={meta.action_type} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-semibold text-alloy-midnight tracking-tight">{copy.title}</h1>
                            <p className="mt-0.5 text-sm text-alloy-midnight/70">{copy.subtitle}</p>
                            <p className="mt-1 text-xs text-alloy-midnight/55">
                                Secure link · Expires {expiresAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                            </p>
                        </div>
                        <span
                            className={`flex-shrink-0 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                linkStatus === "Valid"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : linkStatus === "Expired"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-alloy-stone/20 text-alloy-midnight/70"
                            }`}
                        >
                            {linkStatus}
                        </span>
                    </div>
                </div>
                <div className={bodyClass}>
                    {(meta.entity_type === "schedule" || meta.entity_type === "job") && (
                        <div className="pb-5 border-b border-alloy-stone/20">
                            <ActionLinkDetailsPanel details={details} heading={detailsHeading} />
                        </div>
                    )}

                    {meta.action_type === "customer_cancel" && meta.entity_type === "schedule" && (
                        <div className="py-5 border-b border-alloy-stone/20">
                            <label htmlFor="cancel_reason" className="block text-sm font-medium text-alloy-midnight mb-1">Reason (optional)</label>
                            <input
                                id="cancel_reason"
                                type="text"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                className="w-full border border-alloy-stone/40 rounded-lg px-3 py-2 text-alloy-midnight text-sm focus:outline-none focus:ring-2 focus:ring-alloy-blue/30 focus:border-alloy-blue"
                            />
                            <p className="mt-1.5 text-xs text-alloy-midnight/60">Provide a reason for cancellation if you’d like it recorded.</p>
                        </div>
                    )}

                    <div className="pt-5 flex flex-col sm:flex-row sm:items-center gap-3">
                        {isScheduleRescheduleLink(meta.action_type, meta.entity_type) ? (
                            <button
                                type="button"
                                onClick={() =>
                                    router.push(
                                        `/book-v2?reschedule_token=${encodeURIComponent(token)}&reschedule_skip_review=1`
                                    )
                                }
                                className="w-full sm:w-auto px-5 py-2.5 bg-alloy-blue text-white rounded-lg text-sm font-medium hover:bg-alloy-blue/90 transition-colors"
                            >
                                {copy.primaryCta}
                            </button>
                        ) : meta.action_type === "vendor_accept_job" ? (
                            <button
                                type="button"
                                onClick={handleAcceptJob}
                                disabled={submitting}
                                className="w-full sm:w-auto px-5 py-2.5 bg-alloy-blue text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-alloy-blue/90 transition-colors"
                            >
                                {submitting ? "Confirming…" : copy.primaryCta}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={submitting}
                                className="w-full sm:w-auto px-5 py-2.5 bg-alloy-blue text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-alloy-blue/90 transition-colors"
                            >
                                {submitting ? "Confirming…" : copy.primaryCta}
                            </button>
                        )}
                        <Link href="/" className="text-alloy-midnight/70 hover:underline text-sm text-center sm:text-left">
                            Back
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
