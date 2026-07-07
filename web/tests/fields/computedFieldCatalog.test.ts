/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { deriveAgeFromDateOfBirth } from "@/lib/fields/derived/ageFromDateOfBirth";
import {
    COMPUTED_FIELD_CATALOG,
    computedFieldByRefKey,
    computedFieldsForChildSettingsTab,
    computedFieldsForSettingsEntity,
} from "@/lib/fields/computedFieldCatalog";
import {
    buildSettingsFieldCatalogEntries,
    countFieldsByOwnership,
    staticCatalogCountsForHubEntity,
} from "@/lib/fields/fieldCatalogForSettings";
import {
    deriveComputedFieldAvailability,
    deriveFieldCapability,
} from "@/lib/fields/fieldCapabilityEngine";
import {
    canSurfaceResolveField,
    resolverInputFromComputedField,
} from "@/lib/fields/fieldResolverRegistry";
import { resolveComputedFieldSurfaceAvailability } from "@/lib/fields/fieldSurfaceAvailability";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";

describe("computed field catalog", () => {
    it("includes all sprint-specified computed fields", () => {
        const refKeys = COMPUTED_FIELD_CATALOG.map((f) => f.refKey);
        expect(refKeys).toContain("child.age");
        expect(refKeys).toContain("family.primary_parent");
        expect(refKeys).toContain("family.children_summary");
        expect(refKeys).toContain("opportunity.current_stage");
        expect(refKeys).toContain("opportunity.current_work");
        expect(refKeys).toContain("opportunity.days_in_stage");
        expect(refKeys).toContain("opportunity.next_step");
        expect(refKeys).toContain("family.needs_response");
    });

    it("marks computed fields as read-only and not configurable", () => {
        for (const field of COMPUTED_FIELD_CATALOG) {
            expect(field.ownership).toBe("computed");
            expect(field.editable).toBe(false);
            expect(field.configurable).toBe(false);
        }
    });

    it("child.age resolves from date of birth at runtime", () => {
        const derived = deriveAgeFromDateOfBirth("2022-03-15", new Date("2026-07-07"));
        expect(derived?.display).toMatch(/\d/);
        const entry = computedFieldByRefKey("child.age");
        expect(entry?.dependencies).toContain("child.date_of_birth");
        expect(entry?.resolver_status).toBe("now");
    });

    it("future computed fields include honest unavailable reasons", () => {
        const needsResponse = computedFieldByRefKey("family.needs_response");
        expect(needsResponse?.resolver_status).toBe("future");
        expect(needsResponse?.unavailable_reason).toMatch(/not wired/i);

        const daysInStage = computedFieldByRefKey("opportunity.days_in_stage");
        expect(daysInStage?.resolver_status).toBe("future");
        expect(daysInStage?.unavailable_reason).toBeTruthy();
    });
});

describe("computed field availability", () => {
    it("blocks computed fields from Forms as editable inputs", () => {
        const input = resolverInputFromComputedField(computedFieldByRefKey("child.age")!);
        const forms = canSurfaceResolveField("forms", input);
        expect(forms.supported).toBe(false);
        expect(forms.reason).toMatch(/calculated at runtime/i);

        const cap = deriveFieldCapability("forms", input);
        expect(cap.status).toBe("unavailable");
    });

    it("resolver-ready computed fields appear on queue/focus when alias-backed", () => {
        const currentStage = resolverInputFromComputedField(computedFieldByRefKey("opportunity.current_stage")!);
        expect(canSurfaceResolveField("queue_row", currentStage).supported).toBe(true);
        expect(canSurfaceResolveField("focus_panel", currentStage).supported).toBe(true);

        const childrenSummary = resolverInputFromComputedField(computedFieldByRefKey("family.children_summary")!);
        expect(canSurfaceResolveField("queue_row", childrenSummary).supported).toBe(true);
    });

    it("future computed fields are unavailable on all surfaces", () => {
        const entry = computedFieldByRefKey("family.needs_response")!;
        const rows = resolveComputedFieldSurfaceAvailability(entry);
        expect(rows.every((r) => r.status === "unavailable")).toBe(true);
    });

    it("deriveComputedFieldAvailability covers all consumer surfaces", () => {
        const rows = deriveComputedFieldAvailability(computedFieldByRefKey("opportunity.next_step")!);
        expect(rows.length).toBe(7);
        expect(rows.some((r) => r.surface === "queue_row" && r.status === "available")).toBe(true);
    });
});

describe("Settings → Fields catalog integration", () => {
    it("includes computed fields for Child hub entity", () => {
        const entries = buildSettingsFieldCatalogEntries({
            hubEntity: "inquiry_child",
            entityTypes: ["customer_member", "inquiry_child"],
            customFields: [],
        });
        expect(entries.some((e) => e.refKey === "child.age" && e.ownership === "computed")).toBe(true);
    });

    it("field counts by ownership are accurate", () => {
        const entries = buildSettingsFieldCatalogEntries({
            hubEntity: "customer",
            entityTypes: ["customer"],
            customFields: [
                {
                    id: "1",
                    org_id: "o",
                    entity_type: "customer",
                    field_key: "preferred_language",
                    field_type: "text",
                    label: "Preferred language",
                    description: null,
                    is_system: false,
                    is_required: false,
                    is_active: true,
                    is_visible_in_form: true,
                    is_visible_in_drawer: true,
                    is_visible_in_table: false,
                    is_visible_in_public_booking: false,
                    is_filterable: false,
                    is_sortable: false,
                    section_key: "profile",
                    sort_order: 10,
                    placeholder: null,
                    help_text: null,
                    config: null,
                    requirement_policy: null,
                    interaction_policy: null,
                    created_at: "",
                    updated_at: "",
                },
            ],
        });
        const counts = countFieldsByOwnership(entries);
        expect(counts.custom).toBe(1);
        expect(counts.computed).toBeGreaterThan(0);
        expect(counts.platform).toBeGreaterThan(0);
        expect(counts.total).toBe(counts.platform + counts.custom + counts.computed);
    });

    it("static nav counts include platform and computed", () => {
        const counts = staticCatalogCountsForHubEntity("opportunity");
        expect(counts.platform).toBeGreaterThan(0);
        expect(counts.computed).toBe(computedFieldsForSettingsEntity("opportunity").length);
    });

    it("uses operator-facing entity labels without internal grains", () => {
        expect(adminFieldEntitySingularLabel({}, "inquiry_child")).toBe("Child");
        expect(adminFieldEntitySingularLabel({}, "customer")).toBe("Family");
        expect(adminFieldEntitySingularLabel({}, "opportunity")).toBe("Lead");
        const childComputed = computedFieldsForChildSettingsTab();
        expect(childComputed.every((f) => f.settings_entity === "inquiry_child" || f.entity_type === "customer_member")).toBe(
            true,
        );
    });
});
