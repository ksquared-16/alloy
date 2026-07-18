"use client";

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
    ariaLabel,
    testId,
    testIdPrefix,
}: {
    tabs: readonly ConfigWorkspaceTab<Section>[];
    activeSection: Section;
    onSectionChange: (section: Section) => void;
    ariaLabel: string;
    testId?: string;
    testIdPrefix: string;
}) {
    return (
        <div
            className="mt-3.5 flex overflow-x-auto border-t border-alloy-stone/25"
            role="tablist"
            aria-label={ariaLabel}
            data-testid={testId}
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
    );
}
