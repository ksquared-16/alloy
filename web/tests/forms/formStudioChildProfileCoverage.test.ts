/**
 * THE CHILD'S OWN PROFILE, AND WHY IT WAS NOT THERE.
 *
 * `person` holds guardians. The child's durable profile — preferred name, gender, allergies, the
 * daily routines — lives on `customer_member`. The Forms picker derived its whole field universe
 * from the lifecycle palette, whose entity vocabulary is the BUSINESS PROCESS REQUIREMENT CONTRACT
 * (`person | child | opportunity | customer`), so no child-grain Gender could exist in it at all.
 *
 * The repair projects the child profile from the platform's own manifest rather than widening that
 * contract — which is read by Create Lead eligibility, the action intake spec, stage rule
 * persistence and `validatePublicSubmissionLifecycleRequirements`, the last of which decides
 * whether a family's submission is accepted.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
    projectChildProfileFields,
    type ChildProfileFieldDefinitionRow,
} from "@/lib/forms/childProfileFieldProjection";
import { buildProcessingFormFieldLibrary } from "@/lib/forms/processingFormFieldLibrary";
import type { LifecycleFieldPaletteEntry } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";

/** The org's own rows, as `field_definitions` actually records them for this tenant. */
const ORG_ROWS: ChildProfileFieldDefinitionRow[] = [
    { field_key: "gender", label: "Gender", field_type: "select", config: { option_set_key: "person_gender" }, is_active: true },
    { field_key: "preferred_name", label: "Preferred name", field_type: "text", config: null, is_active: true },
    { field_key: "allergies", label: "Allergies", field_type: "text", config: null, is_active: true },
];

const GUARDIAN_GENDER: LifecycleFieldPaletteEntry = {
    rule_id: "custom:person:gender",
    entity: "person",
    field_label: "Gender",
    field_key: "gender",
    field_source: "custom",
    runtime_enforced: false,
    form_coverage_supported: true,
    config_only: true,
    canonical_field_type: "select",
    canonical_option_set_key: "person_gender",
} as LifecycleFieldPaletteEntry;

const build = (opts: { palette?: LifecycleFieldPaletteEntry[]; rows?: ChildProfileFieldDefinitionRow[] } = {}) =>
    buildProcessingFormFieldLibrary({
        palette: opts.palette ?? [],
        childProfile: projectChildProfileFields(opts.rows === undefined ? ORG_ROWS : opts.rows),
    });

const find = (lib: ReturnType<typeof build>, group: string, label: RegExp) =>
    lib.find((g) => g.group === group)?.items.find((i) => label.test(i.label));

describe("the canonical child profile reaches the Forms picker", () => {
    it("offers Child → Gender, which did not exist before", () => {
        const gender = find(build(), "child", /^Gender$/);
        expect(gender, "Child → Gender is absent from the picker").toBeTruthy();
    });

    it("binds it to customer_member.gender, never to the guardian's person record", () => {
        const add = find(build(), "child", /^Gender$/)!.add;
        expect(add.kind).toBe("bound");
        expect(add.kind === "bound" && add.entityType).toBe("customer_member");
        expect(add.kind === "bound" && add.fieldKey).toBe("gender");
    });

    it("carries the canonical select type and the person_gender vocabulary", () => {
        const add = find(build(), "child", /^Gender$/)!.add;
        expect(add.kind === "bound" && add.builderType).toBe("select");
        expect(add.kind === "bound" && add.optionSetKey).toBe("person_gender");
    });

    it("leaves the guardian's own Gender where it belongs — two owners, two fields", () => {
        /*
         * `person.gender` is the guardian's gender and is correct as Parent / Guardian. Aliasing it
         * into Child would put one field under two subjects and make the child's answer overwrite
         * an adult's record.
         */
        const lib = build({ palette: [GUARDIAN_GENDER] });
        expect(find(lib, "parent", /Gender/), "guardian Gender disappeared").toBeTruthy();
        const child = find(lib, "child", /Gender/)!;
        expect(child.add.kind === "bound" && child.add.entityType).toBe("customer_member");
    });

    it("offers only fields this organization actually has", () => {
        // The manifest says what BELONGS to the child profile; the org's rows say what it HAS.
        expect(find(build({ rows: [] }), "child", /^Gender$/)).toBeUndefined();
        expect(find(build(), "child", /Nap routine/)).toBeUndefined();
    });

    it("falls back to the manifest's own declaration when a row omits it", () => {
        // A seeded field the tenant never customised still gets the platform's answer, not a guess
        // made from the spelling of the field key.
        const [gender] = projectChildProfileFields([{ field_key: "gender", is_active: true }]);
        expect(gender!.field_type).toBe("select");
        expect(gender!.option_set_key).toBe("person_gender");
        expect(gender!.label).toBe("Gender");
    });

    it("records the health classification the manifest declares", () => {
        const allergies = projectChildProfileFields(ORG_ROWS).find((f) => f.field_key === "allergies")!;
        expect(allergies.sensitivity).toBe("health");
        expect(projectChildProfileFields(ORG_ROWS).find((f) => f.field_key === "gender")!.sensitivity).toBe("standard");
    });
});

