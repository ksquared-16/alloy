"use client";

/**
 * Processing → Work mode metrics band.
 *
 * Data-only adapter: derives counts from already-loaded queue + form APIs and renders
 * the canonical `WorkspaceMetricTiles`. No layout or tile styling lives here.
 */

import { useEffect } from "react";
import WorkspaceMetricTiles, { type WorkspaceMetricTileItem } from "@/components/workspace/WorkspaceMetricTiles";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";
import { useProcessingFormApi } from "./useProcessingFormApi";

export default function ProcessingKpiStrip() {
    const { data, loading: queueLoading } = useProcessingQueueWarm();
    const { forms, listLoaded, loadForms } = useProcessingFormApi();

    useEffect(() => {
        if (!listLoaded) void loadForms();
    }, [listLoaded, loadForms]);

    const rows = data?.rows ?? [];
    const active = rows.filter((r) => r.status !== "completed" && r.status !== "archived");
    const ready = rows.filter((r) => r.status === "ready" || r.formDraftSummary?.generatedFormId);
    const loading = queueLoading || !listLoaded;

    const items: WorkspaceMetricTileItem[] = [
        { key: "active", label: "Active work", value: String(active.length), icon: "clipboard", accent: "midnight", status: "unknown" },
        { key: "ready", label: "Ready", value: String(ready.length), icon: "spark", accent: "pine", status: "healthy" },
        { key: "forms", label: "Forms", value: String(forms.length), icon: "layers", accent: "stone", status: "unknown" },
        {
            key: "published",
            label: "Published",
            value: String(forms.filter((f) => f.has_published_version).length),
            icon: "book",
            accent: "gold",
            status: "warning",
        },
    ];

    return (
        <WorkspaceMetricTiles
            eyebrow="Today's activity"
            items={items}
            size="md"
            align="start"
            loading={loading}
            ariaLabel="Today's activity"
            className="w-full"
            data-testid="processing-work-mode-kpi-band"
        />
    );
}