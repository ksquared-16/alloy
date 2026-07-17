/**
 * U-P7 — operational presentation composition, and the Settlement boundary.
 *
 * Governing: runtime-implementation-authorization.md U-P7 (:145) + rationale (:150-154):
 *   "Row layout arriving *after* rows would re-lay them out … the old defect — presentation gating
 *    truth — disappears not by demoting layout, but by REMOVING THE ROUND-TRIP."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
    resolveOperationalPresentation,
    workUnitHeaderConfigFromLayoutDoc,
    rowVariantFromQueueDefinition,
    type OperationalPresentation,
} from "@/lib/runtime/provisioning/operationalPresentation";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";

const ORG = "org-1";
const QUEUE_DEF = { ui: { row_preview: { variant: "crm_compact" } } };

/** Supabase stub whose entity_layouts read returns whatever records the test supplies. */
function stub(records: unknown[] = []) {
    const touched: string[] = [];
    const client = {
        touched,
        from(table: string) {
            touched.push(table);
            const b: Record<string, unknown> = {
                select: () => b, eq: () => b, order: () => b, limit: () => b,
                then: (res: (v: unknown) => unknown) => Promise.resolve({ data: records, error: null }).then(res),
            };
            return b;
        },
    };
    return client as never;
}

const resolve = (over: Partial<Parameters<typeof resolveOperationalPresentation>[0]> = {}) =>
    resolveOperationalPresentation({
        supabase: stub(),
        orgId: ORG,
        fallbackTitle: "New Leads",
        queueLayoutId: "ql-1",
        focusPanelLayoutId: "fp-1",
        queueDefinition: QUEUE_DEF,
        queueRowLayoutConfig: null,
        ...over,
    });

