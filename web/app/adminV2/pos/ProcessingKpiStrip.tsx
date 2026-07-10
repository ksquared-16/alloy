"use client";

/**
 * Processing → Work mode operational health band (Doctrine V3).
 *
 * Data-only adapter: derives counts from queue + form APIs and renders
 * `WorkspaceOperationalHealthStrip`. No layout or strip styling lives here.
 */

import { useEffect } from "react";
import WorkspaceOperationalHealthStrip, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealthStrip";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";
import { useProcessingFormApi } from "./useProcessingFormApi";

/** Matches ProcessingQueueList `deriveWorkLane` → needs_review. */
function isNeedsReviewRow(row: { status: string; formDraftSummary?: { generatedFormId: string | null } | null }): boolean {
    if (row.status === "completed" || row.status === "archived") return false;
    if (row.formDraftSummary?.generatedFormId) return false;
    if (row.status === "ready") return false;
    return true;
}

/** Matches ProcessingQueueList `deriveWorkLane` → ready_publish. */
function isReadyToPublishRow(row: { status: string; formDraftSummary?: { generatedFormId: string | null } | null }): boolean {
    if (row.status === "completed" || row.status === "archived") return false;
    return !!row.formDraftSummary?.generatedFormId;
}

export default function ProcessingKpiStrip() {
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
    const loading = queueLoading || !listLoaded;

    const items: WorkspaceOperationalHealthItem[] = [
        { key: "active", label: "Active work", value: String(active.length), status: "healthy" },
        { key: "needs_review", label: "Needs review", value: String(needsReview.length), status: "warning" },
        { key: "ready_publish", label: "Ready to publish", value: String(readyToPublish.length), status: "healthy" },
        { key: "published", label: "Published", value: String(publishedCount), status: "unknown" },
    ];

    return (
        <WorkspaceOperationalHealthStrip
            eyebrow="Today's activity"
            items={items}
            loading={loading}
            ariaLabel="Today's activity"
            className="w-full"
            data-testid="processing-work-mode-kpi-band"
        />
    );
}
