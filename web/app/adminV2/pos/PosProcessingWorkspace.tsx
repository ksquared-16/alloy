"use client";

/**
 * POS Processing — the command-center, left-to-right:
 *   Column 1: intake queue (existing ProcessingQueueList)
 *   Column 2: the selected work item (extracted data / evidence / preview)
 *   Column 3: Alloy recommendation + confidence + candidates + actions
 * The sticky BOS rail lives OUTSIDE this content (owned by the modal shell).
 *
 * Canonical chrome: white canvas + kit primitives (WorkspaceSectionHeader,
 * WorkspaceEmptyState). Reuses the queue list, the shared case hook, and
 * ReviewDecideCard. The approve path is unchanged.
 */

import WorkspaceSectionHeader from "@/components/workspace/WorkspaceSectionHeader";
import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import ProcessingQueueList from "@/app/adminV2/processing/ProcessingQueueList";
import { usePosCase } from "./usePosCase";
import PosCaseWorkColumn from "./PosCaseWorkColumn";
import PosCaseDecisionColumn from "./PosCaseDecisionColumn";

export default function PosProcessingWorkspace({
    selectedCaseId,
    onSelectCase,
    onGoToSources,
    title = "Processing",
    subtitle = "Information that has entered Alloy, triaged and ready for your decision.",
}: {
    selectedCaseId: string | null;
    onSelectCase: (caseId: string) => void;
    onGoToSources?: () => void;
    title?: string;
    subtitle?: string;
}) {
    const state = usePosCase(selectedCaseId);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader title={title} subtitle={subtitle} />

            {/* Three operational columns (horizontal scroll fallback on narrow modals) */}
            <div className="flex min-h-0 flex-1 overflow-x-auto">
                {/* Column 1 — queue */}
                <div className="flex w-[16rem] shrink-0 flex-col overflow-y-auto border-r border-alloy-stone/12 bg-white">
                    <ProcessingQueueList
                        selectedCaseId={selectedCaseId}
                        onSelectCase={onSelectCase}
                        onGoToSources={onGoToSources}
                    />
                </div>

                {/* Column 2 — work item */}
                <div className="flex min-w-[20rem] flex-1 flex-col overflow-hidden border-r border-alloy-stone/12 bg-white">
                    {selectedCaseId ? (
                        <PosCaseWorkColumn state={state} />
                    ) : (
                        <WorkspaceEmptyState
                            title="Select a case"
                            body="Pick an item from the queue to see its source, the information Alloy extracted, and the supporting evidence."
                        />
                    )}
                </div>

                {/* Column 3 — recommendation + action */}
                <div className="flex w-[19rem] shrink-0 flex-col overflow-hidden bg-white">
                    {selectedCaseId ? (
                        <PosCaseDecisionColumn state={state} />
                    ) : (
                        <WorkspaceEmptyState
                            title="Alloy’s recommendation"
                            body="When you open a case, Alloy shows what it thinks should happen, its confidence, and any matching records — then you approve."
                            tone="muted"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
