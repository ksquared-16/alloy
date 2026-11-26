/**
 * Processing Work → Overview activity metrics.
 *
 * Mirrors Communications overview: compact SurfaceHeaderKpiCard tiles below primary
 * action cards — not the header WorkspaceOperationalHealth strip.
 */

import { useEffect, useMemo } from "react";
import type { WorkspaceHeaderKpiVm } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";
import { useProcessingFormApi } from "@/app/adminV2/pos/useProcessingFormApi";

function isNeedsReviewRow(row: { status: string; formDraftSummary?: { generatedFormId: string | null } | null }): boolean {
    if (row.status === "completed" || row.status === "archived") return false;
    if (row.formDraftSummary?.generatedFormId) return false;
    if (row.status === "ready") return false;
    return true;
}

function isReadyToPublishRow(row: { status: string; formDraftSummary?: { generatedFormId: string | null } | null }): boolean {
    if (row.status === "completed" || row.status === "archived") return false;
    return !!row.formDraftSummary?.generatedFormId;
}

export function buildProcessingOverviewKpis(args: {
    active: number;
    needsReview: number;
    readyToPublish: number;
    published: number;
}): WorkspaceHeaderKpiVm[] {
    return [
        {
            slot: 1,
            label: "Active Work",
            icon: "users",
            accent: "pine",
            formattedValue: String(args.active),
            status: "unknown",
            sourceKey: null,
            drillHref: null,
        },
        {
            slot: 2,
            label: "Needs Review",
            icon: "bolt",
            accent: "ember",
            formattedValue: String(args.needsReview),
            status: "unknown",
            sourceKey: null,
            drillHref: null,
        },
        {
            slot: 3,
            label: "Ready to Publish",
            icon: "calendar",
            accent: "pine",
            formattedValue: String(args.readyToPublish),
            status: "unknown",
            sourceKey: null,
            drillHref: null,
        },
        {
            slot: 4,
            label: "Published",
            icon: "book",
            accent: "gold",
            formattedValue: String(args.published),
            status: "unknown",
            sourceKey: null,
            drillHref: null,
        },
    ];
}

export function useProcessingOverviewKpis(): { kpis: WorkspaceHeaderKpiVm[]; loading: boolean } {
    const { data, loading: queueLoading } = useProcessingQueueWarm();
    const { forms, listLoaded, loadForms } = useProcessingFormApi();

    useEffect(() => {
        if (!listLoaded) void loadForms();
    }, [listLoaded, loadForms]);

    const rows = data?.rows ?? [];
    const active = rows.filter((r) => r.status !== "completed" && r.status !== "archived");
    const needsReview = rows.filter(isNeedsReviewRow);
    const readyToPublish = rows.filter(isReadyToPublishRow);
    const publishedCount = forms.filter((f) => f.has_published_version).length;

    const kpis = useMemo(
        () =>
            buildProcessingOverviewKpis({
                active: active.length,
                needsReview: needsReview.length,
                readyToPublish: readyToPublish.length,
                published: publishedCount,
            }),
        [active.length, needsReview.length, readyToPublish.length, publishedCount]
    );

    return { kpis, loading: queueLoading || !listLoaded };
}
