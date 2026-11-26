import { describe, expect, it, beforeEach } from "vitest";

import {
    addHouseholdRelationshipSectionInstance,
    addableHouseholdRelationshipSections,
    defaultHouseholdRelationshipSectionConfig,
    listHouseholdRelationshipSectionInstances,
    migrateHouseholdRelationshipSectionInstances,
    removeHouseholdRelationshipSectionInstance,
    renameHouseholdRelationshipSectionInstance,
    setHouseholdRelationshipSectionCriteria,
    setHouseholdRelationshipSectionVisibility,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionInstances";
import {
    householdRelationshipSectionDefinition,
    householdRelationshipSectionDefinitions,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipSectionDefinitions";
import {
    resolveHouseholdContactSectionKey,
    shouldShowRelationshipSection,
} from "@/lib/adminV2/runtime/focusPanel/household/identityRelationshipSections";
import {
    defaultNestedSurfaceConfig,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { reconcileIdentityNestedConfig } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";

describe("relationship section definitions and instances", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("resolves canonical relationship-section definitions", () => {
        expect(householdRelationshipSectionDefinitions().length).toBeGreaterThan(5);
        expect(householdRelationshipSectionDefinition("emergency_contact")?.defaultLabel).toBe(
            "Emergency Contacts",
        );
    });

    it("migrates legacy fixed groups into section instances without duplication", () => {
        const config = migrateHouseholdRelationshipSectionInstances(defaultNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID));
        const instances = listHouseholdRelationshipSectionInstances(config);
        const keys = instances.map((instance) => instance.definitionKey);
        expect(keys).toContain("parent_primary");
        expect(keys).toContain("children");
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("add section creates a stable instance and enables it", () => {
        let config = defaultHouseholdRelationshipSectionConfig();
        config = addHouseholdRelationshipSectionInstance(config, "emergency_contact");
        const instance = listHouseholdRelationshipSectionInstances(config).find(
            (entry) => entry.definitionKey === "emergency_contact",
        );
        expect(instance?.instanceKey).toBe("emergency_contacts");
        expect(instance?.enabled).toBe(true);
    });

    it("rename persists on the instance", () => {
        let config = addHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "emergency_contact",
        );
        config = renameHouseholdRelationshipSectionInstance(config, "emergency_contacts", "Emergency & Pickup Contacts");
        const instance = listHouseholdRelationshipSectionInstances(config).find(
            (entry) => entry.definitionKey === "emergency_contact",
        );
        expect(instance?.label).toBe("Emergency & Pickup Contacts");
    });

    it("remove persists by disabling optional instances", () => {
        let config = addHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "authorized_pickup",
        );
        config = removeHouseholdRelationshipSectionInstance(config, "authorized_pickups");
        expect(
            listHouseholdRelationshipSectionInstances(config).some(
                (entry) => entry.definitionKey === "authorized_pickup",
            ),
        ).toBe(false);
    });

    it("required primary section cannot be removed", () => {
        const config = defaultHouseholdRelationshipSectionConfig();
        const next = removeHouseholdRelationshipSectionInstance(config, "primary_contact");
        expect(listHouseholdRelationshipSectionInstances(next).some((i) => i.definitionKey === "parent_primary")).toBe(
            true,
        );
    });

    it("addable sections exclude already-added single-instance definitions", () => {
        let config = defaultHouseholdRelationshipSectionConfig();
        config = addHouseholdRelationshipSectionInstance(config, "emergency_contact");
        const addable = addableHouseholdRelationshipSections(config);
        expect(addable.some((def) => def.definitionKey === "emergency_contact")).toBe(false);
        expect(addable.some((def) => def.definitionKey === "authorized_pickup")).toBe(true);
    });

    it("visibility criteria persist on instance", () => {
        let config = addHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "emergency_contact",
        );
        config = setHouseholdRelationshipSectionVisibility(config, "emergency_contacts", "always");
        config = setHouseholdRelationshipSectionCriteria(config, "emergency_contacts", {
            roleKeys: ["emergency_contact"],
            excludeRoleKeys: ["parent"],
        });
        const group = config.groups.find((entry) => entry.key === "emergency_contacts");
        expect(group?.sectionVisibility).toBe("always");
        expect(group?.relationshipCriteria?.excludeRoleKeys).toContain("parent");
    });

    it("reconcile preserves migrated instances through publish round-trip shape", () => {
        let config = addHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "emergency_contact",
        );
        config = renameHouseholdRelationshipSectionInstance(config, "emergency_contacts", "Saved Emergency");
        const reconciled = reconcileIdentityNestedConfig(HOUSEHOLD_SURFACE_ID, config);
        const instance = listHouseholdRelationshipSectionInstances(reconciled).find(
            (entry) => entry.definitionKey === "emergency_contact",
        );
        expect(instance?.label).toBe("Saved Emergency");
        expect(instance?.definitionKey).toBe("emergency_contact");
    });
});

