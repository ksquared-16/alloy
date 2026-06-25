"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    BUSINESS_PROCESS_PERSPECTIVES_INTRO,
    BUSINESS_PROCESS_PERSPECTIVES_NO_LANES_NOTE,
    BUSINESS_PROCESS_PERSPECTIVES_SAVE_PENDING_NOTE,
    BUSINESS_PROCESS_PERSPECTIVES_SINGLE_LANE_NOTE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import {
    derivePerspectiveLanesFromPipeline,
    type PerspectiveLaneSource,
} from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
import type { PerspectiveConfigV1 } from "@/lib/lifecycle/perspectiveConfigV1";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";

export type PerspectiveDraftRow = PerspectiveConfigV1 & {
    grain?: string;
    foundInDefinition: boolean;
};

function defaultMissionForLane(lane: PerspectiveLaneSource): string {
    if (lane.description?.trim()) return lane.description.trim();
    return `Work ${lane.label.toLowerCase()} records in this stage.`;
}

function buildDraftRows(lanes: PerspectiveLaneSource[]): PerspectiveDraftRow[] {
    return lanes.map((lane) => ({
        queue_key: lane.queueKey,
        label: lane.label,
        mission: defaultMissionForLane(lane),
        visible_in_rail: true,
        display_order: lane.defaultDisplayOrder,
        grain: lane.grain,
        foundInDefinition: lane.foundInDefinition,
    }));
}

function draftsEqual(a: PerspectiveDraftRow[], b: PerspectiveDraftRow[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((row, i) => {
        const other = b[i];
        return (
            row.queue_key === other.queue_key &&
            row.label === other.label &&
            row.mission === other.mission &&
            row.visible_in_rail === other.visible_in_rail &&
            row.display_order === other.display_order
        );
    });
}

export default function LifecycleStagePerspectivesEditor({
    pipeline,
    loading,
    onDirtyChange,
}: {
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
    loading?: boolean;
    onDirtyChange?: (dirty: boolean) => void;
}) {
    const lanes = useMemo(() => derivePerspectiveLanesFromPipeline(pipeline), [pipeline]);
    const baseline = useMemo(() => buildDraftRows(lanes), [lanes]);
    const [drafts, setDrafts] = useState<PerspectiveDraftRow[]>(baseline);

    useEffect(() => {
        setDrafts(baseline);
        onDirtyChange?.(false);
    }, [baseline, onDirtyChange]);

    useEffect(() => {
        onDirtyChange?.(!draftsEqual(drafts, baseline));
    }, [drafts, baseline, onDirtyChange]);

    const updateRow = useCallback((queueKey: string, patch: Partial<PerspectiveDraftRow>) => {
        setDrafts((prev) =>
            prev.map((row) => (row.queue_key === queueKey ? { ...row, ...patch } : row)),
        );
    }, []);

    if (loading) {
        return <p className="text-xs text-alloy-midnight/50">Loading queue lanes…</p>;
    }

    if (!lanes.length) {
        return (
            <p className="text-xs leading-relaxed text-alloy-midnight/55" data-testid="perspectives-no-lanes">
                {BUSINESS_PROCESS_PERSPECTIVES_NO_LANES_NOTE}
            </p>
        );
    }

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-perspectives-editor">
            <p className="text-[11px] leading-relaxed text-alloy-midnight/55">{BUSINESS_PROCESS_PERSPECTIVES_INTRO}</p>

            <div
                className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-950"
                data-testid="perspectives-save-pending-note"
            >
                {BUSINESS_PROCESS_PERSPECTIVES_SAVE_PENDING_NOTE}
            </div>

            {lanes.length === 1 ? (
                <p className="text-[11px] text-alloy-midnight/50">{BUSINESS_PROCESS_PERSPECTIVES_SINGLE_LANE_NOTE}</p>
            ) : null}

            <ul className="space-y-3">
                {drafts.map((row) => (
                    <li
                        key={row.queue_key}
                        className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.03] p-3"
                        data-testid={`perspective-row-${row.queue_key}`}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <p className="text-xs font-semibold text-alloy-midnight">{row.label}</p>
                                <p className="mt-0.5 font-mono text-[10px] text-alloy-midnight/45">
                                    Lane key: {row.queue_key}
                                    {row.grain ? ` · Grain: ${row.grain}` : ""}
                                    {!row.foundInDefinition ? " · Not synced yet" : ""}
                                </p>
                            </div>
                            <label className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/70">
                                <input
                                    type="checkbox"
                                    checked={row.visible_in_rail}
                                    onChange={(e) =>
                                        updateRow(row.queue_key, { visible_in_rail: e.target.checked })
                                    }
                                    data-testid={`perspective-visible-${row.queue_key}`}
                                />
                                Visible in rail
                            </label>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label className="block space-y-1">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    Display label
                                </span>
                                <input
                                    type="text"
                                    value={row.label}
                                    onChange={(e) => updateRow(row.queue_key, { label: e.target.value })}
                                    className="w-full rounded-md border border-alloy-forge/15 bg-white px-2 py-1.5 text-xs text-alloy-midnight"
                                    data-testid={`perspective-label-${row.queue_key}`}
                                />
                            </label>
                            <label className="block space-y-1">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    Display order
                                </span>
                                <input
                                    type="number"
                                    min={1}
                                    value={row.display_order}
                                    onChange={(e) =>
                                        updateRow(row.queue_key, {
                                            display_order: Math.max(1, Number(e.target.value) || 1),
                                        })
                                    }
                                    className="w-full rounded-md border border-alloy-forge/15 bg-white px-2 py-1.5 text-xs text-alloy-midnight"
                                    data-testid={`perspective-order-${row.queue_key}`}
                                />
                            </label>
                        </div>

                        <label className="mt-3 block space-y-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                Default mission
                            </span>
                            <textarea
                                value={row.mission}
                                rows={2}
                                onChange={(e) => updateRow(row.queue_key, { mission: e.target.value })}
                                className="w-full rounded-md border border-alloy-forge/15 bg-white px-2 py-1.5 text-xs text-alloy-midnight"
                                data-testid={`perspective-mission-${row.queue_key}`}
                            />
                        </label>

                        <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
                            <span className="text-alloy-midnight/50">
                                Queue row layout:{" "}
                                <Link
                                    href={LAYOUTS_SETTINGS_HREF}
                                    className="font-medium text-alloy-pine hover:underline"
                                    data-testid={`perspective-queue-layout-link-${row.queue_key}`}
                                >
                                    Assign in Layouts
                                </Link>
                            </span>
                            <span className="text-alloy-midnight/50">
                                Focus Panel layout:{" "}
                                <Link
                                    href={LAYOUTS_SETTINGS_HREF}
                                    className="font-medium text-alloy-pine hover:underline"
                                    data-testid={`perspective-drawer-layout-link-${row.queue_key}`}
                                >
                                    Assign in Layouts
                                </Link>
                            </span>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
