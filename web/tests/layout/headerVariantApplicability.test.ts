import { describe, it, expect } from "vitest";
import {
    resolveSurfaceVariant,
    type SurfaceVariantCandidate,
    type SurfaceVariantContext,
} from "@/lib/layout/resolveSurfaceVariant";

/**
 * P1-D — Work Unit Header applicability certification.
 *
 * Certifies the header region (surface "workspace", layoutKey "work_unit_header") through the single
 * owner `resolveSurfaceVariant`, with test-only published variants (no tenant config is mutated).
 */

const hctx = (over: Partial<SurfaceVariantContext> = {}): SurfaceVariantContext => ({
    businessProcessKey: "enrollment",
    workViewId: "new_leads",
    entityType: "workspace",
    surface: "workspace",
    ...over,
});

let n = 0;
const header = (over: Partial<SurfaceVariantCandidate> = {}): SurfaceVariantCandidate => ({
    layoutId: `H${++n}`,
    layoutKey: "work_unit_header",
    entityType: "workspace",
    surface: "workspace",
    status: "published",
    version: 1,
    businessProcessKey: "enrollment",
    workViewId: null,
    stageKey: null,
    statusKey: null,
    ...over,
});

describe("P1-D Header applicability certification", () => {
    it("published-only: a draft header variant is never resolved", () => {
        expect(resolveSurfaceVariant(hctx(), [header({ status: "draft", workViewId: "new_leads" })])).toBeNull();
    });

    it("deterministic fallback: no published header applies → null (caller uses builtin default)", () => {
        expect(resolveSurfaceVariant(hctx(), [header({ businessProcessKey: "billing" })])).toBeNull();
        expect(resolveSurfaceVariant(hctx(), [])).toBeNull();
    });

    it("Business Process precedence: the enrollment header applies, a billing-scoped one does not", () => {
        const enrollmentDefault = header({ businessProcessKey: "enrollment", workViewId: null });
        const billingScoped = header({ businessProcessKey: "billing", workViewId: "new_leads" });
        const r = resolveSurfaceVariant(hctx({ businessProcessKey: "enrollment" }), [billingScoped, enrollmentDefault]);
        expect(r?.candidate.layoutId).toBe(enrollmentDefault.layoutId);
    });

    it("Work View precedence: a New-Leads header wins over the process default", () => {
        const def = header({ workViewId: null });
        const newLeads = header({ workViewId: "new_leads" });
        const r = resolveSurfaceVariant(hctx({ workViewId: "new_leads" }), [def, newLeads]);
        expect(r?.candidate.layoutId).toBe(newLeads.layoutId);
        expect(r?.tier).toBe("process_workview");
    });

    it("order independence: header resolution is identical regardless of candidate array order", () => {
        const def = header({ workViewId: null });
        const wv = header({ workViewId: "new_leads", version: 2 });
        const set = [def, wv];
        const a = resolveSurfaceVariant(hctx(), set)?.candidate.layoutId;
        const b = resolveSurfaceVariant(hctx(), [...set].reverse())?.candidate.layoutId;
        expect(a).toBe(wv.layoutId);
        expect(a).toBe(b);
    });

    it("no stale header after context movement: moving Work View re-resolves and returns cleanly", () => {
        const newLeads = header({ workViewId: "new_leads" });
        const allLeads = header({ workViewId: "all_leads" });
        const def = header({ workViewId: null });
        const candidates = [newLeads, allLeads, def];

        // Move new_leads → all_leads → new_leads. The resolver is pure, so each context yields its own
        // variant with no memory of the prior — a stale header is structurally impossible.
        expect(resolveSurfaceVariant(hctx({ workViewId: "new_leads" }), candidates)?.candidate.layoutId).toBe(newLeads.layoutId);
        expect(resolveSurfaceVariant(hctx({ workViewId: "all_leads" }), candidates)?.candidate.layoutId).toBe(allLeads.layoutId);
        expect(resolveSurfaceVariant(hctx({ workViewId: "new_leads" }), candidates)?.candidate.layoutId).toBe(newLeads.layoutId);
        // A work view with no scoped variant falls back to the process default (never the prior view's).
        expect(resolveSurfaceVariant(hctx({ workViewId: "registration" }), candidates)?.candidate.layoutId).toBe(def.layoutId);
    });
});
