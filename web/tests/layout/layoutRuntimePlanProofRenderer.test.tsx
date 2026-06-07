/**
 * Proof binding value resolution — Phase 2 tests.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    buildLayoutRuntimePlan,
    buildOpportunityDrawerRelationshipProofLayout,
    buildProofOpportunityRecord,
    classifyLayoutItemBinding,
    collectLayoutItems,
    isOpaqueIdValue,
    OPPORTUNITY_COMPUTE_KEYS,
    resolveProofBindingValue,
} from "@/lib/layout/runtime";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutItem } from "@/lib/layout/layoutV2";

describe("resolveProofBindingValue", () => {
    const record = buildProofOpportunityRecord();
    const anchor = "opportunities";

    it("resolves base fields from record", () => {
        const item: LayoutItem = { id: "f1", kind: "field", refKey: "name", label: "Name" };
        const r = resolveProofBindingValue(record, item, anchor);
        expect(r.isPlaceholder).toBe(false);
        expect(r.display).toContain("Johnson");
        expect(r.bindingClass).toBe("base_field");
    });

    it("primary contact renders person handle, not raw id", () => {
        const items = collectLayoutItems(buildOpportunityDrawerRelationshipProofLayout());
        const employee = items.find((i) => i.refKey === "person.is_employee")!;
        const r = resolveProofBindingValue(record, employee, anchor);
        expect(r.bindingClass).toBe("relationship_field");
        expect(r.relationHandle).toBe("Jamie Johnson");
        expect(r.display).toBe("No");
        expect(r.display).not.toMatch(/[0-9a-f-]{36}/);
    });

    it("location reference fields use handles not uuid ids", () => {
        const items = collectLayoutItems(buildOpportunityDrawerRelationshipProofLayout());
        const site = items.find((i) => i.refKey === "location.site_label")!;
        const r = resolveProofBindingValue(record, site, anchor);
        expect(r.bindingClass).toBe("reference_field");
        expect(r.relationHandle).toContain("Sunshine");
        expect(r.isPlaceholder).toBe(false);
        expect(isOpaqueIdValue(r.display)).toBe(false);
    });

    it("program category is computed read-only projection", () => {
        const items = collectLayoutItems(buildOpportunityDrawerRelationshipProofLayout());
        const prog = items.find((i) => i.refKey === "enrollment.program_category")!;
        const r = resolveProofBindingValue(record, prog, anchor);
        expect(r.bindingClass).toBe("computed_projection");
        expect(r.isComputed).toBe(true);
        expect(r.display).toBe("Infant Care");
    });

    it("fails closed when computed key missing from record", () => {
        const item: LayoutItem = {
            id: "x",
            kind: "field",
            refKey: "enrollment.readiness_summary",
            label: "Readiness",
            metadata: {
                binding: {
                    bindingClass: "computed_projection",
                    computeKey: OPPORTUNITY_COMPUTE_KEYS.readiness_summary,
                    sourceEntity: "enrollment",
                    fieldKey: "readiness_summary",
                },
            },
        };
        const r = resolveProofBindingValue(record, item, anchor);
        expect(r.isPlaceholder).toBe(true);
        expect(r.isComputed).toBe(true);
    });

    it("never surfaces opaque uuid as display for relationship fields", () => {
        const badRecord = buildProofOpportunityRecord({
            _relations: {
                primary_contact: {
                    handle: "Jamie Johnson",
                    fields: { primary_contact_name: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
                },
            },
        });
        const item: LayoutItem = {
            id: "n",
            kind: "field",
            refKey: "person.primary_contact_name",
            metadata: { binding: { bindingClass: "relationship_field", relationKey: "primary_contact", fieldKey: "primary_contact_name" } },
        };
        const r = resolveProofBindingValue(badRecord, item, anchor);
        expect(r.isPlaceholder).toBe(true);
    });
});

describe("LayoutRuntimePlanView — proof renderer", () => {
    it("renders sections from resolved layout + runtime plan", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const plan = buildLayoutRuntimePlan(doc);
        const record = buildProofOpportunityRecord();
        const html = renderToStaticMarkup(<LayoutRuntimePlanView doc={doc} plan={plan} record={record} />);

        expect(html).toContain("Runtime plan");
        expect(html).toContain("Primary contact");
        expect(html).toContain("Jamie Johnson");
        expect(html).toContain("Infant Care");
        expect(html).toContain("computed");
        expect(html).toContain("Enrollment children");
        expect(html).toContain("Alex Johnson");
        expect(html).toContain("enrollment context");
    });

    it("enrollment repeater columns use child_inquiry labels not OCM table names", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const record = buildProofOpportunityRecord();
        const html = renderToStaticMarkup(<LayoutRuntimePlanView doc={doc} record={record} />);

        expect(html).toContain("Child");
        expect(html).toContain("Desired start");
        expect(html.toLowerCase()).not.toContain("ocm");
    });

    it("includes widget and base field sections from lead default", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const plan = buildLayoutRuntimePlan(doc);
        expect(plan.itemKindCounts.widget_placeholder).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.base_field).toBeGreaterThan(0);

        const record = buildProofOpportunityRecord();
        const html = renderToStaticMarkup(<LayoutRuntimePlanView doc={doc} record={record} />);
        expect(html).toContain("Follow up on tour");
    });
});

describe("classifyLayoutItemBinding — parity with proof resolution", () => {
    it("repeater binding matches enrollment_children relation", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const repeater = collectLayoutItems(doc).find((i) => i.kind === "related_list" && i.refKey === "enrollment_children")!;
        const binding = classifyLayoutItemBinding(repeater, "opportunities");
        expect(binding.bindingClass).toBe("repeater");
        expect(binding.relationKey).toBe("enrollment_children");
        expect(binding.sourceEntity).toBe("child_inquiry");
    });
});
