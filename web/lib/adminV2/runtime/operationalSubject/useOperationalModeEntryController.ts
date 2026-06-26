"use client";

import { useEffect, type RefObject } from "react";

import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import {
    ALLOY_OS_OPERATIONAL_MODE_EMPTY_ATTR,
    ALLOY_OS_OPERATIONAL_MODE_PREPARING_ATTR,
    useOperationalModeEntryOptional,
} from "@/lib/adminV2/runtime/operationalSubject/OperationalModeEntryContext";
import {
    resolveOperationalModeEntryMessage,
    type OperationalModeEntryPhase,
} from "@/lib/adminV2/runtime/operationalSubject/operationalModeEntryMessages";

type Params = {
    enabled: boolean;
    workUnitId: string | null;
    activeQueueKey: string | null;
    laneMayPaint: boolean;
    queueItemsLoading: boolean;
    displayItemsRef: RefObject<QueuePreviewItemVm[]>;
    routeRecordId: string | null;
    drawerType: string | null | undefined;
    drawerId: string | null | undefined;
    queueRevision: number;
};

type OperationalModeEntrySnapshot = {
    phase: OperationalModeEntryPhase;
    message: string;
};

function resolveOperationalModeEntrySnapshot(params: Params): OperationalModeEntrySnapshot {
    const rowCount = params.displayItemsRef.current?.length ?? 0;
    const routeRecordId = params.routeRecordId?.trim() || null;
    const drawerOpen = Boolean(params.drawerType && params.drawerId != null);
    const drawerMatchesUrl =
        drawerOpen &&
        routeRecordId != null &&
        String(params.drawerId).trim() === routeRecordId;
    const drawerResolved = routeRecordId ? drawerMatchesUrl : drawerOpen;

    const message = resolveOperationalModeEntryMessage({
        queueItemsLoading: params.queueItemsLoading,
        laneMayPaint: params.laneMayPaint,
        hasRows: rowCount > 0,
        routeRecordId,
        drawerOpen: drawerResolved,
    });

    if (params.queueItemsLoading || !params.laneMayPaint) {
        return { phase: "preparing", message };
    }

    if (rowCount === 0) {
        return { phase: "ready", message: "" };
    }

    if (routeRecordId && !drawerMatchesUrl) {
        return { phase: "preparing", message };
    }

    if (drawerOpen) {
        return { phase: "ready", message: "" };
    }

    return { phase: "preparing", message };
}

/** Gates Work Unit queue reveal until default operational subject is resolved. */
export function useOperationalModeEntryController(params: Params): void {
    const entry = useOperationalModeEntryOptional();
    const setOperationalModeEntry = entry?.setOperationalModeEntry;
    const phase = entry?.phase;
    const laneKey = `${params.workUnitId ?? ""}:${params.activeQueueKey ?? ""}`;

    useEffect(() => {
        if (!params.enabled || !setOperationalModeEntry) return;
        setOperationalModeEntry(resolveOperationalModeEntrySnapshot(params));
    }, [
        setOperationalModeEntry,
        laneKey,
        params.enabled,
        params.laneMayPaint,
        params.queueItemsLoading,
        params.routeRecordId,
        params.drawerType,
        params.drawerId,
        params.queueRevision,
    ]);

    useEffect(() => {
        if (!params.enabled || typeof document === "undefined") return;
        const root = document.documentElement;
        const rowCount = params.displayItemsRef.current?.length ?? 0;
        const isPreparing = phase === "preparing";
        const isReadyEmpty =
            phase === "ready" &&
            params.laneMayPaint &&
            !params.queueItemsLoading &&
            rowCount === 0;

        if (isPreparing) {
            root.setAttribute(ALLOY_OS_OPERATIONAL_MODE_PREPARING_ATTR, "true");
        } else {
            root.removeAttribute(ALLOY_OS_OPERATIONAL_MODE_PREPARING_ATTR);
        }

        if (isReadyEmpty) {
            root.setAttribute(ALLOY_OS_OPERATIONAL_MODE_EMPTY_ATTR, "true");
        } else {
            root.removeAttribute(ALLOY_OS_OPERATIONAL_MODE_EMPTY_ATTR);
        }

        return () => {
            root.removeAttribute(ALLOY_OS_OPERATIONAL_MODE_PREPARING_ATTR);
            root.removeAttribute(ALLOY_OS_OPERATIONAL_MODE_EMPTY_ATTR);
        };
    }, [phase, params.enabled, params.laneMayPaint, params.queueItemsLoading, params.queueRevision]);
}
