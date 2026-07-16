"use client";

import type { ConfigAttentionItem } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Attention region — collapses when healthy.
 * Standalone → white panel on stone. Embedded → nested region inside a panel.
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
