import { describe, expect, it } from "vitest";
import {
    ORGANIZATION_SURFACE_CLASSIFICATION,
    buildProgramsConfigurationObjectDescriptor,
    configurationObjectConcernHref,
    configurationObjectEditBlocksNavigation,
    configurationObjectEligibleSurfaces,
    beginConfigurationObjectEdit,
    cancelConfigurationObjectEdit,
    completeConfigurationObjectSave,
    createConfigurationObjectEditSession,
    failConfigurationObjectSave,
    patchConfigurationObjectDraft,
    projectConfigurationObjectOverviewRegions,
    resolveActiveConfigurationObjectConcern,
    resolveConfigurationObjectConcernState,
    resolveConfigurationObjectSelection,
    shouldApplyConfigurationObjectResponse,
    visibleConfigurationObjectConcerns,
    CONFIGURATION_OBJECT_HARNESS_DESCRIPTOR,
    harnessCollectionItems,
    PROGRAMS_WORKSPACE_SIBLING_CHAPTERS,
} from "@/lib/configRuntime/configurationObject";

describe("Configuration Object Runtime — eligibility", () => {
    it("classifies Programs as eligible and Locations as hierarchical (not object consumer)", () => {
        const programs = ORGANIZATION_SURFACE_CLASSIFICATION.find((s) => s.id === "programs");
        const locations = ORGANIZATION_SURFACE_CLASSIFICATION.find((s) => s.id === "locations");
        const statuses = ORGANIZATION_SURFACE_CLASSIFICATION.find((s) => s.id === "statuses");
        const funding = ORGANIZATION_SURFACE_CLASSIFICATION.find((s) => s.id === "funding");
        expect(programs?.objectRuntimeEligible).toBe(true);
        expect(programs?.notes).toContain("Continuity");
        expect(locations?.kind).toBe("hierarchical_workspace");
        expect(locations?.objectRuntimeEligible).toBe(false);
        expect(statuses?.objectRuntimeEligible).toBe(true);
        expect(funding?.objectRuntimeEligible).toBe(false);
        expect(configurationObjectEligibleSurfaces().some((s) => s.id === "programs")).toBe(true);
        expect(configurationObjectEligibleSurfaces().some((s) => s.id === "simulator")).toBe(false);
    });
});

describe("Configuration Object Runtime — selection and concern projection", () => {
    const ids = ["a", "b"];

    it("prefers route, then retained, never invents a default", () => {
        expect(
            resolveConfigurationObjectSelection({
                routeObjectId: "b",
                retainedObjectId: "a",
                validObjectIds: ids,
            }),
        ).toMatchObject({ objectId: "b", source: "route", shouldSyncRoute: false });
        expect(
            resolveConfigurationObjectSelection({
                routeObjectId: null,
                retainedObjectId: "a",
                validObjectIds: ids,
            }),
        ).toMatchObject({ objectId: "a", source: "retained", shouldSyncRoute: true });
        expect(
            resolveConfigurationObjectSelection({
                routeObjectId: null,
                retainedObjectId: null,
                validObjectIds: ids,
            }).source,
        ).toBe("none");
    });

    it("projects concern from route on object change and rejects stale responses", () => {
        expect(
            resolveConfigurationObjectConcernState({
                routeConcern: "history",
                routeItemId: null,
                localConcern: "overview",
                localItemId: null,
                routeObjectId: "b",
                localObjectId: "a",
            }),
        ).toEqual({ concern: "history", itemId: null, objectChanged: true });
        expect(
            shouldApplyConfigurationObjectResponse({
                requestSeq: 1,
                latestSeq: 2,
                requestObjectId: "a",
                activeObjectId: "a",
            }),
        ).toBe(false);
    });

    it("filters permission-hidden concerns and normalizes invalid concern routes", () => {
        const visible = visibleConfigurationObjectConcerns(CONFIGURATION_OBJECT_HARNESS_DESCRIPTOR.concerns);
        expect(visible.map((c) => c.key)).toEqual(["overview", "relationships", "history", "publication"]);
        expect(visible.some((c) => c.key === "secrets")).toBe(false);
        expect(resolveActiveConfigurationObjectConcern(CONFIGURATION_OBJECT_HARNESS_DESCRIPTOR, "secrets")).toEqual({
            concern: "overview",
            normalized: true,
        });
        expect(
            configurationObjectConcernHref(CONFIGURATION_OBJECT_HARNESS_DESCRIPTOR, "obj-alpha", "history"),
        ).toBe("/dev/configuration-object-harness?objectId=obj-alpha&concern=history");
    });
});

describe("Configuration Object Runtime — editing lifecycle", () => {
    it("supports explicit edit, dirty draft retention on failure, and navigation blocking", () => {
        let session = createConfigurationObjectEditSession<{ label: string }>();
        session = beginConfigurationObjectEdit(session, { label: "Alpha" });
        expect(session.mode).toBe("edit");
        session = patchConfigurationObjectDraft(session, { label: "Alpha 2" });
        expect(configurationObjectEditBlocksNavigation(session)).toBe(true);
        session = failConfigurationObjectSave(session, "Server rejected", [
            { field: "label", message: "Too short" },
        ]);
        expect(session.draft?.label).toBe("Alpha 2");
        expect(session.mode).toBe("edit");
        session = completeConfigurationObjectSave(session);
        expect(session.mode).toBe("read");
        expect(configurationObjectEditBlocksNavigation(session)).toBe(false);
        session = beginConfigurationObjectEdit(session, { label: "X" });
        session = patchConfigurationObjectDraft(session, { label: "Y" });
        session = cancelConfigurationObjectEdit(session);
        expect(session.draft).toBeNull();
    });
});

describe("Configuration Object Runtime — overview and Programs seam", () => {
    it("projects only present overview regions in platform order", () => {
        expect(
            projectConfigurationObjectOverviewRegions({
                primary_action: true,
                summary: true,
                identity_and_state: true,
            }).map((r) => r.key),
        ).toEqual(["identity_and_state", "summary", "primary_action"]);
    });

    it("exposes Programs adoption descriptor without renaming section keys", () => {
        const descriptor = buildProgramsConfigurationObjectDescriptor();
        expect(descriptor.domainId).toBe("programs");
        expect(descriptor.basePath).toBe("/organization/programs");
        expect(descriptor.objectIdQueryParam).toBe("programId");
        expect(descriptor.concernQueryParam).toBe("section");
        expect(descriptor.concerns.some((c) => c.key === "offerings" && c.label === "Delivery Options")).toBe(
            true,
        );
        expect(descriptor.lifecycleSlots.publication).toBe(true);
        expect(PROGRAMS_WORKSPACE_SIBLING_CHAPTERS.map((c) => c.id)).toContain("simulator");
        expect(harnessCollectionItems()).toHaveLength(2);
    });
});
