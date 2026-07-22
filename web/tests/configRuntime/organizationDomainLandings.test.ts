import { describe, expect, it } from "vitest";
import { buildAccessLandingModel } from "@/lib/configRuntime/accessLandingModel";
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
    it("builds Data Model tiles to existing settings routes", () => {
        const model = buildDataModelLandingModel();
        expect(model.tiles.map((t) => t.id)).toEqual([
            "entities",
            "fields",
            "statuses",
            "calculations",
            "option-sets",
            "relationships",
        ]);
        expect(model.tiles.find((t) => t.id === "entities")?.href).toContain("/settings/entities?section=entities");
        expect(model.tiles.find((t) => t.id === "fields")?.href).toContain("/settings/fields");
        expect(model.ownershipNote.toLowerCase()).toContain("organization");
    });

    it("builds Access tiles without inheritance vocabulary", () => {
        const model = buildAccessLandingModel();
        expect(model.tiles.map((t) => t.id)).toEqual(["users", "roles", "departments"]);
        expect(model.purpose.toLowerCase()).toContain("not a configuration inheritance domain");
        expect(model.tiles.find((t) => t.id === "users")?.href).toContain("section=users");
        expect(model.tiles.find((t) => t.id === "departments")?.href).toContain("/settings/departments");
    });

    it("builds Business Processes and Surfaces section deep-links", () => {
        const processes = buildBusinessProcessesLandingModel();
        expect(processes.tiles.some((t) => t.href.includes("section=stages"))).toBe(true);
        expect(processes.tiles.some((t) => t.href.includes("section=automation"))).toBe(true);

        const surfaces = buildSurfacesLandingModel();
        expect(surfaces.tiles.map((t) => t.id)).toContain("focus-panels");
        expect(surfaces.tiles.find((t) => t.id === "queue-rows")?.href).toContain("section=queue-rows");
    });

    it("wires page entrypoints to landing when section is absent", () => {
        expect(read("app/adminV2/settings/entities/page.tsx")).toContain("OrganizationDomainLanding");
        expect(read("app/adminV2/settings/users-roles/page.tsx")).toContain("buildAccessLandingModel");
        expect(read("app/adminV2/settings/processes/page.tsx")).toContain("buildBusinessProcessesLandingModel");
        expect(read("app/adminV2/settings/surfaces/page.tsx")).toContain("buildSurfacesLandingModel");
    });

    it("keeps Location Add Program in-context (no Programs peer redirect)", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).toContain("LocationAddProgramPanel");
        expect(page).not.toContain('router.push("/organization/programs")');
        expect(page).toContain("setCreatingProgram(true)");
    });
});
