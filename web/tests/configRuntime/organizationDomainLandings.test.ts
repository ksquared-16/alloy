import { describe, expect, it } from "vitest";
import { buildAccessLandingModel } from "@/lib/configRuntime/accessLandingModel";
import { ACCESS_WORKSPACE_CHAPTERS } from "@/lib/access/accessChapterRoutes";
import { buildBusinessProcessesLandingModel } from "@/lib/configRuntime/businessProcessesLandingModel";
import { buildDataModelLandingModel } from "@/lib/configRuntime/dataModelLandingModel";
import { buildSurfacesLandingModel } from "@/lib/configRuntime/surfacesLandingModel";
import { readFileSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(path.join(webRoot, rel), "utf8");
}

describe("organization domain landings", () => {
    it("builds Data Model tiles into the organization shell without ceremony cards", () => {
        const model = buildDataModelLandingModel();
        expect(model.tiles.map((t) => t.id)).toEqual([
            "entities",
            "fields",
            "statuses",
            "option-sets",
            "relationships",
            "calculations",
        ]);
        expect(model.summaryCards).toEqual([]);
        expect(model.tiles.find((t) => t.id === "entities")?.href).toContain(
            "/organization/data-model?section=entities",
        );
        expect(model.tiles.find((t) => t.id === "fields")?.href).toContain(
            "/organization/data-model?section=fields",
        );
        expect(model.ownershipNote.toLowerCase()).toContain("organization");
    });

    it("builds Access tiles without inheritance vocabulary", () => {
        const model = buildAccessLandingModel(ACCESS_WORKSPACE_CHAPTERS);
        expect(model.tiles.map((t) => t.id)).toEqual(["users", "roles", "security"]);
        expect(model.summaryCards).toEqual([]);
        expect(model.ownershipNote.toLowerCase()).toContain("not configuration inheritance");
        expect(model.tiles.find((t) => t.id === "users")?.href).toContain("section=users");
        expect(model.tiles.find((t) => t.id === "security")?.href).toContain("section=security");
    });

    it("builds a collection-first Business Processes model and Surfaces section deep-links", () => {
        const processes = buildBusinessProcessesLandingModel();
        expect(processes.summaryCards).toEqual([]);
        expect(processes.purpose).toBe("Create and manage how operational work moves through Alloy.");

        const surfaces = buildSurfacesLandingModel();
        expect(surfaces.summaryCards).toEqual([]);
        expect(surfaces.purpose).toBe("Configure the presentation operators use across Alloy.");
        expect(surfaces.tiles.map((t) => t.id)).toContain("focus-panels");
        expect(surfaces.tiles.find((t) => t.id === "queue-rows")?.href).toContain(
            "/organization/surfaces?section=queue-rows",
        );
    });

    it("wires Data Model to the organization workspace and Access landing when section is absent", () => {
        expect(read("app/adminV2/settings/organization/data-model/page.tsx")).toContain(
            "DataModelWorkspaceSurface",
        );
        expect(read("app/adminV2/settings/entities/page.tsx")).toContain("dataModelSectionHref");
        // IA-8 deleted the duplicate `settings/users-roles` renderer; `/organization/access` is the
        // one page that serves this workspace, and the legacy alias redirects into it.
        expect(read("app/adminV2/settings/organization/access/page.tsx")).toContain("buildAccessLandingModel");
    });

    it("always mounts the Business Processes collection workspace (no landing-tile default)", () => {
        const page = read("app/adminV2/settings/processes/page.tsx");
        expect(page).toContain("ProcessesConfigurationPage");
        expect(page).not.toContain("OrganizationDomainLanding");
        expect(page).toContain("normalizeBusinessProcessSection");
    });

    it("mounts SurfacesPublicationWorkspace — tile landing when bare, category workspace when ?section=", () => {
        const page = read("app/adminV2/settings/surfaces/page.tsx");
        expect(page).toContain("SurfacesPublicationWorkspace");
        expect(page).not.toContain("OrganizationDomainLanding");
        const workspace = read("components/adminV2/settings/surfaces/SurfacesPublicationWorkspace.tsx");
        expect(workspace).toContain("SurfacesLanding");
        expect(workspace).toContain("hideCategoryRail");
    });

    it("keeps Location Add Program in-context (no Programs peer redirect)", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).toContain("LocationAddProgramPanel");
        expect(page).not.toContain('router.push("/organization/programs")');
        expect(page).toContain("setCreatingProgram(true)");
    });
});
