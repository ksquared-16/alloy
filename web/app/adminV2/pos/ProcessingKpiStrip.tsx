"use client";

/**
 * Processing operational health — Work vs Studio contextual metrics.
 *
 * Data-only adapter: derives counts from queue + form APIs and renders
 * canonical `WorkspaceOperationalHealth`. No layout or trend styling lives here.
 */

import { useEffect, useMemo } from "react";
import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealth";
import { formOrigin, formPublishStatus } from "@/lib/pos/processingFolderConfig";
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

/** Static trend placeholders until historical comparison APIs exist. */
const WORK_TRENDS = {
    active: { direction: "up" as const, label: "4 today" },
    needs_review: { direction: "down" as const, label: "42%", tone: "pine" as const },
    ready_publish: { direction: "up" as const, label: "6 today" },
    published: { direction: "none" as const, label: "Today", tone: "gold" as const },
};

const STUDIO_TRENDS = {
    forms: { direction: "up" as const, label: "2 this week" },
    published: { direction: "up" as const, label: "3 this week", tone: "gold" as const },
    draft: { direction: "down" as const, label: "12% vs last 7 days" },
    generated: { direction: "up" as const, label: "5 this month" },
};

export default function ProcessingKpiStrip({ mode }: { mode: "work" | "studio" }) {
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
    const draftCount = forms.filter((f) => formPublishStatus(f) === "draft").length;
    const generatedCount = forms.filter((f) => formOrigin(f) === "generated").length;

    const loading = mode === "work" ? queueLoading || !listLoaded : !listLoaded;

    const workItems: WorkspaceOperationalHealthItem[] = useMemo(
        () => [
            {
                key: "active",
                label: "Active Work",
                value: String(active.length),
                tone: "pine",
                trend: WORK_TRENDS.active,
            },
            {
                key: "needs_review",
                label: "Needs Review",
                value: String(needsReview.length),
                tone: "ember",
                trend: WORK_TRENDS.needs_review,
            },
            {
                key: "ready_publish",
                label: "Ready to Publish",
                value: String(readyToPublish.length),
                tone: "pine",
                trend: WORK_TRENDS.ready_publish,
            },
            {
                key: "published",
                label: "Published",
                value: String(publishedCount),
                tone: "gold",
                trend: WORK_TRENDS.published,
            },
        ],
        [active.length, needsReview.length, readyToPublish.length, publishedCount]
    );

    const studioItems: WorkspaceOperationalHealthItem[] = useMemo(
        () => [
            {
                key: "forms",
                label: "Forms",
                value: String(forms.length),
                tone: "midnight",
                trend: STUDIO_TRENDS.forms,
            },
            {
                key: "published",
                label: "Published",
                value: String(publishedCount),
                tone: "gold",
                trend: STUDIO_TRENDS.published,
            },
            {
                key: "draft",
                label: "Draft",
                value: String(draftCount),
                tone: "midnight",
                trend: STUDIO_TRENDS.draft,
            },
            {
                key: "generated",
                label: "Generated",
                value: String(generatedCount),
                tone: "pine",
                trend: STUDIO_TRENDS.generated,
            },
        ],
        [forms.length, publishedCount, draftCount, generatedCount]
    );

    const isWork = mode === "work";

    return (
        <WorkspaceOperationalHealth
            eyebrow={isWork ? "Today's activity" : "Studio health"}
            items={isWork ? workItems : studioItems}
            loading={loading}
            ariaLabel={isWork ? "Today's activity" : "Studio health"}
            className="w-full"
            data-testid={isWork ? "processing-work-mode-health-band" : "processing-studio-mode-health-band"}
        />
    );
}