describe("U-P7 — operational presentation composition", () => {
    it("2-3. header composition resolves; unpublished config falls back to the canonical default", async () => {
        const p = await resolve();
        expect(p.header.title).toBe("New Leads"); // fallback title, canonical default config
        expect(p.provenance.headerSource).toBe("builtin_default");
        expect(Array.isArray(p.header.kpiSlots)).toBe(true);
    });

    it("8. KPI SLOTS (geometry) are present at commit", async () => {
        const p = await resolve();
        // The canonical default publishes KPI slots — the header can be laid out at first sight.
        expect(p.header.kpiSlots.length).toBeGreaterThan(0);
        for (const s of p.header.kpiSlots) {
            expect(s).toHaveProperty("slot");
            expect(s).toHaveProperty("label");
            expect(s).toHaveProperty("sourceKey"); // WHICH metric settles here — an id, not a value
        }
    });

    it("9. KPI VALUES are absent — and unrepresentable in the type", async () => {
        const p = await resolve();
        for (const s of p.header.kpiSlots) {
            expect(s).not.toHaveProperty("formattedValue");
            expect(s).not.toHaveProperty("status");
            expect(s).not.toHaveProperty("value");
            expect(s).not.toHaveProperty("pending");
        }
        // Structural, not incidental: OperationalKpiSlot declares no value field, so a value cannot
        // be smuggled in. The boundary is a compile error, not a convention.
        const src = readFileSync(join(__dirname, "../../lib/runtime/provisioning/operationalPresentation.ts"), "utf8");
        const typeBlock = src.slice(src.indexOf("export type OperationalKpiSlot"), src.indexOf("/** U-O1 orientation"));
        expect(typeBlock).not.toMatch(/formattedValue|status\s*:|value\s*:/);
    });

    it("10-11. Settlement is absent from the whole composition", async () => {
        const p = await resolve();
        const json = JSON.stringify(p);
        for (const k of ["formattedValue", "count", "counts", "kpiValue", "activity", "communications", "history", "relatedRecords"]) {
            expect(json).not.toContain(`"${k}"`);
        }
    });

    it("4-5. queue row composition resolves published config; null → the CANONICAL fallback", async () => {
        const fallback = await resolve({ queueRowLayoutConfig: null });
        expect(fallback.queue.rowSlots).toBeDefined();
        expect(fallback.provenance.queueRowSource).toBe("canonical_fallback");
        expect(fallback.queue.published).toBe(false);

        // A minimally valid published V3 layout: columns carry blocks, blocks carry fields.
        const published = {
            variant: "operational-row",
            version: 3,
            columns: [
                { blocks: [{ type: "field_group", fields: [{ fieldKey: "title", visible: true }] }] },
            ],
        } as unknown as QueueRecordLayoutConfigV3;
        const p = await resolve({ queueRowLayoutConfig: published });
        expect(p.provenance.queueRowSource).toBe("published");
        expect(p.queue.published).toBe(true);
    });

    it("6+12+13. Focus Panel operational composition carries Situation, Decision, Action, scope state", async () => {
        const p = await resolve();
        expect(p.focusPanel.situation.subjectPlacement).toBeTruthy();
        expect(p.focusPanel.situation.businessStatePlacement).toBeTruthy();
        expect(p.focusPanel.decision.purposePlacement).toBeTruthy();
        expect(p.focusPanel.action.primaryActionPlacement).toBeTruthy(); // 12. primary Action placement
        expect(p.focusPanel.contextFramePlacement).toBeTruthy();
        expect(p.focusPanel.scopeStatePlacement).toBeTruthy(); // 13. FocusPanelScopeState placement
    });

    it("6b. Detail and History are NOT in the operational Focus Panel composition — they settle", async () => {
        const p = await resolve();
        expect(Object.keys(p.focusPanel).sort()).toEqual([
            "action", "contextFramePlacement", "decision", "scopeStatePlacement", "situation",
        ]);
    });

    it("14-15. geometry is stable and no operational layout id requires a later lookup", async () => {
        const p = await resolve();
        // Identifiers survive as PROVENANCE only.
        expect(p.provenance.queueLayoutId).toBe("ql-1");
        expect(p.provenance.focusPanelLayoutId).toBe("fp-1");
        // Everything renderable is already resolved: title, slots, row slots, panel regions.
        expect(p.header.title).toBeTruthy();
        expect(p.queue.rowVariant).toBe("crm_compact");
        expect(p.queue.rowSlots).toBeDefined();
        // The identifiers are NOT the only renderable representation — that was the defect.
        const renderable: Array<keyof OperationalPresentation> = ["header", "queue", "focusPanel"];
        for (const k of renderable) expect(p[k]).toBeDefined();
    });

    it("17. a layout feature flag cannot make U-P7 unavailable", async () => {
        // The gate can only downgrade published → canonical fallback. Composition still resolves.
        const p = await resolve({ queueRowLayoutConfig: null });
        expect(p.queue.rowSlots).toBeDefined();
        expect(p.header.title).toBeTruthy();
        expect(p.focusPanel).toBeDefined();
    });

    it("16. route and D1 share ONE decoder and ONE row-layout resolver", () => {
        const route = readFileSync(join(__dirname, "../../app/api/admin/queue-row-layout/[surfaceId]/route.ts"), "utf8");
        // The route delegates to the shared owner rather than carrying its own chain.
        expect(route).toMatch(/resolveQueueRowLayoutServer/);
        expect(route).not.toMatch(/function resolveSurfaceSpec\(/);
        expect(route).not.toMatch(/function envelopeFromResolution\(/);
        // D1 consumes the same owner.
        const d1 = readFileSync(join(__dirname, "../../lib/runtime/provisioning/workUnitProvisioningAnswer.ts"), "utf8");
        expect(d1).toMatch(/resolveQueueRowLayoutServer/);
        expect(d1).toMatch(/resolveOperationalPresentation/);
    });

    it("the header decoder is the shared canonical owner", () => {
        // Same doc → same config, on both the route path and the runtime path.
        const doc = { metadata: { workUnitHeaderSurface: { version: 1, title: "Custom", subtitle: null, kpis: [] } } };
        const cfg = workUnitHeaderConfigFromLayoutDoc(doc as never);
        expect(cfg.title).toBe("Custom");
        expect(workUnitHeaderConfigFromLayoutDoc(null).title).toBeDefined(); // null → canonical default
    });

    it("row variant comes from the work unit's queue_definition", () => {
        expect(rowVariantFromQueueDefinition(QUEUE_DEF)).toBe("crm_compact");
        expect(rowVariantFromQueueDefinition(null)).toBe("basic");
    });

    it("configuration unavailability is NOT an operational error — the default composes", async () => {
        const throwing = {
            from() {
                throw new Error("configuration store down");
            },
        } as never;
        const p = await resolveOperationalPresentation({
            supabase: throwing, orgId: ORG, fallbackTitle: "New Leads",
            queueLayoutId: null, focusPanelLayoutId: null,
            queueDefinition: QUEUE_DEF, queueRowLayoutConfig: null,
        });
        // U-P7 must never be the reason a Work Unit cannot commit.
        expect(p.header.title).toBe("New Leads");
        expect(p.provenance.headerSource).toBe("builtin_default");
    });
});
