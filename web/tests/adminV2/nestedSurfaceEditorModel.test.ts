/**
 * Nested Surface editor model tests (Focus Panel nested editing slice).
 */
import { describe, expect, it, beforeEach } from "vitest";
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
import {
    __resetSurfaceRegistry,
    registerSurface,
} from "@/lib/platform/surfaceComposition/surfaceRegistry";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import type { SurfaceSpec } from "@/lib/platform/surfaceComposition/universalSurfaceModel";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

beforeEach(() => {
    __resetSurfaceRegistry();
    ensureRuntimeSurfacesRegistered();
});

describe("nested surface registry (SurfaceSpec source of truth)", () => {
    it("Children Surface and Financial Configuration Surface are recognized nested surfaces", () => {
        expect(isNestedSurfaceId(CHILDREN_SURFACE_ID)).toBe(true);
        expect(isNestedSurfaceId(FINANCIAL_CONFIG_SURFACE_ID)).toBe(true);
        expect(isNestedSurfaceId("pipeline-queue-row")).toBe(false);
    });

    it("groupDefsFor derives editable groups from the registered Children Surface spec", () => {
        const keys = groupDefsFor(CHILDREN_SURFACE_ID).map((g) => g.key);
        expect(keys).toContain("identity");
        expect(keys).toContain("placement");
        expect(keys).toContain("readiness");
        expect(keys).toContain("roster");
        expect(keys).toContain("child_edit");
        expect(nestedSurfaceLabel(CHILDREN_SURFACE_ID)).toBe("Children");
    });

    it("groupDefsFor derives editable groups from the registered Financial Configuration Surface spec", () => {
        const keys = groupDefsFor(FINANCIAL_CONFIG_SURFACE_ID).map((g) => g.key);
        expect(keys).toEqual([
            "current_configuration",
            "configuration_history",
            "configuration_actions",
            "billing_periods",
            "line_items",
        ]);
    });

    it("a newly registered nested surface is editable without a hardcoded editor definition", () => {
        const customSurface: SurfaceSpec = {
            id: "custom_nested_proof_surface",
            label: "Custom Nested Proof",
            category: "record",
            canvas: {
                rows: [
                    {
                        id: "row-1",
                        components: [
                            {
                                id: "custom_component",
                                label: "Custom",
                                componentType: "card",
                                evidenceGroups: [
                                    {
                                        key: "summary",
                                        label: "Summary",
                                        purpose: "What is true?",
                                        items: [
                                            { key: "person.email", label: "Email", kind: "field", namespace: "person" },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        };
        registerSurface(customSurface);
        expect(isNestedSurfaceId("custom_nested_proof_surface")).toBe(true);
        const groups = groupDefsFor("custom_nested_proof_surface");
        expect(groups).toHaveLength(1);
        expect(groups[0]!.defaultFieldKeys).toEqual(["person.email"]);
        expect(groups[0]!.acceptedNamespaces).toEqual(["person"]);
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
    it("Children identity group seeds presentation fields from the registry", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        expect(selectedFieldKeys(cfg, "identity")).toEqual([
            "child.first_name",
            "child.last_name",
            "child.preferred_name",
            "child.nickname",
            "child.date_of_birth",
            "child.dob_age",
        ]);
    });

    it("Financial current_configuration seeds registry field items only", () => {
        const cfg = defaultNestedSurfaceConfig(FINANCIAL_CONFIG_SURFACE_ID);
        expect(selectedFieldKeys(cfg, "current_configuration")).toEqual([
            "billing.tuition_rate",
            "billing.discounts",
        ]);
        expect(selectedFieldKeys(cfg, "configuration_history")).toEqual([]);
    });
});

describe("add / remove / reorder fields (persistable, immutable)", () => {
    it("adds a field to a group", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const next = addFieldToNestedGroup(cfg, "readiness", "child.name");
        expect(selectedFieldKeys(next, "readiness")).toEqual(["child.name"]);
        expect(selectedFieldKeys(cfg, "readiness")).toEqual([]);
    });

    it("does not double-add the same field", () => {
        let cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        cfg = addFieldToNestedGroup(cfg, "readiness", "child.name");
        cfg = addFieldToNestedGroup(cfg, "readiness", "child.name");
        expect(selectedFieldKeys(cfg, "readiness")).toEqual(["child.name"]);
    });

    it("removes a field", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const next = removeFieldFromNestedGroup(cfg, "identity", "child.dob_age");
        expect(selectedFieldKeys(next, "identity")).not.toContain("child.dob_age");
        expect(selectedFieldKeys(next, "identity").length).toBeGreaterThan(0);
    });

    it("reorders a field within a group", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const next = moveFieldInNestedGroup(cfg, "identity", "child.dob_age", -1);
        const keys = selectedFieldKeys(next, "identity");
        expect(keys.indexOf("child.dob_age")).toBeLessThan(keys.indexOf("child.date_of_birth"));
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
        expect(keys).toContain("child.pickup_code");
    });

    it("Children placement group does NOT offer an opportunity-namespace custom field", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const keys = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "placement", cfg, CUSTOM).map((f) => f.key);
        expect(keys).not.toContain("opportunity.referred_by");
    });

    it("Financial current_configuration (opportunity) offers the opportunity custom field", () => {
        const cfg = defaultNestedSurfaceConfig(FINANCIAL_CONFIG_SURFACE_ID);
        const keys = availableFieldsForNestedGroup(FINANCIAL_CONFIG_SURFACE_ID, "current_configuration", cfg, CUSTOM).map((f) => f.key);
        expect(keys).toContain("opportunity.referred_by");
    });

    it("already-selected fields are not offered again", () => {
        let cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        cfg = addFieldToNestedGroup(cfg, "readiness", "child.name");
        const keys = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "readiness", cfg).map((f) => f.key);
        expect(keys).not.toContain("child.name");
    });

    it("without tenant defs, only real platform fields are offered (never fabricated)", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const fields = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "identity", cfg);
        for (const f of fields) {
            expect(f.key).toMatch(/^[a-z_]+\.[a-z_]+$/);
            expect(f.isSystemField).toBe(true);
        }
    });
});

describe("reconcile loaded config with the registry", () => {
    it("returns default when nothing is loaded", () => {
        const cfg = reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, null);
        expect(selectedFieldKeys(cfg, "identity")).toEqual([
            "child.first_name",
            "child.last_name",
            "child.preferred_name",
            "child.nickname",
            "child.date_of_birth",
            "child.dob_age",
        ]);
    });

    it("preserves loaded selections and adds any new registry groups", () => {
        const loaded = { surfaceId: CHILDREN_SURFACE_ID, groups: [{ key: "placement", selectedFieldKeys: ["child.room"] }] };
        const cfg = reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, loaded);
        expect(selectedFieldKeys(cfg, "placement")).toEqual(["child.room"]);
        expect(cfg.groups.map((g) => g.key)).toContain("readiness");
    });
});
