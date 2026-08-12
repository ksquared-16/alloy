"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import {
    ACTION_SURFACE_INLINE_ERROR_CLASS,
    handleRegistrySectionActionOutcome,
} from "@/lib/admin/actions/actionSurfaceFeedback";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

type RouterLike = { push: (href: string) => void; refresh: () => void };

export function OpportunityInquiryChildrenRegistryActions(props: {
    opportunityId: string;
    childrenCount: number;
    canMutate: boolean;
    router: RouterLike;
    focusRecord: (request: { entity_type: string; entity_id: string }) => void;
    openForm: (opts: { form_key: string; action: ResolvedActionForClient }) => void;
    openAddInquiryChild?: (mode: "child" | "sibling") => void;
    /** Suppress keys already on record_header (e.g. add_child / add_sibling). */
    excludeActionKeys?: Set<string>;
}) {
    const { opportunityId, childrenCount, canMutate, router, focusRecord, openForm, openAddInquiryChild, excludeActionKeys } =
        props;
    const [bySlot, setBySlot] = useState<ResolvedActionsBySlot | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const qs = new URLSearchParams({
            surface: "record_section",
            entity_type: "opportunity",
            entity_id: opportunityId,
            section_key: "inquiry_children",
        });
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
                        phase: "inquiry_children_record_section_actions_fetch",
                        section_key: "inquiry_children",
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
    }, [opportunityId]);

    const chosen = useMemo(() => {
        const all = [...(bySlot?.primary ?? []), ...(bySlot?.secondary ?? []), ...(bySlot?.overflow ?? [])];
        const filtered = excludeActionKeys?.size ? all.filter((a) => !excludeActionKeys.has(a.key)) : all;
        const want = childrenCount > 0 ? "add_sibling" : "add_child";
        return filtered.find((a) => a.key === want) ?? null;
    }, [bySlot, childrenCount, excludeActionKeys]);

    if (loading) {
        return (
            <div
                className="h-9 w-[10.5rem] animate-pulse rounded-md bg-alloy-stone/12"
                aria-busy="true"
                aria-label="Loading inquiry actions"
                data-inquiry-children-registry-action-skeleton="true"
            />
        );
    }
    if (!chosen) return null;

    return (
        <div className="flex flex-col items-end gap-1">
            <button
                type="button"
                disabled={!canMutate || busyKey != null}
                onClick={async () => {
                    if (!canMutate) return;
                    setBusyKey(chosen.key);
                    setActionError(null);
                    try {
                        const out = await applyRegistryResolvedActionClient(chosen, {
                            router,
                            focusRecord,
                            openForm,
                            openAddInquiryChild,
                            entityId: opportunityId,
                            context: { surface: "record_section", section_key: "inquiry_children" },
                        });
                        const { error } = handleRegistrySectionActionOutcome(opportunityId, chosen, out);
                        if (error) setActionError(error);
                    } finally {
                        setBusyKey(null);
                    }
                }}
                className="rounded-md border border-alloy-blue/30 bg-alloy-blue/5 px-3 py-1.5 text-sm font-semibold text-alloy-blue hover:bg-alloy-blue/10 hover:border-alloy-blue/45 disabled:opacity-50"
                data-inquiry-children-registry-action={chosen.key}
            >
                {busyKey === chosen.key ? "…" : chosen.label}
            </button>
            {actionError ? (
                <p className={ACTION_SURFACE_INLINE_ERROR_CLASS} role="alert">
                    {actionError}
                </p>
            ) : null}
        </div>
    );
}

