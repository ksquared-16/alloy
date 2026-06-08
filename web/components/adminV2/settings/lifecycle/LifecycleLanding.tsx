"use client";

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

export default function LifecycleLanding({
    savedLifecycles,
    onStartNew,
    onOpenExisting,
}: {
    savedLifecycles: LifecycleBuilderProcessRecord[];
    onStartNew: () => void;
    onOpenExisting: (processId: string) => void;
}) {
    return (
        <section
            className="mx-auto max-w-lg space-y-4 rounded-xl border border-alloy-forge/12 bg-white/90 p-6 shadow-sm"
            data-testid="lifecycle-landing"
        >
            <div>
                <h2 className="text-base font-semibold text-alloy-midnight">Build a process</h2>
                <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/60">
                    Start from scratch or open a lifecycle you have already configured.
                </p>
            </div>

            <button
                type="button"
                className="w-full rounded-md bg-alloy-pine px-4 py-2.5 text-sm font-medium text-white"
                onClick={onStartNew}
                data-testid="lifecycle-start-new"
            >
                Start new lifecycle
            </button>

            {savedLifecycles.length ? (
                <div className="space-y-2" data-testid="lifecycle-open-existing">
                    <p className="text-xs font-medium text-alloy-midnight/70">Open existing lifecycle</p>
                    <ul className="divide-y divide-alloy-forge/10 rounded-md border border-alloy-forge/12">
                        {savedLifecycles.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-alloy-stone/10"
                                    onClick={() => onOpenExisting(p.id)}
                                    data-testid={`lifecycle-open-${p.key}`}
                                >
                                    <span className="font-medium text-alloy-midnight">{p.name}</span>
                                    <span className="text-xs text-alloy-midnight/50">
                                        {p.stages.filter((s) => s.is_active).length} stage
                                        {p.stages.filter((s) => s.is_active).length === 1 ? "" : "s"}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}
