"use client";

import type { ConfigOperationalAction } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

const PRIORITY_ORDER: ConfigOperationalAction["priority"][] = ["fix", "next", "manage"];

const PRIORITY_LABEL: Record<ConfigOperationalAction["priority"], string> = {
    fix: "Fix now",
    next: "Do next",
    manage: "Manage",
};

/**
 * Operational action model — frequency and consequence ranked, not a button soup.
 * Domains supply actions; this primitive only groups and presents them.
 */
export function ConfigOperationalActions({
    actions,
    onSelect,
    testId = "config-operational-actions",
}: {
    actions: ConfigOperationalAction[];
    onSelect: (action: ConfigOperationalAction) => void;
    testId?: string;
}) {
    const grouped = PRIORITY_ORDER.map((priority) => ({
        priority,
        items: actions.filter((action) => action.priority === priority),
    })).filter((group) => group.items.length > 0);

    if (grouped.length === 0) {
        return (
            <ConfigWorkspaceCard title="Actions" compact testId={testId}>
                <p className="config-typo-sublabel">Nothing needs action right now.</p>
            </ConfigWorkspaceCard>
        );
    }

    return (
        <ConfigWorkspaceCard title="Actions" compact testId={testId}>
            <div className="space-y-3">
                {grouped.map((group) => (
                    <div key={group.priority}>
                        <p className="config-typo-meta mb-1 uppercase tracking-[0.14em]">
                            {PRIORITY_LABEL[group.priority]}
                        </p>
                        <ul className="space-y-0.5">
                            {group.items.map((action) => (
                                <li key={action.id}>
                                    <button
                                        type="button"
                                        disabled={action.disabled}
                                        className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[#00a283]/5 disabled:opacity-40"
                                        onClick={() => onSelect(action)}
                                        data-testid={`${testId}-${action.id}`}
                                    >
                                        <span className="block text-xs font-semibold text-[#007d68]">
                                            {action.label} →
                                        </span>
                                        {action.reason ?
                                            <span className="config-typo-sublabel mt-0.5 block">
                                                {action.reason}
                                            </span>
                                        :   null}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </ConfigWorkspaceCard>
    );
}
