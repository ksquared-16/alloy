import { describe, expect, it } from "vitest";

import {
    buildOpportunityOperationalContext,
    entityOperationalContextEqual,
    isStaleOperationalProposalEntity,
    resolveOpportunityOperationalContextLabel,
} from "@/lib/adminV2/bos/activeOperationalContext";

describe("activeOperationalContext", () => {
    it("resolveOpportunityOperationalContextLabel prefers customer name from entity GET", () => {
        const label = resolveOpportunityOperationalContextLabel({
            overviewData: { _customer_name: "Mitchell Family", name: "Inquiry 42" },
            queuePreviewSeed: { title: "Queue Title" },
            opportunitySingular: "Opportunity",
        });
        expect(label).toBe("Mitchell Family");
    });

    it("resolveOpportunityOperationalContextLabel falls back to queue seed before singular", () => {
        const label = resolveOpportunityOperationalContextLabel({
            overviewData: null,
            queuePreviewSeed: { title: "Mitchell · Tour pending" },
            opportunitySingular: "Opportunity",
        });
        expect(label).toBe("Mitchell · Tour pending");
    });

    it("buildOpportunityOperationalContext sets drawer source_surface", () => {
        const ctx = buildOpportunityOperationalContext({
            entityId: "opp-1",
            overviewData: { _customer_name: "Lee Household" },
            queuePreviewSeed: null,
            opportunitySingular: "Opportunity",
            sourceSurface: "opportunity_drawer",
        });
        expect(ctx.entity_id).toBe("opp-1");
        expect(ctx.source_surface).toBe("opportunity_drawer");
        expect(ctx.label).toBe("Lee Household");
        expect(ctx.available_actions?.length).toBeGreaterThan(0);
    });

    it("entityOperationalContextEqual ignores reference identity when fields match", () => {
        const a = buildOpportunityOperationalContext({
            entityId: "x",
            overviewData: { _customer_name: "A" },
            queuePreviewSeed: null,
            opportunitySingular: "Opportunity",
            sourceSurface: "queue",
        });
        const b = { ...a, available_actions: [...(a.available_actions ?? [])] };
        expect(entityOperationalContextEqual(a, b)).toBe(true);
    });

    it("isStaleOperationalProposalEntity when card entity differs from active", () => {
        expect(isStaleOperationalProposalEntity("a", "b")).toBe(true);
        expect(isStaleOperationalProposalEntity("a", "a")).toBe(false);
        expect(isStaleOperationalProposalEntity("a", null)).toBe(false);
        expect(isStaleOperationalProposalEntity(null, "a")).toBe(false);
    });
});
