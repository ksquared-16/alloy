"use client";

import type { ReactNode } from "react";
import type { ConfigurationDetailSection } from "@/lib/configPublication/runtimeModel";
import {
    ConfigWorkspaceTabBar,
    type ConfigWorkspaceTab,
} from "@/components/adminV2/settings/configurationRuntime/workspace/ConfigWorkspaceTabBar";

export type ConfigDetailTab<Section extends string = ConfigurationDetailSection> = ConfigWorkspaceTab<Section>;

/**
 * Publishable Configuration Detail Runtime.
 * Owns read-first section navigation; domains supply payload-specific content.
 */
export function ConfigDetailRuntime<Section extends string = ConfigurationDetailSection>({
    header,
    consequence,
    tabs,
    activeSection,
    onSectionChange,
    children,
    testId = "config-detail-runtime",
    headerTestId,
    tabAriaLabel = "Configuration details",
    tabTestIdPrefix,
}: {
    header: ReactNode;
    consequence?: ReactNode;
    tabs: readonly ConfigDetailTab<Section>[];
    activeSection: Section;
    onSectionChange: (section: Section) => void;
    children: ReactNode;
    testId?: string;
    headerTestId?: string;
    tabAriaLabel?: string;
    tabTestIdPrefix?: string;
}) {
    return (
        <div className="min-w-0 space-y-3" data-testid={testId}>
            <section
                className="process-config-setup-card px-5 pb-0 pt-4"
                data-testid={headerTestId}
            >
                {header}
                {consequence ?
                    <div className="mt-3">{consequence}</div>
                :   null}
                <ConfigWorkspaceTabBar
                    tabs={tabs}
                    activeSection={activeSection}
                    onSectionChange={onSectionChange}
                    ariaLabel={tabAriaLabel}
                    testId={`${testId}-tabs`}
                    testIdPrefix={tabTestIdPrefix ?? `${testId}-tab`}
                />
            </section>
            <div role="tabpanel" data-testid={`${testId}-${activeSection}`}>
                {children}
            </div>
        </div>
    );
}
