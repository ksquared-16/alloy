import { describe, expect, it } from "vitest";
import { validateQueueDefinition, type QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import {
    computeUnmappedOverflowCount,
    computeWorkUnitLifecycleCoverage,
    findAllRecordsQueueKey,
    isRowUnmappedForThroughput,
    shouldSuppressWorkUnitKpiStrip,
    statusKeysCoveredByThroughputQueues,
    summarizeUnmappedRowsForDiagnostics,
    workUnitScopeTotalFromSummaries,
} from "@/lib/workspace/workUnitQueueDerived";

function enrollmentLikeDef(): QueueDefinitionV1 {
    return validateQueueDefinition({
        version: 1,
        entity_type: "opportunity",
        queues: [
            {
                key: "all_open",
                label: "All open",
                filters: [{ type: "field" as const, field_key: "closed", operator: "eq" as const, value: false }],
            },
            {
                key: "stage_a",
                label: "Stage A",
                filters: [{ type: "status", operator: "in", values: ["a"] }],
            },
            {
                key: "stage_b",
                label: "Stage B",
                filters: [{ type: "status", operator: "in", values: ["b"] }],
            },
            {
                key: "needs_attention",
                label: "Needs attention",
                filters: [{ type: "exception", operator: "exists", exception_types: ["needs_attention"] }],
            },
        ],
        ui: {
            layout: "pipeline_with_attention",
            primary_total_queue: "all_open",
            sections: [
                { key: "throughput", label: "Pipeline", queue_keys: ["all_open", "stage_a", "stage_b"] },
                { key: "attn", label: "Attention", tone: "critical", queue_keys: ["needs_attention"] },
            ],
        },
    });
}

describe("workUnitQueueDerived", () => {
    it("findAllRecordsQueueKey uses ui.primary_total_queue when present", () => {
        const def = enrollmentLikeDef();
        const ui = getQueueUiConfig(def);
        expect(findAllRecordsQueueKey(def, ui)).toBe("all_open");
    });

    it("statusKeysCoveredByThroughputQueues excludes all-lane and needs_attention", () => {
        const def = enrollmentLikeDef();
        const covered = statusKeysCoveredByThroughputQueues(def, "all_open");
        expect([...covered].sort()).toEqual(["a", "b"]);
    });

    it("computeUnmappedOverflowCount is allCount minus sum of other lane counts", () => {
        const def = enrollmentLikeDef();
        const n = computeUnmappedOverflowCount({
            def,
            allRecordsQueueKey: "all_open",
            summaries: [
                { key: "all_open", count: 8 },
                { key: "stage_a", count: 3 },
                { key: "stage_b", count: 2 },
                { key: "needs_attention", count: 1 },
            ],
        });
        expect(n).toBe(3);
    });

    it("computeUnmappedOverflowCount ignores non-status lanes (e.g. date slices)", () => {
        const def = validateQueueDefinition({
            version: 1,
            entity_type: "opportunity",
            queues: [
                {
                    key: "all_open",
                    label: "All",
                    filters: [{ type: "field" as const, field_key: "closed", operator: "eq" as const, value: false }],
                },
                { key: "stage_a", label: "Stage A", filters: [{ type: "status", operator: "in", values: ["a"] }] },
                {
                    key: "tours_today",
                    label: "Tours today",
                    filters: [{ type: "date" as const, field: "tour_date", operator: "today" as const }],
                },
                {
                    key: "needs_attention",
                    label: "Needs attention",
                    filters: [{ type: "exception", operator: "exists", exception_types: ["needs_attention"] }],
                },
            ],
            ui: {
                primary_total_queue: "all_open",
                sections: [{ key: "throughput", label: "Pipeline", queue_keys: ["all_open", "stage_a", "tours_today"] }],
            },
        });
        const n = computeUnmappedOverflowCount({
            def,
            allRecordsQueueKey: "all_open",
            summaries: [
                { key: "all_open", count: 10 },
                { key: "stage_a", count: 4 },
                { key: "tours_today", count: 99 },
                { key: "needs_attention", count: 1 },
            ],
        });
        expect(n).toBe(6);
    });

    it("workUnitScopeTotalFromSummaries returns primary lane count only", () => {
        const def = enrollmentLikeDef();
        const { queueKey, total } = workUnitScopeTotalFromSummaries(def, [
            { key: "all_open", count: 4 },
            { key: "stage_a", count: 3 },
            { key: "stage_b", count: 2 },
            { key: "needs_attention", count: 1 },
        ]);
        expect(queueKey).toBe("all_open");
        expect(total).toBe(4);
    });

    it("shouldSuppressWorkUnitKpiStrip is true for pipeline_with_attention layout", () => {
        const def = enrollmentLikeDef();
        const ui = getQueueUiConfig(def);
        expect(shouldSuppressWorkUnitKpiStrip({ def, ui })).toBe(true);
    });

    it("shouldSuppressWorkUnitKpiStrip is true for multi-throughput sections with status lanes", () => {
        const def = validateQueueDefinition({
            version: 1,
            entity_type: "opportunity",
            queues: [
                { key: "all", label: "All", filters: [] },
                { key: "lane1", label: "L1", filters: [{ type: "status", operator: "in", values: ["x"] }] },
                { key: "lane2", label: "L2", filters: [{ type: "status", operator: "in", values: ["y"] }] },
            ],
            ui: {
                layout: "single_section",
                primary_total_queue: "all",
                sections: [
                    { key: "s1", label: "One", queue_keys: ["all"] },
                    { key: "s2", label: "Two", queue_keys: ["lane1", "lane2"] },
                ],
            },
        });
        const ui = getQueueUiConfig(def);
        expect(ui.layout).toBe("single_section");
        expect(shouldSuppressWorkUnitKpiStrip({ def, ui })).toBe(true);
    });

    it("isRowUnmappedForThroughput treats missing status_key as unmapped", () => {
        const covered = new Set(["a"]);
        expect(isRowUnmappedForThroughput({ id: "1" }, covered)).toBe(true);
        expect(isRowUnmappedForThroughput({ id: "1", status_key: "a" }, covered)).toBe(false);
        expect(isRowUnmappedForThroughput({ id: "1", status_key: "z" }, covered)).toBe(true);
    });

    it("computeWorkUnitLifecycleCoverage reports full coverage when unmapped is 0", () => {
        const def = enrollmentLikeDef();
        const c = computeWorkUnitLifecycleCoverage({
            def,
            allRecordsQueueKey: "all_open",
            summaries: [
                { key: "all_open", count: 5 },
                { key: "stage_a", count: 3 },
                { key: "stage_b", count: 2 },
                { key: "needs_attention", count: 1 },
            ],
        });
        expect(c.isComplete).toBe(true);
        expect(c.allRecordsCount).toBe(5);
        expect(c.statusLaneCountSum).toBe(5);
        expect(c.unmappedCount).toBe(0);
        expect(c.needsAttentionCount).toBe(1);
    });

    it("computeWorkUnitLifecycleCoverage warns via unmappedCount when status lanes do not exhaust all-lane", () => {
        const def = enrollmentLikeDef();
        const c = computeWorkUnitLifecycleCoverage({
            def,
            allRecordsQueueKey: "all_open",
            summaries: [
                { key: "all_open", count: 8 },
                { key: "stage_a", count: 3 },
                { key: "stage_b", count: 2 },
                { key: "needs_attention", count: 1 },
            ],
        });
        expect(c.isComplete).toBe(true);
        expect(c.unmappedCount).toBe(3);
    });

    it("computeWorkUnitLifecycleCoverage marks incomplete when a status lane is deferred", () => {
        const def = enrollmentLikeDef();
        const c = computeWorkUnitLifecycleCoverage({
            def,
            allRecordsQueueKey: "all_open",
            summaries: [
                { key: "all_open", count: 5 },
                { key: "stage_a", count: 3, counts_deferred: true },
                { key: "stage_b", count: 2 },
                { key: "needs_attention", count: 0 },
            ],
        });
        expect(c.isComplete).toBe(false);
        expect(c.statusLaneCountSum).toBe(null);
    });

    it("summarizeUnmappedRowsForDiagnostics ignores mapped rows; needs_attention overlap does not add unmapped", () => {
        const covered = new Set(["inquiry", "tour_booked"]);
        const rows = [
            { id: "1", name: "A", status_key: "inquiry" },
            { id: "2", name: "B", status_key: "lost" },
            { id: "3", name: "C", status_key: "tour_booked", _attention_reason_label: "Stale" },
        ];
        const d = summarizeUnmappedRowsForDiagnostics(rows, covered, 10);
        expect(d.samples).toHaveLength(1);
        expect(d.samples[0]?.id).toBe("2");
        expect(d.statusKeyCounts).toEqual({ lost: 1 });
    });
});
