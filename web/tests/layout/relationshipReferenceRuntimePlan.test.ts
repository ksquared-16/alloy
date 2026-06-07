/**
 * Relationship/reference runtime plan — Phase 1 tests.
 *
 * Validates opportunity drawer proof layout binding classification without
 * live cutover or operator-visible behavior changes.
 */

import { describe, expect, it } from "vitest";
import {
    buildLayoutRuntimePlan,
    buildOpportunityDrawerRelationshipProofLayout,
    classifyLayoutItemBinding,
    collectLayoutItems,
    getOpportunityRelation,
    OPPORTUNITY_COMPUTE_KEYS,
    OPPORTUNITY_DRAWER_RELATIONS,
    readItemBindingMetadata,
} from "@/lib/layout/runtime";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { isLayoutRuntimeEnabledServer } from "@/lib/layout/featureFlag";

describe("relationshipReferenceRuntimePlan — proof layout", () => {
    it("parses and builds a runtime plan with binding classes", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const parsed = parseLayoutDoc(doc);
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);

        const plan = buildLayoutRuntimePlan(doc);
        expect(plan.entityType).toBe("opportunities");
        expect(plan.layoutKey).toBe("opportunity_relationship_proof_v1");
        expect(plan.bindingClassCounts.relationship_field).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.reference_field).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.computed_projection).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.repeater).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.base_field).toBeGreaterThan(0);
    });

    it("models primary contact as Person relationship, not child field", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const items = collectLayoutItems(doc);
        const employeeField = items.find((i) => i.refKey === "person.is_employee");
        expect(employeeField).toBeDefined();

        const binding = classifyLayoutItemBinding(employeeField!, "opportunities");
        expect(binding.bindingClass).toBe("relationship_field");
        expect(binding.contractBlockKind).toBe("relationship_section");
        expect(binding.relationKey).toBe("primary_contact");
        expect(binding.sourceEntity).toBe("person");
        expect(binding.fieldKey).toBe("is_employee");
        expect(binding.isCrossEntity).toBe(true);

        const relation = getOpportunityRelation("primary_contact");
        expect(relation?.targetEntity).toBe("persons");
        expect(relation?.fkColumn).toBe("primary_person_id");
    });

    it("disambiguates location roles — no generic location field", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const items = collectLayoutItems(doc);
        const locationItems = items.filter((i) => readItemBindingMetadata(i)?.locationRole);

        const roles = new Set(locationItems.map((i) => readItemBindingMetadata(i)!.locationRole));
        expect(roles.has("site")).toBe(true);
        expect(roles.has("classroom")).toBe(true);
        expect(roles.has("room")).toBe(true);
        expect(roles.has("household_address")).toBe(true);

        for (const item of locationItems) {
            const b = classifyLayoutItemBinding(item, "opportunities");
            expect(b.bindingClass).toBe("reference_field");
            expect(b.contractBlockKind).toBe("relationship_section");
            expect(b.locationRole).toBeTruthy();
            expect(b.relationKey).not.toBe("location");
        }
    });

    it("treats program category as computed projection from placement/config", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const items = collectLayoutItems(doc);
        const programCategory = items.find((i) => i.refKey === "enrollment.program_category");
        expect(programCategory).toBeDefined();

        const binding = classifyLayoutItemBinding(programCategory!, "opportunities");
        expect(binding.bindingClass).toBe("computed_projection");
        expect(binding.computeKey).toBe(OPPORTUNITY_COMPUTE_KEYS.program_category);
        expect(binding.sourceEntity).toBe("enrollment");
        expect(binding.fieldKey).toBe("program_category");
    });

    it("scopes enrollment-child fields to repeater with enrollmentChildContext", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const items = collectLayoutItems(doc);
        const repeater = items.find((i) => i.kind === "related_list" && i.refKey === "enrollment_children");
        expect(repeater).toBeDefined();

        const binding = classifyLayoutItemBinding(repeater!, "opportunities");
        expect(binding.bindingClass).toBe("repeater");
        expect(binding.contractBlockKind).toBe("repeater");
        expect(binding.relationKey).toBe("enrollment_children");
        expect(binding.sourceEntity).toBe("child_inquiry");

        const relation = OPPORTUNITY_DRAWER_RELATIONS.enrollment_children;
        expect(relation.enrollmentChildContext).toBe(true);
        expect(repeater!.columns?.every((c) => c.refKey.startsWith("child_inquiry."))).toBe(true);
    });

    it("includes widget and field_group from lead default alongside relationship items", () => {
        const doc = buildOpportunityDrawerRelationshipProofLayout();
        const plan = buildLayoutRuntimePlan(doc);
        expect(plan.itemKindCounts.widget_placeholder).toBeGreaterThan(0);
        expect(plan.itemKindCounts.field_group).toBeGreaterThan(0);
        expect(plan.itemKindCounts.related_list).toBeGreaterThan(0);
        expect(plan.bindingClassCounts.widget).toBeGreaterThan(0);
    });
});

describe("relationshipReferenceRuntimePlan — flags", () => {
    it("layout runtime flag defaults off (no live cutover)", () => {
        expect(isLayoutRuntimeEnabledServer()).toBe(false);
    });
});
