import { describe, it, expect } from "vitest";
import {
    resolveSurfaceVariant,
    type SurfaceVariantCandidate,
    type SurfaceVariantContext,
} from "@/lib/layout/resolveSurfaceVariant";

const ctx = (over: Partial<SurfaceVariantContext> = {}): SurfaceVariantContext => ({
    businessProcessKey: "enrollment",
    workViewId: "new_leads",
    stageKey: "lead",
    statusKey: "open",
    entityType: "opportunities",
    surface: "drawer",
    ...over,
});

let seq = 0;
const cand = (over: Partial<SurfaceVariantCandidate> = {}): SurfaceVariantCandidate => ({
    layoutId: `L${++seq}`,
    layoutKey: "focus_panel_summary",
    entityType: "opportunities",
    surface: "drawer",
    status: "published",
    version: 1,
    businessProcessKey: "enrollment",
    workViewId: null,
    stageKey: null,
    statusKey: null,
    ...over,
});

describe("resolveSurfaceVariant — applicability resolver (P0, behavior-neutral)", () => {
    it("published-only: draft candidates are never resolved", () => {
        const draft = cand({ status: "draft", workViewId: "new_leads" });
        expect(resolveSurfaceVariant(ctx(), [draft])).toBeNull();
    });

    it("fallback: returns null when nothing published applies (caller owns the default)", () => {
        const otherProcess = cand({ businessProcessKey: "billing" });
        const otherSurface = cand({ surface: "queue" });
        const otherEntity = cand({ entityType: "person" });
        expect(resolveSurfaceVariant(ctx(), [otherProcess, otherSurface, otherEntity])).toBeNull();
    });

    it("process default (no finer constraints) applies as the least-specific tier", () => {
        const def = cand({ workViewId: null, stageKey: null, statusKey: null });
        const r = resolveSurfaceVariant(ctx(), [def]);
        expect(r?.candidate.layoutId).toBe(def.layoutId);
        expect(r?.tier).toBe("process_surface_default");
    });

    it("Work View applicability: a Work-View-scoped variant wins over a process default", () => {
        const def = cand({ workViewId: null });
        const wv = cand({ workViewId: "new_leads" });
        const r = resolveSurfaceVariant(ctx({ workViewId: "new_leads" }), [def, wv]);
        expect(r?.candidate.layoutId).toBe(wv.layoutId);
        expect(r?.tier).toBe("process_workview");
    });

    it("Work View applicability: a variant scoped to a DIFFERENT work view does not apply", () => {
        const wvOther = cand({ workViewId: "all_leads" });
        const def = cand({ workViewId: null });
        const r = resolveSurfaceVariant(ctx({ workViewId: "new_leads" }), [wvOther, def]);
        expect(r?.candidate.layoutId).toBe(def.layoutId); // the other-view variant is filtered out
    });

    it("precedence: Work View ≻ stage ≻ status (most specific wins)", () => {
        const status = cand({ statusKey: "open" });
        const stage = cand({ stageKey: "lead" });
        const workview = cand({ workViewId: "new_leads" });
        const wvStageStatus = cand({ workViewId: "new_leads", stageKey: "lead", statusKey: "open" });
        const r = resolveSurfaceVariant(ctx(), [status, stage, workview, wvStageStatus]);
        expect(r?.candidate.layoutId).toBe(wvStageStatus.layoutId);
        expect(r?.tier).toBe("process_workview_stage_status");
    });

    it("stage beats status; workview beats both", () => {
        const status = cand({ statusKey: "open" });
        const stage = cand({ stageKey: "lead" });
        expect(resolveSurfaceVariant(ctx(), [status, stage])?.candidate.layoutId).toBe(stage.layoutId);
        const workview = cand({ workViewId: "new_leads" });
        expect(resolveSurfaceVariant(ctx(), [status, stage, workview])?.candidate.layoutId).toBe(workview.layoutId);
    });

    it("tie-break: same specificity → highest version wins", () => {
        const v1 = cand({ workViewId: "new_leads", version: 1 });
        const v3 = cand({ workViewId: "new_leads", version: 3 });
        const v2 = cand({ workViewId: "new_leads", version: 2 });
        expect(resolveSurfaceVariant(ctx(), [v1, v3, v2])?.candidate.layoutId).toBe(v3.layoutId);
    });

    it("deterministic: result is independent of candidate array order", () => {
        const a = cand({ workViewId: "new_leads", version: 2 });
        const b = cand({ workViewId: null, stageKey: "lead" });
        const c = cand({ statusKey: "open" });
        const set = [a, b, c];
        const forward = resolveSurfaceVariant(ctx(), set)?.candidate.layoutId;
        const reversed = resolveSurfaceVariant(ctx(), [...set].reverse())?.candidate.layoutId;
        const shuffled = resolveSurfaceVariant(ctx(), [c, a, b])?.candidate.layoutId;
        expect(forward).toBe(a.layoutId);
        expect(reversed).toBe(a.layoutId);
        expect(shuffled).toBe(a.layoutId);
    });

    it("deterministic tie-break on equal specificity AND version uses lexically-least layoutId", () => {
        const zzz = cand({ layoutId: "Zzz", workViewId: "new_leads", version: 5 });
        const aaa = cand({ layoutId: "Aaa", workViewId: "new_leads", version: 5 });
        expect(resolveSurfaceVariant(ctx(), [zzz, aaa])?.candidate.layoutId).toBe("Aaa");
        expect(resolveSurfaceVariant(ctx(), [aaa, zzz])?.candidate.layoutId).toBe("Aaa");
    });

    it("generalizes across surfaces: header + queue + focus panel all resolve through one resolver", () => {
        for (const surface of ["workspace", "queue", "drawer"] as const) {
            const def = cand({ surface, workViewId: null });
            const wv = cand({ surface, workViewId: "new_leads" });
            const r = resolveSurfaceVariant(ctx({ surface }), [def, wv]);
            expect(r?.candidate.layoutId).toBe(wv.layoutId);
        }
    });
});
