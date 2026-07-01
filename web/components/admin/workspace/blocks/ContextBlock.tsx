"use client";

import type { WorkspaceContextBlock } from "@/lib/workspace/types";

export function ContextBlock({
    block,
    presentation = "flat",
}: {
    block: WorkspaceContextBlock;
    presentation?: "flat" | "bridge";
}) {
    if (presentation === "bridge") {
        return (
            <section
                className="adminv2-ws-section-spacing rounded-[10px] border p-4 text-sm"
                data-workspace-block="context"
                style={{
                    borderColor: "color-mix(in srgb, var(--d-border) 88%, transparent)",
                    background: "color-mix(in srgb, var(--d-panel-quiet) 55%, transparent)",
                    color: "var(--d-muted)",
                }}
            >
                <h2 className="text-xs font-bold tracking-wide" style={{ color: "var(--d-text-primary)" }}>
                    {block.title ?? "Context"}
                </h2>
                <div className="mt-2 space-y-2 leading-relaxed">
                    {block.paragraphs.map((p, i) => (
                        <p key={i}>{p}</p>
                    ))}
                </div>
            </section>
        );
    }

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
