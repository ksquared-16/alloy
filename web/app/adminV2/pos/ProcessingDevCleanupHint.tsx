"use client";

/** Dev/local hint for cleaning test imports — never shown in production. */
export default function ProcessingDevCleanupHint() {
    if (process.env.NODE_ENV === "production") return null;

    return (
        <div className="shrink-0 border-t border-amber-200/60 bg-amber-50/80 px-4 py-2 text-[10px] text-amber-900">
            <span className="font-semibold">Dev cleanup:</span> Remove MO500/E2E test artifacts with dry-run first —{" "}
            <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-[9px]">
                cd web && ORG_ID=&lt;uuid&gt; npm run dev:clean:processing-composer-e2e
            </code>
            {" · "}
            append <code className="font-mono text-[9px]">PROCESSING_COMPOSER_E2E_CLEANUP_APPLY=1</code> to apply.
        </div>
    );
}
