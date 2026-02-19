"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
                <div className="text-alloy-midnight/70">Loading…</div>
            </div>
        );
    }

    if (status === "not_found") {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="max-w-md w-full border border-alloy-stone/30 rounded-lg p-6 bg-white text-center">
                    <h1 className="text-xl font-semibold text-alloy-midnight mb-2">Link not found</h1>
                    <p className="text-alloy-midnight/70 text-sm mb-4">This link is invalid or has been removed.</p>
                    <Link href="/" className="text-alloy-blue hover:underline text-sm">Go home</Link>
                </div>
            </div>
        );
    }

    if (status === "expired") {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="max-w-md w-full border border-alloy-stone/30 rounded-lg p-6 bg-white text-center">
                    <h1 className="text-xl font-semibold text-alloy-midnight mb-2">Link expired</h1>
                    <p className="text-alloy-midnight/70 text-sm mb-4">This link has expired and can no longer be used.</p>
                    <Link href="/" className="text-alloy-blue hover:underline text-sm">Go home</Link>
                </div>
            </div>
        );
    }

    if (status === "consumed") {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="max-w-md w-full border border-alloy-stone/30 rounded-lg p-6 bg-white text-center">
                    <h1 className="text-xl font-semibold text-alloy-midnight mb-2">Already used</h1>
                    <p className="text-alloy-midnight/70 text-sm mb-4">This link has already been used.</p>
                    <Link href="/" className="text-alloy-blue hover:underline text-sm">Go home</Link>
                </div>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="max-w-md w-full border border-alloy-stone/30 rounded-lg p-6 bg-white text-center">
                    <h1 className="text-xl font-semibold text-alloy-midnight mb-2">Something went wrong</h1>
                    <p className="text-alloy-midnight/70 text-sm mb-4">We couldn’t complete your request. Please try again or go home.</p>
                    <Link href="/" className="text-alloy-blue hover:underline text-sm">Go home</Link>
                </div>
            </div>
        );
    }

    if (status === "success") {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="max-w-md w-full border border-alloy-stone/30 rounded-lg p-6 bg-white text-center">
                    <h1 className="text-xl font-semibold text-alloy-midnight mb-2">Done</h1>
                    <p className="text-alloy-midnight/70 text-sm mb-4">Your action has been completed successfully.</p>
                    <Link href="/" className="text-alloy-blue hover:underline text-sm">Go home</Link>
                </div>
            </div>
        );
    }

    if (status !== "ready" || !meta) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="text-alloy-midnight/70">Loading…</div>
            </div>
        );
    }

    const expiresAt = new Date(meta.expires_at);
    const isExpired = expiresAt <= new Date();

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="max-w-md w-full border border-alloy-stone/30 rounded-lg p-6 bg-white">
                <h1 className="text-xl font-semibold text-alloy-midnight mb-2">Confirm action</h1>
                <dl className="text-sm text-alloy-midnight/80 space-y-1 mb-4">
                    <div><span className="font-medium">Action:</span> {meta.action_type}</div>
                    <div><span className="font-medium">Entity:</span> {meta.entity_type}</div>
                    <div><span className="font-medium">Expires:</span> {isExpired ? "Expired" : expiresAt.toLocaleString()}</div>
                    <div><span className="font-medium">Status:</span> {meta.consumed_at ? "Already used" : "Valid"}</div>
                </dl>
                {meta.action_type === "customer_cancel" && meta.entity_type === "schedule" && (
                    <div className="mb-4">
                        <label htmlFor="cancel_reason" className="block text-sm font-medium text-alloy-midnight mb-1">Reason (optional)</label>
                        <input
                            id="cancel_reason"
                            type="text"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="w-full border border-alloy-stone/40 rounded px-3 py-2 text-alloy-midnight text-sm"
                        />
                    </div>
                )}
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={submitting}
                        className="px-4 py-2 bg-alloy-blue text-white rounded text-sm font-medium disabled:opacity-50"
                    >
                        {submitting ? "Confirming…" : "Confirm"}
                    </button>
                    <Link href="/" className="px-4 py-2 text-alloy-midnight/70 hover:underline text-sm">Cancel</Link>
                </div>
            </div>
        </div>
    );
}
