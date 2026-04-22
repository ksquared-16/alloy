import { describe, expect, it } from "vitest";
import { computeOpportunityLifecycleKpis } from "@/lib/workspace/computeOpportunityLifecycleKpis";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

function def(
    status_key: string,
    lifecycle_stage: string | null,
    overrides: Partial<StatusDefinitionRow> = {}
): StatusDefinitionRow {
    return {
        id: `id-${status_key}`,
        org_id: "o1",
        industry_key: null,
        entity_type: "opportunities",
        status_key,
        status_label: status_key,
        sort_order: 0,
        is_active: true,
        is_system: false,
        metadata: lifecycle_stage ? { lifecycle_stage } : null,
        ...overrides,
    };
}

describe("computeOpportunityLifecycleKpis", () => {
    it("buckets rows by effective lifecycle and sums values for non-terminal rows", () => {
        const defs = [
            def("new", "intake"),
            def("qualified", "qualification"),
            def("needs_a_quote", "execution"),
            def("quoted", "execution"),
            def("booked", "success"),
            def("lost", "failure"),
        ];

        const rows = [
            { status_key: "new", quote_total: null },
            { status_key: "qualified", quote_total: null },
            { status_key: "needs_a_quote", quote_total: null },
            { status_key: "quoted", quote_total: 100 },
            { status_key: "booked", quote_total: 200 },
            { status_key: "lost", quote_total: null },
        ];

        const r = computeOpportunityLifecycleKpis(rows, defs);
        expect(r.counts.total).toBe(6);
        expect(r.counts.intake).toBe(1);
        expect(r.counts.qualification).toBe(1);
        expect(r.counts.execution).toBe(1);
        expect(r.counts.decision).toBe(1);
        expect(r.counts.success).toBe(1);
        expect(r.counts.failure).toBe(1);
        expect(r.counts.unclassified).toBe(0);

        // open pipeline: first 4 rows (100 from quoted as decision); terminal excluded
        expect(r.values.openPipeline).toBe(100);
        expect(r.values.pricedInMotion).toBe(100);
    });
});
