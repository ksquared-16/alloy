"use client";

import { useEffect } from "react";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { buildOverviewDataForBosHandoff } from "@/lib/adminV2/bos/bosAssistHandoffRouting";
import {
    ADMINV2_ASK_BOS_HANDOFF_EVENT,
    queueBosHandoffPreviewFromOperationalRead,
    triggerBosDrawerAssistHandoff,
    type AskBosHandoffDetail,
} from "@/lib/adminV2/bos/bosDrawerAssistHandoff";

/** Subscribes to registry Ask BOS actions from queue rows and drawer header. */
export default function AskBosHandoffListener() {
    const globalAssistant = useGlobalAssistantOptional();

    useEffect(() => {
        const onHandoff = (ev: Event) => {
            const detail = (ev as CustomEvent<AskBosHandoffDetail>).detail;
            const entityId = detail?.opportunity_id?.trim();
            if (!entityId || !globalAssistant) return;
            const entityLabel = detail.display_name?.trim() || "Inquiry";
            triggerBosDrawerAssistHandoff({
                globalAssistant,
                entityId,
                overviewData: buildOverviewDataForBosHandoff({
                    entityId,
                    entityLabel,
                    queuePreview: detail.queue_preview ?? null,
                }),
                opportunitySingular: "Inquiry",
            });
        };
        window.addEventListener(ADMINV2_ASK_BOS_HANDOFF_EVENT, onHandoff);
        return () => window.removeEventListener(ADMINV2_ASK_BOS_HANDOFF_EVENT, onHandoff);
    }, [globalAssistant]);

    return null;
}
