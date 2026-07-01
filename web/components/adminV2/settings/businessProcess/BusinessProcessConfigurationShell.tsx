"use client";

import type { ReactNode } from "react";
import BusinessProcessConfigurationNav from "@/components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav";
import { ConfigurationShell } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import type { BusinessProcessWorkspaceSection } from "@/lib/lifecycle/businessProcessUiLabels";

export default function BusinessProcessConfigurationShell({
    activeSection,
    onSelectSection,
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
            navColumn={
                <BusinessProcessConfigurationNav activeSection={activeSection} onSelect={onSelectSection} />
            }
            listColumn={listColumn}
        >
            {children}
        </ConfigurationShell>
    );
}
