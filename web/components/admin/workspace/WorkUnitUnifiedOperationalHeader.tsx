"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import {
    WorkUnitAboveFoldHeaderChips,
    type WorkUnitAboveFoldHeaderHandlers,
} from "@/app/adminV2/components/workspace/WorkUnitAboveFoldHeaderChips";
import type { WorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { WorkUnitCommandSurface } from "@/components/admin/workspace/layout/WorkUnitCommandSurface";
import { resolveWorkUnitCommandProcessName } from "@/lib/workspace/workUnitCommandHeaderTitles";
import { workUnitKeyToRouteSlug } from "@/lib/admin/workUnitRouteSlug";
import { alloyRuntimeTrace } from "@/lib/perf/alloyRuntimeTrace";

type Props = {
    aboveFold: WorkUnitAboveFoldRenderModel;
    handlers: WorkUnitAboveFoldHeaderHandlers;
    kpis: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    kpiStripPlaceholder?: boolean;
    lifecyclePanel?: ReactNode;
    otherPillSectionKey?: string | null;
    queuePillPendingKey?: string | null;
    processName?: string | null;
    workUnitId?: string | null;
    surfaceKey?: string;
};

function headerSectionsWithoutNeedsAttention(
    aboveFold: WorkUnitAboveFoldRenderModel,
    suppressNeedsAttention: boolean
): WorkUnitAboveFoldRenderModel {
    if (!suppressNeedsAttention) return aboveFold;
    return {
        ...aboveFold,
        header: {
            ...aboveFold.header,
            sections: aboveFold.header.sections.filter((section) => section.key !== "needs_attention"),
        },
    };
}

function hasOipPerformanceStrip(kpis: KPIVm[]): boolean {
    return kpis.some((kpi) => kpi.id.startsWith("oip."));
}

/** Work-unit command surface adapter — layout system owns row structure. */
export default function WorkUnitUnifiedOperationalHeader({
    aboveFold,
    handlers,
    kpis,
    oipResolved,
    kpiStripPlaceholder = false,
    lifecyclePanel = null,
    otherPillSectionKey = null,
    queuePillPendingKey = null,
    processName = null,
    workUnitId = null,
    surfaceKey = "default",
}: Props) {
    const suppressNeedsAttention = hasOipPerformanceStrip(kpis);
    const filteredAboveFold = useMemo(
        () => headerSectionsWithoutNeedsAttention(aboveFold, suppressNeedsAttention),
        [aboveFold, suppressNeedsAttention]
    );

    const hasHeader = filteredAboveFold.header.visible;

    const stagePills =
        hasHeader ?
            <WorkUnitAboveFoldHeaderChips
                slot={filteredAboveFold.header}
                handlers={handlers}
                otherPillSectionKey={otherPillSectionKey}
                lifecyclePanel={lifecyclePanel}
                queuePillPendingKey={queuePillPendingKey}
                layout="inline"
            />
        :   null;

    const resolvedProcessName = resolveWorkUnitCommandProcessName({
        aboveFold: filteredAboveFold,
        processName,
    });

    // WU.HEADER canonical runtime trace — the pill strip is built from the same
    // configured Work Views the route resolved against. Emits labels/slugs, the
    // active pill, and the rendered count so the log proves all siblings render.
    const headerChips = useMemo(
        () => filteredAboveFold.header.sections.flatMap((section) => section.chips),
        [filteredAboveFold.header.sections],
    );
    useEffect(() => {
        if (!hasHeader) return;
        const activeChip = headerChips.find((chip) => chip.selected) ?? null;
        alloyRuntimeTrace("WU.HEADER", {
            source: "configured_work_views",
            process_label: resolvedProcessName,
            header_title_rendered: resolvedProcessName ?? "",
            calculation_keys: kpis.map((kpi) => kpi.id),
            work_view_pill_labels: headerChips.map((chip) => chip.label),
            work_view_pill_slugs: headerChips.map((chip) => workUnitKeyToRouteSlug(chip.key)),
            work_view_pill_keys: headerChips.map((chip) => chip.key),
            active_pill_key: activeChip?.key ?? null,
            active_pill_slug: activeChip ? workUnitKeyToRouteSlug(activeChip.key) : null,
            rendered_pill_count: headerChips.length,
        });
    }, [hasHeader, headerChips, resolvedProcessName, kpis]);

    return (
        <WorkUnitCommandSurface
            processName={resolvedProcessName}
            stagePills={stagePills}
            kpis={kpis}
            oipResolved={oipResolved}
            kpiStripPlaceholder={kpiStripPlaceholder}
            workUnitId={workUnitId}
            surfaceKey={surfaceKey}
        />
    );
}
