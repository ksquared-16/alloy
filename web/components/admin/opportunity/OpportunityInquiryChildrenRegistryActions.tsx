"use client";

import { useEffect, useMemo, useState } from "react";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

type OpenDrawerFn = (opts: {
    type: AdminDrawerEntityType;
    id: string;
    defaultOpportunitySurface?: "quote_intake";
}) => void;

type RouterLike = { push: (href: string) => void; refresh: () => void };

export function OpportunityInquiryChildrenRegistryActions(props: {
    opportunityId: string;
    childrenCount: number;
    canMutate: boolean;
    router: RouterLike;
    openDrawer: OpenDrawerFn;
    openForm: (opts: { form_key: string; action: ResolvedActionForClient }) => void;
}) {
    const { opportunityId, childrenCount, canMutate, router, openDrawer, openForm } = props;
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
            section_key: "inquiry_children",
        });
        const url = `/api/admin/actions?${qs.toString()}`;
        dedupeAdminFetch(url, workspaceDataFetchInit())
            .then((r) => r.json())
            .then((j: { actions?: ResolvedActionsBySlot }) => {
                if (!cancelled) setBySlot(j.actions ?? null);
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
        const want = childrenCount > 0 ? "add_sibling" : "add_child";
        return all.find((a) => a.key === want) ?? null;
    }, [bySlot, childrenCount]);

    if (loading) return null;
    if (!chosen) return null;

    return (
        <button
            type="button"
            disabled={!canMutate || busyKey != null}
            onClick={async () => {
                if (!canMutate) return;
                setBusyKey(chosen.key);
                try {
                    await applyRegistryResolvedActionClient(chosen, {
                        router,
                        openDrawer,
                        openForm,
                        entityId: opportunityId,
                        context: { surface: "record_section", section_key: "inquiry_children" },
                    });
                } finally {
                    setBusyKey(null);
                }
            }}
            className="rounded-md border border-alloy-stone/25 bg-white px-3 py-1.5 text-sm font-semibold text-alloy-midnight/90 hover:bg-alloy-stone/5 disabled:opacity-50"
            data-inquiry-children-registry-action={chosen.key}
        >
            {busyKey === chosen.key ? "…" : chosen.label}
        </button>
    );
}

