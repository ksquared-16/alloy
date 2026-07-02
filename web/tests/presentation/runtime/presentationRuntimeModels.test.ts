import { describe, expect, it } from "vitest";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import type { QueueItemsResult } from "@/lib/queues/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import {
    drillHrefForMetricKey,
    operationalAnswerModelsFromResolvedMetrics,
    opportunityQueuePreviewSeedFromRowContext,
    processTileModelFromLandingCard,
    queueRowModelFromQueueItem,
    queueRowModelsFromQueueItemsResult,
    queueRowSubjectDisplayName,
    workViewLinkModelsFromConfiguredViews,
} from "@/lib/presentation/runtime/types";

function landingCard(overrides?: Partial<OperatorLifecycleLandingCard>): OperatorLifecycleLandingCard {
    return {
        id: "lc-1",
        departmentId: "dept-1",
        processKey: "enrollment",
        label: "Enrollment",
        description: "Lead to enrolled",
        entryHref: "/workspace/work-unit/new-leads",
        workQueues: [
            { label: "New Leads", platformKey: "new_leads", href: "/workspace/work-unit/new-leads" },
            { label: "Tours", platformKey: "tours", href: "/workspace/work-unit/tours" },
        ],
        stageCount: 4,
        activeRecordCount: 12,
        needsAttentionCount: 3,
        performanceMetrics: [{ label: "Tour conversion", value: "42%" }],
        ...overrides,
    };
}

function queueRowContext(entityId: string): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: entityId, display_name: "Jordan Lee" },
        row_stage: "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: "new_lead",
        row_status_label: "New Lead",
        case_context: {
            case_id: entityId,
            display_name: "Jordan Lee",
            case_type_label: "Enrollment",
            case_status_key: "new_lead",
            case_status_label: "New Lead",
        },
        primary_contact: { display_name: "Jordan Lee" },
        related_subjects_summary: [],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: entityId },
    };
}

function workView(overrides?: Partial<WorkViewConfigV1Stored>): WorkViewConfigV1Stored {
    return {
        id: "wv-1",
        label: "All Leads",
        ...overrides,
    };
}

describe("processTileModelFromLandingCard", () => {
    it("maps the landing card to a process tile with work-view links", () => {
        const tile = processTileModelFromLandingCard(landingCard());

        expect(tile).toMatchObject({
            id: "lc-1",
            label: "Enrollment",
            description: "Lead to enrolled",
            entryHref: "/workspace/work-unit/new-leads",
            activeRecordCount: 12,
            needsAttentionCount: 3,
        });
        expect(tile.performanceMetrics).toEqual([{ label: "Tour conversion", value: "42%" }]);
        expect(tile.workViews).toEqual([
            { id: "new_leads", label: "New Leads", isActive: false, count: null, href: "/workspace/work-unit/new-leads", attentionCount: null, overdueCount: null },
            { id: "tours", label: "Tours", isActive: false, count: null, href: "/workspace/work-unit/tours", attentionCount: null, overdueCount: null },
        ]);
    });

    it("defaults absent rollups honestly (null counts, empty metrics)", () => {
        const tile = processTileModelFromLandingCard(
            landingCard({ activeRecordCount: null, needsAttentionCount: null, performanceMetrics: undefined }),
        );
        expect(tile.activeRecordCount).toBeNull();
        expect(tile.needsAttentionCount).toBeNull();
        expect(tile.performanceMetrics).toEqual([]);
    });
});

describe("queueRowModelFromQueueItem", () => {
    it("wraps the frozen QueueRowContext projection with row identity", () => {
        const context = queueRowContext("opp-1");
        const row = queueRowModelFromQueueItem({ id: "opp-1", _queue_row_context: context }, "opportunity");

        expect(row).toEqual({ context, entityType: "opportunity", entityId: "opp-1" });
    });

    it("keeps rows without an attached context (job/schedule lanes)", () => {
        const row = queueRowModelFromQueueItem({ id: "job-1" }, "job");
        expect(row).toEqual({ context: null, entityType: "job", entityId: "job-1" });
    });

    it("falls back to drawer_open identity and drops rows without any id", () => {
        const context = queueRowContext("opp-2");
        expect(queueRowModelFromQueueItem({ _queue_row_context: context }, "opportunity")?.entityId).toBe("opp-2");
        expect(queueRowModelFromQueueItem({}, "opportunity")).toBeNull();
        expect(queueRowModelFromQueueItem(null, "opportunity")).toBeNull();
    });

    it("maps a full QueueItemsResult preserving API order", () => {
        const result: QueueItemsResult = {
            queue: {
                key: "new_leads",
                label: "New Leads",
                entity_type: "opportunity",
                priority: "standard",
                display: "list",
            },
            items: [
                { id: "opp-1", _queue_row_context: queueRowContext("opp-1") },
                {}, // no identity — dropped
                { id: "opp-3" },
            ],
            total: 3,
            limit: 20,
            offset: 0,
        };

        const rows = queueRowModelsFromQueueItemsResult(result);
        expect(rows.map((r) => r.entityId)).toEqual(["opp-1", "opp-3"]);
        expect(rows.every((r) => r.entityType === "opportunity")).toBe(true);
    });
});

