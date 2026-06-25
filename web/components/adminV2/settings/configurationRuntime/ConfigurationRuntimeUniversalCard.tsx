/**
 * Configuration Runtime Concept A — Settings-tier Universal Card shell.
 * @see docs/sprints/06_2026/configuration_runtime_concept_a_freeze.md
 */

import { useState, type ReactNode } from "react";

export type ConfigurationRuntimeUniversalCardProps = {
    id: string;
    title: string;
    /** One operational question this card answers. */
    question?: string;
    summary?: string;
    insightChips?: string[];
    defaultOpen?: boolean;
    lazyMount?: boolean;
    dirty?: boolean;
    span?: "default" | "full";
    children: ReactNode;
};

export default function ConfigurationRuntimeUniversalCard({
    id,
    title,
    question,
    summary,
    insightChips,
    defaultOpen = false,
    lazyMount,
    dirty = false,
    span = "default",
    children,
}: ConfigurationRuntimeUniversalCardProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <details
            className={`group rounded-[10px] border border-alloy-forge/12 bg-white shadow-sm ${
                span === "full" ? "lg:col-span-2" : ""
            } ${dirty ? "ring-1 ring-amber-200/80" : ""}`}
            data-testid={`configuration-runtime-card-${id}`}
            open={open}
            onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
            <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-alloy-midnight">{title}</h4>
                            {dirty ?
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                                    Unsaved
                                </span>
                            :   null}
                        </div>
                        {question ?
                            <p className="mt-0.5 text-[11px] font-medium text-alloy-pine/90">{question}</p>
                        :   null}
                        {summary ?
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/55">{summary}</p>
                        :   null}
                        {insightChips?.length ?
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {insightChips.map((chip) => (
                                    <span
                                        key={chip}
                                        className="rounded-full border border-alloy-forge/10 bg-alloy-stone/[0.04] px-2 py-0.5 text-[10px] text-alloy-midnight/60"
                                    >
                                        {chip}
                                    </span>
                                ))}
                            </div>
                        :   null}
                    </div>
                    <span className="shrink-0 text-[10px] text-alloy-midnight/40 group-open:rotate-90">›</span>
                </div>
            </summary>
            <div className="border-t border-alloy-forge/8 px-4 py-3">
                {!lazyMount || open ? children : null}
            </div>
        </details>
    );
}