describe("relationship section runtime resolution", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("routes emergency roles to emergency section when enabled", () => {
        let config = addHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "emergency_contact",
        );
        const section = resolveHouseholdContactSectionKey({
            config,
            roleType: "emergency_contact",
            isPrimary: false,
            assignedPersonIds: new Set(),
            personId: "e1",
        });
        expect(section).toBe("emergency_contacts");
    });

    it("routes pickup roles to authorized pickup section", () => {
        let config = addHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "authorized_pickup",
        );
        const section = resolveHouseholdContactSectionKey({
            config,
            roleType: "authorized_pickup",
            isPrimary: false,
            assignedPersonIds: new Set(),
            personId: "p1",
        });
        expect(section).toBe("authorized_pickups");
    });

    it("deduplicates assigned people across sections", () => {
        let config = defaultHouseholdRelationshipSectionConfig();
        config = addHouseholdRelationshipSectionInstance(config, "emergency_contact");
        const assigned = new Set<string>(["p1"]);
        const duplicate = resolveHouseholdContactSectionKey({
            config,
            roleType: "emergency_contact",
            isPrimary: false,
            assignedPersonIds: assigned,
            personId: "p1",
        });
        expect(duplicate).toBe("");
    });

    it("respects hidden visibility at runtime", () => {
        let config = addHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "authorized_pickup",
        );
        config = setHouseholdRelationshipSectionVisibility(config, "authorized_pickups", "hidden");
        expect(
            shouldShowRelationshipSection({
                config,
                sectionKey: "authorized_pickups",
                count: 2,
            }),
        ).toBe(false);
    });

    it("exclude criteria prevent parent matching emergency section", () => {
        let config = addHouseholdRelationshipSectionInstance(
            defaultHouseholdRelationshipSectionConfig(),
            "emergency_contact",
        );
        config = setHouseholdRelationshipSectionCriteria(config, "emergency_contacts", {
            roleKeys: ["emergency_contact", "emergency"],
            excludeRoleKeys: ["parent", "guardian"],
        });
        const parentMatch = resolveHouseholdContactSectionKey({
            config,
            roleType: "parent",
            isPrimary: false,
            assignedPersonIds: new Set(),
            personId: "p2",
        });
        expect(parentMatch).toBe("other_parent_guardian");
    });

    it("unions platform parent roles so family_member matches Other Parent despite stale criteria", () => {
        let config = defaultHouseholdRelationshipSectionConfig();
        config = setHouseholdRelationshipSectionCriteria(config, "other_parent_guardian", {
            roleKeys: ["parent", "guardian"],
            excludeRoleKeys: ["emergency", "pickup", "billing"],
        });
        const match = resolveHouseholdContactSectionKey({
            config,
            roleType: "family_member",
            isPrimary: false,
            assignedPersonIds: new Set(["p1"]),
            personId: "p2",
        });
        expect(match).toBe("other_parent_guardian");
    });

    it("invalid definition references fail safe without throwing", () => {
        let config = defaultHouseholdRelationshipSectionConfig();
        config = {
            ...config,
            groups: config.groups.map((group) =>
                group.key === "household_members"
                    ? { ...group, definitionKey: "unknown_definition" }
                    : group,
            ),
        };
        expect(() => listHouseholdRelationshipSectionInstances(config)).not.toThrow();
    });
});

describe("children section handoff metadata", () => {
    beforeEach(() => {
        ensureRuntimeSurfacesRegistered();
    });

    it("children instance uses handoff behavior to children_surface", () => {
        const config = defaultHouseholdRelationshipSectionConfig();
        const children = listHouseholdRelationshipSectionInstances(config).find(
            (instance) => instance.definitionKey === "children",
        );
        expect(children?.clickBehavior).toBe("handoff_to_surface");
        expect(children?.handoffSurfaceKey).toBe("children_surface");
    });
});
