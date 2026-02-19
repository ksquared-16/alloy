"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const ACTION_COPY: Record<string, { title: string; subtitle: string; primaryCta: string }> = {
    customer_cancel: { title: "Confirm cancellation", subtitle: "You’re about to cancel your appointment.", primaryCta: "Confirm cancellation" },
    customer_reschedule: { title: "Confirm reschedule", subtitle: "You’re about to reschedule your appointment.", primaryCta: "Choose a new time" },
    vendor_accept_job: { title: "Confirm acceptance", subtitle: "You’re about to accept this job.", primaryCta: "Confirm acceptance" },
};
const DEFAULT_ACTION_COPY = { title: "Confirm action", subtitle: "Confirm the action below.", primaryCta: "Confirm" };

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
    if (actionType === "customer_reschedule") {
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

function formatActionTypeLabel(actionType: string): string {
    const labels: Record<string, string> = {
        customer_cancel: "Cancel appointment",
        customer_reschedule: "Reschedule appointment",
        vendor_accept_job: "Accept job",
    };
    if (labels[actionType]) return labels[actionType];
    return actionType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEntityTypeLabel(entityType: string): string {
    const labels: Record<string, string> = {
        schedule: "Appointment",
        job: "Job",
    };
    if (labels[entityType]) return labels[entityType];
    return entityType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
            .then((data: { ok?: boolean; reason?: string }) => {
                if (data.ok) {
                    setStatus("success");
                } else if (data.reason === "already_assigned") {
                    setStatus("already_assigned");
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
        const isAcceptJob = meta?.action_type === "vendor_accept_job";
        return (
            <div className={pageBg}>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[420px] h-[320px] rounded-full bg-alloy-stone/10 blur-3xl" />
                </div>
                <div className={cardClass}>
                    <div className={headerClass}>
                        <h1 className="text-lg font-semibold text-alloy-midnight">{isAcceptJob ? "Job accepted" : "Done"}</h1>
                    </div>
                    <div className={`${bodyClass} text-center`}>
                        <p className="text-alloy-midnight/70 text-sm">
                            {isAcceptJob ? "You have accepted this job." : "Your action has been completed successfully."}
                        </p>
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
                        <h1 className="text-lg font-semibold text-alloy-midnight">Job no longer available</h1>
                    </div>
                    <div className={`${bodyClass} text-center`}>
                        <p className="text-alloy-midnight/70 text-sm">Someone else already accepted this job.</p>
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
    const copy = getActionCopy(meta.action_type);
    const md = meta.metadata ?? {};
    const startAt = md.start_at != null ? String(md.start_at) : null;
    const endAt = md.end_at != null ? String(md.end_at) : null;
    const timezone = md.timezone != null ? String(md.timezone) : null;
    const serviceLabel = md.service_label != null ? String(md.service_label) : formatEntityTypeLabel(meta.entity_type);
    const address = md.address != null ? String(md.address) : null;
    const city = md.city != null ? String(md.city) : null;
    const showAppointmentSummary = meta.entity_type === "schedule";

    function formatDateTime(iso: string, tz: string | null): string {
        try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return iso;
            if (tz) {
                return d.toLocaleString(undefined, { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
            }
            return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        } catch {
            return iso;
        }
    }

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
                            <p className="mt-1 text-xs text-alloy-midnight/60">This link is secure and expires in 2 hours.</p>
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
                    <dl className="text-sm text-alloy-midnight/80 space-y-2 pb-5 border-b border-alloy-stone/20">
                        <div><span className="font-medium text-alloy-midnight">Action:</span> {formatActionTypeLabel(meta.action_type)}</div>
                        <div><span className="font-medium text-alloy-midnight">Entity:</span> {formatEntityTypeLabel(meta.entity_type)}</div>
                        <div><span className="font-medium text-alloy-midnight">Expires:</span> {isExpired ? "Expired" : expiresAt.toLocaleString()}</div>
                    </dl>

                    {showAppointmentSummary && (
                        <div className="py-5 border-b border-alloy-stone/20">
                            <h2 className="text-sm font-semibold text-alloy-midnight mb-3">Appointment summary</h2>
                            <dl className="text-sm text-alloy-midnight/80 space-y-2">
                                {(startAt || endAt) && (
                                    <div>
                                        <span className="font-medium text-alloy-midnight">Date & time:</span>{" "}
                                        {startAt && endAt
                                            ? `${formatDateTime(startAt, timezone)} – ${formatDateTime(endAt, timezone)}`
                                            : startAt
                                              ? formatDateTime(startAt, timezone)
                                              : endAt
                                                ? formatDateTime(endAt, timezone)
                                                : null}
                                    </div>
                                )}
                                <div><span className="font-medium text-alloy-midnight">Service:</span> {serviceLabel}</div>
                                {(address || city) && (
                                    <div>
                                        <span className="font-medium text-alloy-midnight">Location:</span>{" "}
                                        {[address, city].filter(Boolean).join(", ")}
                                    </div>
                                )}
                            </dl>
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
                        {meta.action_type === "customer_reschedule" ? (
                            <button
                                type="button"
                                onClick={() => router.push(`/book-v2?reschedule_token=${encodeURIComponent(token)}`)}
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
