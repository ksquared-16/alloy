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
import { dispatchOpportunityQueueUpdated } from "@/lib/admin/opportunityQueueRefreshEvent";
import { dispatchOpportunityDrawerRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import {
    registerDrawerOperatingEditSection,
    type DrawerOperatingSaveSectionOptions,
} from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";
import { dispatchDrawerLayoutRuntimeBodyRecordPatch } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import { applyLayoutRuntimeDraftToRecord } from "@/lib/layout/runtime/applyLayoutRuntimeDraftToRecord";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import { isLayoutRuntimeEditableRefKeySupported } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    collectLayoutRuntimeChildRepeaterBaselines,
    saveLayoutRuntimeChildRepeaterEdits,
} from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import {
    isLayoutRuntimePersonContactRefKey,
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

type LayoutRuntimeDrawerEditContextValue = {
    getFieldValue: (refKey: string, fallback: string, rowKey?: string) => string;
    setFieldValue: (refKey: string, value: string, rowKey?: string) => void;
    isEditableRefKey: (refKey: string) => boolean;
};

const LayoutRuntimeDrawerEditContext = createContext<LayoutRuntimeDrawerEditContextValue | null>(null);

export function useLayoutRuntimeDrawerEdit(): LayoutRuntimeDrawerEditContextValue | null {
    return useContext(LayoutRuntimeDrawerEditContext);
}

function composeDraftKey(refKey: string, rowKey?: string): string {
    return rowKey ? `${rowKey}::${refKey}` : refKey;
}

function resolveEditableRefKey(refKey: string): string {
    const normalized = normalizeRefKeyOnRead(refKey);
    if (isLayoutRuntimeEditableRefKeySupported(normalized)) return normalized;
    return refKey;
}

function collectPersonContactBaseline(record: ProofRuntimeRecord): Record<string, string> {
    const baseline: Record<string, string> = {};
    for (const key of Object.keys(record)) {
        if (!isLayoutRuntimePersonContactRefKey(key)) continue;
        const v = record[key];
        baseline[key] = v == null ? "" : String(v);
    }
    return baseline;
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

function collectEditableBaseline(record: ProofRuntimeRecord): Record<string, string> {
    const { rows, rowKeys } = collectRepeaterRows(record);
    return {
        ...collectPersonContactBaseline(record),
        ...collectLayoutRuntimeChildRepeaterBaselines(record, rowKeys, rows),
    };
}

type Props = {
    record: ProofRuntimeRecord;
    children: ReactNode;
    onSaved?: () => void;
};

export default function LayoutRuntimeDrawerEditProvider({ record, children, onSaved }: Props) {
    const baselineRef = useRef<Record<string, string>>(collectEditableBaseline(record));
    const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...baselineRef.current }));
    const repeaterRef = useRef(collectRepeaterRows(record));
    const optimisticSnapshotRef = useRef<Record<string, string> | null>(null);
    const optimisticRecordRef = useRef<ProofRuntimeRecord | null>(null);

    useEffect(() => {
        void prefetchWorkspaceChildcareInquiryOptionSets();
    }, []);

    useEffect(() => {
        const nextBaseline = collectEditableBaseline(record);
        baselineRef.current = nextBaseline;
        setDraft({ ...nextBaseline });
        repeaterRef.current = collectRepeaterRows(record);
    }, [record]);

    const isDirty = useCallback(() => {
        for (const refKey of Object.keys(baselineRef.current)) {
            if ((draft[refKey] ?? "") !== (baselineRef.current[refKey] ?? "")) return true;
        }
        return false;
    }, [draft]);

    const revert = useCallback(() => {
        setDraft({ ...baselineRef.current });
    }, []);

    const savePersonContact = useCallback(async () => {
        const personBaseline: Record<string, string> = {};
        const personDraft: Record<string, string> = {};
        for (const refKey of Object.keys(baselineRef.current)) {
            if (!isLayoutRuntimePersonContactRefKey(refKey)) continue;
            personBaseline[refKey] = baselineRef.current[refKey] ?? "";
            personDraft[refKey] = draft[refKey] ?? "";
        }
        const result = await saveLayoutRuntimePersonContactEdits({
            record: record as Record<string, unknown>,
            baseline: personBaseline,
            draft: personDraft,
        });
        if (!result.ok) throw new Error(result.error);
    }, [draft, record]);

    const saveChildRepeater = useCallback(async () => {
        const { rows, rowKeys } = repeaterRef.current;
        const result = await saveLayoutRuntimeChildRepeaterEdits({
            record,
            rows,
            rowKeys,
            baseline: baselineRef.current,
            draft,
        });
        if (!result.ok) throw new Error(result.error);
    }, [draft, record]);

    const patchOptimisticRecord = useCallback(
        (nextDraft: Record<string, string>) => {
            const opportunityId = String(record.id ?? "").trim();
            if (!opportunityId) return;
            const nextRecord = applyLayoutRuntimeDraftToRecord({
                record,
                baseline: baselineRef.current,
                draft: nextDraft,
                rowKeys: repeaterRef.current.rowKeys,
                rows: repeaterRef.current.rows,
            });
            optimisticRecordRef.current = nextRecord;
            dispatchOpportunityDrawerRecordPatch(opportunityId, nextRecord);
            dispatchDrawerLayoutRuntimeBodyRecordPatch({
                entityType: "opportunities",
                entityId: opportunityId,
                record: nextRecord,
            });
        },
        [record],
    );

    const applyOptimistic = useCallback(() => {
        if (!isDirty()) return;
        optimisticSnapshotRef.current = { ...baselineRef.current };
        baselineRef.current = { ...draft };
        patchOptimisticRecord(draft);
    }, [draft, isDirty, patchOptimisticRecord]);

    const rollbackOptimistic = useCallback(() => {
        const snapshot = optimisticSnapshotRef.current;
        if (!snapshot) return;
        baselineRef.current = snapshot;
        setDraft({ ...snapshot });
        optimisticSnapshotRef.current = null;
        if (optimisticRecordRef.current) {
            const opportunityId = String(record.id ?? "").trim();
            if (opportunityId) {
                dispatchOpportunityDrawerRecordPatch(opportunityId, record);
                dispatchDrawerLayoutRuntimeBodyRecordPatch({
                    entityType: "opportunities",
                    entityId: opportunityId,
                    record,
                });
            }
        }
        optimisticRecordRef.current = null;
    }, [record]);

    const save = useCallback(
        async (options?: DrawerOperatingSaveSectionOptions) => {
            if (!options?.confirmOnly) {
                await savePersonContact();
                await saveChildRepeater();
                baselineRef.current = { ...draft };
                patchOptimisticRecord(draft);
            } else {
                await Promise.all([savePersonContact(), saveChildRepeater()]);
            }
            const opportunityId = String(record.id ?? "").trim();
            if (opportunityId) {
                dispatchOpportunityQueueUpdated(opportunityId, "layout_runtime_child_save");
            }
            optimisticSnapshotRef.current = null;
            optimisticRecordRef.current = null;
            onSaved?.();
        },
        [draft, onSaved, patchOptimisticRecord, record.id, saveChildRepeater, savePersonContact],
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

    const value = useMemo(
        (): LayoutRuntimeDrawerEditContextValue => ({
            getFieldValue: (refKey, fallback, rowKey) =>
                draft[composeDraftKey(resolveEditableRefKey(refKey), rowKey)] ?? fallback,
            setFieldValue: (refKey, value, rowKey) => {
                const resolved = resolveEditableRefKey(refKey);
                if (!isLayoutRuntimeEditableRefKeySupported(resolved)) return;
                const ocmKey = inquiryChildOcmFieldKeyFromLayoutRefKey(resolved);
                if (ocmKey && isInquiryChildPlacementFieldKey(ocmKey) && rowKey) {
                    const current: Record<string, string> = {};
                    for (const placementKey of ["location_id", "desired_program_type", "program_room_cohort_key"] as const) {
                        const rk = layoutRefKeyForInquiryChildOcmField(placementKey);
                        current[placementKey] = draft[composeDraftKey(rk, rowKey)] ?? "";
                    }
                    const next = applyInquiryChildPlacementFieldChange(ocmKey, value, current);
                    setDraft((prev) => {
                        const merged = { ...prev };
                        for (const placementKey of ["location_id", "desired_program_type", "program_room_cohort_key"] as const) {
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
        }),
        [draft],
    );

    return (
        <LayoutRuntimePlacementDataProvider>
            <LayoutRuntimeDrawerEditContext.Provider value={value}>
                {children}
            </LayoutRuntimeDrawerEditContext.Provider>
        </LayoutRuntimePlacementDataProvider>
    );
}
