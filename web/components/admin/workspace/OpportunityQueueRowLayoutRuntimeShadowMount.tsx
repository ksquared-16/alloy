"use client";

/**
 * C4 foundation — fire-and-forget queue row layout shadow evaluation (hidden).
 */

import { useEffect, useRef } from "react";
import { isLayoutRuntimeOpportunityQueueShadowReadPathEnabledClient } from "@/lib/layout/featureFlag";
import type { OpportunityQueueLaneContextInput } from "@/lib/layout/runtime/queue/buildOpportunityQueueLayoutContext";

type Props = OpportunityQueueLaneContextInput & {
    rowKey: string;
};

export default function OpportunityQueueRowLayoutRuntimeShadowMount(props: Props) {
    const enabled = isLayoutRuntimeOpportunityQueueShadowReadPathEnabledClient();
    const lastKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled) return;
        const key = props.rowKey;
        if (!key || lastKeyRef.current === key) return;
        lastKeyRef.current = key;

        const qs = new URLSearchParams();
        if (props.drillWorkUnitKey) qs.set("work_unit_key", props.drillWorkUnitKey);
        if (props.lifecycleKey) qs.set("lifecycle_key", props.lifecycleKey);
        if (props.stageKey) qs.set("stage_key", props.stageKey);
        if (props.grain) qs.set("grain", props.grain);
        if (props.isWaitlistCandidate) {
            qs.set("waitlist", "1");
            if (!props.grain) qs.set("grain", "candidate");
        }

        fetch(`/api/admin/layout-runtime/opportunity-queue-row-shadow?${qs.toString()}`)
            .then(async (res) => {
                if (!res.ok) return;
                const json = await res.json();
                if (typeof console !== "undefined" && json?.telemetry) {
                    console.info("[layout_runtime_shadow:opportunity_queue_row]", json.telemetry);
                }
            })
            .catch(() => {});
    }, [enabled, props.rowKey, props.drillWorkUnitKey, props.lifecycleKey, props.stageKey, props.grain, props.isWaitlistCandidate]);

    if (!enabled) return null;

    return (
        <span
            aria-hidden="true"
            hidden
            data-layout-runtime-shadow-mount="opportunity_queue_row"
            data-queue-row-key={props.rowKey}
        />
    );
}
