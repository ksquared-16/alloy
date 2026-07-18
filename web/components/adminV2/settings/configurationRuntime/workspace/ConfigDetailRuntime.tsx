"use client";

import type { ReactNode } from "react";
import type { ConfigurationDetailSection } from "@/lib/configPublication/runtimeModel";

export type ConfigDetailTab<Section extends string = ConfigurationDetailSection> = {
    key: Section;
    label: string;
    attentionCount?: number;
};

/**
 * Publishable Configuration Detail Runtime.
 * Owns read-first section navigation; domains supply payload-specific content.
 */
export function ConfigDetailRuntime<Section extends string = ConfigurationDetailSection>({
    header,
    consequence,
    tabs,
    navigation,
    activeSection,
    onSectionChange,
    children,
    testId = "config-detail-runtime",
}: {
    header: ReactNode;
    consequence?: ReactNode;
    tabs: ConfigDetailTab<Section>[];
    navigation?: ReactNode;
    activeSection: Section;
    onSectionChange: (section: Section) => void;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <div className="min-w-0 space-y-3" data-testid={testId}>
            <section className="process-config-setup-card px-5 pb-0 pt-4">
                {header}
                {consequence ?
                    <div className="mt-3">{consequence}</div>
                :   null}
                {navigation ?? (
                    <div
                        className="mt-3.5 flex overflow-x-auto border-t border-alloy-stone/25"
                        role="tablist"
                        aria-label="Configuration details"
                        data-testid={`${testId}-tabs`}
                    >
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                role="tab"
                                aria-selected={activeSection === tab.key}
                                className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold ${
                                    activeSection === tab.key ?
                                        "border-[#00a283] text-[#007d68]"
                                    :   "border-transparent text-alloy-midnight/50 hover:text-alloy-midnight/75"
                                }`}
                                onClick={() => onSectionChange(tab.key)}
                                data-testid={`${testId}-tab-${tab.key}`}
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
                )}
            </section>
            <div role="tabpanel" data-testid={`${testId}-${activeSection}`}>
                {children}
            </div>
        </div>
    );
}
