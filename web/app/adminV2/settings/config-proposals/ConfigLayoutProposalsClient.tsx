"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type { ConfigLayoutAssistCapabilitiesV1 } from "@/lib/agent/configLayoutAssist/configLayoutAssistTypes";

type ProposalListItem = {
    id: string;
    state: string;
    category: string;
    summary: string;
    risk_level: string;
    apply_mode: string;
    permission_requirements: string[];
    created_at: string;
    updated_at: string;
};

type ProposalRecord = ProposalListItem & {
    proposal_json: ConfigurationProposalV1;
    failed_reason?: string | null;
    rejection_reason?: string | null;
};

const STATE_LABEL: Record<string, string> = {
    draft: "Draft (recommendation)",
    reviewed: "Reviewed",
    approved: "Approved (not yet applied)",
    rejected: "Rejected",
    applied: "Applied",
    failed: "Failed",
    rolled_back: "Rolled back",
};

export default function ConfigLayoutProposalsClient({ initialId }: { initialId?: string }) {
    const searchParams = useSearchParams();
    const [list, setList] = useState<ProposalListItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
    const [detail, setDetail] = useState<ProposalRecord | null>(null);
    const [caps, setCaps] = useState<ConfigLayoutAssistCapabilitiesV1 | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const loadList = useCallback(async () => {
        const res = await fetch("/api/admin/config-layout-assist/proposals", {
            credentials: "include",
            headers: { Accept: "application/json" },
        });
        const j = (await res.json()) as { ok?: boolean; proposals?: ProposalListItem[] };
        if (res.ok && j.ok && j.proposals) setList(j.proposals);
    }, []);

    const loadDetail = useCallback(async (id: string) => {
        const res = await fetch(`/api/admin/config-layout-assist/proposals/${encodeURIComponent(id)}`, {
            credentials: "include",
            headers: { Accept: "application/json" },
        });
        const j = (await res.json()) as { ok?: boolean; proposal?: ProposalRecord };
        if (res.ok && j.ok && j.proposal) setDetail(j.proposal);
    }, []);

    useEffect(() => {
        void loadList();
        void fetch("/api/admin/ai/config-layout-assist/capabilities", {
            credentials: "include",
            headers: { Accept: "application/json" },
        })
            .then((r) => r.json())
            .then((j) => {
                if (j.ok) setCaps(j as ConfigLayoutAssistCapabilitiesV1);
            })
            .catch(() => undefined);
    }, [loadList]);

    useEffect(() => {
        const fromUrl = searchParams.get("proposalId") ?? searchParams.get("id");
        if (fromUrl?.trim()) {
            setSelectedId(fromUrl.trim());
        }
    }, [searchParams]);

    useEffect(() => {
        if (selectedId) void loadDetail(selectedId);
        else setDetail(null);
    }, [selectedId, loadDetail]);

    const transition = useCallback(
        async (to_state: string, extra?: { rejection_reason?: string; failed_reason?: string }) => {
            if (!selectedId) return;
            setBusy(true);
            setMessage(null);
            try {
                const res = await fetch(
                    `/api/admin/config-layout-assist/proposals/${encodeURIComponent(selectedId)}/state`,
                    {
                        method: "PATCH",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ to_state, ...extra }),
                    }
                );
                const j = (await res.json()) as { ok?: boolean; message?: string };
                if (!res.ok || !j.ok) {
                    setMessage(j.message ?? `Transition failed (${res.status})`);
                    return;
                }
                await loadList();
                await loadDetail(selectedId);
                setMessage(`Moved to ${to_state}.`);
            } finally {
                setBusy(false);
            }
        },
        [selectedId, loadList, loadDetail]
    );

    const applyApproved = useCallback(async () => {
        if (!selectedId) return;
        setBusy(true);
        setMessage(null);
        try {
            const res = await fetch(
                `/api/admin/config-layout-assist/proposals/${encodeURIComponent(selectedId)}/apply`,
                { method: "POST", credentials: "include", headers: { Accept: "application/json" } }
            );
            const j = (await res.json()) as { ok?: boolean; message?: string; error?: string };
            if (!res.ok || !j.ok) {
                setMessage(j.message ?? j.error ?? `Apply failed (${res.status})`);
            } else {
                setMessage("Apply completed with verification.");
            }
            await loadList();
            await loadDetail(selectedId);
        } finally {
            setBusy(false);
        }
    }, [selectedId, loadList, loadDetail]);

    const proposal = detail?.proposal_json;
    const canReview = caps?.can_review ?? false;
    const canApply = caps?.can_apply ?? false;

    const lifecycleActions = useMemo(() => {
        const s = detail?.state;
        if (!s) return [];
        const actions: { label: string; onClick: () => void; variant?: "primary" | "danger" }[] = [];
        if (s === "draft" && canReview) {
            actions.push({ label: "Mark reviewed", onClick: () => void transition("reviewed"), variant: "primary" });
            actions.push({
                label: "Reject",
                onClick: () => void transition("rejected", { rejection_reason: "Rejected from admin review UI." }),
                variant: "danger",
            });
        }
        if (s === "reviewed" && canReview) {
            actions.push({
                label: "Reject",
                onClick: () => void transition("rejected", { rejection_reason: "Rejected after review." }),
                variant: "danger",
            });
        }
        if (s === "reviewed" && canApply) {
            actions.push({ label: "Approve", onClick: () => void transition("approved"), variant: "primary" });
        }
        if (s === "approved" && canApply && detail.apply_mode !== "recommendation_only") {
            actions.push({ label: "Apply (authoritative APIs)", onClick: () => void applyApproved(), variant: "primary" });
        }
        return actions;
    }, [detail?.state, detail?.apply_mode, canReview, canApply, transition, applyApproved]);

    return (
        <div className="flex flex-col gap-4 lg:flex-row">
            <section className="min-w-0 flex-1 space-y-2">
                <h2 className="text-sm font-semibold text-alloy-midnight">Proposals</h2>
                <ul className="divide-y divide-alloy-forge/10 rounded-lg border border-alloy-forge/12 bg-white/60">
                    {list.length === 0 ? (
                        <li className="px-3 py-4 text-xs text-alloy-midnight/55">
                            No proposals yet. Use Orchestrator or POST propose.
                        </li>
                    ) : (
                        list.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    className={`w-full px-3 py-2 text-left text-xs hover:bg-white/80 ${selectedId === p.id ? "bg-white" : ""}`}
                                    onClick={() => setSelectedId(p.id)}
                                >
                                    <div className="font-medium text-alloy-midnight">{p.summary}</div>
                                    <div className="mt-0.5 text-[10px] text-alloy-midnight/50">
                                        {STATE_LABEL[p.state] ?? p.state} · {p.risk_level} ·{" "}
                                        {new Date(p.created_at).toLocaleString()}
                                    </div>
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            </section>

            <section className="min-w-0 flex-[1.4] space-y-3 rounded-lg border border-alloy-forge/12 bg-white/60 p-4">
                {!detail || !proposal ? (
                    <p className="text-xs text-alloy-midnight/55">
                        Select a proposal to review operations, risks, and lifecycle actions.
                    </p>
                ) : (
                    <>
                        <header>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                {STATE_LABEL[detail.state] ?? detail.state}
                            </p>
                            <h2 className="text-base font-semibold text-alloy-midnight">{detail.summary}</h2>
                            <p className="mt-1 text-xs text-alloy-midnight/60">{proposal.intent}</p>
                        </header>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                                <span className="text-alloy-midnight/45">Risk</span>
                                <p className="font-medium capitalize">{detail.risk_level}</p>
                            </div>
                            <div>
                                <span className="text-alloy-midnight/45">Apply mode</span>
                                <p className="font-medium">{detail.apply_mode}</p>
                            </div>
                        </div>

                        {proposal.rationale.length > 0 ? (
                            <div>
                                <h3 className="text-[11px] font-semibold text-alloy-midnight/55">Rationale</h3>
                                <ul className="mt-1 list-disc pl-4 text-xs text-alloy-midnight/70">
                                    {proposal.rationale.map((r) => (
                                        <li key={r}>{r}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        <div>
                            <h3 className="text-[11px] font-semibold text-alloy-midnight/55">Required permissions</h3>
                            <p className="mt-1 text-xs text-alloy-midnight/70">
                                {detail.permission_requirements.join(", ") || "—"}
                            </p>
                        </div>

                        <div>
                            <h3 className="text-[11px] font-semibold text-alloy-midnight/55">Operations (diff preview)</h3>
                            <ul className="mt-2 space-y-2">
                                {proposal.proposed_operations.map((op) => (
                                    <li
                                        key={op.operation_id}
                                        className="rounded border border-alloy-forge/10 bg-white/80 px-2 py-1.5 text-[11px]"
                                    >
                                        <div className="font-medium text-alloy-midnight">
                                            {op.kind} · {op.entity_type}
                                            {op.field_key ? ` · ${op.field_key}` : ""}
                                        </div>
                                        {op.rationale[0] ? (
                                            <p className="text-alloy-midnight/60">{op.rationale[0]}</p>
                                        ) : null}
                                        <pre className="mt-1 max-h-24 overflow-auto rounded bg-alloy-midnight/[0.04] p-1 text-[10px]">
                                            {JSON.stringify({ before: op.before, after: op.after }, null, 2)}
                                        </pre>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {detail.state === "applied" ? (
                            <p className="rounded border border-alloy-pine/30 bg-alloy-pine/5 px-2 py-1 text-[11px] text-alloy-pine">
                                Applied change — authoritative config was updated after human approval.
                            </p>
                        ) : (
                            <p className="rounded border border-amber-200/80 bg-amber-50/80 px-2 py-1 text-[11px] text-amber-900/90">
                                Recommendation / pending — no config mutation until you approve and apply.
                            </p>
                        )}

                        {detail.state === "reviewed" && canReview && !canApply ? (
                            <p className="text-xs text-alloy-midnight/55">
                                Approve and apply require <span className="font-mono">config_assist.apply</span>.
                            </p>
                        ) : null}

                        {detail.apply_mode === "recommendation_only" && detail.state === "approved" ? (
                            <p className="text-xs text-alloy-midnight/55">
                                This proposal is recommendation-only; there are no configuration mutations to apply.
                            </p>
                        ) : null}

                        {lifecycleActions.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {lifecycleActions.map((a) => (
                                    <button
                                        key={a.label}
                                        type="button"
                                        disabled={busy}
                                        className={`rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
                                            a.variant === "danger"
                                                ? "border border-red-200 text-red-800"
                                                : "bg-alloy-midnight/90 text-white"
                                        }`}
                                        onClick={a.onClick}
                                    >
                                        {a.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        {message ? <p className="text-xs text-alloy-midnight/70">{message}</p> : null}
                        {detail.failed_reason ? (
                            <p className="text-xs text-red-700">Failed: {detail.failed_reason}</p>
                        ) : null}
                    </>
                )}
            </section>
        </div>
    );
}
