"use client";

import type { WorkspaceRuntimeData, WorkspaceSignalsBlock } from "@/lib/workspace/types";

export function SignalsBlock({
    block,
    runtime,
    presentation = "flat",
}: {
    block: WorkspaceSignalsBlock;
    runtime: WorkspaceRuntimeData;
    presentation?: "flat" | "bridge";
}) {
    if (presentation === "bridge") {
        return (
            <div data-workspace-block="signals">
                <div className="adminv2-ws-signal-strip adminv2-ws-band-signals">
                    <div className="adminv2-ws-signal-cards">
                        {block.signals.map((s) => {
                            const v = runtime.metrics[s.metric];
                            const display = v === null || v === undefined ? "—" : String(v);
                            return (
                                <div key={s.id} className="adminv2-ws-signal-card" data-severity="info">
                                    <div className="adminv2-ws-signal-card-row">
                                        <div className="adminv2-ws-signal-card-main">
                                            {s.eyebrow ? (
                                                <div className="adminv2-ws-signal-label">{s.eyebrow}</div>
                                            ) : null}
                                            <div className="adminv2-ws-signal-title">{s.label}</div>
                                        </div>
                                        <div className="adminv2-ws-signal-actions">
                                            <span
                                                className="tabular-nums font-semibold"
                                                style={{ fontSize: 18, color: "var(--d-text-primary)" }}
                                            >
                                                {display}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <section className="rounded-xl border border-admin-border bg-white p-5 shadow-sm" data-workspace-block="signals">
            <h2 className="text-sm font-semibold text-alloy-midnight">{block.title ?? "Signals"}</h2>
            {block.subtitle ? <p className="text-xs text-alloy-midnight/60 mt-1">{block.subtitle}</p> : null}
            <ul className="mt-3 space-y-2">
                {block.signals.map((s) => {
                    const v = runtime.metrics[s.metric];
                    return (
                        <li key={s.id} className="text-sm text-alloy-forge/90 flex justify-between gap-4">
                            <span>
                                {s.eyebrow ? (
                                    <span className="block text-[10px] font-semibold text-alloy-midnight/45">{s.eyebrow}</span>
                                ) : null}
                                {s.label}
                            </span>
                            <span className="font-medium text-alloy-midnight tabular-nums">{v === null || v === undefined ? "—" : v}</span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
