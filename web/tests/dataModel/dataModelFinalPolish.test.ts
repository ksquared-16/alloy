import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { configurationPrimaryHubEntities } from "@/lib/adminV2/configuration/configurationEntityCatalog";
import {
    buildDataModelEntitiesWorkspaceVm,
    ENTITY_FIELD_OWNERSHIP_FILTERS,
    entityDefinitionApiType,
    entityFieldOwnershipFilterCount,
    entitySupportsRelationshipVocabulary,
    matchesEntityFieldOwnershipFilter,
    relationshipVocabularyEndpoint,
    withFieldCategoriesReplaced,
    withFieldSummaryAdded,
    withOptionSetReplaced,
    withRelationshipVocabulary,
    withStatusDomainStatuses,
    type EntityFieldSummaryVm,
    type EntityRelationshipSummaryVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

const webRoot = path.resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(path.join(webRoot, rel), "utf8");
}

const ENTITIES_DIR = "components/adminV2/settings/dataModel/entities";
const DATA_MODEL_DIR = "components/adminV2/settings/dataModel";

/** Every operator-facing file in the Entity workspace. */
const ENTITY_UI_FILES = [
    `${DATA_MODEL_DIR}/DataModelWorkspaceSurface.tsx`,
    `${ENTITIES_DIR}/EntitiesCollectionRail.tsx`,
    `${ENTITIES_DIR}/EntitiesWorkspaceSurface.tsx`,
    `${ENTITIES_DIR}/EntityFieldCategoriesPanel.tsx`,
    `${ENTITIES_DIR}/EntityFieldCreatePanel.tsx`,
    `${ENTITIES_DIR}/EntityFieldDetail.tsx`,
    `${ENTITIES_DIR}/EntityFieldsTab.tsx`,
    `${ENTITIES_DIR}/EntityHistoryTab.tsx`,
    `${ENTITIES_DIR}/EntityOptionSetPanel.tsx`,
    `${ENTITIES_DIR}/EntityOverviewTab.tsx`,
    `${ENTITIES_DIR}/EntityRelationshipsTab.tsx`,
    `${ENTITIES_DIR}/EntitySelectedWorkspace.tsx`,
    `${ENTITIES_DIR}/EntityStatusTab.tsx`,
    `${ENTITIES_DIR}/EntitySurfacesUsageCard.tsx`,
    `${ENTITIES_DIR}/EntityVocabularyTab.tsx`,
] as const;

/**
 * Rendered JSX text only — the parts an operator can actually read. Request bodies,
 * regexes, `data-testid`s, and imports legitimately carry snake_case identifiers;
 * asserting against those would be asserting against the API contract, not the copy.
 */
function operatorCopy(source: string): string {
    return source
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return false;
            if (trimmed.startsWith("import ") || trimmed.startsWith("} from ")) return false;
            if (/data-testid|testId|aria-|data-[a-z-]+=|REGEX|encodeURIComponent/.test(trimmed)) return false;
            if (/method:\s*"(POST|PATCH|PUT|DELETE)"/.test(trimmed)) return false;
            // API request-body keys and the response row types that mirror them.
            if (
                /^(entity_type|status_key|status_label|field_key|section_key|set_key|item_key|sort_order|is_active|is_archived|is_required|label|description|key|metadata)\??:/.test(
                    trimmed,
                )
            ) {
                return false;
            }
            if (/fetch\(|\/api\/admin\//.test(trimmed)) return false;
            return true;
        })
        .join("\n");
}

function buildVm() {
    return buildDataModelEntitiesWorkspaceVm({
        entities: configurationPrimaryHubEntities(),
        labels: {},
        defaultsByType: new Map(),
        customFieldsByEntityType: new Map(),
    });
}

