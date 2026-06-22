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
import { dispatchDrawerLayoutRuntimeBodyRecordPatch } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyRecordPatch";
import { applyLayoutRuntimeDraftToRecord } from "@/lib/layout/runtime/applyLayoutRuntimeDraftToRecord";
import { isLayoutRuntimeEditableRefKeySupported, resolveLayoutRuntimeEditableRefKey } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    collectLayoutRuntimeChildRepeaterBaselines,
    saveLayoutRuntimeChildRepeaterEdits,
} from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import {
    collectLayoutRuntimeOpportunityNativeBaseline,
    saveLayoutRuntimeOpportunityNativeEdits,
} from "@/lib/layout/runtime/layoutRuntimeOpportunityFieldEdit";
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
    return resolveLayoutRuntimeEditableRefKey(refKey);
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

function collectEditableBaseline(record: ProofRuntimeRecord): Record<string, string> {
    const { rows, rowKeys } = collectRepeaterRows(record);
    return {
        ...collectPersonContactBaseline(record),
        ...collectDisplayCompanionBaseline(record),
        ...collectLayoutRuntimeOpportunityNativeBaseline(record),
        ...collectLayoutRuntimeChildRepeaterBaselines(record, rowKeys, rows),
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
        repeaterRef.current = collectRepeaterRows(record);
        setDraft((prev) => {
            const merged = mergeEditableBaselineFromRecord(baselineRef.current, prev, nextBaseline);
            baselineRef.current = merged.baseline;
            return merged.draft;
        });
    }, [record]);

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

    const savePersonContact = useCallback(async (patchBaseline: Record<string, string>) => {
        const personBaseline: Record<string, string> = {};
        const personDraft: Record<string, string> = {};
        for (const refKey of Object.keys(patchBaseline)) {
            if (!isLayoutRuntimePersonContactRefKey(refKey)) continue;
            personBaseline[refKey] = patchBaseline[refKey] ?? "";
            personDraft[refKey] = draft[refKey] ?? "";
        }
        const result = await saveLayoutRuntimePersonContactEdits({
            record: record as Record<string, unknown>,
            baseline: personBaseline,
            draft: personDraft,
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
            const patchBaseline =
                options?.confirmOnly ?
                    (optimisticSnapshotRef.current ?? baselineRef.current)
                :   baselineRef.current;

            if (!options?.confirmOnly) {
                await savePersonContact(patchBaseline);
                await saveOpportunityNative(patchBaseline);
                await saveChildRepeater(patchBaseline);
            } else {
                await Promise.all([
                    savePersonContact(patchBaseline),
                    saveOpportunityNative(patchBaseline),
                    saveChildRepeater(patchBaseline),
                ]);
            }
            baselineRef.current = { ...draft };
            patchOptimisticRecord(draft);
            const opportunityId = String(record.id ?? "").trim();
            if (opportunityId) {
                dispatchOpportunityQueueUpdated(opportunityId, "layout_runtime_child_save");
            }
            optimisticSnapshotRef.current = null;
            optimisticRecordRef.current = null;
            dispatchLayoutRuntimeDrawerSaved();
            onSaved?.();
        },
        [draft, onSaved, patchOptimisticRecord, record.id, saveChildRepeater, saveOpportunityNative, savePersonContact],
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
            getFieldValue: (refKey, fallback, rowKey) => {
                const trimmedRef = refKey.trim();
                if (LAYOUT_RUNTIME_DISPLAY_COMPANION_REF_KEYS.has(trimmedRef)) {
                    return draft[composeDraftKey(trimmedRef, rowKey)] ?? fallback;
                }
                return draft[composeDraftKey(resolveEditableRefKey(refKey), rowKey)] ?? fallback;
            },
            setFieldValue: (refKey, value, rowKey) => {
                const trimmedRef = refKey.trim();
                if (LAYOUT_RUNTIME_DISPLAY_COMPANION_REF_KEYS.has(trimmedRef)) {
                    const key = composeDraftKey(trimmedRef, rowKey);
                    setDraft((prev) => ({ ...prev, [key]: value }));
                    return;
                }
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
