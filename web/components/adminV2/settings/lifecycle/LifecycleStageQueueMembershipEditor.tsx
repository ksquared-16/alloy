"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
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
    QUEUE_MEMBERSHIP_COUNT_UNIT_FIELD_LABEL,
    QUEUE_MEMBERSHIP_COUNT_UNIT_LABELS,
    QUEUE_MEMBERSHIP_LOCATION_SCOPE_LABELS,
    QUEUE_MEMBERSHIP_PLACEMENT_SCOPE_LABELS,
    QUEUE_MEMBERSHIP_SUBJECT_FIELD_LABEL,
    QUEUE_MEMBERSHIP_SUBJECT_LABELS,
} from "@/lib/lifecycle/queueMembershipUiLabels";

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
    departmentId?: string;
    stageKey: string;
    savedMembership: QueueMembershipV1 | null;
    onDirtyChange?: (dirty: boolean) => void;
};

const LifecycleStageQueueMembershipEditor = forwardRef<
    LifecycleStageQueueMembershipEditorHandle,
    Props
>(function LifecycleStageQueueMembershipEditor(
    { stageKey, savedMembership, onDirtyChange },
    ref,
) {
    const [draft, setDraft] = useState<QueueMembershipEditorDraft>(() =>
        queueMembershipEditorDraftFromSaved(savedMembership, stageKey),
    );

    useEffect(() => {
        setDraft(queueMembershipEditorDraftFromSaved(savedMembership, stageKey));
    }, [savedMembership, stageKey]);

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

    const setSubject = (subject: QueueMembershipSubjectType) => {
        const next = applySubjectTypeChange(draft, subject);
        setDraft(next);
    };

    const locationOptions = locationScopesForSubject(draft.subject_type);

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-queue-membership-editor">
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-alloy-midnight/70">
                        {QUEUE_MEMBERSHIP_SUBJECT_FIELD_LABEL}
                    </span>
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
                    <span className="text-[11px] font-medium text-alloy-midnight/70">
                        {QUEUE_MEMBERSHIP_COUNT_UNIT_FIELD_LABEL}
                    </span>
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

            <label className="block space-y-1">
                <span className="text-[11px] font-medium text-alloy-midnight/70">Location filter</span>
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
                    {countUnitSummaryLabel(draft.count_unit)}
                </p>
            ) : null}
        </div>
    );
});

export default LifecycleStageQueueMembershipEditor;
