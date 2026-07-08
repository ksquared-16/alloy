"use client";

import type { ReactNode } from "react";
import { FileInput, X } from "lucide-react";

import CommsModalTabBar from "@/app/adminV2/communications/CommsModalTabBar";
import {
    COMMS_WORKSPACE_NAV_CLASS,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import OperationalModalHeader from "@/app/adminV2/components/OperationalModalHeader";
import AlloyModeSwitch from "@/components/workspace/AlloyModeSwitch";
import type { ProcessingStudioTab } from "@/app/adminV2/pos/ProcessingStudioShell";

export type DigitalMailroomMode = "work" | "studio";
export type DigitalMailroomWorkView = "overview" | "work";

const MAILROOM_MODES = [
    { key: "work" as const, label: "Work" },
    { key: "studio" as const, label: "Studio" },
];

const WORK_TABS = [
    { key: "overview" as const, label: "Overview" },
    { key: "work" as const, label: "Work" },
];

const STUDIO_TABS: { key: ProcessingStudioTab; label: string }[] = [
    { key: "forms", label: "Forms" },
    { key: "packets", label: "Packets" },
    { key: "fields", label: "Fields" },
    { key: "branding", label: "Branding" },
];

export default function DigitalMailroomShell({
    mode,
    workView,
    studioTab,
    onModeChange,
    onWorkViewChange,
    onStudioTabChange,
    onClose,
    hideChrome = false,
    children,
}: {
    mode: DigitalMailroomMode;
    workView: DigitalMailroomWorkView;
    studioTab: ProcessingStudioTab;
    onModeChange: (mode: DigitalMailroomMode) => void;
    onWorkViewChange: (view: DigitalMailroomWorkView) => void;
    onStudioTabChange: (tab: ProcessingStudioTab) => void;
    onClose: () => void;
    hideChrome?: boolean;
    children: ReactNode;
}) {
    if (hideChrome) {
        return (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" data-testid="digital-mailroom-shell">
                <header className="relative shrink-0 border-b border-alloy-stone/12 bg-white px-4 py-2">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close Digital Mailroom"
                        className="absolute right-3 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-alloy-midnight/45 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight"
                    >
                        <X className="h-4 w-4" aria-hidden strokeWidth={2} />
                    </button>
                </header>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </div>
        );
    }

    const sectionTabs = mode === "work" ? WORK_TABS : STUDIO_TABS;
    const activeSection = mode === "work" ? workView : studioTab;

    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white"
            data-testid="digital-mailroom-shell"
        >
            <OperationalModalHeader
                icon={<FileInput className="h-4 w-4" aria-hidden strokeWidth={2} />}
                title="Digital Mailroom"
                subtitle="Where operational work happens."
                titleId="digital-mailroom-title"
                onClose={onClose}
                closeLabel="Close Digital Mailroom"
            />

            <nav className={COMMS_WORKSPACE_NAV_CLASS} data-mailroom-workspace-nav="true" aria-label="Digital Mailroom views">
                <AlloyModeSwitch
                    modes={MAILROOM_MODES}
                    active={mode}
                    onChange={onModeChange}
                    ariaLabel="Digital Mailroom mode"
                />
                <div
                    className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-alloy-stone/15"
                    data-mailroom-mode-sections="true"
                >
                    <CommsModalTabBar
                        tabs={sectionTabs}
                        activeKey={activeSection}
                        onSelect={(key) => {
                            if (mode === "work") onWorkViewChange(key as DigitalMailroomWorkView);
                            else onStudioTabChange(key as ProcessingStudioTab);
                        }}
                        aria-label={mode === "studio" ? "Studio sections" : "Work sections"}
                    />
                </div>
            </nav>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-alloy-stone/12 bg-white p-0" data-mailroom-workspace-execution="true">
                {children}
            </div>
        </div>
    );
}
