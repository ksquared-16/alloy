import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildDataModelLandingModel } from "@/lib/configRuntime/dataModelLandingModel";
import {
    DATA_MODEL_SECTION_ENTITY_TAB,
    DATA_MODEL_WORKSPACE_SECTIONS,
    dataModelEntityHref,
    dataModelSectionHref,
    normalizeDataModelWorkspaceSection,
    resolveDataModelEntityRoute,
} from "@/lib/dataModel/dataModelChapterRoutes";
import {
    ENTITY_CHILD_DETAIL_TABS,
    ENTITY_FIELD_DETAIL_TABS,
    ENTITY_WORKSPACE_TABS,
} from "@/lib/dataModel/dataModelWorkspaceVm";

const webRoot = path.resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(path.join(webRoot, rel), "utf8");
}

const ENTITIES_DIR = "components/adminV2/settings/dataModel/entities";

describe("Data Model routing", () => {
    it("keeps the legacy section vocabulary as an inbound compatibility surface only", () => {
        expect([...DATA_MODEL_WORKSPACE_SECTIONS]).toEqual([
            "entities",
            "fields",
            "statuses",
            "option-sets",
            "relationships",
            "calculations",
        ]);
        expect(normalizeDataModelWorkspaceSection("entity-labels")).toBe("entities");
        expect(normalizeDataModelWorkspaceSection("analytics")).toBe("calculations");
        expect(normalizeDataModelWorkspaceSection("nope")).toBeNull();
    });

    it("maps every legacy category (except calculations) onto a real Entity tab", () => {
        const entityTabKeys = ENTITY_WORKSPACE_TABS.map((tab) => tab.key);
        for (const [section, tab] of Object.entries(DATA_MODEL_SECTION_ENTITY_TAB)) {
            expect(entityTabKeys, `${section} maps to a non-existent tab`).toContain(tab);
        }
        expect(DATA_MODEL_SECTION_ENTITY_TAB.fields).toBe("fields");
        expect(DATA_MODEL_SECTION_ENTITY_TAB.statuses).toBe("status");
        expect(DATA_MODEL_SECTION_ENTITY_TAB.relationships).toBe("relationships");
        // Option sets are reached through the option-backed field that consumes them.
        expect(DATA_MODEL_SECTION_ENTITY_TAB["option-sets"]).toBe("fields");
    });

    it("resolves legacy ?section= links into the Entity workspace", () => {
        expect(resolveDataModelEntityRoute({ section: "fields" })).toEqual({
            mode: "entity",
            entity: undefined,
            tab: "fields",
            field: undefined,
        });
        expect(resolveDataModelEntityRoute({ section: "statuses", entity: "opportunity" })).toEqual({
            mode: "entity",
            entity: "opportunity",
            tab: "status",
            field: undefined,
        });
        expect(resolveDataModelEntityRoute({ section: "option-sets" }).mode).toBe("entity");
        expect(resolveDataModelEntityRoute({ section: "relationships" })).toMatchObject({
            tab: "relationships",
        });
    });

    it("lets an explicit tab win over a stale section, and keeps calculations separate", () => {
        expect(resolveDataModelEntityRoute({ section: "fields", tab: "vocabulary" })).toMatchObject({
            tab: "vocabulary",
        });
        expect(resolveDataModelEntityRoute({ section: "calculations" })).toEqual({ mode: "calculations" });
        expect(resolveDataModelEntityRoute({})).toEqual({
            mode: "entity",
            entity: undefined,
            tab: undefined,
            field: undefined,
        });
    });

    it("builds canonical Entity deep-links without a section param", () => {
        expect(dataModelEntityHref("person")).toContain("entity=person");
        expect(dataModelEntityHref("person")).not.toContain("section=");
        expect(dataModelEntityHref("person", { tab: "fields", field: "person.first_name" })).toContain(
            "field=person.first_name",
        );
    });

    it("keeps landing tiles and legacy settings redirects resolvable", () => {
        const model = buildDataModelLandingModel();
        expect(model.summaryCards).toEqual([]);
        expect(model.tiles.find((t) => t.id === "entities")?.href).toBe(dataModelSectionHref("entities"));

        expect(read("app/adminV2/settings/entities/page.tsx")).toContain("dataModelSectionHref");
        expect(read("app/adminV2/settings/fields/page.tsx")).toContain('dataModelSectionHref("fields"');
        expect(read("app/adminV2/settings/statuses/page.tsx")).toContain('dataModelSectionHref("statuses")');
        expect(read("app/adminV2/settings/option-sets/page.tsx")).toContain('dataModelSectionHref("option-sets")');
        expect(read("app/adminV2/settings/relationships/page.tsx")).toContain('dataModelSectionHref("relationships")');
        expect(read("app/adminV2/settings/calculations/page.tsx")).toContain('dataModelSectionHref("calculations")');
    });
});

