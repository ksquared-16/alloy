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

const SECTIONS: ReadonlyArray<{
    id: BusinessProcessWorkspaceSection;
    label: string;
    description: string;
}> = [
    { id: "stages", label: BUSINESS_PROCESS_NAV_STAGES, description: "Status membership, requirements, operating plan" },
    { id: "work-views", label: BUSINESS_PROCESS_NAV_WORK_VIEWS, description: "Process-level operational lenses" },
    { id: "presentation", label: BUSINESS_PROCESS_NAV_PRESENTATION, description: "Queue and Focus Panel assignments" },
    { id: "actions", label: BUSINESS_PROCESS_NAV_ACTIONS, description: "Process actions matrix" },
    { id: "automation", label: BUSINESS_PROCESS_NAV_AUTOMATION, description: "Workflow entry points" },
    { id: "health", label: BUSINESS_PROCESS_NAV_HEALTH, description: "Ready check and configuration health" },
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
            className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Business process configuration"
            data-testid="business-process-workspace-nav"
        >
            {SECTIONS.map((section) => {
                const active = section.id === activeSection;
                return (
                    <button
                        key={section.id}
                        type="button"
                        onClick={() => onSelect(section.id)}
                        className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                            active
                                ? "border-alloy-pine/35 bg-alloy-pine/[0.08] shadow-sm ring-1 ring-alloy-pine/20"
                                : "border-alloy-forge/10 bg-white hover:border-alloy-pine/20 hover:bg-alloy-pine/[0.03]"
                        }`}
                        data-testid={`business-process-nav-${section.id}`}
                        aria-current={active ? "page" : undefined}
                    >
                        <p className={`text-sm font-semibold ${active ? "text-alloy-pine" : "text-alloy-midnight"}`}>
                            {section.label}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/55">{section.description}</p>
                    </button>
                );
            })}
        </nav>
    );
}
