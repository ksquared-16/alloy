"use client";

import {
    BUSINESS_PROCESS_NAV_ACTIONS,
    BUSINESS_PROCESS_NAV_AUTOMATION,
    BUSINESS_PROCESS_NAV_HEALTH,
    BUSINESS_PROCESS_NAV_PRESENTATION,
    BUSINESS_PROCESS_NAV_STAGES,
    BUSINESS_PROCESS_NAV_WORK_VIEWS,
    type BusinessProcessWorkspaceSection,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { ConfigRuntimeNavCard } from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimePrimitives";

const SECTIONS: ReadonlyArray<{
    id: BusinessProcessWorkspaceSection;
    label: string;
    description: string;
    icon: string;
}> = [
    { id: "stages", label: BUSINESS_PROCESS_NAV_STAGES, description: "Status membership, requirements, operating plan", icon: "◎" },
    { id: "work-views", label: BUSINESS_PROCESS_NAV_WORK_VIEWS, description: "Process-level operational lenses", icon: "◆" },
    { id: "presentation", label: BUSINESS_PROCESS_NAV_PRESENTATION, description: "Queue and Focus Panel assignments", icon: "▦" },
    { id: "actions", label: BUSINESS_PROCESS_NAV_ACTIONS, description: "Process commands matrix", icon: "⚡" },
    { id: "automation", label: BUSINESS_PROCESS_NAV_AUTOMATION, description: "Workflow entry points", icon: "↻" },
    { id: "health", label: BUSINESS_PROCESS_NAV_HEALTH, description: "Ready check and configuration health", icon: "✓" },
];

export default function BusinessProcessWorkspaceNav({
    activeSection,
    onSelect,
}: {
    activeSection: BusinessProcessWorkspaceSection;
    onSelect: (section: BusinessProcessWorkspaceSection) => void;
}) {
    return (
        <nav
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Business process configuration"
            data-testid="business-process-workspace-nav"
        >
            {SECTIONS.map((section) => {
                const active = section.id === activeSection;
                return (
                    <div key={section.id} className="relative">
                        <div className="pointer-events-none absolute left-4 top-4 text-sm text-alloy-pine/70" aria-hidden>
                            {section.icon}
                        </div>
                        <div className="pl-7">
                            <ConfigRuntimeNavCard
                                active={active}
                                title={section.label}
                                description={section.description}
                                onClick={() => onSelect(section.id)}
                                testId={`business-process-nav-${section.id}`}
                            />
                        </div>
                    </div>
                );
            })}
        </nav>
    );
}
