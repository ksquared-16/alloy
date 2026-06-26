"use client";

import type { ReactNode } from "react";
import BusinessProcessConfigurationNav from "@/components/adminV2/settings/businessProcess/BusinessProcessConfigurationNav";
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
        <div className="process-config-shell" data-testid="business-process-configuration-shell">
            <BusinessProcessConfigurationNav activeSection={activeSection} onSelect={onSelectSection} />
            {listColumn ?
                <aside className="process-config-list-column" data-testid="business-process-list-column">
                    {listColumn}
                </aside>
            :   null}
            <div className="process-config-setup-workspace" data-testid="business-process-setup-workspace">
                {children}
            </div>
        </div>
    );
}
