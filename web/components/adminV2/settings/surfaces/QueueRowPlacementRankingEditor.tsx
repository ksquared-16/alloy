"use client";

import type { QueueRowPlacementRankingCriterion } from "@/lib/layout/queueRecordLayoutV3";
import {
    PLACEMENT_RANKING_CATALOG,
    isPlacementCriterionRegistered,
    reorderCriteria,
} from "@/lib/adminV2/settings/surfaces/queueRowVariantDisplayControls";

export type QueueRowPlacementRankingEditorProps = {
    criteria: QueueRowPlacementRankingCriterion[];
    isWaitlist: boolean;
    onChange: (criteria: QueueRowPlacementRankingCriterion[]) => void;
};

export default function QueueRowPlacementRankingEditor({
    criteria,
    isWaitlist,
    onChange,
}: QueueRowPlacementRankingEditorProps) {
    const catalogById = new Map(PLACEMENT_RANKING_CATALOG.map((e) => [e.criterionId, e]));
    const ordered: QueueRowPlacementRankingCriterion[] = criteria.length
        ? criteria
        : PLACEMENT_RANKING_CATALOG.map((entry) => ({
              criterionId: entry.criterionId,
              fieldKey: entry.fieldKey,
              enabled: false,
              direction: entry.defaultDirection,
              weight: entry.supportsWeight ? entry.defaultWeight : undefined,
          }));

    const unused = PLACEMENT_RANKING_CATALOG.filter(
        (entry) => !ordered.some((c) => c.criterionId === entry.criterionId),
    );

    return (
        <div className="w-full rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.02] p-3" data-testid="queue-row-placement-config">
            <div className="mb-2">
                <p className="text-[11px] font-semibold text-alloy-midnight/70">Placement ranking</p>
                <p className="mt-1 text-[10px] text-alloy-midnight/45">
                    Configure how waitlist rows are ranked for display. This does not change process execution or queue membership.
                </p>
            </div>
            <ol className="space-y-1.5" data-testid="queue-row-placement-ranking-list">
                {ordered.map((criterion, index) => {
                    const catalog = catalogById.get(criterion.criterionId);
                    const registered = catalog
                        ? isPlacementCriterionRegistered(catalog.fieldKey, isWaitlist)
                        : false;
                    const label = catalog?.label ?? criterion.criterionId;
                    return (
                        <li
                            key={criterion.criterionId}
                            className="flex flex-wrap items-center gap-2 rounded-md border border-alloy-stone/10 bg-white px-2 py-1.5"
                            data-testid="queue-row-placement-ranking-item"
                            data-placement-criterion={criterion.criterionId}
                        >
                            <span className="w-4 shrink-0 text-[10px] font-semibold tabular-nums text-alloy-midnight/35">
                                {index + 1}
                            </span>
                            <label className="flex min-w-[8rem] flex-1 items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={criterion.enabled && registered}
                                    disabled={!registered}
                                    onChange={(e) => {
                                        const next = [...ordered];
                                        next[index] = { ...criterion, enabled: e.target.checked };
                                        onChange(next);
                                    }}
                                    data-testid="queue-row-placement-enabled"
                                />
                                <span className={`text-[11px] ${registered ? "text-alloy-midnight/75" : "text-alloy-midnight/45"}`}>
                                    {label}
                                </span>
                            </label>
                            {!registered ? (
                                <span className="text-[9px] text-amber-700">Not available yet — missing registry field</span>
                            ) : (
                                <select
                                    value={criterion.direction}
                                    onChange={(e) => {
                                        const next = [...ordered];
                                        next[index] = {
                                            ...criterion,
                                            direction: e.target.value as "asc" | "desc",
                                        };
                                        onChange(next);
                                    }}
                                    className="rounded border border-alloy-stone/20 bg-white px-1.5 py-0.5 text-[10px]"
                                    data-testid="queue-row-placement-direction"
                                >
                                    <option value="asc">Ascending</option>
                                    <option value="desc">Descending</option>
                                </select>
                            )}
                            {catalog?.supportsWeight && registered ? (
                                <label className="flex items-center gap-1 text-[10px] text-alloy-midnight/55">
                                    Weight
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.1}
                                        value={criterion.weight ?? catalog.defaultWeight ?? 1}
                                        onChange={(e) => {
                                            const next = [...ordered];
                                            next[index] = {
                                                ...criterion,
                                                weight: Number(e.target.value),
                                            };
                                            onChange(next);
                                        }}
                                        className="w-14 rounded border border-alloy-stone/20 px-1 py-0.5 text-[10px]"
                                        data-testid="queue-row-placement-weight"
                                    />
                                </label>
                            ) : null}
                            <span className="ml-auto flex shrink-0 gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => onChange(reorderCriteria(ordered, index, -1))}
                                    disabled={index === 0}
                                    className="rounded px-1 text-[10px] text-alloy-midnight/45 hover:bg-alloy-stone/10 disabled:opacity-30"
                                    aria-label="Move up"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onChange(reorderCriteria(ordered, index, 1))}
                                    disabled={index === ordered.length - 1}
                                    className="rounded px-1 text-[10px] text-alloy-midnight/45 hover:bg-alloy-stone/10 disabled:opacity-30"
                                    aria-label="Move down"
                                >
                                    ↓
                                </button>
                            </span>
                        </li>
                    );
                })}
            </ol>
            {unused.length > 0 ? (
                <div className="mt-2 flex items-center gap-2">
                    <select
                        defaultValue=""
                        onChange={(e) => {
                            const id = e.target.value;
                            if (!id) return;
                            const entry = catalogById.get(id);
                            if (!entry) return;
                            onChange([
                                ...ordered,
                                {
                                    criterionId: entry.criterionId,
                                    fieldKey: entry.fieldKey,
                                    enabled: entry.registered,
                                    direction: entry.defaultDirection,
                                    weight: entry.supportsWeight ? entry.defaultWeight : undefined,
                                },
                            ]);
                            e.target.value = "";
                        }}
                        className="rounded-md border border-alloy-stone/20 bg-white px-2 py-1 text-[11px]"
                        data-testid="queue-row-placement-add"
                    >
                        <option value="">Add ranking criterion</option>
                        {unused.map((entry) => (
                            <option key={entry.criterionId} value={entry.criterionId}>
                                {entry.label}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}
        </div>
    );
}
