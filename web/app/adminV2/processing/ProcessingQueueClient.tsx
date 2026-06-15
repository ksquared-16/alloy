"use client";

/**
 * POS-FP3/FP4/FP-W — standalone Processing page surface (deep-link host).
 *
 * Kept so existing `/admin/processing` and `/admin/processing/:caseId` deep links
 * keep working unchanged. Reuses the shared `ProcessingQueueList` + drawer. The
 * converged, context-preserving experience is the Processing modal (Communications
 * doctrine); this page remains the deep-link surface. Read-only.
 */

import { useCallback, useState } from "react";
import ProcessingQueueList from "@/app/adminV2/processing/ProcessingQueueList";
import ProcessingCaseDrawer from "@/app/adminV2/processing/ProcessingCaseDrawer";
import {
    closeProcessingCaseDrawerUrl,
    openProcessingCaseDrawerUrl,
} from "@/lib/pos/processingCase/processingDrawerUrl";

export default function ProcessingQueueClient({ initialCaseId }: { initialCaseId?: string }) {
    // Deep-link / refresh restore comes from the route param (server-known) — no
    // window read, no setState-in-effect, no hydration mismatch.
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(initialCaseId ?? null);

    const openCase = useCallback((caseId: string) => {
        setSelectedCaseId(caseId);
        openProcessingCaseDrawerUrl(caseId);
    }, []);

    const closeCase = useCallback(() => {
        setSelectedCaseId(null);
        closeProcessingCaseDrawerUrl();
    }, []);

    return (
        <div className="w-full">
            <header className="mb-4">
                <h1 className="text-xl font-medium text-stone-900">Processing</h1>
                <p className="text-sm text-stone-500">What needs your attention.</p>
            </header>
            <ProcessingQueueList selectedCaseId={selectedCaseId} onSelectCase={openCase} />
            {selectedCaseId ? <ProcessingCaseDrawer caseId={selectedCaseId} onClose={closeCase} /> : null}
        </div>
    );
}
