"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { resolveInquiryChildOcmId } from "@/lib/admin/drawer/inquiryChildFieldEdit";
import type { InquiryChildRow } from "@/components/admin/entity/OpportunityInquiryChildrenSection";

type SplitOutcome = {
    outcome_key: string;
    label: string;
    target_stage_key: string | null;
};

type Props = {
    opportunityId: string;
    children: InquiryChildRow[];
    canMutate: boolean;
    onApplied: () => void;
};

export default function OpportunityDecisionSplitPanel({
    opportunityId,
    children,
    canMutate,
    onApplied,
}: Props) {
    const [outcomes, setOutcomes] = useState<SplitOutcome[]>([]);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectionByChildKey, setSelectionByChildKey] = useState<Record<string, string>>({});

    const childRows = useMemo(
        () =>
            children.filter((row) => {
                const name = (row.display_name ?? "").trim();
                return Boolean(name || row.customer_member_id);
            }),
        [children]
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        void fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/decision-split`, {
            credentials: "include",
        })
            .then(async (res) => {
                const json = (await res.json().catch(() => ({}))) as {
                    visible?: boolean;
                    split_rule?: { outcomes?: SplitOutcome[] } | null;
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error ?? "Could not load decision split");
                if (cancelled) return;
                setVisible(json.visible === true);
                setOutcomes(json.split_rule?.outcomes ?? []);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : "Could not load decision split");
                setVisible(false);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [opportunityId]);

    useEffect(() => {
        setSelectionByChildKey((prev) => {
            const next = { ...prev };
            for (const row of childRows) {
                if (!next[row.id]) next[row.id] = "no_action";
            }
            return next;
        });
    }, [childRows]);

    const onApply = useCallback(async () => {
        if (!canMutate || saving) return;
        setSaving(true);
        setError(null);
        try {
            const selections = childRows.map((row) => ({
                opportunity_customer_member_id: resolveInquiryChildOcmId(row),
                customer_member_id: row.customer_member_id || null,
                outcome_key: selectionByChildKey[row.id] ?? "no_action",
            }));
            const res = await fetch(
                `/api/admin/opportunities/${encodeURIComponent(opportunityId)}/decision-split`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ selections }),
                }
            );
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Save failed");
            onApplied();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }, [canMutate, childRows, onApplied, opportunityId, saving, selectionByChildKey]);

    if (loading || !visible || !outcomes.length || !childRows.length) {
        return null;
    }

    return (
        <div
            className={oppInqLeadSummaryShellClassName}
            data-opportunity-decision-split-panel="true"
        >
            <div className="flex flex-wrap items-end justify-between gap-1.5 border-b border-alloy-stone/12 pb-1">
                <span className={oppInqEyebrow}>Decision — choose each child&apos;s path</span>
            </div>
            <div className={`${oppInqInnerCardCompact} mt-1 space-y-2`}>
                <p className="text-[11px] leading-snug text-alloy-midnight/55">
                    Set where each child goes after the family decision. Siblings can take different paths.
                </p>
                <div className="space-y-2">
                    {childRows.map((row) => {
                        const displayName = (row.display_name ?? "Child").trim() || "Child";
                        const statusLabel =
                            (row.outcome_status_label ?? row.outcome_status_key ?? "").trim() || "—";
                        return (
                            <div
                                key={row.id}
                                className="grid grid-cols-1 gap-2 rounded-md border border-alloy-stone/12 bg-white/70 px-2.5 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)] sm:items-center"
                                data-decision-split-child-row={row.id}
                            >
                                <div className="min-w-0">
                                    <div className="truncate text-[12px] font-semibold text-alloy-midnight/90">
                                        {displayName}
                                    </div>
                                    <div className="text-[10px] text-alloy-midnight/45">
                                        Current track status · {statusLabel}
                                    </div>
                                </div>
                                {canMutate ? (
                                    <select
                                        className="w-full rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/90"
                                        value={selectionByChildKey[row.id] ?? "no_action"}
                                        disabled={saving}
                                        aria-label={`Path for ${displayName}`}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setSelectionByChildKey((prev) => ({ ...prev, [row.id]: v }));
                                        }}
                                    >
                                        {outcomes.map((o) => (
                                            <option key={o.outcome_key} value={o.outcome_key}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className="text-[11px] text-alloy-midnight/50">Read only</span>
                                )}
                            </div>
                        );
                    })}
                </div>
                {canMutate ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                            type="button"
                            className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                            disabled={saving}
                            data-decision-split-apply="true"
                            onClick={() => void onApply()}
                        >
                            {saving ? "Saving…" : "Apply child paths"}
                        </button>
                        {error ? (
                            <span className="text-[11px] text-red-700/90">{error}</span>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
