"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

type OpenDrawerFn = (opts: {
    type: AdminDrawerEntityType;
    id: string;
    defaultOpportunitySurface?: "quote_intake";
}) => void;

type RouterLike = { push: (href: string) => void; refresh: () => void };

type Props = {
    opportunityId: string;
    sectionKey: string;
    departmentId?: string | null;
    workUnitId?: string | null;
    /** Suppress keys already shown on the record header (registry). */
    excludeActionKeys?: Set<string>;
    canMutate: boolean;
    router: RouterLike;
    openDrawer: OpenDrawerFn;
    openForm?: (opts: { form_key: string; action: ResolvedActionForClient }) => void;
    onApplied?: () => void;
    /** Success path only — e.g. workflow_run_id for start_workflow. */
    onExecutionResult?: (executionResult: Record<string, unknown> | undefined) => void;
};

function filterSlot(
    items: ResolvedActionForClient[] | undefined,
    exclude: Set<string> | undefined
): ResolvedActionForClient[] {
    const list = items ?? [];
    if (!exclude?.size) return list;
    return list.filter((a) => !exclude.has(a.key));
}

/**
 * Config-driven buttons for one opportunity drawer section (`surface=record_section`).
 * Labels and behavior come from action_definitions + placements only.
 */
export default function OpportunityRecordSectionRegistryActions({
    opportunityId,
    sectionKey,
    departmentId,
    workUnitId,
    excludeActionKeys,
    canMutate,
    router,
    openDrawer,
    openForm,
    onApplied,
    onExecutionResult,
}: Props) {
    const [bySlot, setBySlot] = useState<ResolvedActionsBySlot | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const qs = new URLSearchParams({
            surface: "record_section",
            entity_type: "opportunity",
            entity_id: opportunityId,
            section_key: sectionKey,
        });
        if (departmentId) qs.set("department_id", departmentId);
        if (workUnitId) qs.set("work_unit_id", workUnitId);
        const url = `/api/admin/actions?${qs.toString()}`;
        const timingEnabled = process.env.NODE_ENV !== "production";
        const t0 = timingEnabled ? performance.now() : 0;
        dedupeAdminFetchWithTtl(url, workspaceDataFetchInit(), 1500)
            .then((r) => r.json())
            .then((j: { actions?: ResolvedActionsBySlot }) => {
                if (!cancelled) setBySlot(j.actions ?? null);
                if (timingEnabled) {
                    console.info("[timing][drawer]", {
                        key: `opportunities:${opportunityId}`,
                        phase: "record_section_actions_fetch",
                        section_key: sectionKey,
                        url,
                        ms: Math.round((performance.now() - t0) * 10) / 10,
                    });
                }
            })
            .catch(() => {
                if (!cancelled) setBySlot(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [opportunityId, sectionKey, departmentId, workUnitId]);

    const primary = useMemo(() => filterSlot(bySlot?.primary, excludeActionKeys), [bySlot, excludeActionKeys]);
    const secondary = useMemo(() => filterSlot(bySlot?.secondary, excludeActionKeys), [bySlot, excludeActionKeys]);
    const overflow = useMemo(() => filterSlot(bySlot?.overflow, excludeActionKeys), [bySlot, excludeActionKeys]);

    const onClick = useCallback(
        async (resolved: ResolvedActionForClient) => {
            if (!canMutate) return;
            setBusyKey(resolved.key);
            try {
                const out = await applyRegistryResolvedActionClient(resolved, {
                    router,
                    openDrawer,
                    openForm,
                    departmentId: departmentId ?? null,
                    workUnitId: workUnitId ?? null,
                    entityId: opportunityId,
                    context: {
                        surface: "record_section",
                        section_key: sectionKey,
                        department_id: departmentId ?? null,
                        work_unit_id: workUnitId ?? null,
                    },
                });
                if (out.ok) {
                    onExecutionResult?.(out.execution_result);
                    onApplied?.();
                }
            } finally {
                setBusyKey(null);
            }
        },
        [
            canMutate,
            departmentId,
            opportunityId,
            onApplied,
            onExecutionResult,
            openDrawer,
            openForm,
            router,
            sectionKey,
            workUnitId,
        ]
    );

    if (loading) return null;
    const n = primary.length + secondary.length + overflow.length;
    if (n === 0) return null;

    const primaryCls =
        "px-3 py-1.5 text-sm font-semibold rounded-md bg-alloy-blue text-white hover:opacity-90 disabled:opacity-50";
    const secondaryCls =
        "px-3 py-1.5 text-sm font-semibold rounded-md border border-alloy-stone/60 text-alloy-midnight/90 hover:bg-alloy-stone/15 disabled:opacity-50";

    return (
        <div
            className="mt-2 flex flex-wrap gap-2"
            data-opportunity-record-section-actions={sectionKey}
        >
            {primary.map((a) => (
                <button
                    key={`${sectionKey}:p:${a.key}`}
                    type="button"
                    disabled={!canMutate || busyKey != null}
                    onClick={() => void onClick(a)}
                    className={primaryCls}
                >
                    {busyKey === a.key ? "…" : a.label}
                </button>
            ))}
            {secondary.map((a) => (
                <button
                    key={`${sectionKey}:s:${a.key}`}
                    type="button"
                    disabled={!canMutate || busyKey != null}
                    onClick={() => void onClick(a)}
                    className={secondaryCls}
                >
                    {busyKey === a.key ? "…" : a.label}
                </button>
            ))}
            {overflow.map((a) => (
                <button
                    key={`${sectionKey}:o:${a.key}`}
                    type="button"
                    disabled={!canMutate || busyKey != null}
                    onClick={() => void onClick(a)}
                    className={secondaryCls}
                >
                    {busyKey === a.key ? "…" : a.label}
                </button>
            ))}
        </div>
    );
}
