"use client";

import type { QueueRowVariant, QueueRowVariantGroupBy } from "@/lib/layout/queueRecordLayoutV3";
import QueueRowVariantStagePicker, {
    type ProcessStageOption,
} from "@/components/adminV2/settings/surfaces/QueueRowVariantStagePicker";
import QueueRowOrderedCriteriaEditor from "@/components/adminV2/settings/surfaces/QueueRowOrderedCriteriaEditor";
import SurfaceRowFocusPicker from "@/components/adminV2/settings/surfaces/SurfaceRowFocusPicker";
import {
    subjectFocusFromUi,
    subjectFocusToUi,
} from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import {
    QUEUE_ROW_GROUP_BY_OPTIONS,
    QUEUE_ROW_SORT_BY_OPTIONS,
    addGroupCriterion,
    addSortCriterion,
    groupByOptionLabel,
    normalizeGroupByCriteria,
    normalizeSortCriteria,
    patchVariantDisplayFromCriteria,
    reorderCriteria,
    sortCriterionLabel,
    type QueueRowSortByKey,
} from "@/lib/adminV2/settings/surfaces/queueRowVariantDisplayControls";

export type QueueRowVariantSettingsProps = {
    variant: QueueRowVariant;
    processStages: readonly ProcessStageOption[];
    stagesLoading?: boolean;
    onPatch: (patch: Partial<QueueRowVariant>) => void;
};

/** Variant-level settings shown below the row canvas (stages, group, sort). */
export default function QueueRowVariantSettings({
    variant,
    processStages,
    stagesLoading = false,
    onPatch,
}: QueueRowVariantSettingsProps) {
    const stageKeys = variant.appliesWhen?.stage_key ?? [];
    const groupCriteria = normalizeGroupByCriteria(variant);
    const sortCriteria = normalizeSortCriteria(variant);

    const patchDisplay = (
        nextGroup: typeof groupCriteria,
        nextSort: typeof sortCriteria,
    ) => onPatch(patchVariantDisplayFromCriteria(nextGroup, nextSort));

    return (
        <section
            className="space-y-3 rounded-xl border border-alloy-stone/14 bg-alloy-stone/[0.02] px-4 py-3"
            data-testid="queue-row-variant-settings-below"
        >
            <p className="text-[11px] font-semibold text-alloy-midnight/70">Variant settings</p>
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
                    <span className="text-[11px] font-medium text-alloy-midnight/55">Variant name</span>
                    <input
                        type="text"
                        value={variant.label}
                        onChange={(e) => onPatch({ label: e.target.value })}
                        className="rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm"
                        data-testid="queue-row-variant-name"
                    />
                </label>
                <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
                    <span className="text-[11px] font-medium text-alloy-midnight/55">Match stages</span>
                    <QueueRowVariantStagePicker
                        stages={processStages}
                        loading={stagesLoading}
                        selectedStageKeys={stageKeys}
                        onChange={(keys) => onPatch({ appliesWhen: { ...variant.appliesWhen, stage_key: keys } })}
                    />
                </div>
                <SurfaceRowFocusPicker
                    value={subjectFocusToUi(variant.subjectFocus)}
                    onChange={(ui) =>
                        onPatch({ subjectFocus: subjectFocusFromUi(ui, stageKeys) })
                    }
                />
            </div>
            <div className="flex flex-wrap gap-3">
                <QueueRowOrderedCriteriaEditor
                    title="Group by"
                    testId="queue-row-variant-group-by"
                    emptyHint="No grouping — add criteria in priority order."
                    addLabel="Add group criterion"
                    rows={groupCriteria.map((c, i) => ({
                        id: `${c.key}-${i}`,
                        label: groupByOptionLabel(c.key),
                    }))}
                    addOptions={QUEUE_ROW_GROUP_BY_OPTIONS.filter((o) => o.key !== "none").map((o) => ({
                        value: o.key,
                        label: o.label,
                        disabled: groupCriteria.some((c) => c.key === o.key),
                    }))}
                    onAdd={(value) =>
                        patchDisplay(
                            addGroupCriterion(groupCriteria, value as Exclude<QueueRowVariantGroupBy, "none">),
                            sortCriteria,
                        )
                    }
                    onRemove={(index) => patchDisplay(groupCriteria.filter((_, i) => i !== index), sortCriteria)}
                    onReorder={(index, direction) =>
                        patchDisplay(reorderCriteria(groupCriteria, index, direction), sortCriteria)
                    }
                />
                <QueueRowOrderedCriteriaEditor
                    title="Sort by"
                    testId="queue-row-variant-sort-by"
                    emptyHint="Default queue order — add sort criteria in priority order."
                    addLabel="Add sort criterion"
                    rows={sortCriteria.map((c, i) => ({
                        id: `${c.key}-${c.direction}-${i}`,
                        label: sortCriterionLabel(c),
                    }))}
                    addOptions={QUEUE_ROW_SORT_BY_OPTIONS.filter((o) => o.key !== "default").map((o) => ({
                        value: o.key,
                        label: o.label,
                    }))}
                    onAdd={(value) =>
                        patchDisplay(groupCriteria, addSortCriterion(sortCriteria, value as QueueRowSortByKey))
                    }
                    onRemove={(index) => patchDisplay(groupCriteria, sortCriteria.filter((_, i) => i !== index))}
                    onReorder={(index, direction) =>
                        patchDisplay(groupCriteria, reorderCriteria(sortCriteria, index, direction))
                    }
                />
            </div>
        </section>
    );
}
