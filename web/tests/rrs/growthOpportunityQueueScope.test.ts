import { describe, expect, it, vi } from "vitest";
import { applyGrowthOpportunityFiltersToQuery } from "@/lib/rrs/queue/growthOpportunityQueueScope";
import {
    isQueueDefinitionV1Opportunity,
    parseQueueDefinitionV1Strict,
} from "@/lib/rrs/queue/queueDefinitionV1";
import { CHILDCARE_VERTICAL_BOOTSTRAP_V1 } from "@/lib/admin/verticalBootstrap/childcareBootstrapV1";

describe("growthOpportunityQueueScope", () => {
    it("applyGrowthOpportunityFiltersToQuery chains status_keys filter", async () => {
        const chain = {
            in: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
        };
        const supabase = {} as never;
        const out = await applyGrowthOpportunityFiltersToQuery(supabase, "org1", chain, {
            status_keys: ["ready_to_enroll", "waitlisted"],
        });
        expect(chain.in).toHaveBeenCalledWith("status_key", ["ready_to_enroll", "waitlisted"]);
        expect(out).toBe(chain);
    });

    it("childcare bootstrap Growth definitions parse as strict opportunity queue defs", () => {
        const wus = CHILDCARE_VERTICAL_BOOTSTRAP_V1.work_units ?? [];
        for (const wu of wus) {
            const qd = wu.queue_definition;
            const parsed = parseQueueDefinitionV1Strict(qd as Record<string, unknown>);
            expect(parsed.ok, `work_unit ${wu.key}`).toBe(true);
            if (parsed.ok) {
                expect(isQueueDefinitionV1Opportunity(parsed.value), `work_unit ${wu.key}`).toBe(true);
            }
        }
    });
});
