"use client";

import type { ReactNode } from "react";

export type ConfigWorkspaceTab<Section extends string> = {
    key: Section;
    label: string;
    attentionCount?: number;
};

/**
 * Canonical Configuration Runtime concern navigation.
 * Locations defines the composition; every object workspace reuses it.
 */
export function ConfigWorkspaceTabBar<Section extends string>({
    tabs,
    activeSection,
    onSectionChange,
    onSectionIntent,
    ariaLabel,
    testId,
    testIdPrefix,
    trailing,
}: {
    tabs: readonly ConfigWorkspaceTab<Section>[];
    activeSection: Section;
    onSectionChange: (section: Section) => void;
    /** Advisory prefetch / warm hint — never authoritative navigation. */
    onSectionIntent?: (section: Section) => void;
    ariaLabel: string;
    testId?: string;
    testIdPrefix: string;
    /** Optional actions aligned with the tab row (e.g. Save / Publish). */
    trailing?: ReactNode;
}) {
    return (
        <div
            className="mt-3.5 flex items-end gap-2 border-t border-alloy-stone/25"
            data-testid={testId}
        >
            <div
                className="flex min-w-0 flex-1 overflow-x-auto"
                role="tablist"
                aria-label={ariaLabel}
            >
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={activeSection === tab.key}
                        className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold ${
                            activeSection === tab.key
                                ? "border-[#00a283] text-[#007d68]"
                                : "border-transparent text-alloy-midnight/50 hover:text-alloy-midnight/75"
                        }`}
                        onClick={() => onSectionChange(tab.key)}
                        onMouseEnter={() => onSectionIntent?.(tab.key)}
                        onFocus={() => onSectionIntent?.(tab.key)}
                        data-testid={`${testIdPrefix}-${tab.key}`}
                    >
                        {tab.label}
                        {tab.attentionCount && tab.attentionCount > 0 ?
                            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-alloy-ember/10 px-1 text-[10px] text-alloy-ember">
                                {tab.attentionCount}
                            </span>
                        :   null}
                    </button>
                ))}
            </div>
            {trailing}
        </div>
    );
}
