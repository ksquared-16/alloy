"use client";

import { useEffect, useState } from "react";
import OpportunityDrawerLayoutVisualEditor from "@/components/adminV2/settings/OpportunityDrawerLayoutVisualEditor";
import QueueRecordLayoutVisualEditor from "@/components/adminV2/settings/QueueRecordLayoutVisualEditor";
import { fetchEntityLayoutRecord } from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";

type Props = {
    layoutId: string;
    basePath: string;
    onBack: () => void;
    onLayoutIdChange: (layoutId: string) => void;
};

export default function LayoutVisualEditorRouter({ layoutId, basePath, onBack, onLayoutIdChange }: Props) {
    const [surface, setSurface] = useState<"queue" | "drawer" | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setSurface(null);
        setError(null);
        void (async () => {
            try {
                const rec = await fetchEntityLayoutRecord(layoutId);
                const parsed = parseLayoutDoc(rec.doc, { inferSurfaceKey: true });
                if (!parsed.ok || !parsed.doc) {
                    throw new Error(parsed.errors.join("; ") || "Invalid layout document");
                }
                if (!cancelled) {
                    setSurface(parsed.doc.surface === "queue" ? "queue" : "drawer");
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [layoutId]);

    if (error) {
        return (
            <div className="space-y-3 p-4" data-testid="layout-visual-editor-router-error">
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
                <button type="button" onClick={onBack} className="text-xs font-medium text-alloy-pine hover:underline">
                    ← Back to surface gallery
                </button>
            </div>
        );
    }

    if (surface == null) {
        return (
            <div
                className="rounded-xl border border-alloy-forge/12 bg-white/90 p-6 text-sm text-alloy-midnight/55"
                data-testid="layout-visual-editor-router-loading"
            >
                Loading layout editor…
            </div>
        );
    }

    if (surface === "queue") {
        return (
            <QueueRecordLayoutVisualEditor
                layoutId={layoutId}
                basePath={basePath}
                onBack={onBack}
                onLayoutIdChange={onLayoutIdChange}
            />
        );
    }

    return (
        <OpportunityDrawerLayoutVisualEditor
            layoutId={layoutId}
            basePath={basePath}
            onBack={onBack}
            onLayoutIdChange={onLayoutIdChange}
        />
    );
}
