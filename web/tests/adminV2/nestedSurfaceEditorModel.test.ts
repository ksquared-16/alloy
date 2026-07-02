/**
 * Nested Surface editor model tests (Focus Panel nested editing slice).
 */
import { describe, expect, it } from "vitest";
import {
    CHILDREN_SURFACE_ID,
    FINANCIAL_CONFIG_SURFACE_ID,
    addFieldToNestedGroup,
    availableFieldsForNestedGroup,
    defaultNestedSurfaceConfig,
    groupDefsFor,
    isNestedSurfaceId,
    moveFieldInNestedGroup,
    nestedSurfaceLabel,
    reconcileNestedSurfaceConfig,
    removeFieldFromNestedGroup,
    selectedFieldKeys,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

describe("nested surface registry", () => {
    it("Children Surface and Financial Configuration Surface are recognized nested surfaces", () => {
        expect(isNestedSurfaceId(CHILDREN_SURFACE_ID)).toBe(true);
        expect(isNestedSurfaceId(FINANCIAL_CONFIG_SURFACE_ID)).toBe(true);
        expect(isNestedSurfaceId("pipeline-queue-row")).toBe(false);
    });

    it("Children Surface exposes Child Summary / Placement / Schedule / Medical / Documents", () => {
        const keys = groupDefsFor(CHILDREN_SURFACE_ID).map((g) => g.key);
        expect(keys).toEqual(["child_summary", "placement", "schedule", "medical", "documents"]);
        expect(nestedSurfaceLabel(CHILDREN_SURFACE_ID)).toBe("Children Surface");
    });

    it("Financial Configuration Surface exposes Placement & Tuition / Billing Config / Billing Responsibility / History", () => {
        const keys = groupDefsFor(FINANCIAL_CONFIG_SURFACE_ID).map((g) => g.key);
        expect(keys).toEqual(["placement_tuition", "billing_configuration", "billing_responsibility", "history_activity"]);
    });

    it("no group label is abstract", () => {
        for (const id of [CHILDREN_SURFACE_ID, FINANCIAL_CONFIG_SURFACE_ID]) {
            for (const g of groupDefsFor(id)) {
                expect(g.label).not.toMatch(/^(Group|Evidence Group|Details)\s*\d*$/i);
            }
        }
    });
});

describe("default config seeds real fields only", () => {
    it("Children child_summary seeds name/dob/status", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        expect(selectedFieldKeys(cfg, "child_summary")).toEqual(["child.name", "child.date_of_birth", "child.status"]);
    });

    it("Financial groups seed empty (no fake payers/invoices/estimates)", () => {
        const cfg = defaultNestedSurfaceConfig(FINANCIAL_CONFIG_SURFACE_ID);
        expect(selectedFieldKeys(cfg, "billing_configuration")).toEqual([]);
        expect(selectedFieldKeys(cfg, "history_activity")).toEqual([]);
    });
});

describe("add / remove / reorder fields (persistable, immutable)", () => {
    it("adds a field to a group", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const next = addFieldToNestedGroup(cfg, "medical", "child.name");
        expect(selectedFieldKeys(next, "medical")).toEqual(["child.name"]);
        // immutable
        expect(selectedFieldKeys(cfg, "medical")).toEqual([]);
    });

    it("does not double-add the same field", () => {
        let cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        cfg = addFieldToNestedGroup(cfg, "medical", "child.name");
        cfg = addFieldToNestedGroup(cfg, "medical", "child.name");
        expect(selectedFieldKeys(cfg, "medical")).toEqual(["child.name"]);
    });

    it("removes a field", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const next = removeFieldFromNestedGroup(cfg, "child_summary", "child.date_of_birth");
        expect(selectedFieldKeys(next, "child_summary")).toEqual(["child.name", "child.status"]);
    });

    it("reorders a field within a group", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const next = moveFieldInNestedGroup(cfg, "child_summary", "child.status", -1);
        expect(selectedFieldKeys(next, "child_summary")).toEqual(["child.name", "child.status", "child.date_of_birth"]);
    });
});

describe("Add Field availability — compatible predefined + tenant custom, no fakes", () => {
    const CUSTOM: TenantFieldDefinitionRow[] = [
        { field_key: "pickup_code", label: "Pickup Code", entity_type: "customer_member", field_type: "text", is_system: false, is_active: true },
        { field_key: "referred_by", label: "Referred By", entity_type: "opportunity", field_type: "text", is_system: false, is_active: true },
    ];

    it("Children placement group offers a child-namespace custom field", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const keys = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "placement", cfg, CUSTOM).map((f) => f.key);
        expect(keys).toContain("child.pickup_code"); // customer_member → child namespace
    });

    it("Children placement group does NOT offer an opportunity-namespace custom field", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const keys = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "placement", cfg, CUSTOM).map((f) => f.key);
        expect(keys).not.toContain("opportunity.referred_by");
    });

    it("Financial billing_configuration (opportunity) offers the opportunity custom field", () => {
        const cfg = defaultNestedSurfaceConfig(FINANCIAL_CONFIG_SURFACE_ID);
        const keys = availableFieldsForNestedGroup(FINANCIAL_CONFIG_SURFACE_ID, "billing_configuration", cfg, CUSTOM).map((f) => f.key);
        expect(keys).toContain("opportunity.referred_by");
    });

    it("already-selected fields are not offered again", () => {
        let cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        cfg = addFieldToNestedGroup(cfg, "medical", "child.name");
        const keys = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "medical", cfg).map((f) => f.key);
        expect(keys).not.toContain("child.name");
    });

    it("without tenant defs, only real platform fields are offered (never fabricated)", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const fields = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "child_summary", cfg);
        // Every offered field must be a real system field key (namespace.field shape).
        for (const f of fields) {
            expect(f.key).toMatch(/^[a-z_]+\.[a-z_]+$/);
            expect(f.isSystemField).toBe(true);
        }
    });
});

describe("reconcile loaded config with the registry", () => {
    it("returns default when nothing is loaded", () => {
        const cfg = reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, null);
        expect(selectedFieldKeys(cfg, "child_summary")).toEqual(["child.name", "child.date_of_birth", "child.status"]);
    });

    it("preserves loaded selections and adds any new registry groups", () => {
        const loaded = { surfaceId: CHILDREN_SURFACE_ID, groups: [{ key: "child_summary", selectedFieldKeys: ["child.name"] }] };
        const cfg = reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, loaded);
        expect(selectedFieldKeys(cfg, "child_summary")).toEqual(["child.name"]); // loaded wins
        expect(cfg.groups.map((g) => g.key)).toContain("documents"); // new group present
    });
});
