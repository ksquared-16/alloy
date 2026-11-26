/**
 * The form builder's field library must be able to offer everything `/process → requirements` can
 * require. The old hardcoded 17-entry picker could not, so coverage was able to demand rules the
 * builder had no way to satisfy.
 */

import { describe, expect, it } from "vitest";

import { buildProcessingFormFieldLibrary } from "@/lib/forms/processingFormFieldLibrary";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { effectiveFieldRulesForStage } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { PROCESSING_BUILDER_CANONICAL_FIELDS } from "@/lib/forms/processingFormBuilderLibrary";

function libraryForStage(stage: Parameters<typeof mergeLifecycleFieldPaletteForStage>[0]) {
    const palette = mergeLifecycleFieldPaletteForStage(stage, null);
    const { rules } = effectiveFieldRulesForStage(stage, null);
    return {
        palette,
        rules,
        groups: buildProcessingFormFieldLibrary({
            palette,
            requiredRuleIds: rules.required_rule_ids,
            recommendedRuleIds: rules.recommended_rule_ids,
        }),
    };
}

describe("every stage rule is offerable from the builder", () => {
    for (const stage of LIFECYCLE_STAGE_ORDER) {
        it(`${stage}: no required or recommended rule is absent from the library`, () => {
            const { palette, rules, groups } = libraryForStage(stage);
            const offeredRuleIds = new Set(groups.flatMap((g) => g.items.map((i) => i.ruleId)).filter(Boolean));
            const paletteRuleIds = new Set(palette.map((p) => p.rule_id));

            const missing = [...rules.required_rule_ids, ...rules.recommended_rule_ids]
                // Only rules the palette actually surfaces for this stage are the library's job.
                .filter((id) => paletteRuleIds.has(id))
                .filter((id) => !offeredRuleIds.has(id));

            expect(missing, `unofferable rules at ${stage}`).toEqual([]);
        });
    }
});

