"use client";

/**
 * Lane-level opportunity queue layout runtime — fetch once, render rows from preview record.
 */

import { useEffect, useState } from "react";
import { isLayoutRuntimeOpportunityQueueBodyEnabledClient } from "@/lib/layout/featureFlag";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { OpportunityQueueLaneContextInput } from "@/lib/layout/runtime/queue/buildOpportunityQueueLayoutContext";

export type OpportunityQueueLayoutRuntimeState = {
    enabled: boolean;
    loading: boolean;
    doc: LayoutDoc | null;
    layoutSource: string | null;
    layoutKey: string | null;
};

export function useOpportunityQueueLayoutRuntime(
    laneKey: string,
    lane: OpportunityQueueLaneContextInput,
    pinnedEntityLayoutId?: string | null,
    options?: { active?: boolean },
): OpportunityQueueLayoutRuntimeState {
    const enabled = isLayoutRuntimeOpportunityQueueBodyEnabledClient();
    // `active === false` means no row on this lane could render through the layout
    // path (every row is owned by the canonical compressed row), so the layout doc
    // fetch would be unused — skip it. Defaults to active for back-compat.
    const active = options?.active ?? true;
    const [loading, setLoading] = useState(false);
    const [doc, setDoc] = useState<LayoutDoc | null>(null);
    const [layoutSource, setLayoutSource] = useState<string | null>(null);
    const [layoutKey, setLayoutKey] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);

    useEffect(() => {
        const onPublished = () => setRefreshToken((t) => t + 1);
        window.addEventListener("adminv2:entity-layout-published", onPublished);
        return () => window.removeEventListener("adminv2:entity-layout-published", onPublished);
    }, []);

    useEffect(() => {
        if (!enabled || !active) {
            setDoc(null);
            setLayoutSource(null);
            setLayoutKey(null);
            setLoading(false);
            return;
        }
        if (!laneKey) return;
        setLoading(true);

        const qs = new URLSearchParams();
        if (lane.drillWorkUnitKey) qs.set("work_unit_key", lane.drillWorkUnitKey);
        if (lane.businessProcessKey) qs.set("business_process_key", lane.businessProcessKey);
        else if (lane.lifecycleKey) qs.set("lifecycle_key", lane.lifecycleKey);
        if (lane.stageKey) qs.set("stage_key", lane.stageKey);
        if (lane.grain) qs.set("grain", lane.grain);
        if (lane.isWaitlistCandidate) {
            qs.set("waitlist", "1");
            if (!lane.grain) qs.set("grain", "candidate");
        }
        const pinned = pinnedEntityLayoutId?.trim();
        if (pinned) qs.set("entity_layout_id", pinned);

        fetch(`/api/admin/layout-runtime/opportunity-queue-layout?${qs.toString()}`)
            .then(async (res) => {
                if (!res.ok) {
                    setDoc(null);
                    return;
                }
                const json = await res.json();
                setDoc(json.doc ?? null);
                setLayoutSource(json.layoutSource ?? null);
                setLayoutKey(json.layoutKey ?? null);
            })
            .catch(() => setDoc(null))
            .finally(() => setLoading(false));
    }, [
        enabled,
        active,
        laneKey,
        refreshToken,
        lane.drillWorkUnitKey,
        lane.businessProcessKey,
        lane.lifecycleKey,
        lane.stageKey,
        lane.grain,
        lane.isWaitlistCandidate,
        pinnedEntityLayoutId,
    ]);

    return { enabled, loading, doc, layoutSource, layoutKey };
}
