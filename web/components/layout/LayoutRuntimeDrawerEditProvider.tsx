"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    dispatchLayoutRuntimeDrawerReverted,
    dispatchLayoutRuntimeDrawerSaved,
} from "@/lib/layout/runtime/layoutRuntimeDrawerBlockEditEvents";
import { dispatchOpportunityDrawerRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import {
    registerDrawerOperatingEditSection,
    type DrawerOperatingSaveSectionOptions,
} from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";
import {
    dispatchDrawerLayoutRuntimeBodyRecordPatch,
    type DrawerLayoutRuntimeBodyRecordPatchDetail,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import { applyLayoutRuntimeDraftToRecord } from "@/lib/layout/runtime/applyLayoutRuntimeDraftToRecord";
import { isLayoutRuntimeEditableRefKeySupported, resolveLayoutRuntimeEditableRefKey } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import type { LayoutEditorContactRole } from "@/lib/layout/layoutEditorContactRoles";
import {
    contactRoleFieldCapabilityReadOnlyReasonForRecord,
    isLayoutRuntimeRoleContactEditableRefKey,
    layoutRuntimeContactFieldHasSaveTarget,
} from "@/lib/layout/runtime/layoutRuntimeContactRoleFieldCapability";
import {
    collectLayoutRuntimeChildRepeaterBaselines,
    collectLayoutRuntimeChildStandaloneBaselines,
    saveLayoutRuntimeChildRepeaterEdits,
    saveLayoutRuntimeChildStandaloneEdits,
} from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import {
    collectLayoutRuntimeOpportunityNativeBaseline,
    saveLayoutRuntimeOpportunityNativeEdits,
} from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import {
    collectLayoutRuntimePersonNativeBaseline,
    saveLayoutRuntimePersonNativeEdits,
} from "@/lib/layout/runtime/layoutRuntimePersonNativeFieldEdit";
import {
    isLayoutRuntimePersonFieldRefKey,
    saveLayoutRuntimePersonContactEdits,
} from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";
import { prefetchWorkspaceChildcareInquiryOptionSets } from "@/lib/workspace/workspaceChildcareInquiryOptionSets";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import LayoutRuntimePlacementDataProvider from "@/components/layout/LayoutRuntimePlacementDataProvider";
import {
    inquiryChildOcmFieldKeyFromLayoutRefKey,
    layoutRefKeyForInquiryChildOcmField,
} from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import {
    applyInquiryChildPlacementFieldChange,
    isInquiryChildPlacementFieldKey,
} from "@/lib/admin/location/inquiryChildPlacementFieldKeys";

const LAYOUT_RUNTIME_DISPLAY_COMPANION_REF_KEYS = new Set([
    "child.location",
    "child.program",
    "child.room",
    "child.schedule",
    "child.status",
    "opportunity.location",
]);

type LayoutRuntimeDrawerEditContextValue = {
    getFieldValue: (refKey: string, fallback: string, rowKey?: string) => string;
    setFieldValue: (refKey: string, value: string, rowKey?: string, layoutContactRole?: LayoutEditorContactRole) => void;
    isEditableRefKey: (refKey: string) => boolean;
    canEditContactRefKey: (refKey: string, layoutContactRole?: LayoutEditorContactRole) => boolean;
    contactRefReadOnlyReason: (refKey: string, layoutContactRole?: LayoutEditorContactRole) => string | null;
    registerContactRefPersonIds: (bindings: Record<string, string>) => void;
};

const LayoutRuntimeDrawerEditContext = createContext<LayoutRuntimeDrawerEditContextValue | null>(null);

export function useLayoutRuntimeDrawerEdit(): LayoutRuntimeDrawerEditContextValue | null {
    return useContext(LayoutRuntimeDrawerEditContext);
}

function composeDraftKey(refKey: string, rowKey?: string): string {
    return rowKey ? `${rowKey}::${refKey}` : refKey;
}

function resolveEditableRefKey(refKey: string): string {
    return resolveLayoutRuntimeEditableRefKey(refKey);
}

function collectPersonContactBaseline(record: ProofRuntimeRecord): Record<string, string> {
    const baseline: Record<string, string> = {};
    for (const key of Object.keys(record)) {
        if (!isLayoutRuntimePersonFieldRefKey(key)) continue;
        const v = record[key];
        baseline[key] = v == null ? "" : String(v);
    }
    return baseline;
}

function collectDisplayCompanionBaseline(record: ProofRuntimeRecord): Record<string, string> {
    return {
        "opportunity.location":
            String(record["opportunity.location"] ?? record._location_label ?? record._location_name ?? "").trim(),
    };
}

function collectChildDisplayCompanionBaselines(
    rows: ProofRuntimeRecord[],
    rowKeys: string[],
): Record<string, string> {
    const out: Record<string, string> = {};
    const companions = ["child.location", "child.program", "child.room", "child.schedule", "child.status"] as const;
    rows.forEach((row, index) => {
        const rowKey = rowKeys[index];
        if (!rowKey) return;
        for (const companion of companions) {
            const raw = row[companion];
            out[`${rowKey}::${companion}`] = raw == null ? "" : String(raw).trim();
        }
    });
    return out;
}

function collectRepeaterRows(record: ProofRuntimeRecord): { rows: ProofRuntimeRecord[]; rowKeys: string[] } {
    const rows: ProofRuntimeRecord[] = [];
    const rowKeys: string[] = [];
    for (const source of ["children", "enrollment_children"] as const) {
        const raw = record[source];
        if (!Array.isArray(raw)) continue;
        raw.forEach((row, index) => {
            if (!row || typeof row !== "object") return;
            const rec = row as ProofRuntimeRecord;
            rows.push(rec);
            rowKeys.push(layoutRuntimeRepeaterRowReactKey(rec, index, source));
        });
    }
    return { rows, rowKeys };
}

type DrawerEditEntityType = DrawerLayoutRuntimeBodyRecordPatchDetail["entityType"];

function collectEditableBaseline(record: ProofRuntimeRecord, entityType: DrawerEditEntityType): Record<string, string> {
    const { rows, rowKeys } = collectRepeaterRows(record);
    return {
        ...collectPersonContactBaseline(record),
        ...collectLayoutRuntimePersonNativeBaseline(record),
        ...collectDisplayCompanionBaseline(record),
        ...collectLayoutRuntimeOpportunityNativeBaseline(record),
        ...collectLayoutRuntimeChildRepeaterBaselines(record, rowKeys, rows),
        ...(entityType === "child" ? collectLayoutRuntimeChildStandaloneBaselines(record) : {}),
        ...collectChildDisplayCompanionBaselines(rows, rowKeys),
    };
}

function mergeEditableBaselineFromRecord(
    prevBaseline: Record<string, string>,
    prevDraft: Record<string, string>,
    nextFromRecord: Record<string, string>,
): { baseline: Record<string, string>; draft: Record<string, string> } {
    const baseline = { ...nextFromRecord };
    const draft = { ...nextFromRecord };

    for (const key of Object.keys(prevBaseline)) {
        const incoming = nextFromRecord[key] ?? "";
        const prevBase = prevBaseline[key] ?? "";
        const prevDraftVal = prevDraft[key] ?? "";
        const isLocationField = key.includes("location");
        if (prevBase && !incoming && isLocationField) {
            baseline[key] = prevBase;
            draft[key] = prevDraftVal || prevBase;
        }
    }

    for (const key of Object.keys(prevDraft)) {
        if ((prevDraft[key] ?? "") !== (prevBaseline[key] ?? "")) {
            draft[key] = prevDraft[key] ?? "";
        }
    }

    return { baseline, draft };
}

type Props = {
    record: ProofRuntimeRecord;
    children: ReactNode;
    onSaved?: () => void;
    /** Defaults to opportunities when omitted (legacy opportunity drawer host). */
    entityType?: DrawerEditEntityType;
};

export default function LayoutRuntimeDrawerEditProvider({
    record,
    children,
    onSaved,
    entityType = "opportunities",
}: Props) {
    const baselineRef = useRef<Record<string, string>>(collectEditableBaseline(record, entityType));
    const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...baselineRef.current }));
    const repeaterRef = useRef(collectRepeaterRows(record));
    const optimisticSnapshotRef = useRef<Record<string, string> | null>(null);
    const optimisticRecordRef = useRef<ProofRuntimeRecord | null>(null);
    const contactRefPersonIdsRef = useRef<Record<string, string>>({});
    const contactRefEditRoleRef = useRef<Partial<Record<string, LayoutEditorContactRole>>>({});

    useEffect(() => {
        void prefetchWorkspaceChildcareInquiryOptionSets();
    }, []);

    useEffect(() => {
        const nextBaseline = collectEditableBaseline(record, entityType);
        repeaterRef.current = collectRepeaterRows(record);
        setDraft((prev) => {
            const merged = mergeEditableBaselineFromRecord(baselineRef.current, prev, nextBaseline);
            baselineRef.current = merged.baseline;
            return merged.draft;
        });
    }, [entityType, record]);

    const isDirty = useCallback(() => {
        for (const refKey of Object.keys(baselineRef.current)) {
            if ((draft[refKey] ?? "") !== (baselineRef.current[refKey] ?? "")) return true;
        }
        return false;
    }, [draft]);

    const revert = useCallback(() => {
        setDraft({ ...baselineRef.current });
        dispatchLayoutRuntimeDrawerReverted();
    }, []);

    const registerContactRefPersonIds = useCallback((bindings: Record<string, string>) => {
        contactRefPersonIdsRef.current = {
            ...contactRefPersonIdsRef.current,
            ...bindings,
        };
    }, []);

    const savePersonNative = useCallback(async (patchBaseline: Record<string, string>) => {
        const fullNativeBaseline = collectLayoutRuntimePersonNativeBaseline(record);
        const nativeBaseline: Record<string, string> = {};
        const nativeDraft: Record<string, string> = {};
        for (const refKey of Object.keys(fullNativeBaseline)) {
            nativeBaseline[refKey] = patchBaseline[refKey] ?? fullNativeBaseline[refKey] ?? "";
            nativeDraft[refKey] = draft[refKey] ?? nativeBaseline[refKey] ?? "";
        }
        const result = await saveLayoutRuntimePersonNativeEdits({
            record: record as ProofRuntimeRecord,
            baseline: nativeBaseline,
            draft: nativeDraft,
        });
        if (!result.ok) throw new Error(result.error);
    }, [draft, record]);

    const savePersonContact = useCallback(async (patchBaseline: Record<string, string>) => {
        const personBaseline: Record<string, string> = {};
        const personDraft: Record<string, string> = {};
        for (const refKey of Object.keys(patchBaseline)) {
            if (!isLayoutRuntimePersonFieldRefKey(refKey)) continue;
            personBaseline[refKey] = patchBaseline[refKey] ?? "";
            personDraft[refKey] = draft[refKey] ?? "";
        }
        const result = await saveLayoutRuntimePersonContactEdits({
            record: record as Record<string, unknown>,
            baseline: personBaseline,
            draft: personDraft,
            contactRefPersonIdOverrides: contactRefPersonIdsRef.current,
            contactRefRoleOverrides: contactRefEditRoleRef.current,
        });
        if (!result.ok) throw new Error(result.error);
    }, [draft, record]);

    const saveOpportunityNative = useCallback(async (patchBaseline: Record<string, string>) => {
        const result = await saveLayoutRuntimeOpportunityNativeEdits({
            record,
            baseline: patchBaseline,
            draft,
        });
        if (!result.ok) throw new Error(result.error);
    }, [draft, record]);

    const saveChildRepeater = useCallback(async (patchBaseline: Record<string, string>) => {
        const { rows, rowKeys } = repeaterRef.current;
        const result = await saveLayoutRuntimeChildRepeaterEdits({
            record,
            rows,
            rowKeys,
            baseline: patchBaseline,
            draft,
        });
        if (!result.ok) throw new Error(result.error);
    }, [draft, record]);

    const saveChildStandalone = useCallback(async (patchBaseline: Record<string, string>) => {
        if (entityType !== "child") return;
        const result = await saveLayoutRuntimeChildStandaloneEdits({
            record,
            baseline: patchBaseline,
            draft,
        });
        if (!result.ok) throw new Error(result.error);
    }, [draft, entityType, record]);

    const patchOptimisticRecord = useCallback(
        (nextDraft: Record<string, string>) => {
            const entityId = String(record.id ?? "").trim();
            if (!entityId) return;
            const nextRecord = applyLayoutRuntimeDraftToRecord({
                record,
                baseline: baselineRef.current,
                draft: nextDraft,
                rowKeys: repeaterRef.current.rowKeys,
                rows: repeaterRef.current.rows,
            });
            optimisticRecordRef.current = nextRecord;
            if (entityType === "opportunities") {
                dispatchOpportunityDrawerRecordPatch(entityId, nextRecord);
            }
            dispatchDrawerLayoutRuntimeBodyRecordPatch({
                entityType,
                entityId,
                record: nextRecord,
            });
        },
        [entityType, record],
    );

    const applyOptimistic = useCallback(() => {
        if (!isDirty()) return;
        optimisticSnapshotRef.current = { ...baselineRef.current };
        patchOptimisticRecord(draft);
    }, [draft, isDirty, patchOptimisticRecord]);

    const rollbackOptimistic = useCallback(() => {
        const snapshot = optimisticSnapshotRef.current;
        if (!snapshot) return;
        baselineRef.current = snapshot;
        setDraft({ ...snapshot });
        optimisticSnapshotRef.current = null;
        if (optimisticRecordRef.current) {
            const entityId = String(record.id ?? "").trim();
            if (entityId) {
                if (entityType === "opportunities") {
                    dispatchOpportunityDrawerRecordPatch(entityId, record);
                }
                dispatchDrawerLayoutRuntimeBodyRecordPatch({
                    entityType,
                    entityId,
                    record,
                });
            }
        }
        optimisticRecordRef.current = null;
    }, [entityType, record]);

    const save = useCallback(
        async (options?: DrawerOperatingSaveSectionOptions) => {
            const patchBaseline =
                options?.confirmOnly ?
                    (optimisticSnapshotRef.current ?? baselineRef.current)
                :   baselineRef.current;

            if (!options?.confirmOnly) {
                await savePersonContact(patchBaseline);
                await savePersonNative(patchBaseline);
                await saveOpportunityNative(patchBaseline);
                await saveChildRepeater(patchBaseline);
                await saveChildStandalone(patchBaseline);
            } else {
                await Promise.all([
                    savePersonContact(patchBaseline),
                    savePersonNative(patchBaseline),
                    saveOpportunityNative(patchBaseline),
                    saveChildRepeater(patchBaseline),
                    saveChildStandalone(patchBaseline),
                ]);
            }
            baselineRef.current = { ...draft };
            patchOptimisticRecord(draft);
            if (entityType === "opportunities") {
                const opportunityId = String(record.id ?? "").trim();
                if (opportunityId) {
                    dispatchOpportunityQueueUpdated(opportunityId, "layout_runtime_child_save");
                }
            }
            optimisticSnapshotRef.current = null;
            optimisticRecordRef.current = null;
            dispatchLayoutRuntimeDrawerSaved();
            onSaved?.();
        },
        [
            draft,
            entityType,
            onSaved,
            patchOptimisticRecord,
            record.id,
            saveChildRepeater,
            saveChildStandalone,
            saveOpportunityNative,
            savePersonContact,
            savePersonNative,
        ],
    );

    useEffect(() => {
        registerDrawerOperatingEditSection("layout_runtime_person_contact", {
            isDirty,
            save,
            revert,
            applyOptimistic,
            rollbackOptimistic,
            saveOrder: 0,
        });
        return () => registerDrawerOperatingEditSection("layout_runtime_person_contact", null);
    }, [applyOptimistic, isDirty, revert, rollbackOptimistic, save]);

    const canEditContactRefKey = useCallback((refKey: string, layoutContactRole?: LayoutEditorContactRole) => {
        const resolved = resolveLayoutRuntimeEditableRefKey(refKey);
        if (!isLayoutRuntimeRoleContactEditableRefKey(resolved)) {
            return isLayoutRuntimeEditableRefKeySupported(resolved);
        }
        return layoutRuntimeContactFieldHasSaveTarget({
            record: record as Record<string, unknown>,
            refKey: resolved,
            overrides: contactRefPersonIdsRef.current,
            layoutContactRole,
        });
    }, [record]);

    const contactRefReadOnlyReason = useCallback((refKey: string, layoutContactRole?: LayoutEditorContactRole) => {
        const resolved = resolveLayoutRuntimeEditableRefKey(refKey);
        return contactRoleFieldCapabilityReadOnlyReasonForRecord(
            resolved,
            record as Record<string, unknown>,
            contactRefPersonIdsRef.current,
            layoutContactRole,
        );
    }, [record]);

    const value = useMemo(
        (): LayoutRuntimeDrawerEditContextValue => ({
            getFieldValue: (refKey, fallback, rowKey) => {
                const trimmedRef = refKey.trim();
                if (LAYOUT_RUNTIME_DISPLAY_COMPANION_REF_KEYS.has(trimmedRef)) {
                    return draft[composeDraftKey(trimmedRef, rowKey)] ?? fallback;
                }
                return draft[composeDraftKey(resolveEditableRefKey(refKey), rowKey)] ?? fallback;
            },
            setFieldValue: (refKey, value, rowKey, layoutContactRole) => {
                const trimmedRef = refKey.trim();
                if (LAYOUT_RUNTIME_DISPLAY_COMPANION_REF_KEYS.has(trimmedRef)) {
                    const key = composeDraftKey(trimmedRef, rowKey);
                    setDraft((prev) => ({ ...prev, [key]: value }));
                    return;
                }
                const resolved = resolveEditableRefKey(refKey);
                if (!canEditContactRefKey(resolved, layoutContactRole)) return;
                if (layoutContactRole && isLayoutRuntimeRoleContactEditableRefKey(resolved)) {
                    contactRefEditRoleRef.current[resolved] = layoutContactRole;
                }
                const ocmKey = inquiryChildOcmFieldKeyFromLayoutRefKey(resolved);
                if (ocmKey && isInquiryChildPlacementFieldKey(ocmKey) && rowKey) {
                    const current: Record<string, string> = {};
                    for (const placementKey of ["location_id", "program_category_id", "program_room_cohort_key"] as const) {
                        const rk = layoutRefKeyForInquiryChildOcmField(placementKey);
                        current[placementKey] = draft[composeDraftKey(rk, rowKey)] ?? "";
                    }
                    const next = applyInquiryChildPlacementFieldChange(ocmKey, value, current);
                    setDraft((prev) => {
                        const merged = { ...prev };
                        for (const placementKey of ["location_id", "program_category_id", "program_room_cohort_key"] as const) {
                            const rk = layoutRefKeyForInquiryChildOcmField(placementKey);
                            merged[composeDraftKey(rk, rowKey)] = next[placementKey] ?? "";
                        }
                        return merged;
                    });
                    return;
                }
                const key = composeDraftKey(resolved, rowKey);
                setDraft((prev) => ({ ...prev, [key]: value }));
            },
            isEditableRefKey: (refKey) =>
                isLayoutRuntimeEditableRefKeySupported(resolveEditableRefKey(refKey)),
            canEditContactRefKey,
            contactRefReadOnlyReason,
            registerContactRefPersonIds,
        }),
        [canEditContactRefKey, contactRefReadOnlyReason, draft, registerContactRefPersonIds],
    );

    return (
        <LayoutRuntimePlacementDataProvider>
            <LayoutRuntimeDrawerEditContext.Provider value={value}>
                {children}
            </LayoutRuntimeDrawerEditContext.Provider>
        </LayoutRuntimePlacementDataProvider>
    );
}
