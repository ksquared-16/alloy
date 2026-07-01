/**
 * In-place layout-runtime drawer body record patch — avoids refetch flash after Save All.
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const ADMINV2_LAYOUT_RUNTIME_BODY_RECORD_PATCH = "adminv2:layout-runtime-body-record-patch" as const;

export type DrawerLayoutRuntimeBodyRecordPatchDetail = {
    entityType: "opportunities" | "persons" | "child";
    entityId: string;
    record: ProofRuntimeRecord;
};

export function dispatchDrawerLayoutRuntimeBodyRecordPatch(
    detail: DrawerLayoutRuntimeBodyRecordPatchDetail,
): void {
    if (typeof window === "undefined") return;
    const entityId = detail.entityId.trim();
    if (!entityId) return;
    window.dispatchEvent(
        new CustomEvent<DrawerLayoutRuntimeBodyRecordPatchDetail>(ADMINV2_LAYOUT_RUNTIME_BODY_RECORD_PATCH, {
            detail: { entityType: detail.entityType, entityId, record: detail.record },
        }),
    );
}

export function parseDrawerLayoutRuntimeBodyRecordPatchDetail(
    ev: Event,
): DrawerLayoutRuntimeBodyRecordPatchDetail | null {
    if (!(ev instanceof CustomEvent)) return null;
    const raw = ev.detail;
    if (!raw || typeof raw !== "object") return null;
    const entityId =
        typeof (raw as DrawerLayoutRuntimeBodyRecordPatchDetail).entityId === "string"
            ? (raw as DrawerLayoutRuntimeBodyRecordPatchDetail).entityId.trim()
            : "";
    const entityType = (raw as DrawerLayoutRuntimeBodyRecordPatchDetail).entityType;
    const record = (raw as DrawerLayoutRuntimeBodyRecordPatchDetail).record;
    if (
        !entityId
        || (entityType !== "opportunities" && entityType !== "persons" && entityType !== "child")
        || !record
        || typeof record !== "object"
        || Array.isArray(record)
    ) {
        return null;
    }
    return { entityType, entityId, record };
}
