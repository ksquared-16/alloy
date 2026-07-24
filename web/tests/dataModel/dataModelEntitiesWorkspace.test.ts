import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
    buildDataModelEntitiesWorkspaceVm,
    buildEntityFieldCategories,
    groupFieldsByCategory,
    parseEntitySelection,
    parseEntityWorkspaceTab,
    parseFieldSelection,
    SHOW_ALL_CATEGORY_KEY,
    withFieldSummaryPatch,
    type EntityStatusDefinitionInput,
} from "@/lib/dataModel/dataModelWorkspaceVm";
import { statusDomainForHubEntity } from "@/lib/dataModel/dataModelEntityStatusDomain";
import { configurationPrimaryHubEntities } from "@/lib/adminV2/configuration/configurationEntityCatalog";
import { entityCategorySeeds } from "@/lib/adminV2/configuration/configurationCategoryCatalog";

const webRoot = path.resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(path.join(webRoot, rel), "utf8");
}

function buildFixtureVm(
    overrides?: Parameters<typeof buildDataModelEntitiesWorkspaceVm>[0] extends infer T ?
        Partial<Omit<T, "labels" | "defaultsByType" | "customFieldsByEntityType">>
    :   never,
) {
    return buildDataModelEntitiesWorkspaceVm({
        entities: configurationPrimaryHubEntities(),
        labels: {},
        defaultsByType: new Map(),
        customFieldsByEntityType: new Map(),
        ...overrides,
    });
}

describe("Data Model → Entity workspace VM", () => {
    it("builds a real Collection with one row per hub entity", () => {
        const vm = buildFixtureVm();
        const entities = configurationPrimaryHubEntities();
        expect(vm.collection.rows).toHaveLength(entities.length);
        expect(vm.collection.rows.map((row) => row.hubKey).sort()).toEqual(
            entities.map((entity) => entity.hubKey).sort(),
        );
        expect(vm.collection.totalFields).toBe(
            vm.collection.rows.reduce((sum, row) => sum + row.fieldsTotal, 0),
        );
        expect(vm.collection.totalRelationships).toBe(
            vm.collection.rows.reduce((sum, row) => sum + row.relationshipsTotal, 0),
        );
    });

    it("defaults to the overview tab when no tab is selected", () => {
        expect(parseEntityWorkspaceTab(undefined)).toBe("overview");
        expect(parseEntityWorkspaceTab(null)).toBe("overview");
        expect(parseEntityWorkspaceTab("")).toBe("overview");
        expect(parseEntityWorkspaceTab("not-a-real-tab")).toBe("overview");
        expect(parseEntityWorkspaceTab("fields")).toBe("fields");
        expect(parseEntityWorkspaceTab("status")).toBe("status");
    });

    it("resolves an unknown/blank entity selection to the collection default", () => {
        const vm = buildFixtureVm();
        expect(parseEntitySelection(undefined, vm)).toBe(vm.defaultHubKey);
        expect(parseEntitySelection("not-a-real-hub-key", vm)).toBe(vm.defaultHubKey);
        const someOther = vm.collection.rows.find((row) => row.hubKey !== vm.defaultHubKey);
        if (someOther) {
            expect(parseEntitySelection(someOther.hubKey, vm)).toBe(someOther.hubKey);
        }
    });

    it("derives collection row, header facts, and Overview counts from the SAME resolver for every entity", () => {
        const vm = buildFixtureVm();
        for (const row of vm.collection.rows) {
            const entity = vm.entitiesByHubKey[row.hubKey];
            expect(entity).toBeDefined();
            if (!entity) continue;

            expect(row.fieldsTotal).toBe(entity.structure.fields.total);
            expect(row.relationshipsTotal).toBe(entity.structure.relationshipsTotal);

            const { fields } = entity.structure;
            expect(fields.platform + fields.custom + fields.computed).toBe(fields.total);
            expect(entity.fields).toHaveLength(fields.total);
        }
    });

    it("does not change structure counts when only vocabulary differs", () => {
        const baseline = buildFixtureVm();
        const withOverrides = buildDataModelEntitiesWorkspaceVm({
            entities: configurationPrimaryHubEntities(),
            labels: Object.fromEntries(
                configurationPrimaryHubEntities().map((entity) => [
                    entity.labelsKey,
                    { singular: `Custom ${entity.labelsKey}`, plural: `Custom ${entity.labelsKey}s` },
                ]),
            ),
            defaultsByType: new Map(),
            customFieldsByEntityType: new Map(),
        });
        for (const row of baseline.collection.rows) {
            const overridden = withOverrides.collection.rows.find((r) => r.hubKey === row.hubKey);
            expect(overridden?.fieldsTotal).toBe(row.fieldsTotal);
            expect(overridden?.relationshipsTotal).toBe(row.relationshipsTotal);
        }
    });
});

