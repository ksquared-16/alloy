"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { QueueMembershipStatusOption } from "@/lib/lifecycle/loadQueueMembershipStatusOptions";
import {
    applySubjectTypeChange,
    queueMembershipDraftDirty,
    queueMembershipDraftToPersisted,
    queueMembershipEditorDraftFromSaved,
    type QueueMembershipEditorDraft,
} from "@/lib/lifecycle/queueMembershipEditorModel";
import type {
    QueueMembershipCountUnit,
    QueueMembershipLocationScopeSource,
    QueueMembershipPlacementScope,
    QueueMembershipSubjectType,
    QueueMembershipV1,
} from "@/lib/lifecycle/queueMembershipV1";
import {
    countUnitSummaryLabel,
    includedStatusFieldLabel,
    QUEUE_MEMBERSHIP_COUNT_UNIT_LABELS,
    QUEUE_MEMBERSHIP_LOCATION_SCOPE_LABELS,
    QUEUE_MEMBERSHIP_PLACEMENT_SCOPE_LABELS,
    QUEUE_MEMBERSHIP_SUBJECT_LABELS,
} from "@/lib/lifecycle/queueMembershipUiLabels";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const SUBJECT_TYPES: QueueMembershipSubjectType[] = ["case", "child", "candidate"];
const COUNT_UNITS: QueueMembershipCountUnit[] = [
    "cases",
    "enrollment_tracks",
    "children",
    "candidates",
];
const PLACEMENT_SCOPES: QueueMembershipPlacementScope[] = ["active_only", "active_and_paused"];

function locationScopesForSubject(subject: QueueMembershipSubjectType): QueueMembershipLocationScopeSource[] {
    switch (subject) {
        case "case":
            return ["case_site"];
        case "child":
            return ["ocm_site", "case_site"];
        case "candidate":
            return ["placement_site", "ocm_site"];
    }
}

export type LifecycleStageQueueMembershipEditorHandle = {
    getDraftMembership: () => QueueMembershipV1 | null;
    isDirty: () => boolean;
};

type Props = {
    departmentId: string;
    stageKey: string;
    savedMembership: QueueMembershipV1 | null;
    statusOptions: QueueMembershipStatusOption[];
    onDirtyChange?: (dirty: boolean) => void;
};

const LifecycleStageQueueMembershipEditor = forwardRef<
    LifecycleStageQueueMembershipEditorHandle,
    Props
