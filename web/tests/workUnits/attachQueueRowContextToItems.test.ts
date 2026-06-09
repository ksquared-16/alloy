import { describe, expect, it, afterEach } from "vitest";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    attachOpportunityQueueRowsWithRowContext,
    isQueueRowContextWiringEnabled,
    queueRowContextMetaFromLane,
} from "@/lib/workUnits/attachQueueRowContextToItems";

describe("attachQueueRowContextToItems", () => {
    const normalized = loadQueueDefinitionBundle(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2).normalized;
    const lane = {
        entityType: "opportunity",
        requestedQueueKey: "tours",
        executableQueueKey: "tours",
        queueLabel: "Tours",
        normalized,
    };

    const baseRow = {
        id: "opp-1",
        name: "Smith Household",
        status_key: "tour_scheduled",
        _status_display: "Tour scheduled",
        _primary_contact_line: "Sarah Smith",
    };

    const envDisabled = process.env.ALLOY_QUEUE_ROW_CONTEXT_DISABLED;

    afterEach(() => {
        if (envDisabled === undefined) {
            delete process.env.ALLOY_QUEUE_ROW_CONTEXT_DISABLED;
        } else {
            process.env.ALLOY_QUEUE_ROW_CONTEXT_DISABLED = envDisabled;
        }
    });

    it("queueRowContextMetaFromLane maps normalized queue entry grain", () => {
        const meta = queueRowContextMetaFromLane(lane);
        expect(meta.key).toBe("tours");
        expect(meta.label).toBe("Tours");
        expect(meta.stage_key).toBe("tours");
        expect(meta.subject_grain).toBe("case");
    });

    it("attaches _queue_row_context without removing existing fields", () => {
        const [out] = attachOpportunityQueueRowsWithRowContext([baseRow], lane);
        expect(out.id).toBe("opp-1");
        expect(out.name).toBe("Smith Household");
        expect(out._status_display).toBe("Tour scheduled");
        const ctx = out._queue_row_context!;
        expect(ctx.row_subject.subject_type).toBe("case");
        expect(ctx.row_stage).toBe("Tours");
    });

    it("skips attachment when wiring disabled", () => {
        process.env.ALLOY_QUEUE_ROW_CONTEXT_DISABLED = "1";
        expect(isQueueRowContextWiringEnabled()).toBe(false);
        const [out] = attachOpportunityQueueRowsWithRowContext([baseRow], lane);
        expect(out._queue_row_context).toBeUndefined();
    });

    it("passes through job entity type unchanged", () => {
        const [out] = attachOpportunityQueueRowsWithRowContext([baseRow], { ...lane, entityType: "job" });
        expect(out._queue_row_context).toBeUndefined();
    });

    it("handles empty and malformed rows without throwing", () => {
        expect(attachOpportunityQueueRowsWithRowContext([], lane)).toEqual([]);
        const out = attachOpportunityQueueRowsWithRowContext([null, "x", baseRow] as unknown[], lane);
        expect(out).toHaveLength(1);
        expect(out[0]!._queue_row_context).toBeDefined();
    });

    it("builds context when optional enrichment fields are missing", () => {
        const [out] = attachOpportunityQueueRowsWithRowContext(
            [{ id: "opp-2", status_key: "new_inquiry" }],
            { ...lane, queueLabel: "New Leads", requestedQueueKey: "new_leads", executableQueueKey: "new_leads" }
        );
        const ctx = out._queue_row_context as {
            primary_contact: unknown;
            related_subjects_summary: unknown[];
            attention_summary: unknown;
        };
        expect(ctx.primary_contact).toBeNull();
        expect(ctx.related_subjects_summary).toEqual([]);
        expect(ctx.attention_summary).toBeNull();
    });
});