describe("Entity → Fields VM (in-entity field experience)", () => {
    it("enriches every field summary with the meaning the Fields tab renders", () => {
        const vm = buildFixtureVm();
        const person = vm.entitiesByHubKey.person;
        expect(person).toBeDefined();
        if (!person) return;

        expect(person.fields.length).toBeGreaterThan(0);
        for (const field of person.fields) {
            expect(field.refKey).toBeTruthy();
            expect(field.label).toBeTruthy();
            expect(field.fieldType).toBeTruthy();
            expect(field.categoryKey).toBeTruthy();
            expect(field.categoryLabel).toBeTruthy();
            expect(["platform", "custom", "computed"]).toContain(field.ownership);
            expect(["full", "presentation", "view"]).toContain(field.editMode);
        }
    });

    it("exposes real configured categories per entity with honest field counts", () => {
        const vm = buildFixtureVm();
        const person = vm.entitiesByHubKey.person;
        expect(person).toBeDefined();
        if (!person) return;

        // Seeds are real platform categories for this entity and must all be offered.
        const seedKeys = entityCategorySeeds("person").map((seed) => seed.key);
        for (const key of seedKeys) {
            expect(person.fieldCategories.map((category) => category.key)).toContain(key);
        }

        // Counts are derived from the field list, never invented.
        for (const category of person.fieldCategories) {
            expect(category.fieldCount).toBe(
                person.fields.filter((field) => field.categoryKey === category.key).length,
            );
        }
        const categorized = person.fieldCategories.reduce((sum, c) => sum + c.fieldCount, 0);
        expect(categorized).toBe(person.structure.fields.total);
    });

    it("merges org field_section_definitions labels and ordering into the category list", () => {
        const vm = buildFixtureVm({
            categoryRegistryByEntityType: new Map([
                [
                    "person",
                    [
                        { section_key: "identity", label: "Who they are", sort_order: 1 },
                        { section_key: "vip_program", label: "VIP program", sort_order: 2 },
                        { section_key: "retired_cat", label: "Retired", sort_order: 3, is_archived: true },
                    ],
                ],
            ]),
        });
        const person = vm.entitiesByHubKey.person;
        expect(person).toBeDefined();
        if (!person) return;

        const keys = person.fieldCategories.map((category) => category.key);
        expect(keys[0]).toBe("identity");
        expect(keys).toContain("vip_program");
        expect(keys).not.toContain("retired_cat");
        expect(person.fieldCategories.find((c) => c.key === "identity")?.label).toBe("Who they are");
        expect(person.fields.find((f) => f.categoryKey === "identity")?.categoryLabel).toBe("Who they are");
    });

    it("groups every field under Show All without dropping or duplicating any", () => {
        const vm = buildFixtureVm();
        const person = vm.entitiesByHubKey.person;
        expect(person).toBeDefined();
        if (!person) return;

        const groups = groupFieldsByCategory(person.fields, person.fieldCategories);
        const grouped = groups.flatMap((group) => group.fields.map((field) => field.refKey));
        expect(grouped.sort()).toEqual(person.fields.map((field) => field.refKey).sort());
        expect(new Set(grouped).size).toBe(grouped.length);
        // Show All never renders an empty heading.
        expect(groups.every((group) => group.fields.length > 0)).toBe(true);
    });

    it("keeps a field visible in Show All when its category is not in the category list", () => {
        const categories = buildEntityFieldCategories("person", []);
        const orphan = {
            refKey: "person.orphan",
            label: "Orphan",
            ownership: "custom" as const,
            categoryKey: "not_a_seeded_category",
            categoryLabel: "Not A Seeded Category",
            fieldType: "text",
            entityType: "person",
            description: null,
            helpText: null,
            storageLine: null,
            required: false,
            optionSetKey: null,
            fieldDefinitionId: "abc",
            isSystem: false,
            isActive: true,
            editMode: "full" as const,
            visibility: null,
        };
        const groups = groupFieldsByCategory([orphan], categories);
        expect(groups.flatMap((g) => g.fields.map((f) => f.refKey))).toEqual(["person.orphan"]);
    });

    it("resolves field selection against real fields only", () => {
        const vm = buildFixtureVm();
        const person = vm.entitiesByHubKey.person;
        expect(person).toBeDefined();
        if (!person) return;

        const real = person.fields[0]?.refKey;
        expect(parseFieldSelection(real, person)).toBe(real);
        expect(parseFieldSelection("nope.not.real", person)).toBeNull();
        expect(parseFieldSelection(undefined, person)).toBeNull();
        expect(SHOW_ALL_CATEGORY_KEY).not.toBe("");
    });

    it("recomputes category counts after an in-place field edit without touching structure counts", () => {
        const vm = buildFixtureVm();
        const person = vm.entitiesByHubKey.person;
        expect(person).toBeDefined();
        if (!person) return;

        const target = person.fields[0];
        expect(target).toBeDefined();
        if (!target) return;

        const patched = withFieldSummaryPatch(person, target.refKey, {
            label: "Renamed field",
            categoryKey: "custom",
            categoryLabel: "Custom",
        });
        expect(patched.fields.find((f) => f.refKey === target.refKey)?.label).toBe("Renamed field");
        expect(patched.structure).toEqual(person.structure);
        for (const category of patched.fieldCategories) {
            expect(category.fieldCount).toBe(
                patched.fields.filter((field) => field.categoryKey === category.key).length,
            );
        }
    });
});