describe("Data Model shell is Entity-centric", () => {
    it("has no Data Model category rail", () => {
        const surface = read("components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx");
        expect(surface).not.toContain("data-model-category-rail");
        expect(surface).not.toContain("DataModelCategoryNav");
        expect(surface).not.toContain("Data Model categories");
    });

    it("mounts the Entity workspace as the primary experience, not a legacy category client", () => {
        const page = read("app/adminV2/settings/organization/data-model/page.tsx");
        expect(page).toContain("DataModelWorkspaceSurface");
        expect(page).not.toContain("OrganizationDomainLanding");

        const surface = read("components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx");
        expect(surface).toContain("EntitiesWorkspaceSurface");
        for (const legacyClient of [
            "EntitiesWorkspaceClient",
            "DataModelWorkspaceClient",
            "StatusesConfigurationPage",
            "OptionSetsClient",
            "RelationshipsSettingsClient",
        ]) {
            expect(surface, `${legacyClient} must not be the primary Entity experience`).not.toContain(
                legacyClient,
            );
        }
    });

    it("uses the Entity collection rail as the Data Model selector", () => {
        const entitiesSurface = read(`${ENTITIES_DIR}/EntitiesWorkspaceSurface.tsx`);
        expect(entitiesSurface).toContain("EntitiesCollectionRail");
        expect(entitiesSurface).toContain("queueColumn");
        expect(entitiesSurface).toContain("dataModelEntityHref");
    });

    it("breadcrumbs Data Model › Entity with no Entities middle crumb", () => {
        const selected = read(`${ENTITIES_DIR}/EntitySelectedWorkspace.tsx`);
        const breadcrumbStart = selected.indexOf("breadcrumb={");
        const breadcrumbEnd = selected.indexOf("testId={`${testId}-header-object`}");
        expect(breadcrumbStart).toBeGreaterThan(-1);
        const breadcrumb = selected.slice(breadcrumbStart, breadcrumbEnd);
        expect(breadcrumb).toContain("Data Model");
        expect(breadcrumb).toContain("{entity.displayName}");
        expect(breadcrumb).not.toContain(">Entities<");
        expect(breadcrumb).not.toContain("Entities</span>");
    });

    it("keeps Operational Calculations reachable as a deferred compat pane, not a primary rail entry", () => {
        const surface = read("components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx");
        expect(surface).toContain("AnalyticsSettingsClient");
        expect(surface).toContain("data-model-calculations-entry");
        expect(surface).toContain("data-model-calculations-baseline-note");

        const rail = read(`${ENTITIES_DIR}/EntitiesCollectionRail.tsx`);
        expect(rail).not.toContain("Calculations");
    });

    it("does not invent a parallel metadata or calculation system in the shell", () => {
        const surface = read("components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx");
        expect(surface).not.toContain("createEntity");
        expect(surface).not.toContain("generic status");
        expect(surface).not.toContain("iframe");
    });
});

