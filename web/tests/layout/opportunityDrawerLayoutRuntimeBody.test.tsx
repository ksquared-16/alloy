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
import {
    buildLayoutRuntimeRecordBindingEvidence,
    buildOpportunityLayoutRuntimeRecordFromVm,
    collectLayoutDocFieldRefKeys,
} from "@/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
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

    it("body cutover enabled by default without env vars", () => {
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(true);
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledClient()).toBe(true);
    });

    it("body cutover disabled by emergency fallback or explicit kill switch", () => {
        process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK = "1";
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);

        delete process.env.LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK;
        process.env.LAYOUT_RUNTIME_ENABLED = "0";
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_ENABLED = "0";
        expect(isLayoutRuntimeOpportunityDrawerBodyEnabledServer()).toBe(false);
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
        const children = record.enrollment_children as { "child.name"?: string; "child.program"?: string }[] | undefined;
        expect(Array.isArray(children) && children[0]?.["child.name"]).toBe("Alex Johnson");
        expect(Array.isArray(record.children) && record.children.length).toBe(children?.length ?? 0);
        expect(children?.[0]?.["child.program"]).toBe("Infant AM");
        expect(record["opportunity.tour_date"]).toBeDefined();
        expect(JSON.stringify(record.enrollment_children)).not.toContain("cm-secret");
        expect(JSON.stringify(record.enrollment_children)).not.toContain("ocm-secret");
        expect(record._relations?.primary_contact?.handle).toBe("Jamie Johnson");
    });
});

/** A LayoutDoc whose field refKeys are NOT in the old hardcoded record subset. */
function customRefKeyDoc(): LayoutDoc {
    const field = (id: string, refKey: string, label: string) => ({
        id, kind: "field" as const, refKey, label, renderHint: "text" as const,
    });
    return {
        formatVersion: 1,
        surface: "drawer",
        entityType: "opportunities",
        sections: [
            {
                id: "sec1",
                key: "summary",
                title: "Summary",
                rows: [
                    {
                        id: "r0",
                        columns: [
                            {
                                id: "c0",
                                width: 12,
                                items: [
                                    field("f-quote", "opportunity.quote_total", "Quote total"),
                                    field("f-custom", "opportunity.custom_unmapped_field", "Custom field"),
                                    field("f-rel", "person.relationship", "Relationship"),
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    } as unknown as LayoutDoc;
}

describe("doc-driven refKey → runtime record binding (blank-body fix)", () => {
    it("carries every configured field refKey, mapping VM values where present", () => {
        const doc = customRefKeyDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: { name: "Nguyen Family", quote_total: "$4,200", person: undefined },
            doc,
        });
        // VM-backed custom refKey resolves to its value…
        expect(record["opportunity.quote_total"]).toBe("$4,200");
        // …refKeys with no VM source are still PRESENT (set to ""), so the field
        // renders a label + "—" instead of vanishing.
        expect(record["opportunity.custom_unmapped_field"]).toBe("");
        expect(record).toHaveProperty("person.relationship");
    });

    it("emits binding evidence with no missing refKeys after mapping", () => {
        const doc = customRefKeyDoc();
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: { quote_total: "$4,200" },
            doc,
        });
        const evidence = buildLayoutRuntimeRecordBindingEvidence(doc, record);
        expect(evidence.layoutItemRefKeys).toEqual(
            expect.arrayContaining(["opportunity.quote_total", "opportunity.custom_unmapped_field", "person.relationship"]),
        );
        expect(evidence.missingRefKeys).toEqual([]);
        expect(collectLayoutDocFieldRefKeys(doc)).toContain("opportunity.custom_unmapped_field");
    });

    it("without doc, unmapped refKeys remain absent (regression guard for the bug)", () => {
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: { quote_total: "$4,200" },
        });
        expect(record["opportunity.custom_unmapped_field"]).toBeUndefined();
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
                id: "empty-section",
                key: "empty",
                title: "Empty",
                rows: [],
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
    it("supports configured widgets including future modules and actions", () => {
        const future = futureModuleWidget("opportunities", "x", "parents", "Parents");
        expect(isLayoutItemSupportedForProduction(future)).toBe(true);
        expect(
            isLayoutItemSupportedForProduction({
                id: "w-actions",
                kind: "widget_placeholder",
                refKey: "actions",
                label: "Actions",
            }),
        ).toBe(true);
    });

    it("supports related_list displayMode list (published v10 child section)", () => {
        expect(
            isLayoutItemSupportedForProduction({
                id: "children",
                kind: "related_list",
                refKey: "children",
                source: "children",
                displayMode: "list",
                columns: [{ refKey: "child.first_name", label: "First Name" }],
            }),
        ).toBe(true);
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

    it("renders published v10 list-mode child section with first_name columns", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const sections = doc.sections.map((section) =>
            section.title === "Child Information" ?
                {
                    ...section,
                    rows: section.rows.map((row) => ({
                        ...row,
                        columns: row.columns.map((col) => ({
                            ...col,
                            items: col.items.map((item) =>
                                item.kind === "related_list" && item.refKey === "children" ?
                                    {
                                        ...item,
                                        displayMode: "list" as const,
                                        columns: [
                                            { refKey: "child.first_name", label: "First Name" },
                                            { refKey: "child.last_name", label: "Last Name" },
                                        ],
                                    }
                                :   item,
                            ),
                        })),
                    })),
                }
            :   section,
        );
        const v10Doc = { ...doc, sections };
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: {
                name: "Mitchell Family",
                _inquiry_children: [
                    { id: "ocm-1", first_name: "Jim", last_name: "Pat", person_id: "p1", display_name: "Jim Pat" },
                ],
            },
        });
        const html = renderToStaticMarkup(<LayoutRuntimeDrawerBodyView doc={v10Doc} record={record} />);
        expect(html).toContain("Jim");
        expect(html).toContain("Pat");
    });

    it("layout failure path keeps VM presentation resolver on VM", () => {
        expect(resolveOpportunityOverviewBodyPresentation({ cutoverEnabled: true, phase: "fallback" })).toBe("vm");
    });

    it("error boundary class is wired for layout overview render protection", () => {
        expect(assertLayoutRuntimeBodyErrorState(new Error("boom"))).toEqual({ hasError: true });
    });
});