describe("Polish 1 — Industry is gone from Entity Vocabulary", () => {
    it("renders no industry control, dropdown, or default explanation in the Vocabulary tab", () => {
        const vocabulary = read(`${ENTITIES_DIR}/EntityVocabularyTab.tsx`);
        expect(vocabulary).not.toContain("Organization industry");
        expect(vocabulary).not.toContain("industries");
        expect(vocabulary).not.toContain("orgIndustryId");
        expect(vocabulary).not.toContain("Industry default");
        expect(vocabulary).not.toContain("/api/admin/organization/industry");
        // The one real decision this tab owns is still fully wired.
        expect(vocabulary).toContain("/api/admin/entity-labels");
        expect(vocabulary).toContain("entity-vocabulary-save");
        expect(vocabulary).toContain("Reset to Alloy default");
    });

    it("stops threading industry props down the Entity prop chain", () => {
        for (const file of [
            `${DATA_MODEL_DIR}/DataModelWorkspaceSurface.tsx`,
            `${ENTITIES_DIR}/EntitiesWorkspaceSurface.tsx`,
            `${ENTITIES_DIR}/EntitySelectedWorkspace.tsx`,
        ]) {
            const source = read(file);
            expect(source, `${file} still passes industry props`).not.toContain("initialIndustries");
            expect(source, `${file} still passes industry props`).not.toContain("orgIndustryId");
        }
    });

    it("does not load industry in the Entity workspace loader or expose it in the VM", () => {
        const loader = read("lib/dataModel/loadDataModelEntitiesWorkspaceVm.ts");
        expect(loader).not.toContain("DataModelIndustryOption");
        expect(loader).not.toContain("industries:");
        expect(loader).not.toContain("org_industry_id");

        const vm = buildVm();
        expect(Object.keys(vm)).not.toContain("industries");
    });

    it("keeps Industry out of Overview copy", () => {
        const overview = read(`${ENTITIES_DIR}/EntityOverviewTab.tsx`);
        expect(overview).not.toContain("Industry");
        expect(overview).toContain("Alloy default:");
    });
});

describe("Polish 2 — no raw storage identifiers in primary Entity UI", () => {
    it("never renders a raw key or column name outside an Advanced disclosure", () => {
        for (const file of ENTITY_UI_FILES) {
            const copy = operatorCopy(read(file));
            for (const jargon of ["status_key", "entity_key", "field_key", "persons.", ".status_key"]) {
                expect(copy, `${file} shows "${jargon}" in operator copy`).not.toContain(jargon);
            }
        }
    });

    it("puts the internal reference and storage location behind Advanced where they appear at all", () => {
        for (const file of [
            `${ENTITIES_DIR}/EntityFieldDetail.tsx`,
            `${ENTITIES_DIR}/EntityStatusTab.tsx`,
            `${ENTITIES_DIR}/EntityOptionSetPanel.tsx`,
        ]) {
            const source = read(file);
            expect(source, `${file} must gate keys behind Advanced`).toContain("ConfigurationAdvancedToggle");
            expect(source).toContain("Internal reference");
            const advancedAt = source.indexOf("ConfigurationAdvancedToggle");
            expect(source.indexOf("Internal reference")).toBeGreaterThan(advancedAt);
        }
    });

    it("speaks in operator labels — field label, status name, list name", () => {
        expect(read(`${ENTITIES_DIR}/EntityFieldDetail.tsx`)).toContain("Field label");
        expect(read(`${ENTITIES_DIR}/EntityStatusTab.tsx`)).toContain("Status name");
        expect(read(`${ENTITIES_DIR}/EntityOptionSetPanel.tsx`)).toContain("List name");
        // Raw `field_type` values are translated for display.
        expect(read(`${ENTITIES_DIR}/EntityFieldDetail.tsx`)).toContain("fieldTypeOperatorLabel");
    });
});

describe("Polish 3 — Operational Calculations is not promoted on Entity pages", () => {
    it("removes the header context action while keeping the compat route alive", () => {
        const surface = read(`${DATA_MODEL_DIR}/DataModelWorkspaceSurface.tsx`);
        expect(surface).not.toContain("DATA_MODEL_CALCULATIONS_HREF");
        expect(surface).not.toContain("Operational Calculations →");
        expect(surface).not.toContain("actions={");

        // The deep-link pane itself still resolves.
        expect(surface).toContain("AnalyticsSettingsClient");
        expect(surface).toContain("data-model-calculations-pane");
        expect(surface).toContain('mode === "calculations"');
    });

    it("still resolves ?section=calculations for inbound deep links", async () => {
        const { resolveDataModelEntityRoute, normalizeDataModelWorkspaceSection } = await import(
            "@/lib/dataModel/dataModelChapterRoutes"
        );
        expect(resolveDataModelEntityRoute({ section: "calculations" })).toEqual({ mode: "calculations" });
        expect(normalizeDataModelWorkspaceSection("analytics")).toBe("calculations");
        // The page still hands the calculations mode to the surface.
        expect(read("app/adminV2/settings/organization/data-model/page.tsx")).toContain("mode={route.mode}");
    });
});

