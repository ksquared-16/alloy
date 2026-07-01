"use client";

/**
 * Processing → Work mode → Incoming — the command-center, left-to-right:
 *   Column 1: incoming queue (existing ProcessingQueueList)
 *   Column 2: what came in (the selected item: submitted content / preview)
 *   Column 3: what Alloy found + what to do next (recommendation → approve)
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
import PosTemplateSetupColumn from "./PosTemplateSetupColumn";
import ProcessingKpiStrip from "./ProcessingKpiStrip";

export default function PosProcessingWorkspace({
    selectedCaseId,
    onSelectCase,
    onGoToSources,
    onOpenForm,
    title = "Incoming",
    subtitle,
}: {
    selectedCaseId: string | null;
    onSelectCase: (caseId: string) => void;
    onGoToSources?: () => void;
    onOpenForm?: (formId: string) => void;
    title?: string;
    subtitle?: string;
}) {
    const state = usePosCase(selectedCaseId);

    // Case purpose splits the work/decision surface:
    //   • Document → Form (primary source is an uploaded document): guided TEMPLATE SETUP,
    //     not record commit — recreate the document as a reusable form.
    //   • Record / intake case: the existing review → recommendation → commit flow.
    const primary = state.detail?.sources.find((s) => s.role === "primary") ?? state.detail?.sources[0] ?? null;
    const isDocumentCase = primary?.kind === "document";
    const detailLoading = !!selectedCaseId && state.loading && !state.detail;

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader title={title} subtitle={subtitle} />

            <ProcessingKpiStrip />

            <div className="flex min-h-0 flex-1 overflow-x-auto">
                {/* Column 1 — queue (always) */}
                <div className="flex w-[16rem] shrink-0 flex-col overflow-y-auto border-r border-alloy-stone/12 bg-white">
                    <ProcessingQueueList
                        selectedCaseId={selectedCaseId}
                        onSelectCase={onSelectCase}
                        onGoToSources={onGoToSources}
                        showFolders
                    />
                </div>

                {!selectedCaseId ? (
                    <div className="flex min-w-[20rem] flex-1 flex-col overflow-hidden bg-white">
                        <WorkspaceEmptyState
                            title="Pick something that came in"
                            body="Submissions open for your approval. Uploaded documents open so Alloy can turn them into a reusable form."
                        />
                    </div>
                ) : detailLoading ? (
                    <div className="flex min-w-[20rem] flex-1 flex-col gap-3 overflow-hidden bg-white p-3" aria-busy="true">
                        <div className="h-16 animate-pulse rounded-lg bg-stone-100" />
                        <div className="h-24 animate-pulse rounded-lg bg-stone-100" />
                    </div>
                ) : isDocumentCase ? (
                    /* Document → Form: one focused template-setup surface (work + decision together) */
                    <div className="flex min-w-[24rem] flex-1 flex-col overflow-hidden bg-white">
                        <PosTemplateSetupColumn state={state} onOpenForm={onOpenForm} />
                    </div>
                ) : (
                    /* Record / intake case: the existing two-column review + commit flow */
                    <>
                        <div className="flex min-w-[20rem] flex-1 flex-col overflow-hidden border-r border-alloy-stone/12 bg-white">
                            <PosCaseWorkColumn state={state} />
                        </div>
                        <div className="flex w-[19rem] shrink-0 flex-col overflow-hidden bg-white">
                            <PosCaseDecisionColumn state={state} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