describe("Entity → Status VM (status domain hosted in the entity)", () => {
    it("maps every primary hub entity onto a registered status domain owner", () => {
        for (const entity of configurationPrimaryHubEntities()) {
            const domain = statusDomainForHubEntity(entity.hubKey);
            expect(domain, `no status domain for ${entity.hubKey}`).not.toBeNull();
            expect(domain?.authoritativeTable).toBeTruthy();
            expect(domain?.authoritativeColumn).toBeTruthy();
        }
    });

    it("composes effective status definitions into the selected entity, marking inherited defaults", () => {
        const rows: EntityStatusDefinitionInput[] = [
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
            {
                id: "2",
                org_id: null,
                entity_type: "persons",
                status_key: "archived",
                status_label: null,
                sort_order: 5,
                is_active: false,
                is_system: true,
            },
        ];
        const vm = buildFixtureVm({
            statusDefinitionsByEntityType: new Map([["persons", rows]]),
        });
        const person = vm.entitiesByHubKey.person;
        expect(person?.statusDomain).not.toBeNull();
        const statuses = person?.statusDomain?.statuses ?? [];
        expect(statuses.map((s) => s.statusKey)).toEqual(["archived", "active"]);
        expect(statuses[0]?.scope).toBe("industry_default");
        expect(statuses[0]?.label).toBe("Archived");
        expect(statuses[0]?.isActive).toBe(false);
        expect(statuses[1]?.scope).toBe("organization");
    });
});

