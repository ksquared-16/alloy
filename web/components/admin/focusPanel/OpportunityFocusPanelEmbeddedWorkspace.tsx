"use client";

import { useEffect, useState } from "react";

import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import OpportunityDrawerVmTabPanes from "@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes";
import LayoutRuntimeActivityTimelineWidget from "@/components/layout/LayoutRuntimeActivityTimelineWidget";
import LayoutRuntimeTasksWidget from "@/components/layout/LayoutRuntimeTasksWidget";
import { resolveLayoutRuntimeActivityTimeline } from "@/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
import { markDrawerFamilyWorkspaceTiming } from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchTiming";

type Props = {
    drawerId: string;
    record: Record<string, unknown>;
    displayVm: OpportunityDrawerViewModel;
    onSelectTab: (tab: DrawerTabKey) => void;
};

type WorkTab = "items" | "notes";

const WORK_TABS: { key: WorkTab; label: string }[] = [
    { key: "items", label: "Work Items" },
    { key: "notes", label: "Notes" },
];

/** Events surfaced in the compact Recent Activity ribbon (dense strip). */
const RIBBON_EVENT_COUNT = 7;

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
    displayVm,
    onSelectTab,
}: Props) {
    const [workTab, setWorkTab] = useState<WorkTab>("items");
    const proofRecord = record as ProofRuntimeRecord;

    useEffect(() => {
        markDrawerFamilyWorkspaceTiming("activity_mounted", { entity_id: drawerId });
    }, [drawerId]);

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
                <header className="alloy-os-activity-cockpit__ribbon-head">
                    <svg
                        className="alloy-os-activity-cockpit__hdr-ico"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden
                    >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="alloy-os-activity-cockpit__panel-title">Recent Activity</span>
                </header>
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
                    <header className="alloy-os-activity-cockpit__comms-head">
                        <svg
                            className="alloy-os-activity-cockpit__hdr-ico"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            aria-hidden
                        >
                            <path d="M21 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-5.4A8 8 0 1 1 21 11.5Z" strokeLinejoin="round" />
                        </svg>
                        <span className="alloy-os-activity-cockpit__panel-title">Communications</span>
                    </header>
                    <div className="alloy-os-activity-workspace__embed" data-embedded-workspace="communications">
                        <CommunicationsDrawerSection
                            apiEntityType="opportunities"
                            entityId={drawerId}
                            initialPreviewVm={displayVm.activity?.communicationsPreviewVm ?? null}
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
                        <header className="alloy-os-activity-cockpit__work-head">
                            <svg
                                className="alloy-os-activity-cockpit__hdr-ico"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden
                            >
                                <path d="M4 6h11M4 12h11M4 18h7" strokeLinecap="round" />
                                <path d="m17 5 2 2 3-3.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
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
                            <svg
                                className="alloy-os-activity-cockpit__hdr-ico"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                aria-hidden
                            >
                                <path d="M6 3h8l4 4v14H6V3Z" strokeLinejoin="round" />
                                <path d="M14 3v4h4" strokeLinejoin="round" />
                            </svg>
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

        </div>
    );
}
