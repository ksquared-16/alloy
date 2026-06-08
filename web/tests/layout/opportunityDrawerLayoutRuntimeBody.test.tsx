/**
 * C1b — opportunity drawer layout runtime overview body tests.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    isLayoutRuntimeOpportunityDrawerBodyEnabledClient,
    isLayoutRuntimeOpportunityDrawerBodyEnabledServer,
} from "@/lib/layout/featureFlag";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildOpportunityLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm";
import {
    evaluateOpportunityLayoutRuntimeBodyFromVm,
    isOpportunityLayoutDocRenderable,
} from "@/lib/layout/runtime/evaluateOpportunityLayoutRuntimeBody";
import { isLayoutItemSupportedForProduction } from "@/lib/layout/runtime/isLayoutItemSupportedForProduction";
import { futureModuleWidget } from "@/lib/layout/runtime/proofLayoutHelpers";
import {
    resolveOpportunityOverviewBodyPresentation,
    shouldFallbackLayoutFetchOnTimeout,
    OPPORTUNITY_DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS,
} from "@/lib/layout/runtime/useOpportunityDrawerLayoutRuntimeBody";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import OpportunityDrawerLayoutRuntimeBodyErrorBoundary from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyErrorBoundary";

function assertLayoutRuntimeBodyErrorState(error: Error): { hasError: boolean } {
    const derive = OpportunityDrawerLayoutRuntimeBodyErrorBoundary as unknown as {
        getDerivedStateFromError: (err: Error) => { hasError: boolean };
    };
    return derive.getDerivedStateFromError(error);
}

describe("C1b opportunity drawer body gates", () => {
    const env = { ...process.env };

    beforeEach(() => {
        delete process.env.LAYOUT_RUNTIME_ENABLED;
        delete process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER;
        delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED;
        delete process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER;
    });

    afterEach(() => {
        process.env = { ...env };
    });

    it("body cutover requires runtime + opportunity drawer flags", () => {
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledClient()).toBe(false);

        process.env.LAYOUT_RUNTIME_ENABLED = "1";
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED = "1";
        process.env.LAYOUT_RUNTIME_OPPORTUNITY_DRAWER = "1";
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER = "1";

        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledClient()).toBe(true);
    });
});

describe("resolveOpportunityOverviewBodyPresentation", () => {
    it("flags off always renders VM body", () => {
        expect(resolveOpportunityOverviewBodyPresentation({ cutoverEnabled: false, phase: "ready" })).toBe("vm");
    });

    it("flags on holds during idle/loading and renders layout when ready", () => {
        expect(resolveOpportunityOverviewBodyPresentation({ cutoverEnabled: true, phase: "idle" })).toBe("hold");
        expect(resolveOpportunityOverviewBodyPresentation({ cutoverEnabled: true, phase: "loading" })).toBe("hold");
        expect(resolveOpportunityOverviewBodyPresentation({ cutoverEnabled: true, phase: "fallback" })).toBe("vm");
        expect(resolveOpportunityOverviewBodyPresentation({ cutoverEnabled: true, phase: "ready" })).toBe("layout");
    });

    it("max hold timeout falls back to VM presentation", () => {
        expect(OPPORTUNITY_DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS).toBeGreaterThanOrEqual(1500);
        expect(OPPORTUNITY_DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS).toBeLessThanOrEqual(2000);

        const started = 1_000_000;
        expect(
            shouldFallbackLayoutFetchOnTimeout({
                cutoverEnabled: true,
                phase: "loading",
                fetchStartedAtMs: started,
                nowMs: started + OPPORTUNITY_DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS - 1,
            }),
        ).toBe(false);
        expect(
            shouldFallbackLayoutFetchOnTimeout({
                cutoverEnabled: true,
                phase: "loading",
                fetchStartedAtMs: started,
                nowMs: started + OPPORTUNITY_DRAWER_LAYOUT_RUNTIME_BODY_MAX_HOLD_MS,
            }),
        ).toBe(true);
        expect(resolveOpportunityOverviewBodyPresentation({ cutoverEnabled: true, phase: "fallback" })).toBe("vm");
    });
});

describe("buildOpportunityLayoutRuntimeRecordFromVm", () => {
    it("maps VM paint record to operator-safe layout runtime record", () => {
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: {
                name: "Johnson Family",
                status_key: "qualified",
                _status_display: "Qualified",
                _primary_contact_name: "Jamie Johnson",
                _primary_contact_phone: "(555) 234-8901",
                _primary_contact_email: "jamie.j@example.com",
                _inquiry_children: [
                    {
                        id: "row-1",
                        display_name: "Alex Johnson",
                        desired_start_date: "2026-09-01",
                        location_label: "Main Campus",
                        program_room_cohort_label: "Infant AM",
                        outcome_status_label: "Active inquiry",
                        customer_member_id: "cm-secret",
                        ocm_id: "ocm-secret",
                    },
                ],
            },
            statusDisplay: "Qualified",
        });

        expect(record["person.primary_contact_name"]).toBe("Jamie Johnson");
        const children = record.enrollment_children;
        expect(Array.isArray(children) && children[0]?.["child.name"]).toBe("Alex Johnson");
        expect(Array.isArray(record.children) && record.children.length).toBe(children?.length ?? 0);
        expect(children?.[0]?.["child.program"]).toBe("Infant AM");
        expect(record["opportunity.tour_date"]).toBeDefined();
        expect(JSON.stringify(record.enrollment_children)).not.toContain("cm-secret");
        expect(JSON.stringify(record.enrollment_children)).not.toContain("ocm-secret");
        expect(record._relations?.primary_contact?.handle).toBe("Jamie Johnson");
    });
});

describe("evaluateOpportunityLayoutRuntimeBodyFromVm", () => {
    it("returns layout body payload for renderable docs", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = evaluateOpportunityLayoutRuntimeBodyFromVm({
            doc,
            opportunityId: "opp-1",
            vmRecord: { name: "Test Opp", status_key: "new" },
            layoutSource: "default",
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.doc.sections.length).toBeGreaterThan(0);
            expect(result.record.id).toBe("opp-1");
        }
    });

    it("falls back when doc has no supported production items", () => {
        const doc = buildLeadDrawerDefaultDoc();
        doc.sections = [
            {
                ...doc.sections[0]!,
                rows: doc.sections[0]!.rows.map((row) => ({
                    ...row,
                    columns: row.columns.map((col) => ({
                        ...col,
                        items: [futureModuleWidget("opportunities", "x", "communications", "Communications")],
                    })),
                })),
            },
        ];
        expect(isOpportunityLayoutDocRenderable(doc)).toBe(false);
        const result = evaluateOpportunityLayoutRuntimeBodyFromVm({
            doc,
            opportunityId: "opp-1",
            vmRecord: { name: "Test Opp" },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe("layout_not_renderable");
    });
});

describe("isLayoutItemSupportedForProduction", () => {
    it("omits future modules and simulated action widgets", () => {
        const future = futureModuleWidget("opportunities", "x", "parents", "Parents");
        expect(isLayoutItemSupportedForProduction(future)).toBe(false);
        expect(
            isLayoutItemSupportedForProduction({
                id: "w-actions",
                kind: "widget_placeholder",
                refKey: "actions",
                label: "Actions",
            }),
        ).toBe(false);
    });
});

describe("LayoutRuntimeDrawerBodyView production renderer", () => {
    it("renders operator-safe layout body without proof binding banner", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: {
                name: "Johnson Family",
                "person.primary_contact_name": "Jamie Johnson",
                "person.primary_phone": "(555) 234-8901",
                _inquiry_children: [
                    {
                        id: "row-1",
                        display_name: "Alex Johnson",
                        program_room_cohort_label: "Infant AM",
                    },
                ],
            },
        });
        const html = renderToStaticMarkup(<LayoutRuntimeDrawerBodyView doc={doc} record={record} />);
        expect(html).toContain("Jamie Johnson");
        expect(html).toContain("Alex Johnson");
        expect(html).not.toContain("Runtime plan ·");
        expect(html).not.toContain("computed");
        expect(html).not.toContain("person.primary_contact_name");
        expect(html).not.toContain("inquiry_child");
        expect(html).not.toContain("customer_member");
    });

    it("children repeater binds via children source alias", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: {
                name: "Johnson Family",
                _inquiry_children: [{ id: "row-1", display_name: "Alex Johnson" }],
            },
        });
        expect(Array.isArray(record.children) && record.children[0]?.["child.name"]).toBe("Alex Johnson");
        const html = renderToStaticMarkup(<LayoutRuntimeDrawerBodyView doc={doc} record={record} />);
        expect(html).toContain("Alex Johnson");
    });

    it("layout failure path keeps VM presentation resolver on VM", () => {
        expect(resolveOpportunityOverviewBodyPresentation({ cutoverEnabled: true, phase: "fallback" })).toBe("vm");
    });

    it("error boundary class is wired for layout overview render protection", () => {
        expect(assertLayoutRuntimeBodyErrorState(new Error("boom"))).toEqual({ hasError: true });
    });
});
