"use client";

/**
 * Visible layout-runtime queue-row error card — shown INSTEAD of the legacy VM
 * queue card when the layout runtime is in hard cutover and a row's published
 * LayoutDoc cannot render. No silent fallback to the old card.
 */

const STAGING_DEBUG = process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG === "1";

export default function LayoutRuntimeQueueRowErrorCard({
    reason,
    queueRowKey,
}: {
    reason?: string | null;
    queueRowKey?: string;
}) {
    return (
        <div
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
            role="alert"
            data-layout-runtime-queue-row-error="true"
            data-layout-runtime-queue-row-reason={reason ?? ""}
        >
            <span className="font-semibold">Layout row couldn’t render</span>
            <span className="text-amber-900">— configured in Settings → Surfaces; legacy card not shown.</span>
            {STAGING_DEBUG && reason ? <code className="ml-auto font-mono text-[11px]">{reason}{queueRowKey ? ` · ${queueRowKey}` : ""}</code> : null}
        </div>
    );
}