describe("a field is filed under the record it is written to", () => {
    it("keeps a child-grain fact out of the guardian group even when a person rule asks for it", () => {
        /*
         * `child_allergies` is declared `entity_type: "child"` in the registry, but the stage rule
         * that asks for it is written against `person`. Grouping by the RULE's entity filed the
         * child's allergies under Parent / Guardian. The registry's entity is where the answer is
         * actually written, so it decides the grain.
         */
        const lib = buildProcessingFormFieldLibrary({
            palette: [{
                rule_id: "person:allergies",
                entity: "person",
                field_label: "Allergies",
                field_key: "allergies",
                field_source: "catalog",
                runtime_enforced: false,
                form_coverage_supported: true,
                config_only: false,
            } as LifecycleFieldPaletteEntry],
        });
        expect(find(lib, "parent", /Allergies/), "Allergies is still under Parent / Guardian").toBeUndefined();
    });
});

describe("one word cannot mean two records", () => {
    const twoStartDates = () =>
        buildProcessingFormFieldLibrary({
            palette: [
                { rule_id: "a", entity: "child", field_label: "Start date", field_key: "zz_start", field_source: "custom", runtime_enforced: false, form_coverage_supported: true, config_only: true, canonical_field_type: "date" },
                { rule_id: "b", entity: "opportunity", field_label: "Start date", field_key: "zz_start", field_source: "custom", runtime_enforced: false, form_coverage_supported: true, config_only: true, canonical_field_type: "date" },
            ] as LifecycleFieldPaletteEntry[],
        });

    it("names each copy by the grain that owns it", () => {
        const lib = twoStartDates();
        expect(find(lib, "child", /^Child — Start date$/)).toBeTruthy();
        expect(find(lib, "enrollment", /^Enrollment — Start date$/)).toBeTruthy();
    });

    it("leaves an unambiguous label exactly as the organization wrote it", () => {
        const lib = buildProcessingFormFieldLibrary({
            palette: [{ rule_id: "a", entity: "child", field_label: "Start date", field_key: "zz_start", field_source: "custom", runtime_enforced: false, form_coverage_supported: true, config_only: true, canonical_field_type: "date" } as LifecycleFieldPaletteEntry],
        });
        expect(find(lib, "child", /^Start date$/)).toBeTruthy();
    });
});

describe("an unsupported child field is not a selectable dead end", () => {
    it("keeps a manifest-declared choice usable even when the org row forgot its vocabulary", () => {
        /*
         * A tenant row with an empty config is not a field without answers — the manifest declares
         * `gender` over `person_gender`, and that declaration stands in. This is the fallback doing
         * its job, and it is why no child-profile choice reaches the picker empty.
         */
        const lib = build({ rows: [{ field_key: "gender", field_type: "select", config: {}, is_active: true }] });
        const gender = find(lib, "child", /^Gender$/)!;
        expect(gender.captureUnsupported).toBeUndefined();
        expect(gender.add.kind === "bound" && gender.add.optionSetKey).toBe("person_gender");
    });

    it("refuses a choice that genuinely has no answers behind it", () => {
        // An org row that redeclares a text field as a choice, with neither a vocabulary nor a list.
        const lib = build({ rows: [{ field_key: "preferred_name", field_type: "select", config: {}, is_active: true }] });
        const offered = find(lib, "child", /Preferred name/)!;
        expect(offered.captureUnsupported).toBe(true);
        expect(offered.meta).toContain("cannot be captured by a form");
    });

    it("refuses a declared type Forms has no answer control for", () => {
        const lib = build({ rows: [{ field_key: "preferred_name", field_type: "geography_point", is_active: true }] });
        expect(find(lib, "child", /Preferred name/)!.captureUnsupported).toBe(true);
    });
});

