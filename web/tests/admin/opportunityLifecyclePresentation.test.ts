import { describe, expect, it } from "vitest";
import {
    buildOpportunityLifecycleFields,
    resolveEffectiveOpportunityLifecycleStage,
} from "@/lib/admin/opportunityLifecyclePresentation";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

function def(
    key: string,
    meta: Record<string, unknown> | null
): StatusDefinitionRow {
    return {
        id: "x",
        org_id: "o",
        industry_key: null,
        entity_type: "opportunities",
        status_key: key,
        status_label: key,
        sort_order: 1,
        is_active: true,
        is_system: true,
        metadata: meta,
    };
}

describe("resolveEffectiveOpportunityLifecycleStage", () => {
    it("terminal success/failure wins over positive quote", () => {
        const defs = [
            def("booked", { lifecycle_stage: "success" }),
            def("needs_a_quote", { lifecycle_stage: "execution" }),
        ];
        expect(
            resolveEffectiveOpportunityLifecycleStage({
                statusKey: "booked",
                quoteTotalDollars: 199,
                defs,
            })
        ).toBe("success");
        expect(
            resolveEffectiveOpportunityLifecycleStage({
                statusKey: "lost",
                quoteTotalDollars: 199,
                defs: [def("lost", { lifecycle_stage: "failure" })],
            })
        ).toBe("failure");
    });

    it("derives decision when quote_total positive and not terminal", () => {
        const defs = [def("needs_a_quote", { lifecycle_stage: "execution" })];
        expect(
            resolveEffectiveOpportunityLifecycleStage({
                statusKey: "needs_a_quote",
                quoteTotalDollars: 50,
                defs,
            })
        ).toBe("decision");
    });

    it("uses metadata lifecycle when no positive quote", () => {
        const defs = [def("qualified", { lifecycle_stage: "qualification" })];
        expect(
            resolveEffectiveOpportunityLifecycleStage({
                statusKey: "qualified",
                quoteTotalDollars: null,
                defs,
            })
        ).toBe("qualification");
    });
});

describe("buildOpportunityLifecycleFields", () => {
    it("returns titles and next step", () => {
        const f = buildOpportunityLifecycleFields({
            statusKey: "new",
            quoteTotalDollars: null,
            defs: [def("new", { lifecycle_stage: "intake" })],
        });
        expect(f._effective_lifecycle_stage).toBe("intake");
        expect(f._lifecycle_stage_title).toBe("Intake");
        expect(f._lifecycle_next_step.lines.length).toBeGreaterThan(0);
    });
});
