"use client";

import type { QueueRowVariant, QueueRowVariantGroupBy } from "@/lib/layout/queueRecordLayoutV3";
import QueueRowVariantStagePicker, {
    type ProcessStageOption,
} from "@/components/adminV2/settings/surfaces/QueueRowVariantStagePicker";
import QueueRowOrderedCriteriaEditor from "@/components/adminV2/settings/surfaces/QueueRowOrderedCriteriaEditor";
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

export type QueueRowVariantInspectorProps = {
    variant: QueueRowVariant;
    processStages: readonly ProcessStageOption[];
    stagesLoading?: boolean;
    showWaitlistPlacement?: boolean;
    onPatch: (patch: Partial<QueueRowVariant>) => void;
    onClose?: () => void;
    compact?: boolean;
};

function DisplayControls({
    variant,
    onPatch,
    showWaitlistPlacement,
}: {
    variant: QueueRowVariant;
    onPatch: (patch: Partial<QueueRowVariant>) => void;
    showWaitlistPlacement?: boolean;
}) {
    const groupCriteria = normalizeGroupByCriteria(variant);
    const sortCriteria = normalizeSortCriteria(variant);

    const patchDisplay = (
        nextGroup: typeof groupCriteria,
        nextSort: typeof sortCriteria,
    ) => onPatch(patchVariantDisplayFromCriteria(nextGroup, nextSort));

    return (
        <>
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
            {showWaitlistPlacement ? (
                <p
                    className="rounded-md border border-alloy-stone/14 bg-alloy-stone/5 px-3 py-2 text-[11px] text-alloy-midnight/55"
                    data-testid="queue-row-placement-ranking-deferred"
                >
                    Placement ranking configuration is handled in Placement settings.
                </p>
            ) : null}
        </>
    );
}

export default function QueueRowVariantInspector({
    variant,
    processStages,
    stagesLoading = false,
    showWaitlistPlacement = false,
    onPatch,
    onClose,
    compact = false,
}: QueueRowVariantInspectorProps) {
    const stageKeys = variant.appliesWhen?.stage_key ?? [];

    if (compact) {
        return (
            <div className="space-y-3 rounded-xl border border-alloy-stone/14 bg-white px-4 py-3 shadow-sm" data-testid="queue-row-variant-inspector">
                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
                        <span className="text-[11px] font-medium text-alloy-midnight/55">Variant name</span>
                        <input
                            type="text"
                            value={variant.label}
                            onChange={(e) => onPatch({ label: e.target.value })}
                            placeholder="e.g. Tour"
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
                    {onClose ? (
                        <button type="button" onClick={onClose} className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white hover:bg-alloy-pine/90" data-testid="queue-row-variant-done">
                            Done
                        </button>
                    ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                    <DisplayControls variant={variant} onPatch={onPatch} showWaitlistPlacement={showWaitlistPlacement} />
                </div>
            </div>
        );
    }

    return (
        <section className="rounded-xl border border-alloy-stone/14 bg-white p-4 shadow-sm" data-testid="queue-row-variant-inspector">
            <header className="mb-3 flex items-start justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold text-alloy-midnight">{variant.label || "Untitled variant"}</p>
                    <p className="mt-1 text-[11px] text-alloy-midnight/50">
                        Applies when selected stages match. Candidate-focused variants should also constrain grain
                        (candidate/child) so family-grain All / Tours keep Default.
                    </p>
                </div>
                {onClose ? (
                    <button type="button" onClick={onClose} className="rounded p-1 text-alloy-midnight/35 hover:bg-alloy-stone/10" aria-label="Close variant editor">✕</button>
                ) : null}
            </header>
            <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-alloy-midnight/75">Variant name</span>
                    <input type="text" value={variant.label} onChange={(e) => onPatch({ label: e.target.value })} className="rounded-md border border-alloy-stone/20 px-2.5 py-1.5 text-sm" data-testid="queue-row-variant-name" />
                </label>
                <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-alloy-midnight/75">Match stages</span>
                    <QueueRowVariantStagePicker stages={processStages} loading={stagesLoading} selectedStageKeys={stageKeys} onChange={(keys) => onPatch({ appliesWhen: { ...variant.appliesWhen, stage_key: keys } })} />
                </div>
                <DisplayControls variant={variant} onPatch={onPatch} showWaitlistPlacement={showWaitlistPlacement} />
            </div>
        </section>
    );
}
