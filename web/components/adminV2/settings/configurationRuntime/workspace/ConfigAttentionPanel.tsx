"use client";

import type { ConfigAttentionItem } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import {
    ConfigurationInlineButton,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

/**
 * Attention region — operational rows (problem → consequence → next).
 * Collapses when healthy.
 */
export function ConfigAttentionPanel({
    items,
    onResolve,
    compact = false,
    embedded = false,
    actionAlign = "inline",
    testId = "config-attention-panel",
}: {
    items: ConfigAttentionItem[];
    onResolve?: (item: ConfigAttentionItem) => void;
    compact?: boolean;
    embedded?: boolean;
    /** `trailing` attaches the next step to the right of each issue. */
    actionAlign?: "inline" | "trailing";
    testId?: string;
}) {
    const actionable = items.filter((item) => item.grade !== "good");
    if (actionable.length === 0) return null;

    const list = (
        <ul className="divide-y divide-alloy-forge/10">
            {actionable.map((item) => {
                const nextLabel = item.nextLabel ?? "Continue";
                const icon = (
                    <span
                        className={`mt-0.5 shrink-0 ${item.grade === "fix" ? "text-amber-700" : "text-blue-700"}`}
                        aria-hidden="true"
                    >
                        {item.grade === "fix" ? "⚠" : "ⓘ"}
                    </span>
                );
                const copy = (
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-alloy-midnight">{item.label}</p>
                        {item.consequence ?
                            <p className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/55">
                                {item.consequence}
                            </p>
                        :   null}
                        {onResolve && actionAlign === "inline" ?
                            <ConfigurationInlineButton className="mt-1.5" onClick={() => onResolve(item)}>
                                {nextLabel} →
                            </ConfigurationInlineButton>
                        :   null}
                    </div>
                );
                const trailing =
                    onResolve && actionAlign === "trailing" ?
                        <ConfigurationSecondaryButton
                            className="shrink-0 self-center px-2.5 py-1 text-[11px] font-semibold"
                            onClick={() => onResolve(item)}
                        >
                            {nextLabel} →
                        </ConfigurationSecondaryButton>
                    :   null;

                const body = (
                    <div className="flex items-start gap-2.5">
                        {icon}
                        {copy}
                        {trailing}
                    </div>
                );

                return (
                    <li key={item.key} className={compact ? "py-2.5 first:pt-0 last:pb-0" : "py-3 first:pt-0 last:pb-0"}>
                        {body}
                    </li>
                );
            })}
        </ul>
    );

    if (embedded) {
        return (
            <section className="min-w-0" data-testid={testId} data-config-surface="region">
                <h2 className="mb-2.5 text-[15px] font-semibold tracking-tight text-alloy-midnight">
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
