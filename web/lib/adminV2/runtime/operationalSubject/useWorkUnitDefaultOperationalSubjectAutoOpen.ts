"use client";

import { useEffect, useRef, type RefObject } from "react";

import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import {
    buildOperationalSubjectRowsFromPreview,
    findOperationalSubjectRowByEntityId,
    resolveDefaultOperationalSubject,
    resolveDefaultOperationalSubjectStrategyForWorkUnit,
} from "@/lib/adminV2/runtime/operationalSubject/resolveDefaultOperationalSubject";
import { perfAlloyOsRuntimeMark } from "@/lib/perf/adminV2PerfLog";
import { perfIntent } from "@/lib/perf/perfNamespaceLog";

const AUTO_OPEN_SOURCE = "default_operational_subject";

type EntityType = "opportunity" | "job" | "schedule";

type Params = {
    enabled: boolean;
    workUnitId: string | null;
    workUnitKey: string | null;
    activeQueueKey: string | null;
    laneMayPaint: boolean;
    queueItemsLoading: boolean;
    displayItemsRef: RefObject<QueuePreviewItemVm[]>;
    rawQueueItemsRef: RefObject<Array<Record<string, unknown>> | null | undefined>;
    queueEntityType: EntityType | undefined;
    routeRecordId: string | null;
    drawerType: string | null | undefined;
    drawerId: string | null | undefined;
    currentUserId: string | null;
    openRecord: (entityId: string, entityType: EntityType, source: string) => void;
    /** Bump when display rows or lane ownership changes. */
    queueRevision: number;
};

/**
 * Phase B + C — auto-open Default Operational Subject when Work Unit queue is ready.
 * Respects URL record id and manual row selection.
 */
export function useWorkUnitDefaultOperationalSubjectAutoOpen(params: Params): void {
    const manualSelectionRef = useRef(false);
    const autoOpenedLaneRef = useRef<string | null>(null);

    const laneKey = `${params.workUnitId ?? ""}:${params.activeQueueKey ?? ""}`;

    useEffect(() => {
        autoOpenedLaneRef.current = null;
        manualSelectionRef.current = false;
    }, [laneKey]);

    useEffect(() => {
        if (!params.enabled) return;
        if (!params.workUnitId || !params.activeQueueKey) return;
        if (!params.laneMayPaint || params.queueItemsLoading) return;

        const displayItems = params.displayItemsRef.current ?? [];
        if (!displayItems.length) return;

        const urlRecordId = params.routeRecordId?.trim() || null;
        if (urlRecordId) return;

        const openDrawerId =
            params.drawerType && params.drawerId != null ? String(params.drawerId).trim() : "";
        if (openDrawerId && manualSelectionRef.current) {
            // Manual click wins: a subject is already open by operator intent — never let the
            // default resolver re-open or overwrite it.
            perfIntent("default_resolver_blocked_manual_selection", {
                work_unit_id: params.workUnitId,
                queue_key: params.activeQueueKey,
                opportunity_id: openDrawerId,
            });
            return;
        }

        const entityType: EntityType =
            params.queueEntityType === "job" || params.queueEntityType === "schedule"
                ? params.queueEntityType
                : "opportunity";

        const subjectRows = buildOperationalSubjectRowsFromPreview(
            displayItems,
            params.rawQueueItemsRef.current ?? undefined,
            entityType,
        );

        if (openDrawerId) {
            const existing = findOperationalSubjectRowByEntityId(subjectRows, openDrawerId);
            if (existing) {
                autoOpenedLaneRef.current = laneKey;
                return;
            }
        }

        if (manualSelectionRef.current) {
            perfIntent("default_resolver_blocked_manual_selection", {
                work_unit_id: params.workUnitId,
                queue_key: params.activeQueueKey,
            });
            return;
        }
        if (autoOpenedLaneRef.current === laneKey) return;

        const strategy = resolveDefaultOperationalSubjectStrategyForWorkUnit(params.workUnitKey);
        const resolved = resolveDefaultOperationalSubject(subjectRows, strategy, {
            currentUserId: params.currentUserId,
        });
        if (!resolved) return;

        autoOpenedLaneRef.current = laneKey;
        perfAlloyOsRuntimeMark("default_subject_resolved", {
            work_unit_id: params.workUnitId,
            queue_key: params.activeQueueKey,
            entity_type: resolved.entityType,
        });
        params.openRecord(resolved.entityId, resolved.entityType, AUTO_OPEN_SOURCE);
    }, [
        params.enabled,
        params.workUnitId,
        params.workUnitKey,
        params.activeQueueKey,
        params.laneMayPaint,
        params.queueItemsLoading,
        params.displayItemsRef,
        params.rawQueueItemsRef,
        params.queueEntityType,
        params.routeRecordId,
        params.drawerType,
        params.drawerId,
        params.currentUserId,
        params.openRecord,
        params.queueRevision,
        laneKey,
    ]);

    useEffect(() => {
        if (!params.enabled) return;
        const handler = () => {
            manualSelectionRef.current = true;
        };
        window.addEventListener("alloy-os-manual-operational-subject", handler);
        return () => window.removeEventListener("alloy-os-manual-operational-subject", handler);
    }, [params.enabled]);
}

export function markManualOperationalSubjectSelection(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("alloy-os-manual-operational-subject"));
}

export { AUTO_OPEN_SOURCE as DEFAULT_OPERATIONAL_SUBJECT_OPEN_SOURCE };