describe("Polish 4 — Fields tab filters compose", () => {
    it("offers All / Platform / Organization / Computed / Inactive as ownership truth", () => {
        expect(ENTITY_FIELD_OWNERSHIP_FILTERS.map((option) => option.key)).toEqual([
            "all",
            "platform",
            "organization",
            "computed",
            "inactive",
        ]);
        // "custom" is the internal ownership word; operators see "Organization".
        expect(ENTITY_FIELD_OWNERSHIP_FILTERS.map((option) => option.label)).toEqual([
            "All",
            "Platform",
            "Organization",
            "Computed",
            "Inactive",
        ]);
    });

    it("maps each filter onto the field's real ownership and lifecycle", () => {
        const field = (over: Partial<EntityFieldSummaryVm>): EntityFieldSummaryVm => ({
            refKey: "person.x",
            label: "X",
            ownership: "platform",
            categoryKey: "identity",
            categoryLabel: "Identity",
            fieldType: "text",
            entityType: "person",
            description: null,
            helpText: null,
            storageLine: null,
            required: false,
            optionSetKey: null,
            fieldDefinitionId: null,
            isSystem: false,
            isActive: true,
            editMode: "view",
            visibility: null,
            ...over,
        });

        const platform = field({});
        const custom = field({ refKey: "person.c", ownership: "custom" });
        const computed = field({ refKey: "person.k", ownership: "computed" });
        const inactive = field({ refKey: "person.i", ownership: "custom", isActive: false });

        expect(matchesEntityFieldOwnershipFilter(platform, "all")).toBe(true);
        expect(matchesEntityFieldOwnershipFilter(platform, "platform")).toBe(true);
        expect(matchesEntityFieldOwnershipFilter(platform, "organization")).toBe(false);
        expect(matchesEntityFieldOwnershipFilter(custom, "organization")).toBe(true);
        expect(matchesEntityFieldOwnershipFilter(computed, "computed")).toBe(true);
        expect(matchesEntityFieldOwnershipFilter(inactive, "inactive")).toBe(true);
        expect(matchesEntityFieldOwnershipFilter(custom, "inactive")).toBe(false);

        const all = [platform, custom, computed, inactive];
        expect(entityFieldOwnershipFilterCount(all, "all")).toBe(4);
        expect(entityFieldOwnershipFilterCount(all, "organization")).toBe(2);
        expect(entityFieldOwnershipFilterCount(all, "inactive")).toBe(1);
    });

    it("renders the ownership filter alongside search and the existing category filter", () => {
        const fields = read(`${ENTITIES_DIR}/EntityFieldsTab.tsx`);
        expect(fields).toContain("-ownership-filter");
        expect(fields).toContain("ENTITY_FIELD_OWNERSHIP_FILTERS");
        expect(fields).toContain("-search");
        expect(fields).toContain("-category-filter");
        // All three compose in one predicate rather than overriding each other.
        expect(fields).toContain("matchesEntityFieldOwnershipFilter(field, ownershipFilter)");
        expect(fields).toContain("matchesQuery(field)");
        expect(fields).toContain("field.categoryKey === categoryKey");
    });

    it("counts inactive fields in the structure resolver without breaking the ownership split", () => {
        const vm = buildVm();
        for (const row of vm.collection.rows) {
            const entity = vm.entitiesByHubKey[row.hubKey];
            if (!entity) continue;
            const { fields } = entity.structure;
            expect(fields.platform + fields.custom + fields.computed).toBe(fields.total);
            expect(fields.inactive).toBe(entity.fields.filter((f) => !f.isActive).length);
        }
    });
});

