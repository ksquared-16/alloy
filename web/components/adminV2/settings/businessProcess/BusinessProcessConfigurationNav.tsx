"use client";

import {
    GitBranch,
    HeartPulse,
    Layers,
    LayoutGrid,
    Zap,
} from "lucide-react";
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

const SECTION_ICONS: Record<ConfigurationProcessQueueSection, typeof Layers> = {
    stages: Layers,
    "work-views": LayoutGrid,
    actions: Zap,
    automation: GitBranch,
    health: HeartPulse,
};

const SECTION_META: Record<ConfigurationProcessQueueSection, { label: string }> = {
    stages: { label: BUSINESS_PROCESS_NAV_STAGES },
    "work-views": { label: BUSINESS_PROCESS_NAV_WORK_VIEWS },
    actions: { label: BUSINESS_PROCESS_NAV_ACTIONS },
    automation: { label: BUSINESS_PROCESS_NAV_AUTOMATION },
    health: { label: BUSINESS_PROCESS_NAV_HEALTH },
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
            className="configuration-section-queue process-config-nav"
            aria-label="Process configuration"
            data-testid="business-process-workspace-nav"
        >
            {CONFIGURATION_PROCESS_QUEUE_GROUPS.map((group) => (
                <div key={group.label} className="mb-2 last:mb-0">
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                        {group.label}
                    </p>
                    <div className="space-y-0.5">
                        {group.sections.map((sectionId) => {
                            const section = SECTION_META[sectionId];
                            const Icon = SECTION_ICONS[sectionId];
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
                                    <Icon size={15} strokeWidth={1.75} className="shrink-0" aria-hidden />
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
