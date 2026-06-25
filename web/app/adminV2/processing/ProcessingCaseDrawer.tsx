"use client";

/**
 * POS-FP4/FP-W — standalone Processing Case detail drawer (deep-link page surface).
 *
 * Thin fixed-panel wrapper around the shared `ProcessingCaseDetailContent` so the
 * standalone `/admin/processing/:caseId` deep link keeps working unchanged, while
 * the converged Processing modal reuses the same content in its middle column.
 */

import ProcessingCaseDetailContent from "@/app/adminV2/processing/ProcessingCaseDetailContent";

export default function ProcessingCaseDrawer({ caseId, onClose }: { caseId: string; onClose: () => void }) {
    return (
        <div
            role="dialog"
            aria-label="Processing case detail"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-xl"
        >
            <div className="flex shrink-0 items-center justify-end border-b border-stone-100 p-2">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="rounded p-1 text-stone-400 hover:bg-stone-100"
                >
                    ✕
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <ProcessingCaseDetailContent caseId={caseId} />
            </div>
        </div>
    );
}
