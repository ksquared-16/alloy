import { describe, expect, it } from "vitest";
import { resolveOpportunityAttention } from "@/lib/opportunities/opportunityAttentionResolver";
import { diffAttentionResolverResults } from "@/lib/opportunities/attentionResolverDiff";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

const defFor = (sk: string, lifecycle: string): StatusDefinitionRow => ({
    id: "sd",
    org_id: "o",
    industry_key: null,
    entity_type: "opportunities",
    status_key: sk,
    status_label: null,
    sort_order: 0,
    is_active: true,
    is_system: false,
    metadata: { lifecycle_stage: lifecycle },
});

describe("diffAttentionResolverResults", () => {
    it("detects entered_attention", () => {
        const nowMs = Date.parse("2026-06-01T12:00:00.000Z");
        const next = resolveOpportunityAttention({
            opportunity: {
                id: "1",
                status_key: "contacted",
                created_at: "2026-05-01T12:00:00.000Z",
                updated_at: "2026-05-20T12:00:00.000Z",
                metadata: { next_follow_up_at: "2026-05-30T12:00:00.000Z" },
                customer_id: "c",
                primary_person_id: "p",
            },
            nowMs,
            defs: [defFor("contacted", "qualification")],
        });
        const d = diffAttentionResolverResults(null, next);
        expect(d.some((x) => x.code === "entered_attention")).toBe(true);
    });
});
