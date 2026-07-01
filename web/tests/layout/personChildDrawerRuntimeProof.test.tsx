/**
 * Person + Child drawer runtime foundation — proof tests.
 *
 * Validates relationship/reference modeling, future module placeholders,
 * and LayoutRuntimePlan rendering without production cutover.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
    appendOpportunityFutureTabPlaceholders,
    buildChildDrawerRelationshipProofLayout,
    buildLayoutRuntimePlan,
    buildOpportunityDrawerRelationshipProofLayout,
    buildPersonDrawerRelationshipProofLayout,
    buildProofChildRecord,
    buildProofPersonRecord,
    CHILD_COMPUTE_KEYS,
    classifyLayoutItemBinding,
    collectLayoutItems,
    getChildRelation,
    getPersonRelation,
    OPPORTUNITY_FUTURE_DRAWER_MODULES,
    PERSON_DRAWER_RELATIONS,
    resolveProofBindingValue,
    shouldRenderProofItem,
} from "@/lib/layout/runtime";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { isLayoutRuntimeEnabledServer } from "@/lib/layout/featureFlag";
import type { LayoutItem } from "@/lib/layout/layoutV2";

describe("personDrawerRuntimeProof — layout plan", () => {
    it("parses and builds a runtime plan with relationship bindings", () => {
        const doc = buildPersonDrawerRelationshipProofLayout();
        const parsed = parseLayoutDoc(doc);
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);

        const plan = buildLayoutRuntimePlan(doc);
        expect(plan.entityType).toBe("persons");
        expect(plan.layoutKey).toBe("person_relationship_proof_v1");
        expect(plan.bindingClassCounts.base_field).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.reference_field).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.relationship_field).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.repeater).toBeGreaterThan(0);
        expect(plan.itemKindCounts.widget_placeholder).toBeGreaterThan(0);
    });

    it("models household and children as relationships, not flat person fields", () => {
        const doc = buildPersonDrawerRelationshipProofLayout();
        const items = collectLayoutItems(doc);

        const household = items.find((i) => i.refKey === "customer.household_name");
        expect(household).toBeDefined();
        const hhBinding = classifyLayoutItemBinding(household!, "persons");
        expect(hhBinding.bindingClass).toBe("reference_field");
        expect(hhBinding.relationKey).toBe("household_customer");

        const primaryChild = items.find((i) => i.refKey === "child.name" && readBinding(i)?.relationKey === "primary_child");
        expect(primaryChild).toBeDefined();
        expect(classifyLayoutItemBinding(primaryChild!, "persons").bindingClass).toBe("relationship_field");

        const repeater = items.find((i) => i.kind === "related_list" && i.refKey === "household_children");
        expect(repeater).toBeDefined();
        expect(classifyLayoutItemBinding(repeater!, "persons").bindingClass).toBe("repeater");

        expect(PERSON_DRAWER_RELATIONS.household_children.targetEntity).toBe("customer_members");
        expect(getPersonRelation("primary_child")?.label).toBeTruthy();
    });

    it("renders person proof layout via LayoutRuntimePlanView", () => {
        const doc = buildPersonDrawerRelationshipProofLayout();
        const record = buildProofPersonRecord();
        const html = renderToStaticMarkup(<LayoutRuntimePlanView doc={doc} record={record} />);

        expect(html).toContain("Johnson Household");
        expect(html).toContain("Riley Brooks");
        expect(html).toContain("Children");
        expect(html).toContain("Future module");
        expect(html.toLowerCase()).not.toContain("customer_member");
        expect(html.toLowerCase()).not.toContain("ocm");
    });
});

describe("childDrawerRuntimeProof — layout plan", () => {
    it("parses and builds a runtime plan with location roles and person relationships", () => {
        const doc = buildChildDrawerRelationshipProofLayout();
        const parsed = parseLayoutDoc(doc);
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);

        const plan = buildLayoutRuntimePlan(doc);
        expect(plan.entityType).toBe("customer_members");
        expect(plan.layoutKey).toBe("child_relationship_proof_v1");
        expect(plan.bindingClassCounts.base_field).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.reference_field).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.relationship_field).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.computed_projection).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.repeater).toBeGreaterThan(0);
    });

    it("uses child.* for durable attributes and relationships for parents/locations", () => {
        const doc = buildChildDrawerRelationshipProofLayout();
        const items = collectLayoutItems(doc);

        const childName = items.find((i) => i.refKey === "child.name" && readBinding(i)?.bindingClass === "base_field");
        expect(childName).toBeDefined();

        const site = items.find((i) => i.refKey === "location.site_label");
        expect(site).toBeDefined();
        const siteBinding = classifyLayoutItemBinding(site!, "customer_members");
        expect(siteBinding.bindingClass).toBe("reference_field");
        expect(siteBinding.locationRole).toBe("site");
        expect(siteBinding.relationKey).toBe("enrollment_site_location");

        const classroom = items.find((i) => i.refKey === "location.classroom_label");
        expect(classifyLayoutItemBinding(classroom!, "customer_members").locationRole).toBe("classroom");

        const room = items.find((i) => i.refKey === "location.room_label");
        expect(classifyLayoutItemBinding(room!, "customer_members").locationRole).toBe("room");

        const primaryContact = items.find((i) => i.refKey === "person.primary_contact_name");
        expect(classifyLayoutItemBinding(primaryContact!, "customer_members").relationKey).toBe("primary_contact");

        const parentsRepeater = items.find((i) => i.kind === "related_list" && i.refKey === "parents");
        expect(parentsRepeater).toBeDefined();
        expect(getChildRelation("parents")?.targetEntity).toBe("persons");
    });

    it("does not flatten classroom/site into child fields", () => {
        const doc = buildChildDrawerRelationshipProofLayout();
        const items = collectLayoutItems(doc);
        const flatLocationFields = items.filter(
            (i) => i.refKey.startsWith("child.") && /classroom|site|room|location/.test(i.refKey),
        );
        expect(flatLocationFields).toHaveLength(0);
    });

    it("renders child proof with handles, not opaque ids", () => {
        const doc = buildChildDrawerRelationshipProofLayout();
        const record = buildProofChildRecord();
        const html = renderToStaticMarkup(
            <LayoutRuntimePlanView doc={doc} record={record} useSectionFlow={false} variant="proof" />
        );

        expect(html).toContain("Riley Brooks");
        expect(html).toContain("Jamie Johnson");
        expect(html).toContain("Infant Room A");
        expect(html).toContain("Sunshine Early Learning");
        expect(html).toContain("Schedule");
        expect(html).toContain("Future module");
        expect(html).toContain("Placeholder only");
        expect(html.toLowerCase()).not.toContain("inquiry_child");
        expect(html.toLowerCase()).not.toContain("child_inquiry");
    });

    it("resolves enrollment status as computed projection", () => {
        const record = buildProofChildRecord();
        const item: LayoutItem = {
            id: "x",
            kind: "field",
            refKey: "enrollment.enrollment_status",
            metadata: {
                binding: {
                    bindingClass: "computed_projection",
                    computeKey: CHILD_COMPUTE_KEYS.enrollment_status,
                    sourceEntity: "enrollment",
                    fieldKey: "enrollment_status",
                },
            },
        };
        const r = resolveProofBindingValue(record, item, "customer_members");
        expect(r.isComputed).toBe(true);
        expect(r.display).toBe("Enrolled");
    });
});

describe("futureDrawerModulePlaceholders", () => {
    it("appends opportunity future tab widgets without breaking base layout", () => {
        const base = buildOpportunityDrawerRelationshipProofLayout();
        const withFuture = appendOpportunityFutureTabPlaceholders(base);
        expect(withFuture.sections.length).toBeGreaterThan(base.sections.length);

        const futureWidgets = collectLayoutItems(withFuture).filter((i) => i.metadata?.futureModule === true);
        expect(futureWidgets.length).toBe(OPPORTUNITY_FUTURE_DRAWER_MODULES.length);
        expect(futureWidgets.map((w) => w.label)).toContain("Children");
        expect(futureWidgets.map((w) => w.label)).toContain("Tasks");
    });

    it("child future modules include schedule, attendance, billing placeholders", () => {
        const doc = buildChildDrawerRelationshipProofLayout();
        const futureWidgets = collectLayoutItems(doc).filter((i) => i.metadata?.futureModule === true);
        const labels = futureWidgets.map((w) => w.label);
        expect(labels).toContain("Schedule");
        expect(labels).toContain("Attendance");
        expect(labels).toContain("Billing");
        expect(labels).toContain("Parents");
    });

    it("unsupported item kinds fail closed", () => {
        const badItem = { id: "bad", kind: "unknown" as LayoutItem["kind"], refKey: "x" };
        expect(shouldRenderProofItem(badItem)).toBe(false);
    });
});

describe("personChildDrawerRuntimeProof — flags", () => {
    it("layout runtime flag defaults on (live cutover)", () => {
        expect(isLayoutRuntimeEnabledServer()).toBe(true);
    });
});

function readBinding(item: LayoutItem) {
    const raw = item.metadata?.binding;
    return raw && typeof raw === "object" ? (raw as { relationKey?: string; bindingClass?: string }) : null;
}
