"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    buildPersonEmployeePlacementPatch,
    readPersonEmployeePlacementValues,
    type PersonEmployeePlacementValues,
} from "@/lib/admin/personEmployeePlacementFields";
import { patchLinkedPersonFromOpportunityDrawer } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import { dispatchOpportunityQueueUpdatedBroadcast } from "@/lib/admin/opportunityQueueRefreshEvent";
import { registerPersonDrawerEditSection } from "@/lib/admin/person/personDrawerEditingCoordinator";
import type { DrawerOperatingSaveSectionOptions } from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";

const INPUT_CLASS =
    "w-full rounded border border-admin-border bg-white px-2 py-1.5 text-sm text-alloy-forge focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:cursor-not-allowed disabled:opacity-60";

const SAVE_DELAY_MS = 450;

export type PersonEmployeePlacementSectionProps = {
    personId: string;
    initialValues: PersonEmployeePlacementValues;
    canMutate: boolean;
    /** Shown under fields when editing from a linked surface (e.g. contact). */
    saveHint?: string;
    /** Parent/child person drawer — hide legacy source field and long help copy. */
    compactOperatingSurface?: boolean;
    /** Drawer-level save — do not autosave on blur/change. */
    deferSave?: boolean;
    onPersonUpdated?: (person: Record<string, unknown>) => void;
};