>(function LifecycleStageQueueMembershipEditor(
    { departmentId, stageKey, savedMembership, statusOptions: initialOptions, onDirtyChange },
    ref,
) {
    const [draft, setDraft] = useState<QueueMembershipEditorDraft>(() =>
        queueMembershipEditorDraftFromSaved(savedMembership, stageKey),
    );
    const [statusOptions, setStatusOptions] = useState(initialOptions);
    const [loadingOptions, setLoadingOptions] = useState(false);

    useEffect(() => {
        setDraft(queueMembershipEditorDraftFromSaved(savedMembership, stageKey));
    }, [savedMembership, stageKey]);

    useEffect(() => {
        setStatusOptions(initialOptions);
    }, [initialOptions]);

    const dirty = useMemo(
        () => queueMembershipDraftDirty(savedMembership, draft, stageKey),
        [savedMembership, draft, stageKey],
    );

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    useImperativeHandle(
        ref,
        () => ({
            getDraftMembership: () => queueMembershipDraftToPersisted(draft, stageKey),
            isDirty: () => dirty,
        }),
        [draft, dirty, stageKey],
    );

    const loadOptionsForSubject = useCallback(
        async (subject: QueueMembershipSubjectType) => {
            if (!departmentId.trim() || !stageKey.trim()) return;
            setLoadingOptions(true);
            try {
                const qs = new URLSearchParams({
                    department_id: departmentId,
                    stage_key: stageKey,
                    subject_type: subject,
                });
                const res = await fetch(
                    `/api/admin/lifecycle-builder/queue-membership-status-options?${qs.toString()}`,
                    workspaceDataFetchInit(),
                );
                const j = (await res.json().catch(() => ({}))) as {
                    options?: QueueMembershipStatusOption[];
                    error?: string;
                };
                if (res.ok && j.options) setStatusOptions(j.options);
            } finally {
                setLoadingOptions(false);
            }
        },
        [departmentId, stageKey],
    );

    const setSubject = (subject: QueueMembershipSubjectType) => {
        const next = applySubjectTypeChange(draft, subject);
        setDraft(next);
        void loadOptionsForSubject(subject);
    };

    const toggleKey = (key: string, selected: boolean) => {
        setDraft((prev) => {
            const set = new Set(prev.included_keys);
            if (selected) set.add(key);
            else set.delete(key);
            return { ...prev, included_keys: [...set] };
        });
    };

    const includedKeySet = useMemo(() => new Set(draft.included_keys), [draft.included_keys]);
    const locationOptions = locationScopesForSubject(draft.subject_type);

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-queue-membership-editor">
            <p className="text-[11px] text-alloy-midnight/55">
                Choose which records belong in this process stage. Counts and queue rows follow these
                selections.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-alloy-midnight/70">Record type</span>
                    <select
                        className="w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-xs"
                        value={draft.subject_type}
                        onChange={(e) => setSubject(e.target.value as QueueMembershipSubjectType)}
                        data-testid="queue-membership-subject"
                    >
                        {SUBJECT_TYPES.map((value) => (
                            <option key={value} value={value}>
                                {QUEUE_MEMBERSHIP_SUBJECT_LABELS[value]}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-alloy-midnight/70">Counts as</span>
                    <select
                        className="w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-xs"
                        value={draft.count_unit}
                        onChange={(e) =>
                            setDraft((prev) => ({
                                ...prev,
                                count_unit: e.target.value as QueueMembershipCountUnit,
                            }))
                        }
                        data-testid="queue-membership-count-unit"
                    >
                        {COUNT_UNITS.map((value) => (
                            <option key={value} value={value}>
                                {QUEUE_MEMBERSHIP_COUNT_UNIT_LABELS[value]}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="space-y-1">
                <span className="text-[11px] font-medium text-alloy-midnight/70">
                    {includedStatusFieldLabel(draft.subject_type)}
                </span>
                {loadingOptions ? (
                    <p className="text-xs text-alloy-midnight/50">Loading statuses…</p>
                ) : statusOptions.length ? (
                    <ul
                        className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-alloy-forge/12 p-2"
                        data-testid="queue-membership-status-list"
                    >
                        {statusOptions.map((row) => {
                            const checked = includedKeySet.has(row.status_key);
                            return (
                                <li key={row.status_key}>
                                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => toggleKey(row.status_key, e.target.checked)}
                                            data-testid={`queue-membership-status-${row.status_key}`}
                                        />
                                        <span>{row.status_label}</span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="text-xs text-alloy-midnight/50">
                        No statuses configured for this subject yet. Add statuses under Settings → Statuses.
                    </p>
                )}
            </div>

            <label className="block space-y-1">
                <span className="text-[11px] font-medium text-alloy-midnight/70">Location scope</span>
                <select
                    className="w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-xs"
                    value={draft.location_scope_source ?? ""}
                    onChange={(e) =>
                        setDraft((prev) => ({
                            ...prev,
                            location_scope_source: e.target.value
                                ? (e.target.value as QueueMembershipLocationScopeSource)
                                : null,
                        }))
                    }
                    data-testid="queue-membership-location-scope"
                >
                    <option value="">No location filter</option>
                    {locationOptions.map((value) => (
                        <option key={value} value={value}>
                            {QUEUE_MEMBERSHIP_LOCATION_SCOPE_LABELS[value]}
                        </option>
                    ))}
                </select>
            </label>

            {draft.subject_type === "candidate" ? (
                <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-alloy-midnight/70">Placement scope</span>
                    <select
                        className="w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-xs"
                        value={draft.placement_scope ?? ""}
                        onChange={(e) =>
                            setDraft((prev) => ({
                                ...prev,
                                placement_scope: e.target.value
                                    ? (e.target.value as QueueMembershipPlacementScope)
                                    : null,
                            }))
                        }
                        data-testid="queue-membership-placement-scope"
                    >
                        <option value="">Default (active and paused)</option>
                        {PLACEMENT_SCOPES.map((value) => (
                            <option key={value} value={value}>
                                {QUEUE_MEMBERSHIP_PLACEMENT_SCOPE_LABELS[value]}
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}

            {draft.included_keys.length > 0 ? (
                <p className="text-[10px] text-alloy-midnight/45" data-testid="queue-membership-summary">
                    {countUnitSummaryLabel(draft.count_unit)} · {draft.included_keys.length} status
                    {draft.included_keys.length === 1 ? "" : "es"} selected
                </p>
            ) : null}
        </div>
    );
});

export default LifecycleStageQueueMembershipEditor;
