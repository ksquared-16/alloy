import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    foldField, forbidden, known, knownEmpty, projectionMatchesConfiguration, unavailable, unknown,
    type FirstOrderConfigurationIdentity, type FirstOrderWorkUnitProjection,
} from "@/lib/runtime/firstOrder/firstOrderWorkUnitProjection";

const SRC = readFileSync(resolve(process.cwd(), "lib/runtime/firstOrder/firstOrderWorkUnitProjection.ts"), "utf8");

/**
 * The source with comments stripped.
 *
 * A substring gate over the WHOLE file cannot tell a transported field from the prose explaining
 * why that field is absent — and this contract's comments deliberately name every Stage-2 owner it
 * excludes, so the naive check fails on its own documentation. Declarations are what the gate is
 * about.
 */
const DECLARATIONS = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * THE FIRST-ORDER PROJECTION CONTRACT (P0-7.6 · A′ Slice 1 item A).
 *
 * Gates written before the composer that will fill this shape, so the contract is the thing under
 * review rather than whatever an implementation happens to produce.
 */

const identity = (over: Partial<FirstOrderConfigurationIdentity> = {}): FirstOrderConfigurationIdentity => ({
    cardKeys: ["business_process", "financials", "children", "household", "attendance", "health_safety"],
    kpiKeys: ["needs_attention", "overdue_work", "pipeline_children"],
    workViewIds: ["new-leads", "tours"],
    siteScopeId: null,
    ...over,
});

const projection = (id = identity()): FirstOrderWorkUnitProjection => ({
    workUnitId: "wu-1",
    subjectId: known("subj-1"),
    configurationIdentity: id,
    geometry: { cardOrder: id.cardKeys, kpiSlotCount: id.kpiKeys.length, workViewCount: id.workViewIds.length },
    queueRows: known([]),
    kpiValues: {},
    workViewTotals: {},
    cards: {},
});

describe("the state model cannot collapse UNKNOWN into ZERO", () => {
    const render = <T,>(f: Parameters<typeof foldField<T, string>>[0]) =>
        foldField(f, {
            known: (v) => `value:${String(v)}`,
            knownEmpty: () => "empty",
            unknown: () => "UNKNOWN",
            unavailable: (r) => `UNAVAILABLE:${r}`,
            forbidden: () => "FORBIDDEN",
        });

    it("each state renders distinctly — zero is not empty, empty is not unknown", () => {
        expect(render(known(0))).toBe("value:0");
        expect(render(knownEmpty<number>())).toBe("empty");
        expect(render(unknown<number>())).toBe("UNKNOWN");
        expect(render(unavailable<number>("read failed"))).toBe("UNAVAILABLE:read failed");
        expect(render(forbidden<number>())).toBe("FORBIDDEN");
        expect(new Set([render(known(0)), render(knownEmpty<number>()), render(unknown<number>()),
            render(unavailable<number>("x")), render(forbidden<number>())]).size).toBe(5);
    });

    it("a known ZERO is a real answer and must survive as one", () => {
        // The mirror of the defect: refusing to show a true zero is as wrong as inventing one.
        expect(render(known(0))).toContain("0");
    });

    it("THE LOCK: no valueOr-style default helper exists to collapse a state", () => {
        // A `valueOr(field, 0)` convenience is exactly how UNKNOWN becomes ZERO. Its absence is
        // part of the contract, so its reintroduction must fail here first.
        expect(SRC).not.toMatch(/export function valueOr|valueOrDefault|\?\?\s*0\b/);
        expect(SRC).toContain("export function foldField");
    });

    it("foldField is total — every state has a handler and none falls through", () => {
        for (const f of [known(1), knownEmpty<number>(), unknown<number>(), unavailable<number>("r"), forbidden<number>()]) {
            expect(render(f)).not.toBe(undefined);
        }
    });
});

describe("configuration identity: N cannot satisfy N+1", () => {
    it("matches itself", () => {
        expect(projectionMatchesConfiguration(projection(), identity())).toEqual({ matches: true });
    });

    const CHANGES: Array<[string, Partial<FirstOrderConfigurationIdentity>]> = [
        ["a card removed", { cardKeys: ["business_process", "financials"] }],
        ["a card added", { cardKeys: [...identity().cardKeys, "billing_preview"] }],
        ["cards reordered", { cardKeys: [...identity().cardKeys].reverse() }],
        ["a KPI removed", { kpiKeys: ["needs_attention"] }],
        ["a KPI added", { kpiKeys: [...identity().kpiKeys, "new_kpi"] }],
        ["a Work View removed", { workViewIds: ["new-leads"] }],
        ["Work Views reordered", { workViewIds: ["tours", "new-leads"] }],
        ["site scope changed", { siteScopeId: "site-2" }],
    ];

    for (const [name, over] of CHANGES) {
        it(`rejects when ${name}`, () => {
            const r = projectionMatchesConfiguration(projection(), identity(over));
            expect(r.matches, name).toBe(false);
        });
    }

    it("REORDER IS A MISMATCH even though semantic identity is unchanged", () => {
        // Geometry depends on order, so a reordered frame is a different frame. Comparing as sets
        // would pass this and let Stage 2 relocate a card.
        const r = projectionMatchesConfiguration(projection(), identity({ cardKeys: [...identity().cardKeys].reverse() }));
        expect(r.matches).toBe(false);
        if (!r.matches) expect(r.reason).toContain("order");
    });

    it("a mismatch names WHICH dimension moved, not just that something did", () => {
        const r = projectionMatchesConfiguration(projection(), identity({ siteScopeId: "site-2" }));
        if (!r.matches) expect(r.reason).toBe("site scope changed");
    });
});

describe("the projection carries Stage-1 truth only", () => {
    it("cards are keyed by configured key, so membership is not a type change", () => {
        expect(DECLARATIONS).toContain("readonly cards: Readonly<Record<string, FirstOrderCardSummary>>");
        // Naming the six cards as fields would bake today's configuration into the contract.
        for (const k of ["business_process:", "health_safety:", "financials:"]) expect(DECLARATIONS).not.toContain(k);
    });

    it("THE GATE: no Stage-2 owner is transported", () => {
        for (const owner of ["nestedSurfaces", "drawer", "recentActivity", "paymentApplications", "avatar", "merchant"]) {
            expect(DECLARATIONS, `${owner} is Stage-2 detail and must not appear in the Stage-1 contract`)
                .not.toContain(owner);
        }
    });

    it("THE CONTROL: the stripped source still contains the real declarations", () => {
        // If the comment-stripper over-reached, the gate above would pass vacuously.
        expect(DECLARATIONS).toContain("FirstOrderWorkUnitProjection");
        expect(DECLARATIONS).toContain("personalSeen");
        expect(DECLARATIONS.length).toBeGreaterThan(800);
    });

    it("personal_seen stays viewer-scoped and request-time", () => {
        expect(SRC).toContain("personalSeen");
        expect(SRC).toMatch(/viewer-scoped and request-time; never maintained/i);
    });

    it("geometry carries final structure so Stage 2 cannot relocate anything", () => {
        const p = projection();
        expect(p.geometry.cardOrder).toEqual(p.configurationIdentity.cardKeys);
        expect(p.geometry.kpiSlotCount).toBe(p.configurationIdentity.kpiKeys.length);
    });
});
