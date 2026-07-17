"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    type BusinessProcessLayoutAssignmentRecord,
    type LayoutAssignmentSurfaceKey,
} from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import { layoutAssignmentSlotsForStage } from "@/lib/layout/layoutAssignmentSlots";
import { publishedLayoutOptionsForAssignmentSlot } from "@/lib/layout/layoutAssignmentLayoutOptions";
import { formatLayoutTitleWithVersion } from "@/lib/layout/layoutVersionNaming";
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";

type AssignmentsResponse = { assignments: BusinessProcessLayoutAssignmentRecord[] };
type LayoutsResponse = { records: EntityLayoutRecord[] };

type Props = {
    businessProcessKey: string;
    stageKey: string;
    stageLabel: string;
};

function assignmentFor(
    assignments: BusinessProcessLayoutAssignmentRecord[],
    processKey: string,
    stageKey: string,
    surfaceKey: LayoutAssignmentSurfaceKey,
): BusinessProcessLayoutAssignmentRecord | null {
    return (
        assignments.find(
            (a) =>
                a.businessProcessKey === processKey
                && a.surfaceKey === surfaceKey
                && (a.stageKey ?? null) === stageKey
                && !a.statusKey,
        ) ?? null
    );
}

function layoutOptionsForSurface(
    records: EntityLayoutRecord[],
    surfaceKey: LayoutAssignmentSurfaceKey,
): EntityLayoutRecord[] {
    return publishedLayoutOptionsForAssignmentSlot(records, surfaceKey);
}

function layoutLabel(record: EntityLayoutRecord | null): string {
    if (!record) return "Surface default";
    return formatLayoutTitleWithVersion(record.name, record.version);
}

export default function LifecycleStageLayoutAssignmentsCard({
    businessProcessKey,
    stageKey,
    stageLabel,
}: Props) {
    const [assignments, setAssignments] = useState<BusinessProcessLayoutAssignmentRecord[]>([]);
    const [layouts, setLayouts] = useState<EntityLayoutRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const slots = useMemo(() => layoutAssignmentSlotsForStage(stageKey), [stageKey]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [assignRes, layoutRes] = await Promise.all([
                fetch(`/api/admin/business-process-layout-assignments?process=${encodeURIComponent(businessProcessKey)}`),
                fetch("/api/admin/entity-layouts"),
            ]);
            const assignJson = (await assignRes.json()) as AssignmentsResponse & { error?: string };
            const layoutJson = (await layoutRes.json()) as LayoutsResponse & { error?: string };
            if (!assignRes.ok) throw new Error(assignJson.error ?? "Failed to load assignments");
            if (!layoutRes.ok) throw new Error(layoutJson.error ?? "Failed to load layouts");
            setAssignments(assignJson.assignments ?? []);
            setLayouts(layoutJson.records ?? []);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [businessProcessKey]);

    useEffect(() => {
        void load();
    }, [load]);

    const saveAssignment = useCallback(
        async (surfaceKey: LayoutAssignmentSurfaceKey, entityLayoutId: string) => {
            setBusy(surfaceKey);
            setError(null);
            try {
                const res = await fetch("/api/admin/business-process-layout-assignments", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        business_process_key: businessProcessKey,
                        stage_key: stageKey,
                        surface_key: surfaceKey,
                        entity_layout_id: entityLayoutId,
                    }),
                });
                const json = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Save failed");
                await load();
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setBusy(null);
            }
        },
        [businessProcessKey, stageKey, load],
    );

    const clearAssignment = useCallback(
        async (surfaceKey: LayoutAssignmentSurfaceKey) => {
            setBusy(`clear:${surfaceKey}`);
            setError(null);
            try {
                const res = await fetch("/api/admin/business-process-layout-assignments", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        business_process_key: businessProcessKey,
                        stage_key: stageKey,
                        surface_key: surfaceKey,
                        use_default: true,
                    }),
                });
                const json = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Clear failed");
                await load();
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setBusy(null);
            }
        },
        [businessProcessKey, stageKey, load],
    );

    if (loading) {
        return <p className="text-xs text-alloy-midnight/50">Loading layout assignments…</p>;
    }

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-layout-assignments">
            <p className="text-xs leading-relaxed text-alloy-midnight/55">
                Assign published layouts for <span className="font-medium text-alloy-midnight">{stageLabel}</span>.
                Create or edit layouts in{" "}
                <Link href={LAYOUTS_SETTINGS_HREF} className="font-medium text-alloy-pine hover:underline">
                    Configuration → Surfaces
                </Link>
                .
            </p>

            {error ?
                <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>
            :   null}

            <ul className="space-y-2">
                {slots.map((slot) => {
                    const current = assignmentFor(assignments, businessProcessKey, stageKey, slot.surfaceKey);
                    const options = layoutOptionsForSurface(layouts, slot.surfaceKey);
                    const currentRecord =
                        current?.entityLayoutId ?
                            (layouts.find((l) => l.id === current.entityLayoutId) ?? null)
                        :   null;

                    return (
                        <li
                            key={slot.slotId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.03] px-3 py-2"
                            data-testid={`bp-layout-slot-${stageKey}-${slot.slotId}`}
                        >
                            <div className="min-w-0">
                                <span className="text-xs font-medium text-alloy-midnight">{slot.label}</span>
                                {slot.optional ?
                                    <span className="ml-1.5 text-[10px] text-alloy-midnight/40">Optional</span>
                                :   null}
                                <p className="text-[10px] text-alloy-midnight/45">{layoutLabel(currentRecord)}</p>
                            </div>
                            <select
                                value={current?.entityLayoutId ?? ""}
                                disabled={!!busy}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (!v) void clearAssignment(slot.surfaceKey);
                                    else void saveAssignment(slot.surfaceKey, v);
                                }}
                                className="max-w-[12rem] rounded border border-alloy-forge/15 px-1.5 py-1 text-[11px] disabled:opacity-50"
                                data-testid={`bp-layout-slot-select-${stageKey}-${slot.slotId}`}
                            >
                                <option value="">Surface default</option>
                                {options.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                        {formatLayoutTitleWithVersion(opt.name, opt.version)}
                                    </option>
                                ))}
                            </select>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
