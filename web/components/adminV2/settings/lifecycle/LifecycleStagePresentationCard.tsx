"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    FocusPanelLayoutPreviewThumbnail,
    QueueLayoutPreviewThumbnail,
} from "@/components/adminV2/settings/configurationRuntime/LayoutPresentationPreview";
import {
    BUSINESS_PROCESS_PRESENTATION_CARD_INTRO,
    BUSINESS_PROCESS_PRESENTATION_CHANGE,
    BUSINESS_PROCESS_PRESENTATION_FOCUS_PANEL,
    BUSINESS_PROCESS_PRESENTATION_OPEN_LAYOUTS,
    BUSINESS_PROCESS_PRESENTATION_QUEUE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import {
    type BusinessProcessLayoutAssignmentRecord,
    type LayoutAssignmentSurfaceKey,
} from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import { layoutAssignmentSlotsForStage } from "@/lib/layout/layoutAssignmentSlots";
import { publishedLayoutOptionsForAssignmentSlot } from "@/lib/layout/layoutAssignmentLayoutOptions";
import { formatLayoutTitleWithVersion } from "@/lib/layout/layoutVersionNaming";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";

type AssignmentsResponse = { assignments: BusinessProcessLayoutAssignmentRecord[] };
type LayoutsResponse = { records: EntityLayoutRecord[] };

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

function layoutLabel(record: EntityLayoutRecord | null): string {
    if (!record) return "Surface default";
    return formatLayoutTitleWithVersion(record.name, record.version);
}

export default function LifecycleStagePresentationCard({
    businessProcessKey,
    stageKey,
    stageLabel,
}: {
    businessProcessKey: string;
    stageKey: string;
    stageLabel: string;
}) {
    const [assignments, setAssignments] = useState<BusinessProcessLayoutAssignmentRecord[]>([]);
    const [layouts, setLayouts] = useState<EntityLayoutRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const slots = useMemo(() => layoutAssignmentSlotsForStage(stageKey), [stageKey]);
    const queueSlot = slots.find((s) => s.surfaceKey === "queue_record") ?? slots[0];
    const drawerSlot =
        slots.find((s) => s.surfaceKey === "opportunity_drawer")
        ?? slots.find((s) => s.slotId === "drawer")
        ?? slots[1];

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

    if (loading) {
        return <p className="text-xs text-alloy-midnight/50">Loading presentation assignments…</p>;
    }

    const queueAssignment = queueSlot ?
        assignmentFor(assignments, businessProcessKey, stageKey, queueSlot.surfaceKey)
    :   null;
    const drawerAssignment = drawerSlot ?
        assignmentFor(assignments, businessProcessKey, stageKey, drawerSlot.surfaceKey)
    :   null;
    const queueRecord =
        queueAssignment?.entityLayoutId ?
            (layouts.find((l) => l.id === queueAssignment.entityLayoutId) ?? null)
        :   null;
    const drawerRecord =
        drawerAssignment?.entityLayoutId ?
            (layouts.find((l) => l.id === drawerAssignment.entityLayoutId) ?? null)
        :   null;
    const queueOptions = queueSlot ? publishedLayoutOptionsForAssignmentSlot(layouts, queueSlot.surfaceKey) : [];
    const drawerOptions = drawerSlot ? publishedLayoutOptionsForAssignmentSlot(layouts, drawerSlot.surfaceKey) : [];

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-presentation-card">
            <p className="text-[11px] leading-relaxed text-alloy-midnight/55">
                {BUSINESS_PROCESS_PRESENTATION_CARD_INTRO.replace("{stage}", stageLabel)}
            </p>

            {error ?
                <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{error}</p>
            :   null}

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.02] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        {BUSINESS_PROCESS_PRESENTATION_QUEUE}
                    </p>
                    <QueueLayoutPreviewThumbnail label={layoutLabel(queueRecord)} />
                    <p className="mt-2 text-xs font-medium text-alloy-midnight">{layoutLabel(queueRecord)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                            value={queueAssignment?.entityLayoutId ?? ""}
                            disabled={!!busy || !queueSlot}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v && queueSlot) void saveAssignment(queueSlot.surfaceKey, v);
                            }}
                            className="max-w-full flex-1 rounded border border-alloy-forge/15 px-2 py-1 text-[11px] disabled:opacity-50"
                            data-testid="presentation-queue-layout-select"
                        >
                            <option value="">Surface default</option>
                            {queueOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {formatLayoutTitleWithVersion(opt.name, opt.version)}
                                </option>
                            ))}
                        </select>
                        <Link
                            href={LAYOUTS_SETTINGS_HREF}
                            className="text-[11px] font-medium text-alloy-pine hover:underline"
                        >
                            {BUSINESS_PROCESS_PRESENTATION_CHANGE}
                        </Link>
                    </div>
                </div>

                <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.02] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        {BUSINESS_PROCESS_PRESENTATION_FOCUS_PANEL}
                    </p>
                    <FocusPanelLayoutPreviewThumbnail label={layoutLabel(drawerRecord)} />
                    <p className="mt-2 text-xs font-medium text-alloy-midnight">{layoutLabel(drawerRecord)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                            value={drawerAssignment?.entityLayoutId ?? ""}
                            disabled={!!busy || !drawerSlot}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v && drawerSlot) void saveAssignment(drawerSlot.surfaceKey, v);
                            }}
                            className="max-w-full flex-1 rounded border border-alloy-forge/15 px-2 py-1 text-[11px] disabled:opacity-50"
                            data-testid="presentation-focus-panel-layout-select"
                        >
                            <option value="">Surface default</option>
                            {drawerOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {formatLayoutTitleWithVersion(opt.name, opt.version)}
                                </option>
                            ))}
                        </select>
                        <Link
                            href={LAYOUTS_SETTINGS_HREF}
                            className="text-[11px] font-medium text-alloy-pine hover:underline"
                        >
                            {BUSINESS_PROCESS_PRESENTATION_CHANGE}
                        </Link>
                    </div>
                </div>
            </div>

            <p className="text-[11px] text-alloy-midnight/50">
                {BUSINESS_PROCESS_PRESENTATION_OPEN_LAYOUTS}{" "}
                <Link href={LAYOUTS_SETTINGS_HREF} className="font-medium text-alloy-pine hover:underline">
                    Settings → Layouts
                </Link>
            </p>
        </div>
    );
}