describe("Polish 5 — field categories are manageable in place", () => {
    it("adds, renames, archives, and reorders through the field-sections API without navigating", () => {
        const panel = read(`${ENTITIES_DIR}/EntityFieldCategoriesPanel.tsx`);
        expect(panel).toContain("/api/admin/field-sections");
        expect(panel).toContain("Add Category");
        expect(panel).toContain("Rename");
        expect(panel).toContain("Archive");
        expect(panel).toContain("moveCategory");
        expect(panel).toContain("sort_order");
        expect(panel).toContain("is_archived");
        expect(panel).not.toContain("next/link");
        expect(panel).not.toContain("useRouter");
    });

    it("materializes an org row before editing a platform seed category", () => {
        const panel = read(`${ENTITIES_DIR}/EntityFieldCategoriesPanel.tsx`);
        expect(panel).toContain("ensureCategoryRow");
        expect(panel).toContain("registryId");
    });

    it("is reachable from inside the Fields tab, not a separate destination", () => {
        const fields = read(`${ENTITIES_DIR}/EntityFieldsTab.tsx`);
        expect(fields).toContain("EntityFieldCategoriesPanel");
        expect(fields).toContain("-manage-categories");
        expect(fields).toContain("withFieldCategoriesReplaced");
    });

    it("carries the registry id and order the panel needs onto every category", () => {
        const vm = buildVm();
        const person = vm.entitiesByHubKey.person;
        expect(person).toBeDefined();
        if (!person) return;
        for (const category of person.fieldCategories) {
            expect(category).toHaveProperty("registryId");
            expect(typeof category.sortOrder).toBe("number");
            expect(typeof category.isPlatformSeed).toBe("boolean");
        }
    });

    it("keeps counts honest after replacing the category list", () => {
        const vm = buildVm();
        const person = vm.entitiesByHubKey.person;
        if (!person) return;
        const renamed = person.fieldCategories.map((category) =>
            category.key === person.fieldCategories[0]?.key ?
                { ...category, label: "Renamed group" }
            :   category,
        );
        const next = withFieldCategoriesReplaced(person, renamed);
        expect(next.fieldCategories[0]?.label).toBe("Renamed group");
        expect(next.structure).toEqual(person.structure);
        for (const category of next.fieldCategories) {
            expect(category.fieldCount).toBe(
                next.fields.filter((field) => field.categoryKey === category.key).length,
            );
        }
    });
});

describe("Polish 6 — field editing is complete", () => {
    it("exposes Save Field for organization fields and protects platform / computed ones", () => {
        const detail = read(`${ENTITIES_DIR}/EntityFieldDetail.tsx`);
        expect(detail).toContain("Save Field");
        expect(detail).toContain("/api/admin/field-definitions/");
        expect(detail).toContain('method: "PATCH"');
        expect(detail).toContain("withFieldSummaryPatch");
        expect(detail).toContain("PROTECTED_REASON");
        expect(detail).toContain("-protected");
        // Editability is derived from the field's own edit mode, not guessed.
        expect(detail).toContain('field.editMode !== "view"');
        expect(detail).toContain("field.fieldDefinitionId != null");
    });

    it("creates a field inside the Fields section using the existing POST path", () => {
        const create = read(`${ENTITIES_DIR}/EntityFieldCreatePanel.tsx`);
        expect(create).toContain('"/api/admin/field-definitions"');
        expect(create).toContain('method: "POST"');
        expect(create).toContain("entityDefinitionApiType");
        expect(create).not.toContain("next/link");

        const fields = read(`${ENTITIES_DIR}/EntityFieldsTab.tsx`);
        expect(fields).toContain("New Field");
        expect(fields).toContain("EntityFieldCreatePanel");
        expect(fields).toContain("withFieldSummaryAdded");
    });

    it("maps each entity onto the field-definitions entity type its API expects", () => {
        expect(entityDefinitionApiType("person")).toBe("person");
        expect(entityDefinitionApiType("customer")).toBe("customer");
        expect(entityDefinitionApiType("inquiry_child")).toBe("customer_member");
        expect(entityDefinitionApiType("opportunity")).toBe("opportunity");
    });

    it("re-seats a newly created field into the VM with recomputed counts", () => {
        const vm = buildVm();
        const person = vm.entitiesByHubKey.person;
        if (!person) return;

        const added = withFieldSummaryAdded(person, {
            refKey: "person.brand_new",
            label: "Brand new",
            ownership: "custom",
            categoryKey: person.fieldCategories[0]?.key ?? "custom",
            categoryLabel: person.fieldCategories[0]?.label ?? "Custom",
            fieldType: "text",
            entityType: "person",
            description: null,
            helpText: null,
            storageLine: null,
            required: false,
            optionSetKey: null,
            fieldDefinitionId: "new-id",
            isSystem: false,
            isActive: true,
            editMode: "full",
            visibility: {
                form: true,
                drawer: true,
                table: false,
                filterable: false,
                sortable: false,
            },
        });

        expect(added.fields).toHaveLength(person.fields.length + 1);
        expect(added.structure.fields.total).toBe(person.structure.fields.total + 1);
        expect(added.structure.fields.custom).toBe(person.structure.fields.custom + 1);
        expect(added.structure.fields.platform).toBe(person.structure.fields.platform);
        for (const category of added.fieldCategories) {
            expect(category.fieldCount).toBe(
                added.fields.filter((field) => field.categoryKey === category.key).length,
            );
        }
    });
});

