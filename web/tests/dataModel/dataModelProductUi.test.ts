import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildDataModelLandingModel } from "@/lib/configRuntime/dataModelLandingModel";
import {
    DATA_MODEL_WORKSPACE_SECTIONS,
    dataModelSectionHref,
    normalizeDataModelWorkspaceSection,
} from "@/lib/dataModel/dataModelChapterRoutes";

const webRoot = path.resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(path.join(webRoot, rel), "utf8");
}

describe("Data Model product UI", () => {
    it("exposes the six operator categories in stable order", () => {
        expect([...DATA_MODEL_WORKSPACE_SECTIONS]).toEqual([
            "entities",
            "fields",
            "statuses",
            "option-sets",
            "relationships",
            "calculations",
        ]);
    });

    it("builds landing tiles without ceremony cards and into the organization shell", () => {
        const model = buildDataModelLandingModel();
        expect(model.summaryCards).toEqual([]);
        expect(model.purpose).toContain("shared vocabulary");
        expect(model.tiles.map((t) => t.id)).toEqual([
            "entities",
            "fields",
            "statuses",
            "option-sets",
            "relationships",
            "calculations",
        ]);
        expect(model.tiles.find((t) => t.id === "entities")?.href).toBe(
            dataModelSectionHref("entities"),
        );
        expect(model.tiles.find((t) => t.id === "fields")?.href).toContain(
            "/organization/data-model?section=fields",
        );
        expect(model.tiles.find((t) => t.id === "option-sets")?.href).toContain("section=option-sets");
        expect(model.tiles.find((t) => t.id === "relationships")?.href).toContain(
            "section=relationships",
        );
    });

    it("normalizes legacy section aliases into Data Model categories", () => {
        expect(normalizeDataModelWorkspaceSection("entities")).toBe("entities");
        expect(normalizeDataModelWorkspaceSection("entity-labels")).toBe("entities");
        expect(normalizeDataModelWorkspaceSection("analytics")).toBe("calculations");
        expect(normalizeDataModelWorkspaceSection("options")).toBe("option-sets");
        expect(normalizeDataModelWorkspaceSection("nope")).toBeNull();
    });

    it("mounts the Data Model workspace surface with category rail (no conceptual landing)", () => {
        const page = read("app/adminV2/settings/organization/data-model/page.tsx");
        expect(page).toContain("DataModelWorkspaceSurface");
        expect(page).not.toContain("OrganizationDomainLanding");

        const surface = read("components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx");
        expect(surface).toContain("data-model-category-rail");
        expect(surface).toContain("EntitiesWorkspaceClient");
        expect(surface).toContain("DataModelWorkspaceClient");
        expect(surface).toContain("StatusesConfigurationPage");
        expect(surface).toContain("OptionSetsClient");
        expect(surface).toContain("RelationshipsSettingsClient");
        expect(surface).toContain("AnalyticsSettingsClient");
        expect(surface).toContain("data-model-calculations-baseline-note");
        expect(surface).not.toContain("Ownership");
        expect(surface).not.toContain("How to start");
        expect(surface).not.toContain("Scope model");
    });

    it("keeps compatibility redirects from legacy settings Data Model routes", () => {
        expect(read("app/adminV2/settings/entities/page.tsx")).toContain("dataModelSectionHref");
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain('dataModelSectionHref("fields"');
        expect(read("app/adminV2/settings/statuses/page.tsx")).toContain('dataModelSectionHref("statuses")');
        expect(read("app/adminV2/settings/option-sets/page.tsx")).toContain(
            'dataModelSectionHref("option-sets")',
        );
        expect(read("app/adminV2/settings/relationships/page.tsx")).toContain(
            'dataModelSectionHref("relationships")',
        );
        expect(read("app/adminV2/settings/calculations/page.tsx")).toContain(
            'dataModelSectionHref("calculations")',
        );
    });

    it("does not invent a parallel metadata or calculation system in the shell", () => {
        const surface = read("components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx");
        expect(surface).not.toContain("createEntity");
        expect(surface).not.toContain("generic status");
        expect(surface).not.toContain("iframe");
    });
});