describe("library composition", () => {
    it("offers far more than the old hardcoded picker at a late stage", () => {
        const { groups } = libraryForStage("enrollment");
        const count = groups.reduce((n, g) => n + g.items.length, 0);
        expect(count).toBeGreaterThan(PROCESSING_BUILDER_CANONICAL_FIELDS.length);
    });

    it("keeps curated extras the palette does not cover", () => {
        const { groups } = libraryForStage("lead");
        const labels = groups.flatMap((g) => g.items.map((i) => i.label));
        // Allergies and the enrollment signature are not stage rules, but operators still add them.
        expect(labels).toContain("Allergies");
        expect(labels).toContain("Enrollment signature");
    });

    it("marks what the stage asks for so required rules lead their group", () => {
        const { groups, rules } = libraryForStage("enrollment");
        const required = groups.flatMap((g) => g.items).filter((i) => i.tier === "required");
        expect(required.length).toBeGreaterThan(0);
        for (const item of required) {
            expect(rules.required_rule_ids).toContain(item.ruleId);
        }

        for (const group of groups) {
            const tiers = group.items.map((i) => (i.captureUnsupported ? 3 : i.tier === "required" ? 0 : i.tier === "recommended" ? 1 : 2));
            expect([...tiers].sort((a, b) => a - b), `${group.group} ordering`).toEqual(tiers);
        }
    });

    it("every offer can actually be materialized — registry id resolves or binding is complete", () => {
        for (const stage of LIFECYCLE_STAGE_ORDER) {
            const { groups } = libraryForStage(stage);
            for (const item of groups.flatMap((g) => g.items)) {
                if (item.add.kind === "registry") {
                    expect(item.add.registryId, `${stage} ${item.id}`).toBeTruthy();
                } else {
                    expect(item.add.entityType, `${stage} ${item.id}`).toBeTruthy();
                    expect(item.add.fieldKey, `${stage} ${item.id}`).toBeTruthy();
                }
            }
        }
    });

    it("labels a rule no form can capture instead of hiding it", () => {
        const groups = buildProcessingFormFieldLibrary({
            palette: [
                {
                    rule_id: "opportunity:enrollment_packet",
                    entity: "opportunity",
                    field_label: "Enrollment Packet Reviewed",
                    field_key: null,
                    field_source: "catalog",
                    runtime_enforced: false,
                    form_coverage_supported: false,
                    config_only: false,
                },
            ],
            requiredRuleIds: ["opportunity:enrollment_packet"],
        });

        const item = groups.flatMap((g) => g.items).find((i) => i.ruleId === "opportunity:enrollment_packet");
        expect(item?.captureUnsupported).toBe(true);
        expect(item?.meta).toContain("cannot be captured by a form");
    });

    it("offers an org custom field the platform catalog has never heard of", () => {
        const groups = buildProcessingFormFieldLibrary({
            palette: [
                {
                    rule_id: "child:guardian_nickname",
                    entity: "child",
                    field_label: "Nickname",
                    field_key: "guardian_nickname",
                    field_source: "custom",
                    runtime_enforced: false,
                    form_coverage_supported: true,
                    config_only: false,
                },
            ],
            requiredRuleIds: ["child:guardian_nickname"],
        });

        const item = groups.flatMap((g) => g.items).find((i) => i.ruleId === "child:guardian_nickname");
        expect(item).toBeDefined();
        expect(item?.label).toBe("Nickname");
        expect(item?.group).toBe("child");
        expect(item?.tier).toBe("required");
        // No registry entry exists, so it binds directly to the entity field key.
        expect(item?.add).toEqual({
            kind: "bound",
            entityType: "child",
            fieldKey: "guardian_nickname",
            builderType: "short_text",
        });
    });

    it("infers a usable builder type for custom fields from the field key", () => {
        const groups = buildProcessingFormFieldLibrary({
            palette: (
                [
                    ["child:custom_dietary_plan", "custom_dietary_plan", "select"],
                    ["child:custom_review_date", "custom_review_date", "date"],
                    ["child:custom_sibling_count", "custom_sibling_count", "number"],
                    ["child:custom_care_notes", "custom_care_notes", "long_text"],
                ] as const
            ).map(([rule_id, field_key]) => ({
                rule_id,
                entity: "child" as const,
                field_label: field_key,
                field_key,
                field_source: "custom" as const,
                runtime_enforced: false,
                form_coverage_supported: true,
                config_only: false,
            })),
        });

        const byRule = new Map(groups.flatMap((g) => g.items).map((i) => [i.ruleId, i]));
        expect((byRule.get("child:custom_dietary_plan")?.add as { builderType: string }).builderType).toBe("select");
        expect((byRule.get("child:custom_review_date")?.add as { builderType: string }).builderType).toBe("date");
        expect((byRule.get("child:custom_sibling_count")?.add as { builderType: string }).builderType).toBe("number");
        expect((byRule.get("child:custom_care_notes")?.add as { builderType: string }).builderType).toBe("long_text");
    });

    it("`config_only` does not hide a field and does not mean 'not form-capturable'", () => {
        // config_only is derived from `runtime_enforced` (lifecycleFieldPaletteMerge.ts) — "the
        // runtime does not enforce this rule". It says nothing about capture. Treating it as
        // uncapturable mislabeled Date of birth and Location, and because orgRowToPalette stamps
        // config_only on EVERY org custom field, mislabeled all of those too.
        const entry = {
            rule_id: "child:internal_flag",
            entity: "child" as const,
            field_label: "Internal Flag",
            field_key: "internal_flag",
            field_source: "custom" as const,
            runtime_enforced: false,
            form_coverage_supported: true,
            config_only: true,
        };

        const groups = buildProcessingFormFieldLibrary({ palette: [entry] });
        const shown = groups.flatMap((g) => g.items).find((i) => i.ruleId === "child:internal_flag");
        expect(shown, "a config-only field must still be offered").toBeDefined();
        expect(shown?.captureUnsupported).toBeUndefined();
    });

    it("only flags fields the platform says forms cannot cover", () => {
        const groups = buildProcessingFormFieldLibrary({
            palette: [
                {
                    rule_id: "child:date_of_birth",
                    entity: "child",
                    field_label: "Date of birth",
                    field_key: "date_of_birth",
                    field_source: "catalog",
                    runtime_enforced: false,
                    form_coverage_supported: true,
                    config_only: true,
                },
                {
                    rule_id: "opportunity:enrollment_packet",
                    entity: "opportunity",
                    field_label: "Enrollment Packet Reviewed",
                    field_key: null,
                    field_source: "catalog",
                    runtime_enforced: false,
                    form_coverage_supported: false,
                    config_only: true,
                },
            ],
        });
        const byRule = new Map(groups.flatMap((g) => g.items).map((i) => [i.ruleId, i]));
        // Date of birth has a registry field purpose-built for forms — never mark it uncapturable.
        expect(byRule.get("child:date_of_birth")?.captureUnsupported).toBeUndefined();
        expect(byRule.get("opportunity:enrollment_packet")?.captureUnsupported).toBe(true);
    });

    it("the real catalog marks nothing form-capturable as uncapturable", () => {
        for (const stage of LIFECYCLE_STAGE_ORDER) {
            const { palette, groups } = libraryForStage(stage);
            const supported = new Set(
                palette.filter((p) => p.form_coverage_supported).map((p) => p.rule_id)
            );
            const wronglyFlagged = groups
                .flatMap((g) => g.items)
                .filter((i) => i.captureUnsupported && i.ruleId && supported.has(i.ruleId))
                .map((i) => `${i.label} (${i.ruleId})`);
            expect(wronglyFlagged, `${stage}: flagged despite form_coverage_supported`).toEqual([]);
        }
    });

    it("offers org custom fields as capturable, not as dead entries", () => {
        const groups = buildProcessingFormFieldLibrary({
            palette: [
                {
                    // Shape produced by orgRowToPalette for a tenant-defined field.
                    rule_id: "custom:child:dietary_needs",
                    entity: "child",
                    field_label: "Dietary needs",
                    field_key: "dietary_needs",
                    field_source: "custom",
                    runtime_enforced: false,
                    form_coverage_supported: true,
                    config_only: true,
                },
            ],
        });
        const item = groups.flatMap((g) => g.items).find((i) => i.ruleId === "custom:child:dietary_needs");
        expect(item?.label).toBe("Dietary needs");
        expect(item?.captureUnsupported).toBeUndefined();
        expect(item?.add.kind).toBe("bound");
    });

    it("never offers the same underlying field twice", () => {
        // The palette speaks bare entity keys (`person`/`first_name`); the registry's own field_key
        // is prefixed (`guardian_first_name`). Joining on entity+field_key silently missed, so every
        // palette rule fell through to an unbound offer AND the curated overlay re-added the same
        // field under a second label — two "first name" rows for parents, three for guardian email.
        for (const stage of LIFECYCLE_STAGE_ORDER) {
            const { groups } = libraryForStage(stage);
            const items = groups.flatMap((g) => g.items);

            const registryIds = items
                .filter((i) => i.add.kind === "registry")
                .map((i) => (i.add as { registryId: string }).registryId);
            expect(new Set(registryIds).size, `${stage}: duplicate registry field offered twice`).toBe(
                registryIds.length
            );

            const bindings = items
                .filter((i) => i.add.kind === "bound")
                .map((i) => {
                    const a = i.add as { entityType: string; fieldKey: string };
                    return `${a.entityType}:${a.fieldKey}`;
                });
            expect(new Set(bindings).size, `${stage}: duplicate entity binding offered twice`).toBe(
                bindings.length
            );

            const labels = items.map((i) => i.label.toLowerCase());
            expect(new Set(labels).size, `${stage}: duplicate label — ${labels.join(", ")}`).toBe(labels.length);
        }
    });

    it("resolves platform rules to their registry field rather than an unbound guess", () => {
        const { groups } = libraryForStage("lead");
        const byRule = new Map(groups.flatMap((g) => g.items).map((i) => [i.ruleId, i]));

        // The exact join that was broken: bare person/child keys → prefixed registry ids.
        expect(byRule.get("person:first_name")?.add).toEqual({ kind: "registry", registryId: "guardian_first_name" });
        expect(byRule.get("person:email")?.add).toEqual({ kind: "registry", registryId: "guardian_email" });
        expect(byRule.get("child:first_name")?.add).toEqual({ kind: "registry", registryId: "child_first_name" });
        expect(byRule.get("child:desired_schedule")?.add).toEqual({ kind: "registry", registryId: "schedule_type" });
    });

    it("a curated label may rename a field but never move it to another group", () => {
        const { groups } = libraryForStage("lead");
        const parent = groups.find((g) => g.group === "parent");
        // guardian_email is curated as both "Parent email" (communication) and "Emergency email"
        // (emergency_contacts). Neither framing may pull the parent-email requirement out of Parent.
        expect(parent?.items.map((i) => i.ruleId)).toContain("person:email");
        expect(groups.find((g) => g.group === "emergency_contacts")?.items.map((i) => i.ruleId) ?? []).not.toContain(
            "person:email"
        );
    });

    it("does not emit duplicate picker ids", () => {
        for (const stage of LIFECYCLE_STAGE_ORDER) {
            const { groups } = libraryForStage(stage);
            const ids = groups.flatMap((g) => g.items.map((i) => i.id));
            expect(new Set(ids).size, stage).toBe(ids.length);
        }
    });
});