describe("Polish 7 — relationships edit in place where authority exists", () => {
    it("creates and edits organization relationship terms through the role-type APIs", () => {
        const relationships = read(`${ENTITIES_DIR}/EntityRelationshipsTab.tsx`);
        expect(relationships).toContain("New Relationship");
        expect(relationships).toContain("Save Relationship");
        expect(relationships).toContain("customer-person-role-types");
        expect(relationships).toContain("person-relationship-type-settings");
        expect(relationships).toContain("relationshipVocabularyEndpoint");
        expect(relationships).toContain("withRelationshipVocabulary");
        expect(relationships).not.toContain("next/link");
        expect(relationships).not.toContain("useRouter");
    });

    it("keeps platform edges protected rather than fake-editable", () => {
        const relationships = read(`${ENTITIES_DIR}/EntityRelationshipsTab.tsx`);
        expect(relationships).toContain("-protected");
        expect(relationships).toContain("operator-configurable");
        expect(relationships).toContain('relationship.source === "organization_vocabulary"');
    });

    it("only offers relationship-term creation on entities whose vocabulary is real", () => {
        expect(entitySupportsRelationshipVocabulary("person")).toBe("person_relationship");
        expect(entitySupportsRelationshipVocabulary("customer")).toBe("family_role");
        expect(entitySupportsRelationshipVocabulary("opportunity")).toBe(false);
        expect(entitySupportsRelationshipVocabulary("location")).toBe(false);

        expect(relationshipVocabularyEndpoint("family_role")).toBe("/api/admin/customer-person-role-types");
        expect(relationshipVocabularyEndpoint("person_relationship")).toBe(
            "/api/admin/person-relationship-type-settings",
        );
    });

    it("holds vocabulary in its own slice so the platform relationship count stays true", () => {
        const vm = buildVm();
        const person = vm.entitiesByHubKey.person;
        if (!person) return;

        expect(person.relationshipVocabulary).toEqual([]);
        const term: EntityRelationshipSummaryVm = {
            id: "vocabulary:person_relationship:grandparent",
            label: "Grandparent",
            pluralLabel: null,
            connectionLabel: "Person connection",
            meaning: "A way one person can be connected to another.",
            targetLabel: "Person",
            cardinality: "Vocabulary term",
            required: false,
            roleNote: null,
            kind: "custom",
            whereUsed: ["Forms"],
            source: "organization_vocabulary",
            vocabularyKind: "person_relationship",
            vocabularyRowId: "row-1",
            description: null,
            isActive: true,
        };
        const next = withRelationshipVocabulary(person, [term]);
        expect(next.relationshipVocabulary).toHaveLength(1);
        expect(next.relationships).toEqual(person.relationships);
        expect(next.structure.relationshipsTotal).toBe(person.structure.relationshipsTotal);
    });
});

describe("Polish 8 — statuses edit in place", () => {
    it("offers New Status and Save Status through the status-definitions API", () => {
        const status = read(`${ENTITIES_DIR}/EntityStatusTab.tsx`);
        expect(status).toContain("New Status");
        expect(status).toContain("Save Status");
        expect(status).toContain('"/api/admin/status-definitions"');
        expect(status).toContain("/api/admin/status-definitions/${status.id}");
        expect(status).toContain("withStatusDomainStatuses");
        expect(status).not.toContain("next/link");
        expect(status).not.toContain("StatusesConfigurationPage");
    });

    it("overrides an inherited default by creating an organization row, not by pretending to PATCH it", () => {
        const status = read(`${ENTITIES_DIR}/EntityStatusTab.tsx`);
        expect(status).toContain("Save as organization status");
        expect(status).toContain('inherited = status.scope === "industry_default"');
        expect(status).toContain("Alloy default");
        expect(status).not.toContain("Industry default");
    });

    it("protects system statuses", () => {
        const status = read(`${ENTITIES_DIR}/EntityStatusTab.tsx`);
        expect(status).toContain("!status.isSystem");
        expect(status).toContain("-protected");
    });

    it("re-sorts the domain after a status mutation without inventing statuses", () => {
        const vm = buildDataModelEntitiesWorkspaceVm({
            entities: configurationPrimaryHubEntities(),
            labels: {},
            defaultsByType: new Map(),
            customFieldsByEntityType: new Map(),
            statusDefinitionsByEntityType: new Map([
                [
                    "persons",
                    [
                        {
                            id: "1",
                            org_id: "org-1",
                            entity_type: "persons",
                            status_key: "active",
                            status_label: "Active",
                            sort_order: 10,
                            is_active: true,
                            is_system: false,
                        },
                    ],
                ],
            ]),
        });
        const person = vm.entitiesByHubKey.person;
        const existing = person?.statusDomain?.statuses ?? [];
        expect(existing).toHaveLength(1);
        if (!person) return;

        const next = withStatusDomainStatuses(person, [
            ...existing,
            {
                id: "2",
                statusKey: "waiting",
                label: "Waiting on paperwork",
                sortOrder: 5,
                isActive: true,
                isSystem: false,
                scope: "organization",
            },
        ]);
        expect(next.statusDomain?.statuses.map((row) => row.statusKey)).toEqual(["waiting", "active"]);
    });
});

