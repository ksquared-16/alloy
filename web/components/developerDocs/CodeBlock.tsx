"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * A code example, with the one affordance a developer reaches for.
 *
 * The copied string is the parsed block's value, which is the governed source verbatim — no
 * re-indentation, no smart quotes, no trailing-whitespace tidy. A copied example that has been
 * "helpfully" cleaned is an example that does not run.
 */
export function CodeBlock({ code, lang }: { code: string; lang: string | null }) {
    const [copied, setCopied] = useState(false);

    return (
        <div className="group relative my-3 overflow-hidden rounded-lg border border-alloy-forge/12 bg-[#0f1b28]" data-doc-block="code">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-white/45">
                    {lang ?? "text"}
                </span>
                <button
                    type="button"
                    data-testid="doc-code-copy"
                    aria-label="Copy code example"
                    className="inline-flex items-center gap-1 rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
                    onClick={() => {
                        void navigator.clipboard
                            ?.writeText(code)
                            .then(() => setCopied(true))
                            .catch(() => setCopied(false));
                    }}
                >
                    {copied ?
                        <><Check className="h-3 w-3" aria-hidden /> Copied</>
                    :   <><Copy className="h-3 w-3" aria-hidden /> Copy</>}
                </button>
            </div>
            <pre className="overflow-x-auto px-3 py-2.5 text-[12px] leading-[1.6] text-[#e6edf3]">
                <code>{code}</code>
            </pre>
        </div>
    );
}