export default function PersonEmployeePlacementSection({
    personId,
    initialValues,
    canMutate,
    saveHint,
    compactOperatingSurface = false,
    deferSave = false,
    onPersonUpdated,
}: PersonEmployeePlacementSectionProps) {
    const baselineRef = useRef(initialValues);
    const [draft, setDraft] = useState(initialValues);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedFlash, setSavedFlash] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        baselineRef.current = initialValues;
        setDraft(initialValues);
    }, [personId, initialValues.is_employee, initialValues.employee_id, initialValues.employee_source]);

    const optimisticSnapshotRef = useRef<{ baseline: PersonEmployeePlacementValues; draft: PersonEmployeePlacementValues } | null>(
        null,
    );

    const persist = useCallback(
        async (options?: DrawerOperatingSaveSectionOptions) => {
            const pid = personId.trim();
            if (!pid || !canMutate) return;
            const patch = buildPersonEmployeePlacementPatch(draft, baselineRef.current);
            if (Object.keys(patch).length === 0) return;

            if (!options?.confirmOnly) {
                setSaving(true);
            }
            setSaveError(null);
            setSavedFlash(false);
            try {
                const result = await patchLinkedPersonFromOpportunityDrawer({ personId: pid, body: patch });
                if (!result.ok) {
                    setSaveError(result.error);
                    if (!options?.confirmOnly) {
                        setDraft(baselineRef.current);
                    }
                    throw new Error(result.error);
                }
                const next = readPersonEmployeePlacementValues(result.json);
                baselineRef.current = next;
                setDraft(next);
                if (!options?.confirmOnly) {
                    setSavedFlash(true);
                    window.setTimeout(() => setSavedFlash(false), 2000);
                    onPersonUpdated?.(result.json);
                }
                dispatchOpportunityQueueUpdatedBroadcast("person_employee_updated");
                optimisticSnapshotRef.current = null;
            } catch (e) {
                if (!options?.confirmOnly) {
                    setSaveError(e instanceof Error ? e.message : "Save failed");
                    setDraft(baselineRef.current);
                }
                throw e;
            } finally {
                if (!options?.confirmOnly) {
                    setSaving(false);
                }
            }
        },
        [canMutate, draft, onPersonUpdated, personId],
    );

    const scheduleSave = useCallback(() => {
        if (deferSave) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            void persist();
        }, SAVE_DELAY_MS);
    }, [deferSave, persist]);

    useEffect(
        () => () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        },
        []
    );

    const showIdFields = draft.is_employee;

    useEffect(() => {
        if (!deferSave) return;
        registerPersonDrawerEditSection("employee_placement", {
            isDirty: () => {
                const patch = buildPersonEmployeePlacementPatch(draft, baselineRef.current);
                return Object.keys(patch).length > 0;
            },
            save: persist,
            revert: () => setDraft(baselineRef.current),
            applyOptimistic: () => {
                const patch = buildPersonEmployeePlacementPatch(draft, baselineRef.current);
                if (Object.keys(patch).length === 0) return;
                optimisticSnapshotRef.current = {
                    baseline: baselineRef.current,
                    draft,
                };
                baselineRef.current = { ...draft };
                onPersonUpdated?.({
                    is_employee: draft.is_employee,
                    employee_id: draft.employee_id,
                    employee_source: draft.employee_source,
                });
            },
            rollbackOptimistic: () => {
                const snapshot = optimisticSnapshotRef.current;
                if (!snapshot) return;
                baselineRef.current = snapshot.baseline;
                setDraft(snapshot.baseline);
                optimisticSnapshotRef.current = null;
            },
        });
        return () => registerPersonDrawerEditSection("employee_placement", null);
    }, [deferSave, draft, onPersonUpdated, persist]);

    const employeeRowClass = compactOperatingSurface
        ? "flex flex-wrap items-end gap-3"
        : "space-y-3";

    return (
        <div className={employeeRowClass} data-person-employee-placement="true">
            <label
                className={`flex items-center gap-2 text-sm text-alloy-midnight/85 ${compactOperatingSurface ? "shrink-0 pb-1.5" : ""}`}
            >
                <input
                    type="checkbox"
                    checked={draft.is_employee}
                    disabled={!canMutate || saving}
                    onChange={(e) => {
                        const checked = e.target.checked;
                        setDraft((p) => ({
                            ...p,
                            is_employee: checked,
                            ...(checked ? {} : { employee_id: "" }),
                        }));
                        scheduleSave();
                    }}
                    className="h-4 w-4 rounded border-alloy-stone/30 text-alloy-blue focus:ring-alloy-blue/30"
                />
                <span className="font-medium">Employee</span>
            </label>
            {showIdFields ? (
                <div
                    className={
                        compactOperatingSurface
                            ? "flex min-w-0 flex-1 flex-wrap items-end gap-2"
                            : "grid grid-cols-1 gap-3 sm:grid-cols-2"
                    }
                >
                    <div className={compactOperatingSurface ? "min-w-[10rem] flex-1 max-w-sm" : undefined}>
                        <label className="mb-0.5 block text-xs font-medium text-alloy-midnight/60">
                            Employee ID
                        </label>
                        <input
                            value={draft.employee_id}
                            disabled={!canMutate || saving}
                            onChange={(e) => {
                                setDraft((p) => ({ ...p, employee_id: e.target.value }));
                                scheduleSave();
                            }}
                            onBlur={deferSave ? undefined : () => void persist()}
                            className={INPUT_CLASS}
                            placeholder="Optional"
                            autoComplete="off"
                        />
                    </div>
                    {!compactOperatingSurface ? (
                        <div>
                            <label className="mb-0.5 block text-xs font-medium text-alloy-midnight/60">Source</label>
                            <input
                                value={draft.employee_source}
                                disabled={!canMutate || saving}
                                onChange={(e) => {
                                    setDraft((p) => ({ ...p, employee_source: e.target.value }));
                                    scheduleSave();
                                }}
                                onBlur={() => void persist()}
                                className={INPUT_CLASS}
                                placeholder="e.g. manual"
                                autoComplete="off"
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
            {saveHint ? <p className="text-[10px] text-alloy-midnight/45">{saveHint}</p> : null}
            {saving ? <p className="text-[10px] text-alloy-midnight/50">Saving…</p> : null}
            {savedFlash ? <p className="text-[10px] text-emerald-700/90">Saved</p> : null}
            {saveError ? <p className="text-[10px] text-red-700/90">{saveError}</p> : null}
        </div>
    );
}