describe("Polish 9 — option sets edit in place", () => {
    it("has Values / Usage / History and real value mutations (lands on Values)", () => {
        const panel = read(`${ENTITIES_DIR}/EntityOptionSetPanel.tsx`);
        for (const label of ["Values", "Usage", "History"]) {
            expect(panel, `option set panel missing ${label}`).toContain(`label: "${label}"`);
        }
        expect(panel).not.toContain('label: "Overview"');
        expect(panel).toContain('useState<OptionSetPanelTabKey>("values")');
        expect(panel).toContain("EntitySurfacesUsageCard");
        expect(panel).toContain("New Option Set");
        expect(panel).toContain("Add Value");
        expect(panel).toContain("Edit Value");
        expect(panel).toContain('"/api/admin/option-sets"');
        expect(panel).toContain("/items");
        expect(panel).toContain("item_key");
    });

    it("is reached through the option-backed field, never a detached option-sets page", () => {
        const detail = read(`${ENTITIES_DIR}/EntityFieldDetail.tsx`);
        expect(detail).toContain("EntityOptionSetPanel");
        expect(detail).toContain("withOptionSetReplaced");

        for (const file of ENTITY_UI_FILES) {
            const source = operatorCopy(read(file));
            expect(source, `${file} deep-links to a detached option set page`).not.toContain(
                "/settings/option-sets/",
            );
        }
    });

    it("replaces one set in the VM after a value mutation without disturbing others", () => {
        const vm = buildVm();
        const person = vm.entitiesByHubKey.person;
        if (!person) return;
        const next = withOptionSetReplaced(person, {
            setKey: "shirt_sizes",
            label: "Shirt sizes",
            itemCount: 1,
            values: [{ id: "item-1", key: "sm", label: "Small", sortOrder: 10 }],
            usedByFieldRefKeys: ["person.shirt_size"],
            resolved: true,
        });
        expect(next.optionSets.find((set) => set.setKey === "shirt_sizes")?.itemCount).toBe(1);
        expect(next.structure).toEqual(person.structure);
    });
});

describe("Polish 10 — Overview stays inside the Entity", () => {
    it("drills into sibling tabs and never links out or shows an Open-category affordance", () => {
        const overview = read(`${ENTITIES_DIR}/EntityOverviewTab.tsx`);
        expect(overview).toContain("onOpenTab");
        expect(overview).not.toContain("next/link");
        expect(overview).not.toContain("dataModelSectionHref");
        expect(overview).not.toContain("Open ");
        expect(overview).not.toContain("href=");
    });

    it("keeps every Entity tab free of outbound Data Model category links", () => {
        for (const file of ENTITY_UI_FILES.filter(
            (candidate) =>
                !candidate.endsWith("EntitiesWorkspaceSurface.tsx") &&
                !candidate.endsWith("EntitiesCollectionRail.tsx") &&
                !candidate.endsWith("DataModelWorkspaceSurface.tsx") &&
                // Surfaces usage intentionally links into /organization/surfaces.
                !candidate.endsWith("EntitySurfacesUsageCard.tsx"),
        )) {
            const source = read(file);
            expect(source, `${file} links out of the Entity`).not.toContain("dataModelSectionHref");
            expect(source, `${file} links out of the Entity`).not.toContain('from "next/link"');
        }
    });
});

describe("Polish 11 — the category rail is still gone", () => {
    it("keeps the Entity collection as the only Data Model selector", () => {
        const surface = read(`${DATA_MODEL_DIR}/DataModelWorkspaceSurface.tsx`);
        expect(surface).not.toContain("data-model-category-rail");
        expect(surface).not.toContain("DataModelCategoryNav");

        const rail = read(`${ENTITIES_DIR}/EntitiesCollectionRail.tsx`);
        expect(rail).not.toContain("Calculations");
        expect(rail).not.toContain("Option Sets");
        expect(rail).not.toContain("Statuses");
    });
});
