"use client";

/**
 * Visible layout-runtime error panel — shown INSTEAD of the legacy VM body when
 * the layout runtime is in hard cutover and a published LayoutDoc cannot render
 * (fetch failed, timed out, render threw, or no production-supported items).
 *
 * Hard cutover means there is no silent VM fallback: the operator sees a clear
 * error surface (not the old drawer) so the failure is obvious and actionable.
 * Full diagnostic detail is gated behind the staging-debug flag.
 */

const STAGING_DEBUG = process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG === "1";

export default function LayoutRuntimeErrorPanel({
    surface,
    reason,
    layoutSource,
    layoutKey,
    detail,
}: {
    surface: string;
    reason?: string | null;
    layoutSource?: string | null;
    layoutKey?: string | null;
    detail?: Record<string, unknown>;
}) {
    return (
        <div
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="alert"
            data-layout-runtime-error-panel="true"
            data-layout-runtime-surface={surface}
            data-layout-runtime-error-reason={reason ?? ""}
        >
            <div className="font-semibold">Layout couldn’t render</div>
            <p className="mt-1 text-[13px] leading-snug">
                This view is configured in <span className="font-medium">Configuration → Surfaces</span>, but the published
                surface could not be displayed for this record. The legacy view is intentionally not shown.
                {reason ? <span className="mt-1 block text-[12px] text-amber-900">Reason: <code className="font-mono">{reason}</code></span> : null}
            </p>
            {STAGING_DEBUG ?
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-amber-100/70 p-2 text-[11px] leading-tight text-amber-950">
                    {JSON.stringify({ surface, reason, layoutSource, layoutKey, ...detail }, null, 2)}
                </pre>
            :   null}
        </div>
    );
}
