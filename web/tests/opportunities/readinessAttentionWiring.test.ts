import { describe, expect, it, vi } from "vitest";
import { computeOperationalAttentionAttachment } from "@/lib/admin/operationalAttentionEntityAttachment";
import * as readinessForAttention from "@/lib/opportunities/opportunityReadinessForAttention";

describe("readinessAttentionWiring", () => {
    it("passes pre-evaluated readiness into resolver without re-invoking evaluator when provided", () => {
        const evalSpy = vi.spyOn(readinessForAttention, "tryEvaluateOpportunityReadinessForAttention");
        const readiness = {
            contract_version: "1.0" as const,
            primary_state: "needs_information" as const,
            trigger: "record_view" as const,
            subject: { entity_type: "opportunity", entity_id: "opp-1" },
            context: { org_id: "org-1" },
            gaps: [
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record" as const,
                    level: "enforced" as const,
                    label: "Child · Program Interest",
                    missing_reason: "Missing",
                    failure_kind: "missing" as const,
                    blocking: false,
                },
            ],
            counts: {
                gaps_total: 1,
                by_level: { recommended: 0, required: 0, enforced: 1 },
                blocking: 0,
                satisfied: 0,
                configured: 1,
            },
            ok: false,
        };

        const out = computeOperationalAttentionAttachment({
            opportunityRow: {
                id: "opp-1",
                status_key: "contacted",
                created_at: "2026-06-01T12:00:00.000Z",
                updated_at: "2026-06-01T18:00:00.000Z",
                metadata: {},
                customer_id: "c1",
                primary_person_id: "p1",
            },
            defs: [],
            attentionConfigMetadata: null,
            readiness,
        });

        expect(evalSpy).not.toHaveBeenCalled();
        expect(out._operational_attention_error).toBeNull();
        expect(out._operational_attention?.reasons.some((r) => r.code === "missing_required_info")).toBe(true);
        evalSpy.mockRestore();
    });

    it("evaluates readiness once when org context provided and projection enabled", () => {
        const readiness = {
            contract_version: "1.0" as const,
            primary_state: "needs_information" as const,
            trigger: "record_view" as const,
            subject: { entity_type: "opportunity", entity_id: "opp-1" },
            context: { org_id: "org-1" },
            gaps: [
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record" as const,
                    level: "enforced" as const,
                    label: "Child · Program Interest",
                    missing_reason: "Missing",
                    failure_kind: "missing" as const,
                    blocking: false,
                },
            ],
            counts: {
                gaps_total: 1,
                by_level: { recommended: 0, required: 0, enforced: 1 },
                blocking: 0,
                satisfied: 0,
                configured: 1,
            },
            ok: false,
        };
        const evalSpy = vi
            .spyOn(readinessForAttention, "tryEvaluateOpportunityReadinessForAttention")
            .mockReturnValue(readiness);

        computeOperationalAttentionAttachment({
            opportunityRow: {
                id: "opp-1",
                status_key: "contacted",
                created_at: "2026-06-01T12:00:00.000Z",
                updated_at: "2026-06-01T18:00:00.000Z",
                metadata: {},
                customer_id: "c1",
                primary_person_id: "p1",
            },
            defs: [],
            attentionConfigMetadata: null,
            departmentMetadata: {},
            orgId: "org-1",
            departmentId: "dept-1",
        });

        expect(evalSpy).toHaveBeenCalledTimes(1);
        evalSpy.mockRestore();
    });
});
