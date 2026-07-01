"use client";

import "@/app/adminV2/components/workspace/workspace.css";
import OperationalQueueRecordRow from "@/components/layout/OperationalQueueRecordRow";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import { buildOperationalQueueRecordViewModelFromCrmSlots } from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import { doctrineEnrollmentRow, doctrineRowActions } from "./fixtures";

const handlers = {
    onOpenPerson: () => {},
    onOpenChild: () => {},
    onPrefetchPerson: () => {},
    onPrefetchChild: () => {},
};

const previewItem: QueuePreviewItemVm = {
    id: "opp-doctrine-review",
    title: "Johnson Family",
    quickActions: [],
    semanticCrmCompact: doctrineEnrollmentRow,
    layoutRuntimeEnrichment: {
        inquirySummaryTasks: {
            state: "loaded",
            open_count: 2,
            open_tasks: [
                { id: "task-1", title: "Follow up today", status: "open", due_at: "2026-06-09T17:00:00Z", source: "manual" },
                { id: "task-2", title: "Send tour reminder", status: "open", due_at: "2026-06-10T14:00:00Z", source: "workflow" },
            ],
        },
        tourDisplay: "03-12-2026 · 10:30 AM",
    },
};

const record = {
    ...buildOpportunityQueueRowRecordFromPreview(previewItem),
    "opportunity.tour_date": "03-12-2026 · 10:30 AM",
    tour_scheduled_at: "03-12-2026 · 10:30 AM",
};
const vm = buildOperationalQueueRecordViewModelFromCrmSlots(doctrineEnrollmentRow, {
    config: defaultLeadQueueLayoutV3(),
});

function ProductionCardShell({ children }: { children: React.ReactNode }) {
    return (
        <div data-ws-surface="work_unit" className="adminv2-ws-work-unit adminv2-ws-wu-v2 max-w-[1180px]">
            <div
                className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--operational adminv2-interactive-surface adminv2-ws-wu-queue-card--tier-standard adminv2-ws-wu-queue-card--operational-row adminv2-ws-wu-queue-card--attention-accent"
                data-queue-row-operational-card="true"
            >
                <div
                    className="adminv2-ws-crm-queue-preview adminv2-ws-enrollment-crm-preview adminv2-ws-crm-queue-preview--scan adminv2-ws-crm-queue-preview--operational-row"
                    data-queue-preview="crm_compact_operational_row"
                >
                    {children}
                </div>
            </div>
        </div>
    );
}

export default function QueueRecordDoctrineGallery() {
    return (
        <div className="min-h-screen bg-alloy-stone/8 px-6 py-10 text-alloy-midnight">
            <div className="mx-auto max-w-[1180px] space-y-8">
                <header>
                    <h1 className="text-lg font-semibold text-alloy-midnight">Queue record doctrine — visual review</h1>
                    <p className="mt-1 text-sm text-alloy-midnight/60">
                        Production card shell + v3 operational row renderer.
                    </p>
                </header>

                <section data-doctrine-review="enrollment-row">
                    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/50">
                        Enrollment pipeline — doctrine checklist row
                    </h2>
                    <ProductionCardShell>
                        <OperationalQueueRecordRow
                            vm={vm}
                            record={record}
                            config={defaultLeadQueueLayoutV3()}
                            drawerHandlers={handlers}
                            rowActions={doctrineRowActions}
                            onRowAction={() => {}}
                            showAttentionAccent
                            onOpen={() => {}}
                        />
                    </ProductionCardShell>
                </section>
            </div>
        </div>
    );
}
