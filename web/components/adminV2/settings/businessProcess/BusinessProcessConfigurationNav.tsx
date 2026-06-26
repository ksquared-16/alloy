"use client";

import {
    BUSINESS_PROCESS_NAV_ACTIONS,
    BUSINESS_PROCESS_NAV_AUTOMATION,
    BUSINESS_PROCESS_NAV_HEALTH,
    BUSINESS_PROCESS_NAV_STAGES,
    BUSINESS_PROCESS_NAV_WORK_VIEWS,
    type BusinessProcessWorkspaceSection,
} from "@/lib/lifecycle/businessProcessUiLabels";
import {
    CONFIGURATION_PROCESS_QUEUE_GROUPS,
    type ConfigurationProcessQueueSection,
} from "@/lib/adminV2/configurationModeDoctrine";

const SECTION_META: Record<ConfigurationProcessQueueSection, { label: string; icon: string }> = {
    stages: { label: BUSINESS_PROCESS_NAV_STAGES, icon: "◎" },
    "work-views": { label: BUSINESS_PROCESS_NAV_WORK_VIEWS, icon: "◆" },
    actions: { label: BUSINESS_PROCESS_NAV_ACTIONS, icon: "⚡" },
    automation: { label: BUSINESS_PROCESS_NAV_AUTOMATION, icon: "↻" },
    health: { label: BUSINESS_PROCESS_NAV_HEALTH, icon: "✓" },
};

export default function BusinessProcessConfigurationNav({
    activeSection,
    onSelect,
}: {
    activeSection: BusinessProcessWorkspaceSection;
    onSelect: (section: BusinessProcessWorkspaceSection) => void;
}) {
    return (
        <nav
            className="process-config-nav"
            aria-label="Process configuration"
            data-testid="business-process-workspace-nav"
        >
            {CONFIGURATION_PROCESS_QUEUE_GROUPS.map((group) => (
                <div key={group.label} className="mb-3 last:mb-0">
                    <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                        {group.label}
                    </p>
                    <div className="space-y-0.5">
                        {group.sections.map((sectionId) => {
                            const section = SECTION_META[sectionId];
                            const active = sectionId === activeSection;
                            return (
                                <button
                                    key={sectionId}
                                    type="button"
                                    onClick={() => onSelect(sectionId as BusinessProcessWorkspaceSection)}
                                    className={`process-config-nav-item ${active ? "process-config-nav-item--active" : "text-alloy-midnight/75"}`}
                                    data-testid={`business-process-nav-${sectionId}`}
                                    aria-current={active ? "page" : undefined}
                                >
                                    <span className="text-sm" aria-hidden>
                                        {section.icon}
                                    </span>
                                    <span className={`text-sm font-semibold ${active ? "text-alloy-pine" : ""}`}>
                                        {section.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </nav>
    );
}
