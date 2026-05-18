"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import type { ConfigurationProposalV1 } from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import type { ConfigLayoutAssistCapabilitiesV1 } from "@/lib/agent/configLayoutAssist/configLayoutAssistTypes";
import {
    buildProposalListPresentation,
    buildProposalListPresentationFromProposal,
    buildProposalReviewPresentation,
    formatProposalLifecycleState,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistProposalPresentation";
import { readConfigProposalIdFromSearchParams } from "@/lib/agent/configLayoutAssist/configLayoutAssistReviewNavigation";

import { ConfigLayoutProposalReviewPanel } from "./ConfigLayoutProposalReviewPanel";

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

export default function ConfigLayoutProposalsClient({ initialId }: { initialId?: string }) {
    const searchParams = useSearchParams();
    const { labels: entityLabels } = useEntityLabels();
    const [list, setList] = useState<ProposalListItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
    const [detail, setDetail] = useState<ProposalRecord | null>(null);
    const [caps, setCaps] = useState<ConfigLayoutAssistCapabilitiesV1 | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const presentationCtx = useMemo(() => ({ entityLabels }), [entityLabels]);

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
        const fromUrl = readConfigProposalIdFromSearchParams(searchParams);
        if (fromUrl) setSelectedId(fromUrl);
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

    const reviewPresentation = useMemo(
        () => (proposal ? buildProposalReviewPresentation(proposal, presentationCtx) : null),
        [proposal, presentationCtx]
    );

    const statePresentation = useMemo(
        () =>
            detail
                ? formatProposalLifecycleState(detail.state, detail.apply_mode, proposal ?? null)
                : null,
        [detail, proposal]
    );

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
            actions.push({ label: "Apply", onClick: () => void applyApproved(), variant: "primary" });
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
                            No proposals yet. Use the Orchestrator command bar to create one.
                        </li>
                    ) : (
                        list.map((p) => {
                            const listPresentation =
                                selectedId === p.id && proposal
                                    ? buildProposalListPresentationFromProposal(
                                          proposal,
                                          p.state,
                                          p.apply_mode,
                                          presentationCtx
                                      )
                                    : buildProposalListPresentation(p);
                            return (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        className={`w-full px-3 py-2.5 text-left text-xs hover:bg-white/80 ${selectedId === p.id ? "bg-white" : ""}`}
                                        onClick={() => setSelectedId(p.id)}
                                    >
                                        <div className="font-medium text-alloy-midnight">
                                            {listPresentation.title}
                                        </div>
                                        {listPresentation.forLabel ? (
                                            <p className="mt-0.5 text-[11px] text-alloy-midnight/60">
                                                For: {listPresentation.forLabel}
                                            </p>
                                        ) : null}
                                        <p className="mt-1 text-[10px] text-alloy-midnight/50">
                                            Status: {listPresentation.stateLabel.split(" · ")[0]}
                                            {listPresentation.statusHint
                                                ? ` · ${listPresentation.statusHint}`
                                                : ""}
                                        </p>
                                    </button>
                                </li>
                            );
                        })
                    )}
                </ul>
            </section>

            <section className="min-w-0 flex-[1.4] rounded-lg border border-alloy-forge/12 bg-white/60 p-4">
                {!detail || !proposal || !reviewPresentation || !statePresentation ? (
                    <p className="text-xs text-alloy-midnight/55">
                        Select a proposal to review the change in plain language before approving or applying.
                    </p>
                ) : (
                    <ConfigLayoutProposalReviewPanel
                        presentation={reviewPresentation}
                        statePresentation={statePresentation}
                        lifecycleActions={lifecycleActions}
                        busy={busy}
                        message={message}
                        failedReason={detail.failed_reason}
                        showApplyPermissionHint={detail.state === "reviewed" && canReview && !canApply}
                        showRecommendationApprovedHint={
                            detail.apply_mode === "recommendation_only" && detail.state === "approved"
                        }
                    />
                )}
            </section>
        </div>
    );
}
