"use client";

/**
 * Draft Obligation Review (Operational Consumption, Slice 4 / Integration Batch A0)
 * — the PRE-POSTING operator surface.
 *
 * Minimal review workspace: lists Resolved Obligations the pipeline generated and
 * lets an operator triage them BEFORE Posting exists. It calls only the existing,
 * role-gated API (GET/POST /api/admin/financial/consumption/obligations). It does
 * NOT post charges, write the ledger, invoice, or collect payment — "Mark
 * reviewed" only advances the review lifecycle so an obligation becomes eligible
 * for FUTURE Finalize/Posting.
 *
 * Doctrine: docs/platform/core/operational-commercial-integration.md (§11b, A0)
 */

import { useCallback, useEffect, useState } from "react";
import {
    REVIEW_STATUS_LABEL,
    type ObligationListItem,
    type ReviewStatus,
} from "@/lib/operationalConsumption/obligationReviewTypes";

const API = "/api/admin/financial/consumption/obligations";

/** The review-status tabs an operator triages through (plus "all"). */
const TABS: { key: ReviewStatus | "all"; label: string }[] = [
    { key: "review_required", label: "Needs review" },
    { key: "pending", label: "Pending" },
    { key: "reviewed", label: "Reviewed" },
    { key: "suppressed", label: "Suppressed" },
    { key: "stale", label: "Stale" },
    { key: "all", label: "All" },
];

function formatAmount(cents: number | null, currency: string): string {
    if (cents == null) return "—";
    const value = (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });
    return value;
}

function StatusBadge({ status }: { status: ReviewStatus }) {
    const tone: Record<ReviewStatus, string> = {
        pending: "bg-alloy-stone/15 text-alloy-midnight/70",
        review_required: "bg-amber-100 text-amber-800",
        reviewed: "bg-emerald-100 text-emerald-800",
        suppressed: "bg-rose-100 text-rose-700",
        stale: "bg-sky-100 text-sky-800",
    };
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone[status]}`}>
            {REVIEW_STATUS_LABEL[status]}
        </span>
    );
}

export default function ObligationReviewPage() {
    const [tab, setTab] = useState<ReviewStatus | "all">("review_required");
    const [items, setItems] = useState<ObligationListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async (which: ReviewStatus | "all") => {
        setLoading(true);
        setError(null);
        try {
            const qs = which === "all" ? "" : `?review_status=${which}`;
            const res = await fetch(`${API}${qs}`, { cache: "no-store" });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(body.error ?? `Request failed (${res.status})`);
            }
            const body = (await res.json()) as { obligations: ObligationListItem[] };
            setItems(body.obligations ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load obligations");
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(tab);
    }, [tab, load]);

    const act = useCallback(
        async (id: string, action: "mark_reviewed" | "suppress" | "restore", reason?: string) => {
            setBusyId(id);
            setError(null);
            try {
                const res = await fetch(API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id, action, reason }),
                });
                if (!res.ok) {
                    const body = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(body.error ?? `Action failed (${res.status})`);
                }
                await load(tab);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Action failed");
            } finally {
                setBusyId(null);
            }
        },
        [tab, load],
    );

    return (
        <div className="w-full max-w-6xl space-y-4 pb-2">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Obligation review</h1>
                <p className="mt-1 text-xs text-alloy-midnight/60">
                    Pre-posting review of obligations the consumption pipeline generated. Marking an obligation reviewed
                    makes it eligible for future Finalize/Posting — it does <strong>not</strong> post charges, write the
                    ledger, or invoice.
                </p>
            </header>

            <nav className="flex flex-wrap gap-1.5">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            tab === t.key
                                ? "bg-alloy-midnight text-white"
                                : "bg-white/60 text-alloy-midnight/70 hover:bg-alloy-stone/15"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            {error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-alloy-stone/15 bg-white/60">
                {loading ? (
                    <div className="px-4 py-6 text-sm text-alloy-midnight/60">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-alloy-midnight/60">No obligations in this view.</div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-alloy-stone/15 text-[11px] uppercase tracking-wide text-alloy-midnight/50">
                            <tr>
                                <th className="px-4 py-2 font-medium">Kind</th>
                                <th className="px-4 py-2 font-medium">Amount</th>
                                <th className="px-4 py-2 font-medium">Source</th>
                                <th className="px-4 py-2 font-medium">Occurs</th>
                                <th className="px-4 py-2 font-medium">Review</th>
                                <th className="px-4 py-2 font-medium">Posting</th>
                                <th className="px-4 py-2 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((o) => (
                                <tr key={o.id} className="border-b border-alloy-stone/10 last:border-0">
                                    <td className="px-4 py-2 text-alloy-midnight">{o.obligationKind ?? "—"}</td>
                                    <td className="px-4 py-2 tabular-nums text-alloy-midnight">
                                        {formatAmount(o.amountCents, o.currencyCode)}
                                    </td>
                                    <td className="px-4 py-2 text-alloy-midnight/70">
                                        {o.sourceFamily ?? "—"}
                                        {o.eventKey ? <span className="text-alloy-midnight/40"> · {o.eventKey}</span> : null}
                                    </td>
                                    <td className="px-4 py-2 tabular-nums text-alloy-midnight/70">{o.occursOn ?? "—"}</td>
                                    <td className="px-4 py-2">
                                        <StatusBadge status={o.reviewStatus} />
                                    </td>
                                    <td className="px-4 py-2 text-xs">
                                        {o.eligibleForPosting ? (
                                            <span className="text-emerald-700">eligible</span>
                                        ) : (
                                            <span className="text-alloy-midnight/40">not eligible</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <div className="flex justify-end gap-1.5">
                                            {o.reviewStatus !== "reviewed" && o.reviewStatus !== "suppressed" ? (
                                                <button
                                                    type="button"
                                                    disabled={busyId === o.id}
                                                    onClick={() => act(o.id, "mark_reviewed")}
                                                    className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                                >
                                                    Mark reviewed
                                                </button>
                                            ) : null}
                                            {o.reviewStatus !== "suppressed" ? (
                                                <button
                                                    type="button"
                                                    disabled={busyId === o.id}
                                                    onClick={() => {
                                                        const reason = window.prompt("Reason for suppressing this obligation?") ?? undefined;
                                                        if (reason === undefined) return;
                                                        void act(o.id, "suppress", reason);
                                                    }}
                                                    className="rounded-md border border-alloy-stone/30 px-2.5 py-1 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-50"
                                                >
                                                    Suppress
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={busyId === o.id}
                                                    onClick={() => act(o.id, "restore")}
                                                    className="rounded-md border border-alloy-stone/30 px-2.5 py-1 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10 disabled:opacity-50"
                                                >
                                                    Restore
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
