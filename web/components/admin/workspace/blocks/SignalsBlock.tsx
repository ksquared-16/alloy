"use client";

import type { WorkspaceRuntimeData, WorkspaceSignalsBlock } from "@/lib/workspace/types";

export function SignalsBlock({
    block,
    runtime,
}: {
    block: WorkspaceSignalsBlock;
    runtime: WorkspaceRuntimeData;
}) {
    return (
        <section className="rounded-xl border border-admin-border bg-white p-5 shadow-sm" data-workspace-block="signals">
            <h2 className="text-sm font-semibold text-alloy-midnight">{block.title ?? "Signals"}</h2>
            {block.subtitle ? <p className="text-xs text-alloy-midnight/60 mt-1">{block.subtitle}</p> : null}
            <ul className="mt-3 space-y-2">
                {block.signals.map((s) => {
                    const v = runtime.metrics[s.metric];
                    return (
                        <li key={s.id} className="text-sm text-alloy-forge/90 flex justify-between gap-4">
                            <span>{s.label}</span>
                            <span className="font-medium text-alloy-midnight tabular-nums">{v === null || v === undefined ? "—" : v}</span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
