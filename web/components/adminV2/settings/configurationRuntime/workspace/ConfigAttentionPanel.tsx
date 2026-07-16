"use client";

import type { ConfigAttentionItem } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Attention region — no floating card. Collapses entirely when healthy.
 */
export function ConfigAttentionPanel({
    items,
    onResolve,
    compact = false,
    testId = "config-attention-panel",
}: {
    items: ConfigAttentionItem[];
    onResolve?: (item: ConfigAttentionItem) => void;
    compact?: boolean;
    testId?: string;
}) {
    const actionable = items.filter((item) => item.grade !== "good");
    if (actionable.length === 0) return null;

    return (
        <section
            className={compact ? "min-w-0" : "border-t border-alloy-stone/25 pt-3"}
            data-testid={testId}
            data-config-surface="region"
        >
            <h2 className="config-typo-workspace-title mb-1.5">Needs attention</h2>
            <ul className="divide-y divide-alloy-stone/20">
                {actionable.map((item) => (
                    <li
                        key={item.key}
                        className={`flex items-center gap-2.5 ${compact ? "py-1.5" : "py-2"} first:pt-0 last:pb-0`}
                    >
                        <span
                            className={item.grade === "fix" ? "text-amber-700" : "text-blue-700"}
                            aria-hidden="true"
                        >
                            {item.grade === "fix" ? "⚠" : "ⓘ"}
                        </span>
                        <span className="min-w-0 flex-1 text-sm text-alloy-midnight/80">{item.label}</span>
                        {onResolve ?
                            <button
                                type="button"
                                className="shrink-0 text-xs font-semibold text-[#007d68]"
                                onClick={() => onResolve(item)}
                            >
                                Resolve
                            </button>
                        :   null}
                    </li>
                ))}
            </ul>
        </section>
    );
}