describe("Entity → Option Sets VM (reached through option-backed fields)", () => {
    it("composes referenced option sets with values and the fields that consume them", () => {
        const fieldDef = {
            id: "fd-1",
            org_id: "org-1",
            entity_type: "person",
            field_key: "shirt_size",
            field_type: "select",
            label: "Shirt size",
            description: "Uniform sizing",
            is_system: false,
            is_required: false,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
            is_visible_in_table: false,
            is_visible_in_public_booking: false,
            is_filterable: false,
            is_sortable: false,
            section_key: "identity",
            sort_order: 10,
            placeholder: null,
            help_text: null,
            config: { option_set_key: "shirt_sizes" },
            requirement_policy: null,
            interaction_policy: null,
            created_at: "",
            updated_at: "",
        };
        const vm = buildFixtureVm({
            customFieldsByEntityType: new Map([["person", [fieldDef]]]),
            optionSetsByKey: new Map([
                [
                    "shirt_sizes",
                    {
                        setKey: "shirt_sizes",
                        label: "Shirt sizes",
                        values: [{ key: "sm", label: "Small", sortOrder: 1 }],
                    },
                ],
            ]),
        } as never);
        const person = vm.entitiesByHubKey.person;
        expect(person).toBeDefined();
        if (!person) return;

        const field = person.fields.find((f) => f.refKey === "person.shirt_size");
        expect(field?.optionSetKey).toBe("shirt_sizes");
        expect(field?.fieldDefinitionId).toBe("fd-1");
        expect(field?.editMode).toBe("full");

        const optionSet = person.optionSets.find((set) => set.setKey === "shirt_sizes");
        expect(optionSet?.resolved).toBe(true);
        expect(optionSet?.itemCount).toBe(1);
        expect(optionSet?.usedByFieldRefKeys).toEqual(["person.shirt_size"]);
    });

    it("marks an option set key that has no matching org option set as unresolved rather than inventing values", () => {
        const fieldDef = {
            id: "fd-2",
            org_id: "org-1",
            entity_type: "person",
            field_key: "mystery",
            field_type: "select",
            label: "Mystery",
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
            section_key: "custom",
            sort_order: 10,
            placeholder: null,
            help_text: null,
            config: { option_set_key: "missing_set" },
            requirement_policy: null,
            interaction_policy: null,
            created_at: "",
            updated_at: "",
        };
        const vm = buildFixtureVm({
            customFieldsByEntityType: new Map([["person", [fieldDef]]]),
        } as never);
        const optionSet = vm.entitiesByHubKey.person?.optionSets.find((set) => set.setKey === "missing_set");
        expect(optionSet?.resolved).toBe(false);
        expect(optionSet?.values).toEqual([]);
    });
});

describe("Data Model → Entity product wiring (corrective redesign)", () => {
    it("composes the Entity VM server-side on every request (no client waterfall, not gated on a section)", () => {
        const page = read("app/adminV2/settings/organization/data-model/page.tsx");
        expect(page).toContain("loadDataModelEntitiesWorkspaceVm");
        expect(page).toContain("resolveDataModelEntityRoute");
        expect(page).not.toContain('section === "entities"');

        const surface = read("components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx");
        expect(surface).toContain("initialVm={entitiesLoad.vm}");
    });

    it("server-loads categories, statuses, and option sets into the initial Entity payload", () => {
        const loader = read("lib/dataModel/loadDataModelEntitiesWorkspaceVm.ts");
        expect(loader).toContain("field_section_definitions");
        expect(loader).toContain("fetchEffectiveStatusDefinitions");
        expect(loader).toContain("option_sets");
        expect(loader).toContain("option_set_items");
    });

    it("keeps one field/relationship count resolver for the rail, header, and Overview", () => {
        const selected = read("components/adminV2/settings/dataModel/entities/EntitySelectedWorkspace.tsx");
        expect(selected).toContain("entity.structure.fields.total");
        expect(selected).toContain("entity.structure.relationshipsTotal");

        const overview = read("components/adminV2/settings/dataModel/entities/EntityOverviewTab.tsx");
        expect(overview).toContain("entity.structure");
    });
});
