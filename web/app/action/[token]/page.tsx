"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const ACTION_COPY: Record<string, { title: string; primaryCta: string }> = {
    customer_cancel: { title: "Confirm cancellation", primaryCta: "Confirm cancellation" },
    customer_reschedule: { title: "Confirm reschedule", primaryCta: "Confirm reschedule" },
    vendor_accept_job: { title: "Confirm acceptance", primaryCta: "Confirm acceptance" },
};
const DEFAULT_ACTION_COPY = { title: "Confirm action", primaryCta: "Confirm" };

function getActionCopy(actionType: string) {
    return ACTION_COPY[actionType] ?? DEFAULT_ACTION_COPY;
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
};

type Status = "loading" | "ready" | "expired" | "consumed" | "not_found" | "success" | "error";

export default function ActionConfirmPage() {
    const params = useParams();
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

    if (status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="max-w-md w-full text-center text-alloy-midnight/70">Loading…</div>
            </div>
        );
    }

    const cardClass = "max-w-md w-full mx-auto bg-white rounded-xl border border-alloy-stone/25 shadow-sm overflow-hidden";
    const headerClass = "px-6 py-4 border-b border-alloy-stone/20 bg-alloy-stone/5";
    const bodyClass = "px-6 py-5";
    const backLink = (
        <Link href="/" className="text-alloy-blue hover:underline text-sm inline-block mt-4">
            Back
        </Link>
    );

    if (status === "not_found") {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
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
            <div className="min-h-screen flex items-center justify-center p-6">
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
            <div className="min-h-screen flex items-center justify-center p-6">
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
            <div className="min-h-screen flex items-center justify-center p-6">
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
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className={cardClass}>
                    <div className={headerClass}>
                        <h1 className="text-lg font-semibold text-alloy-midnight">Done</h1>
                    </div>
                    <div className={`${bodyClass} text-center`}>
                        <p className="text-alloy-midnight/70 text-sm">Your action has been completed successfully.</p>
                        {backLink}
                    </div>
                </div>
            </div>
        );
    }

    if (status !== "ready" || !meta) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="max-w-md w-full text-center text-alloy-midnight/70">Loading…</div>
            </div>
        );
    }

    const expiresAt = new Date(meta.expires_at);
    const isExpired = expiresAt <= new Date();
    const linkStatus = meta.consumed_at ? "Already used" : isExpired ? "Expired" : "Valid";
    const copy = getActionCopy(meta.action_type);

    const cardClass = "max-w-md w-full mx-auto bg-white rounded-xl border border-alloy-stone/25 shadow-sm overflow-hidden";
    const headerClass = "px-6 py-4 border-b border-alloy-stone/20 bg-alloy-stone/5";
    const bodyClass = "px-6 py-5";

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className={cardClass}>
                <div className={headerClass}>
                    <h1 className="text-lg font-semibold text-alloy-midnight">{copy.title}</h1>
                </div>
                <div className={bodyClass}>
                    <div className="flex items-center gap-2 mb-4">
                        <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
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
                    <dl className="text-sm text-alloy-midnight/80 space-y-2 mb-5">
                        <div><span className="font-medium text-alloy-midnight">Action:</span> {formatActionTypeLabel(meta.action_type)}</div>
                        <div><span className="font-medium text-alloy-midnight">Entity:</span> {formatEntityTypeLabel(meta.entity_type)}</div>
                        <div><span className="font-medium text-alloy-midnight">Expires:</span> {isExpired ? "Expired" : expiresAt.toLocaleString()}</div>
                    </dl>
                    {meta.action_type === "customer_cancel" && meta.entity_type === "schedule" && (
                        <div className="mb-5">
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
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={submitting}
                            className="px-4 py-2.5 bg-alloy-blue text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-alloy-blue/90 transition-colors"
                        >
                            {submitting ? "Confirming…" : copy.primaryCta}
                        </button>
                        <Link href="/" className="px-4 py-2.5 text-alloy-midnight/70 hover:underline text-sm text-center sm:text-left">
                            Back
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
