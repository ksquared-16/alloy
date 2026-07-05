"use client";

import { useState } from "react";

import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import OpportunityDrawerVmTabPanes from "@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes";
import LayoutRuntimeActivityTimelineWidget from "@/components/layout/LayoutRuntimeActivityTimelineWidget";
import LayoutRuntimeTasksWidget from "@/components/layout/LayoutRuntimeTasksWidget";
import { resolveLayoutRuntimeActivityTimeline } from "@/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    DEFAULT_EMBEDDED_WORKSPACE_TAB,
    EMBEDDED_WORKSPACE_TABS,
    type EmbeddedWorkspaceTabKey,
} from "@/lib/adminV2/runtime/focusPanel/embeddedWorkspaceTabs";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";

type Props = {
    drawerId: string;
    record: Record<string, unknown>;
    displayVm: OpportunityDrawerViewModel;
    onSelectTab: (tab: DrawerTabKey) => void;
    initialTab?: EmbeddedWorkspaceTabKey;
};

type WorkTab = "items" | "notes";

const WORK_TABS: { key: WorkTab; label: string }[] = [
    { key: "items", label: "Work Items" },
    { key: "notes", label: "Notes" },
];

/** Number of events surfaced in the compact Recent Activity ribbon (one denser than the prior strip). */
const RIBBON_EVENT_COUNT = 6;

function drawerTabForEmbeddedWorkspaceTab(key: EmbeddedWorkspaceTabKey): DrawerTabKey {
    switch (key) {
        case "documents":
            return "documents";
        case "notes":
            return "notes";
        case "communications":
            return "communications";
        default:
            return "activity";
    }
}

/**
 * Focus Panel Activity mode — one-viewport operational cockpit.
 *
 * Composes existing runtimes rather than inventing new ones:
 *   Recent Activity ribbon  ← LayoutRuntimeActivityTimelineWidget (horizontal_timeline)
 *   Communications (hero)    ← CommunicationsDrawerSection (embedded comms runtime)
 *   Work (Items / Notes)     ← LayoutRuntimeTasksWidget + notes pane
 *   Documents (status)       ← documents pane (uploaded / missing / upload)
 *
 * The EmbeddedWorkspace surface set survives as secondary "open full surface" navigation,
 * so the composed cockpit is the primary experience while the doctrine surfaces stay reachable.
 */
export default function OpportunityFocusPanelEmbeddedWorkspace({
    drawerId,
    record,
    displayVm: _displayVm,
    onSelectTab,
    initialTab = DEFAULT_EMBEDDED_WORKSPACE_TAB,
}: Props) {
    void initialTab;
    void _displayVm;
    const [workTab, setWorkTab] = useState<WorkTab>("items");
    const proofRecord = record as ProofRuntimeRecord;

    const ribbonEntries = resolveLayoutRuntimeActivityTimeline({
        record: proofRecord,
        surfaceKey: "opportunity_drawer",
    }).slice(0, RIBBON_EVENT_COUNT);

    return (
        <div
            className="alloy-os-activity-workspace alloy-os-activity-cockpit"
            data-focus-panel-embedded-workspace="true"
            data-focus-panel-activity-workspace="true"
            data-focus-panel-cockpit="true"
            data-focus-panel-mode="activity"
            role="tabpanel"
            aria-labelledby="focus-panel-mode-tab-activity"
            {...alloySectionDomAttrs("WU-11")}
        >
            {/* 1 — Recent Activity ribbon (compact, horizontal, awareness) */}
            <div className="alloy-os-activity-cockpit__ribbon" data-activity-cockpit-ribbon="true">
                <span className="alloy-os-activity-cockpit__ribbon-label">Recent Activity</span>
                <div className="alloy-os-activity-cockpit__ribbon-feed">
                    <LayoutRuntimeActivityTimelineWidget
                        entries={ribbonEntries}
                        displayMode="horizontal_timeline"
                        onViewAll={() => onSelectTab("activity")}
                    />
                </div>
            </div>

            {/* 2–4 — cockpit body: Communications hero + operational stack */}
            <div className="alloy-os-activity-cockpit__body">
                <section
                    className="alloy-os-activity-cockpit__comms"
                    data-activity-cockpit-comms="true"
                    aria-label="Communications"
                >
                    <div className="alloy-os-activity-workspace__embed" data-embedded-workspace="communications">
                        <CommunicationsDrawerSection
                            apiEntityType="opportunities"
                            entityId={drawerId}
                            embedded
                            embeddedHeaderMode="description_only"
                        />
                    </div>
                </section>

                <div className="alloy-os-activity-cockpit__stack">
                    {/* Work — Work Items / Notes */}
                    <section
                        className="alloy-os-activity-cockpit__panel alloy-os-activity-cockpit__work"
                        data-activity-cockpit-work="true"
                        aria-label="Work"
                    >
                        <header className="alloy-os-activity-cockpit__panel-head">
                            <span className="alloy-os-activity-cockpit__panel-title">Work</span>
                            <div
                                className="alloy-os-activity-cockpit__work-tabs"
                                role="tablist"
                                aria-label="Work sections"
                            >
                                {WORK_TABS.map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        role="tab"
                                        aria-selected={workTab === tab.key}
                                        className={
                                            workTab === tab.key
                                                ? "alloy-os-activity-cockpit__work-tab alloy-os-activity-cockpit__work-tab--active"
                                                : "alloy-os-activity-cockpit__work-tab"
                                        }
                                        data-activity-work-tab={tab.key}
                                        onClick={() => setWorkTab(tab.key)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </header>
                        <div className="alloy-os-activity-cockpit__panel-body">
                            {workTab === "items" ?
                                <LayoutRuntimeTasksWidget
                                    record={proofRecord}
                                    title="Work Items"
                                    chromeless
                                    emptyMessage="No open work items"
                                />
                            :   <OpportunityDrawerVmTabPanes
                                    drawerId={drawerId}
                                    drawerTab="notes"
                                    record={record}
                                    onSelectTab={onSelectTab}
                                />
                            }
                        </div>
                    </section>

                    {/* Documents — persistent operational status */}
                    <section
                        className="alloy-os-activity-cockpit__panel alloy-os-activity-cockpit__docs"
                        data-activity-cockpit-docs="true"
                        aria-label="Documents"
                    >
                        <header className="alloy-os-activity-cockpit__panel-head">
                            <span className="alloy-os-activity-cockpit__panel-title">Documents</span>
                            <button
                                type="button"
                                className="alloy-os-activity-cockpit__panel-viewall"
                                data-activity-docs-viewall="true"
                                onClick={() => onSelectTab("documents")}
                            >
                                View all →
                            </button>
                        </header>
                        <div className="alloy-os-activity-cockpit__panel-body">
                            <OpportunityDrawerVmTabPanes
                                drawerId={drawerId}
                                drawerTab="documents"
                                record={record}
                                onSelectTab={onSelectTab}
                            />
                        </div>
                    </section>
                </div>
            </div>

            {/* Secondary — open a full embedded surface (EmbeddedWorkspace surface set) */}
            <nav
                className="alloy-os-activity-cockpit__surfaces"
                aria-label="Open full surface"
                data-embedded-workspace-nav="true"
                data-activity-workspace-nav="true"
            >
                {EMBEDDED_WORKSPACE_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        className="alloy-os-activity-cockpit__surface-link"
                        data-embedded-workspace-tab={tab.key}
                        data-activity-workspace-tab={tab.key}
                        onClick={() => onSelectTab(drawerTabForEmbeddedWorkspaceTab(tab.key))}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>
        </div>
    );
}
