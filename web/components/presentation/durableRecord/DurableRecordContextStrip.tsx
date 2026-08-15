"use client";

/**
 * THE CONTEXT STRIP — which business context of this record the operator is looking at.
 *
 * It appears only when there is a CHOICE. One context is not a decision, and a strip with a single
 * chip in it is furniture that teaches the operator to ignore the strip.
 *
 * ── THE ORDER IS NOT A DOMAIN PRECEDENCE ──
 *
 * Options arrive in the shared projection's own order (process-first, then schedule, then
 * employment) and are rendered in it. Nothing here promotes Enrollment over Assignment or knows
 * that either exists: a childcare-specific ranking encoded in a platform strip would apply to every
 * product built on Alloy. Which one is SELECTED first is the entry's business — Search carries what
 * the query named, Roster names the context its own product is about — and it arrives resolved.
 */

import type { DurableRecordContextOption } from "@/lib/context/durableRecordContextOptions";

export default function DurableRecordContextStrip({
    options,
    selectedKey,
    onSelect,
}: {
    options: readonly DurableRecordContextOption[];
    selectedKey: string | null;
    onSelect: (key: string) => void;
}) {
    if (options.length < 2) return null;

    return (
        <div
            className="flex flex-wrap items-center gap-1.5 border-b border-alloy-stone/15 px-3 py-2"
            role="tablist"
            aria-label="Record contexts"
            data-durable-record-contexts="true"
        >
            {options.map((option) => {
                const active = option.key === selectedKey;
                return (
                    <button
                        key={option.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onSelect(option.key)}
                        data-durable-record-context={option.key}
                        data-durable-record-context-active={active ? "true" : "false"}
                        // Whether this context can resolve a configured surface is exposed rather
                        // than hidden: it is why the body below differs between them.
                        data-durable-record-context-configured={
                            option.resolvesConfiguredSurface ? "true" : "false"
                        }
                        className={[
                            "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                            active
                                ? "bg-alloy-juniper/[0.12] text-alloy-juniper"
                                : "text-alloy-midnight/65 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight",
                        ].join(" ")}
                        title={option.detail ?? undefined}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
