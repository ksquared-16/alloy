"use client";

import type { ReactNode } from "react";
import { ConfigurationShell } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import type { BusinessProcessWorkspaceSection } from "@/lib/lifecycle/businessProcessUiLabels";

/**
 * Selected-Process workspace shell.
 * Section switching is owned by the Selected Process header tabs — this shell no longer
 * renders a duplicate Configure/Process/Health section queue on the left.
 * `listColumn` remains for nested collections (Stages / Work Views / Actions / Health).
 */
export default function BusinessProcessConfigurationShell({
    activeSection: _activeSection,
    onSelectSection: _onSelectSection,
    listColumn,
    children,
}: {
    activeSection: BusinessProcessWorkspaceSection;
    onSelectSection: (section: BusinessProcessWorkspaceSection) => void;
    listColumn?: ReactNode;
    children: ReactNode;
}) {
    return (
        <ConfigurationShell
            testId="business-process-configuration-shell"
            listColumnTestId="business-process-list-column"
            workspaceTestId="business-process-setup-workspace"
            listColumn={listColumn}
        >
            {children}
        </ConfigurationShell>
    );
}