describe("the repair did not widen a contract four other surfaces depend on", () => {
    /*
     * `loadOrgFieldDefinitionsForLifecycle` is read by Business Process requirement authoring,
     * `persistLifecycleStageFieldRules`, Create Lead eligibility, the action intake spec and
     * `validatePublicSubmissionLifecycleRequirements` — which decides whether a family's submission
     * is accepted at runtime. Its entity list is the requirement contract, not a field universe.
     *
     * If a later change reaches for `+ customer_member` there instead, this fails and says why.
     */
    const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url).pathname, "utf8");

    it("leaves the lifecycle requirement contract at its four entities", () => {
        const loader = read("lib/lifecycle/loadOrgFieldDefinitionsForLifecycle.ts");
        expect(loader).toContain('["person", "inquiry_child", "opportunity", "customer"]');
        expect(loader, "the lifecycle requirement contract was widened to customer_member").not.toContain("customer_member");
    });

    it("keeps the requirement entity vocabulary unchanged", () => {
        expect(read("lib/lifecycle/lifecycleFieldRequirementsCatalog.ts")).toContain(
            'export type LifecycleRequirementEntityKey = "person" | "child" | "opportunity" | "customer";',
        );
    });

    it("reads the child profile through a Forms-owned reader against the same table", () => {
        // Same canonical field store, a second reader with a different question — not a second store.
        const forms = read("lib/forms/loadChildProfileFieldDefinitions.ts");
        expect(forms).toContain('.from("field_definitions")');
        expect(forms).toContain("CHILD_PROFILE_ENTITY_TYPE");
    });

    it("derives the child field set from the platform manifest, not a Forms-local list", () => {
        const projection = read("lib/forms/childProfileFieldProjection.ts");
        expect(projection).toContain("CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST");
        // A hand-curated Forms copy would name fields here; nothing does.
        expect(projection).not.toMatch(/field_key: "(gender|allergies|preferred_name)"/);
    });
});

describe("one concept at one grain is offered once", () => {
    it("does not add a second Allergies beside the established child-grain destination", () => {
        /*
         * `child_allergies` is the registry's child-grain allergy destination and the manifest also
         * carries `allergies`. Both reaching the Child group gave an administrator two identical
         * entries writing to different places — and choosing the manifest one would have created a
         * second home for a Health-classified fact whose writer the Health contract has not settled.
         */
        const lib = buildProcessingFormFieldLibrary({
            palette: [{
                rule_id: "person:allergies", entity: "person", field_label: "Allergies", field_key: "allergies",
                field_source: "catalog", runtime_enforced: false, form_coverage_supported: true, config_only: false,
            } as LifecycleFieldPaletteEntry],
            childProfile: projectChildProfileFields(ORG_ROWS),
        });
        const child = lib.find((g) => g.group === "child")?.items ?? [];
        expect(child.filter((i) => /allergies/i.test(i.label))).toHaveLength(1);
    });

    it("still offers a child-profile field nothing else claims", () => {
        const lib = buildProcessingFormFieldLibrary({ palette: [], childProfile: projectChildProfileFields(ORG_ROWS) });
        const child = lib.find((g) => g.group === "child")?.items ?? [];
        expect(child.some((i) => /allergies/i.test(i.label))).toBe(true);
        expect(child.some((i) => /preferred name/i.test(i.label))).toBe(true);
    });
});

describe("one destination is offered once", () => {
    const twoRulesOneField = (tiers: { requiredRuleIds?: string[] } = {}) =>
        buildProcessingFormFieldLibrary({
            palette: [
                { rule_id: "child:start_date", entity: "child", field_label: "Start date", field_key: "start_date", field_source: "catalog", runtime_enforced: false, form_coverage_supported: true, config_only: false },
                { rule_id: "person:start_date", entity: "person", field_label: "Start date", field_key: "start_date", field_source: "catalog", runtime_enforced: false, form_coverage_supported: true, config_only: false },
            ] as LifecycleFieldPaletteEntry[],
            ...tiers,
        });

    it("collapses two stage rules that resolve to the same registry field", () => {
        /*
         * A child-grain rule and a guardian-grain rule can both ask for `start_date`. Once grain
         * follows the record the answer is written to, both land in the same group — two rows, one
         * field, nothing to choose between them.
         */
        const all = twoRulesOneField().flatMap((g) => g.items);
        expect(all.filter((i) => /start date/i.test(i.label))).toHaveLength(1);
    });

    it("keeps the requirement tier the collapsed row carried", () => {
        // "This stage requires it" is information the survivor must not lose.
        const all = twoRulesOneField({ requiredRuleIds: ["person:start_date"] }).flatMap((g) => g.items);
        expect(all.find((i) => /start date/i.test(i.label))?.tier).toBe("required");
    });

    it("leaves two genuinely different destinations alone", () => {
        const lib = buildProcessingFormFieldLibrary({
            palette: [
                { rule_id: "a", entity: "child", field_label: "Notes", field_key: "zz_child_notes", field_source: "custom", runtime_enforced: false, form_coverage_supported: true, config_only: true },
                { rule_id: "b", entity: "customer", field_label: "Notes", field_key: "zz_household_notes", field_source: "custom", runtime_enforced: false, form_coverage_supported: true, config_only: true },
            ] as LifecycleFieldPaletteEntry[],
        });
        const all = lib.flatMap((g) => g.items).filter((i) => /notes/i.test(i.label));
        expect(all).toHaveLength(2);
        expect(all.map((i) => i.label).sort()).toEqual(["Child — Notes", "Household — Notes"]);
    });
});
