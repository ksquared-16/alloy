"use client";

import type { WorkspaceContextBlock } from "@/lib/workspace/types";

export function ContextBlock({ block }: { block: WorkspaceContextBlock }) {
    return (
        <section
            className="rounded-xl border border-admin-border bg-alloy-stone/10 p-5 text-sm text-alloy-midnight/80"
            data-workspace-block="context"
        >
            <h2 className="text-sm font-semibold text-alloy-midnight">{block.title ?? "Context"}</h2>
            <div className="mt-2 space-y-2">
                {block.paragraphs.map((p, i) => (
                    <p key={i} className="text-alloy-midnight/75 leading-relaxed">
                        {p}
                    </p>
                ))}
            </div>
        </section>
    );
}
