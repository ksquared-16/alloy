import { describe, expect, it } from "vitest";
import { resolveCreatedLeadFocusPanelHref } from "@/lib/admin/canonicalOperatorRoutes";

describe("resolveCreatedLeadFocusPanelHref", () => {
    it("routes the new record to the current Work Unit Focus Panel", () => {
        const href = resolveCreatedLeadFocusPanelHref({
            recordId: "opp-1",
            currentWorkUnitKey: "new_leads",
        });
        expect(href).toBe("/workspace/work-unit/new-leads?subject_id=opp-1");
    });

    it("never returns a legacy drawer / adminV2 drawer route", () => {
        const href = resolveCreatedLeadFocusPanelHref({
            recordId: "opp-1",
            currentWorkUnitKey: "new_leads",
        });
        expect(href).not.toMatch(/drawer/i);
        expect(href).not.toContain("adminV2");
        expect(href.startsWith("/workspace/work-unit/")).toBe(true);
    });

    it("prefers the work unit that owns the new lead status when known (status-aware)", () => {
        const href = resolveCreatedLeadFocusPanelHref({
            recordId: "opp-1",
            owningWorkUnitKey: "new_lead",
            currentWorkUnitKey: "needs_attention",
        });
        // `new_lead`-owning work unit wins over the current work unit.
        expect(href).toBe("/workspace/work-unit/new-lead?subject_id=opp-1");
    });

    it("falls back safely to the operator workspace when no work unit resolves", () => {
        const href = resolveCreatedLeadFocusPanelHref({
            recordId: "opp-1",
            currentWorkUnitKey: null,
        });
        expect(href).toBe("/workspace");
        expect(href).not.toMatch(/drawer/i);
    });

    it("handles a missing record id without producing a drawer route", () => {
        const href = resolveCreatedLeadFocusPanelHref({
            recordId: null,
            currentWorkUnitKey: "new_leads",
        });
        expect(href).toBe("/workspace/work-unit/new-leads");
    });
});
