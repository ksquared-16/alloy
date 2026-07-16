"use client";

import type { ConfigAttentionItem } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Attention region — operational rows (problem → consequence → next).
 * Collapses when healthy.
 */
export function ConfigAttentionPanel({
    items,
    onResolve,
    compact = false,
    embedded = false,
    testId = "config-attention-panel",
}: {
    items: ConfigAttentionItem[];
    onResolve?: (item: ConfigAttentionItem) => void;
    compact?: boolean;
    embedded?: boolean;
    testId?: string;
}) {
    const actionable = items.filter((item) => item.grade !== "good");
    if (actionable.length === 0) return null;

    const list = (
        <ul className="divide-y divide-alloy-forge/10">
            {actionable.map((item) => {
                const nextLabel = item.nextLabel ?? "Continue";
                const body = (
                    <div className="flex items-start gap-2.5">
                        <span
                            className={`mt-0.5 ${item.grade === "fix" ? "text-amber-700" : "text-blue-700"}`}
                            aria-hidden="true"
                        >
                            {item.grade === "fix" ? "⚠" : "ⓘ"}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-alloy-midnight">{item.label}</p>
                            {item.consequence ?
                                <p className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/55">
                                    {item.consequence}
                                </p>
                            :   null}
                            {onResolve ?
                                <p className="mt-1.5 text-xs font-semibold text-[#007d68]">
                                    {nextLabel} →
                                </p>
                            :   null}
                        </div>
                    </div>
                );

                return (
                    <li key={item.key} className={compact ? "py-2 first:pt-0 last:pb-0" : "py-2.5 first:pt-0 last:pb-0"}>
                        {onResolve ?
                            <button
                                type="button"
                                className="-mx-1 w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left hover:bg-alloy-bend-pine/[0.04]"
                                onClick={() => onResolve(item)}
                            >
                                {body}
                            </button>
                        :   body}
                    </li>
                );
            })}
        </ul>
    );

    if (embedded) {
        return (
            <section className="min-w-0" data-testid={testId} data-config-surface="region">
                <h2 className="mb-2 text-[15px] font-semibold tracking-tight text-alloy-midnight">
                    Needs attention
                </h2>
                {list}
            </section>
        );
    }

    return (
        <ConfigWorkspaceCard title="Needs attention" compact={compact} testId={testId}>
            {list}
        </ConfigWorkspaceCard>
    );
}
