"use client";

import { useEffect } from "react";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { useBosPresentationControllerOptional } from "@/contexts/BosPresentationControllerContext";
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
    const bos = useBosPresentationControllerOptional();
    const openBos = bos?.derivation.effective === "closed" ? bos.openFloating : null;

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
                queuePreviewSeed: detail.display_name?.trim()
                    ? { title: detail.display_name.trim() }
                    : null,
                opportunitySingular: "Inquiry",
                sourceSurface: detail.source_surface ?? "queue",
            });
            // "Ask BOS" is an explicit invocation: the hand-off must land in a visible assistant, also
            // where an unrequested one is presented closed (BP V2 D9). The existing open contract.
            openBos?.();
        };
        window.addEventListener(ADMINV2_ASK_BOS_HANDOFF_EVENT, onHandoff);
        return () => window.removeEventListener(ADMINV2_ASK_BOS_HANDOFF_EVENT, onHandoff);
    }, [globalAssistant, openBos]);

    return null;
}
