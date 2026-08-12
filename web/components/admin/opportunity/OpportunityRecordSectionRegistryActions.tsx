"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import {
    ACTION_SURFACE_INLINE_ERROR_CLASS,
    handleRegistrySectionActionOutcome,
} from "@/lib/admin/actions/actionSurfaceFeedback";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { OPPORTUNITY_DRAWER_SECTION_SECONDARY_BUTTON_CLASS } from "@/lib/admin/drawer/opportunityDrawerRecordActionButtonClasses";

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
    focusRecord: (request: { entity_type: string; entity_id: string }) => void;
    openForm?: (opts: { form_key: string; action: ResolvedActionForClient }) => void;
    openAddInquiryChild?: (mode: "child" | "sibling") => void;
    openAddPerson?: (actionKey: string) => void;
    onApplied?: () => void;
    /** Success path only — e.g. workflow_run_id for start_workflow. */
    onExecutionResult?: (executionResult: Record<string, unknown> | undefined) => void;
    /** Summary column uses a shorter action skeleton aligned with inquiry header panels. */
    layoutDensity?: "default" | "summary";
    /** When false, intersection observer and `surface=record_section` fetch stay off until enrichment is allowed. */
    actionsFetchEnabled?: boolean;
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
    focusRecord,
    openForm,
    openAddInquiryChild,
    openAddPerson,
    onApplied,
    onExecutionResult,
    layoutDensity = "default",
    actionsFetchEnabled = true,
}: Props) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [shouldLoad, setShouldLoad] = useState(false);
    const [bySlot, setBySlot] = useState<ResolvedActionsBySlot | null>(null);
    const [loading, setLoading] = useState(false);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        setShouldLoad(false);
        setBySlot(null);
        setLoading(false);
        setActionError(null);
    }, [opportunityId, sectionKey]);

    useEffect(() => {
        const el = mountRef.current;
        if (!actionsFetchEnabled || !el || shouldLoad) return;
        const obs = new IntersectionObserver(
            (entries) => {
                const hit = entries.some((e) => e.isIntersecting);
                if (hit) {
                    setShouldLoad(true);
                    obs.disconnect();
                }
            },
            { root: null, rootMargin: "140px", threshold: 0 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [actionsFetchEnabled, opportunityId, sectionKey, shouldLoad]);

    useEffect(() => {
        if (!shouldLoad) return;
        let cancelled = false;
        const wu = (workUnitId ?? "").trim();
        const dept = (departmentId ?? "").trim();
        // Scoped placements require both dimensions; avoid a first fetch without department_id then a second with it.
        if (wu && !dept) {
            setBySlot(null);
            setLoading(true);
            return () => {
                cancelled = true;
            };
        }

        setLoading(true);
        const qs = new URLSearchParams({
            surface: "record_section",
            entity_type: "opportunity",
            entity_id: opportunityId,
            section_key: sectionKey,
        });
        if (dept) qs.set("department_id", dept);
        if (wu) qs.set("work_unit_id", wu);
        const url = `/api/admin/actions?${qs.toString()}`;
        const timingEnabled =
            process.env.NODE_ENV !== "production" ||
            (typeof window !== "undefined" && /staging|localhost|127\.0\.0\.1/i.test(window.location.hostname));
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
    }, [shouldLoad, opportunityId, sectionKey, departmentId, workUnitId]);

    const primary = useMemo(() => filterSlot(bySlot?.primary, excludeActionKeys), [bySlot, excludeActionKeys]);
    const secondary = useMemo(() => filterSlot(bySlot?.secondary, excludeActionKeys), [bySlot, excludeActionKeys]);
    const overflow = useMemo(() => filterSlot(bySlot?.overflow, excludeActionKeys), [bySlot, excludeActionKeys]);

    const onClick = useCallback(
        async (resolved: ResolvedActionForClient) => {
            if (!canMutate) return;
            setBusyKey(resolved.key);
            setActionError(null);
            try {
                const out = await applyRegistryResolvedActionClient(resolved, {
                    router,
                    focusRecord,
                    openForm,
                    openAddInquiryChild,
                    openAddPerson,
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
                const { error } = handleRegistrySectionActionOutcome(opportunityId, resolved, out);
                if (error) {
                    setActionError(error);
                    return;
                }
                onExecutionResult?.(out.ok ? out.execution_result : undefined);
                onApplied?.();
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
            focusRecord,
            openForm,
            openAddInquiryChild,
    openAddPerson,
            router,
            sectionKey,
            workUnitId,
        ]
    );

    const n = primary.length + secondary.length + overflow.length;
    const compactActions = layoutDensity === "summary";
    const primaryCls =
        "px-3 py-1.5 text-sm font-semibold rounded-md bg-alloy-blue text-white hover:opacity-90 disabled:opacity-50";
    const secondaryCls = OPPORTUNITY_DRAWER_SECTION_SECONDARY_BUTTON_CLASS;

    return (
        <div
            ref={mountRef}
            className={`mt-2 ${compactActions ? "min-h-[2rem]" : "min-h-[2.25rem]"}`}
            data-opportunity-record-section-actions-root={sectionKey}
        >
            {!shouldLoad ? null : loading ? (
                <div
                    className={`flex flex-wrap gap-2 ${compactActions ? "min-h-[2rem] items-center" : ""}`}
                    aria-busy="true"
                    aria-label="Loading section actions"
                    data-opportunity-record-section-actions-skeleton={sectionKey}
                >
                    {compactActions ? (
                        <div className="skeleton-pulse h-8 w-[6.75rem] rounded-md bg-alloy-stone/13" aria-hidden />
                    ) : (
                        <>
                            <div className="h-8 w-[7.5rem] animate-pulse rounded-md bg-alloy-stone/15" />
                            <div className="h-8 w-[6.5rem] animate-pulse rounded-md bg-alloy-stone/12" />
                        </>
                    )}
                </div>
            ) : n === 0 ? null : (
                <div className="space-y-2">
                <div className="flex flex-wrap gap-2" data-opportunity-record-section-actions={sectionKey}>
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
                {actionError ? (
                    <p
                        className={ACTION_SURFACE_INLINE_ERROR_CLASS}
                        role="alert"
                        data-opportunity-record-section-action-error={sectionKey}
                    >
                        {actionError}
                    </p>
                ) : null}
                </div>
            )}
        </div>
    );
}