describe("queueRowSubjectDisplayName / opportunityQueuePreviewSeedFromRowContext", () => {
    it("derives the single-subject title and the Focus Panel open seed from the same contract", () => {
        const context = queueRowContext("opp-1");

        expect(queueRowSubjectDisplayName(context)).toBe("Jordan Lee");
        expect(opportunityQueuePreviewSeedFromRowContext(context)).toEqual({
            title: "Jordan Lee",
            statusLabel: "New Lead",
            stageLabel: "New Leads",
        });
    });

    it("joins grouped subjects and falls back to the row count unit", () => {
        const grouped: QueueRowContext = {
            ...queueRowContext("opp-2"),
            row_presentation_mode: "grouped_subjects",
            row_subjects: [
                { subject_type: "child", subject_id: "c-1", display_name: "Avery Lee" },
                { subject_type: "child", subject_id: "c-2", display_name: "Rowan Lee" },
            ],
        };
        expect(queueRowSubjectDisplayName(grouped)).toBe("Avery Lee, Rowan Lee");
        expect(opportunityQueuePreviewSeedFromRowContext(grouped)?.title).toBe("Avery Lee, Rowan Lee");

        const counted: QueueRowContext = {
            ...queueRowContext("opp-3"),
            row_presentation_mode: "grouped_subjects",
            row_count: 3,
            row_count_unit: "enrollment_track",
        };
        expect(queueRowSubjectDisplayName(counted)).toBe("3 enrollment track");
    });

    it("returns null seed when the row carried no context (placeholder title owns identity)", () => {
        expect(opportunityQueuePreviewSeedFromRowContext(null)).toBeNull();
    });
});

describe("workViewLinkModelsFromConfiguredViews", () => {
    it("orders by display_order, drops hidden views, and marks the active view", () => {
        const views = [
            workView({ id: "wv-b", label: "Tours", display_order: 2, compat_queue_key: "tours" }),
            workView({ id: "wv-hidden", label: "Hidden", visible_in_runtime: false }),
            workView({ id: "wv-a", label: "New Leads", display_order: 1, compat_queue_key: "new_leads" }),
        ];

        const links = workViewLinkModelsFromConfiguredViews(views, {
            activeWorkViewId: "wv-b",
            countForView: (view) => (view.compat_queue_key === "tours" ? 5 : null),
        });

        expect(links).toEqual([
            { id: "wv-a", label: "New Leads", isActive: false, count: null, href: null, attentionCount: null, overdueCount: null },
            { id: "wv-b", label: "Tours", isActive: true, count: 5, href: null, attentionCount: null, overdueCount: null },
        ]);
    });

    it("resolves counts as null when no resolver is supplied", () => {
        const links = workViewLinkModelsFromConfiguredViews([workView()], { activeWorkViewId: null });
        expect(links).toEqual([{ id: "wv-1", label: "All Leads", isActive: false, count: null, href: null, attentionCount: null, overdueCount: null }]);
    });
});

describe("operationalAnswerModelsFromResolvedMetrics", () => {
    it("maps resolved values in key order with canonical drill hrefs, omitting unresolved keys", () => {
        const resolved = {
            "enrollment.lead_count": {
                metric_key: "enrollment.lead_count",
                label: "New leads",
                formatted_value: "18",
            },
            "comms.delivery_rate": {
                metric_key: "comms.delivery_rate",
                label: "Delivery rate",
                formatted_value: "97%",
            },
        } as unknown as ResolvedMetricMap;

        const answers = operationalAnswerModelsFromResolvedMetrics(
            ["comms.delivery_rate", "enrollment.lead_count", "ops.work_overdue_count"],
            resolved,
        );

        expect(answers).toEqual([
            // Exploratory-only calculation — no drill contract, honest null href.
            { key: "comms.delivery_rate", label: "Delivery rate", formattedValue: "97%", href: null },
            {
                key: "enrollment.lead_count",
                label: "New leads",
                formattedValue: "18",
                href: "/workspace/work-unit/enrollment-pipeline",
            },
            // ops.work_overdue_count unresolved — omitted, not rendered as a placeholder.
        ]);
    });

    it("resolves drill hrefs to the canonical slug route (path routing only)", () => {
        expect(drillHrefForMetricKey("enrollment.lead_count")).toBe("/workspace/work-unit/enrollment-pipeline");
        expect(drillHrefForMetricKey("ops.needs_attention_count")).toBe("/workspace/work-unit/needs-attention");
        expect(drillHrefForMetricKey("comms.delivery_rate")).toBeNull();
        expect(drillHrefForMetricKey("not.a.calculation")).toBeNull();
    });

    it("omits no-data values (empty, whitespace, em dash) — real zeros stay", () => {
        const resolved = {
            "enrollment.lead_count": {
                metric_key: "enrollment.lead_count",
                label: "New leads",
                formatted_value: "0",
            },
            "comms.delivery_rate": {
                metric_key: "comms.delivery_rate",
                label: "Delivery rate",
                formatted_value: "—",
            },
            "ops.work_overdue_count": {
                metric_key: "ops.work_overdue_count",
                label: "Overdue",
                formatted_value: "   ",
            },
            "ops.needs_attention_count": {
                metric_key: "ops.needs_attention_count",
                label: "Needs attention",
                formatted_value: "",
            },
        } as unknown as ResolvedMetricMap;

        const answers = operationalAnswerModelsFromResolvedMetrics(
            [
                "enrollment.lead_count",
                "comms.delivery_rate",
                "ops.work_overdue_count",
                "ops.needs_attention_count",
            ],
            resolved,
        );

        // The strip never renders rows of dashes — but "0" is data, not absence.
        expect(answers.map((a) => a.key)).toEqual(["enrollment.lead_count"]);
        expect(answers[0]?.formattedValue).toBe("0");
    });
});