describe("Entity tabs resolve in place", () => {
    it("Fields offers Show All plus a category filter and selects fields without leaving the Entity", () => {
        const fields = read(`${ENTITIES_DIR}/EntityFieldsTab.tsx`);
        expect(fields).toContain("Show All");
        expect(fields).toContain("-category-filter");
        expect(fields).toContain("-category-all");
        expect(fields).toContain("groupFieldsByCategory");
        expect(fields).toContain("ConfigChildObjectMasterDetail");
        expect(fields).toContain("setSelectedRefKey");
        // No navigation out of the Entity.
        expect(fields).not.toContain("next/link");
        expect(fields).not.toContain("DataModelWorkspaceClient");
        expect(fields).not.toContain("fieldsHref");
    });

    it("Field detail exposes Overview / Definition / Validation / Usage / History and preserves the mutation API", () => {
        expect(ENTITY_FIELD_DETAIL_TABS.map((tab) => tab.key)).toEqual([
            "overview",
            "definition",
            "validation",
            "usage",
            "history",
        ]);

        const detail = read(`${ENTITIES_DIR}/EntityFieldDetail.tsx`);
        expect(detail).toContain("ENTITY_FIELD_DETAIL_TABS");
        expect(detail).toContain("/api/admin/field-definitions/");
        expect(detail).toContain('method: "PATCH"');
        // Platform / computed fields are protected rather than fake-editable.
        expect(detail).toContain("-protected");
        expect(detail).toContain("PROTECTED_REASON");
        expect(detail).not.toContain("next/link");
    });

    it("Option Sets open inside the field Definition tab instead of a destination", () => {
        const detail = read(`${ENTITIES_DIR}/EntityFieldDetail.tsx`);
        expect(detail).toContain("EntityOptionSetPanel");
        expect(detail).toContain("-option-set-toggle");

        const panel = read(`${ENTITIES_DIR}/EntityOptionSetPanel.tsx`);
        expect(panel).toContain("Values");
        expect(panel).not.toContain("next/link");
        expect(panel).not.toContain("OptionSetsClient");
    });

    it("Relationships select in place with read-only platform truth", () => {
        expect(ENTITY_CHILD_DETAIL_TABS.map((tab) => tab.key)).toEqual([
            "overview",
            "definition",
            "usage",
            "history",
        ]);

        const relationships = read(`${ENTITIES_DIR}/EntityRelationshipsTab.tsx`);
        expect(relationships).toContain("ENTITY_CHILD_DETAIL_TABS");
        expect(relationships).toContain("ConfigChildObjectMasterDetail");
        expect(relationships).toContain("setSelectedId");
        expect(relationships).toContain("-protected");
        expect(relationships).toContain("operator-configurable");
        expect(relationships).not.toContain("next/link");
        expect(relationships).not.toContain("relationshipsHref");
        expect(relationships).not.toContain("RelationshipsSettingsClient");
    });

    it("Status embeds the entity's status domain in place", () => {
        const status = read(`${ENTITIES_DIR}/EntityStatusTab.tsx`);
        expect(status).toContain("ENTITY_CHILD_DETAIL_TABS");
        expect(status).toContain("ConfigChildObjectMasterDetail");
        expect(status).toContain("entity.statusDomain");
        expect(status).toContain("authoritativeTable");
        expect(status).not.toContain("StatusesConfigurationPage");
        expect(status).not.toContain("next/link");
        expect(status).not.toContain("statusHref");
    });

    it("Overview drills into sibling tabs instead of deep-linking to categories", () => {
        const overview = read(`${ENTITIES_DIR}/EntityOverviewTab.tsx`);
        expect(overview).toContain('onOpenTab("fields")');
        expect(overview).toContain('onOpenTab("relationships")');
        expect(overview).toContain('onOpenTab("status")');
        expect(overview).not.toContain("next/link");
        expect(overview).not.toContain("dataModelSectionHref");
    });
});
