/**
 * Requirement timing persistence — Builder UI → rule_meta_v1 → Create Lead intake.
 */
import { describe, expect, it } from "vitest";
import { deepMergeJsonObjects } from "@/lib/json/deepMergeJsonObjects";
import {
    buildLifecycleFieldRulesOverridePatch,
    effectiveFieldRulesStoredForStage,
    LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY,
    parseLifecycleProgressionRequirementsOverride,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import {
    builderRuleMetaFromUi,
    builderStoredFieldRulesFromUiLevels,
    builderTimingUiFromStored,
    type BuilderRequirementTimingUi,
    type BuilderRequirementUiLevel,
} from "@/lib/lifecycle/lifecycleBuilderRequirementLevelsUi";
import type { LifecycleFieldPaletteEntry } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";
import { replacePatchedStageFieldRules } from "@/lib/lifecycle/replacePatchedStageFieldRules";
import { buildRuleMetaV1 } from "@/lib/lifecycle/requirementTimingMeta";
import {
    buildCreateLeadEligibility,
    createLeadConfigRequiredInputsFromIntakeSpec,
} from "@/lib/platform/commands/createLead/createLeadRequiredInputs";

const SCHOOLS = "custom:opportunity:schools";
const CHILD_FIRST = "child:first_name";
const PERSON_EMAIL = "person:email";

const palette = [
    { rule_id: SCHOOLS, runtime_enforced: false },
    { rule_id: CHILD_FIRST, runtime_enforced: true },
    { rule_id: PERSON_EMAIL, runtime_enforced: true },
] as const;

const mergePalette: LifecycleFieldPaletteEntry[] = [
    {
        rule_id: SCHOOLS,
        entity: "opportunity",
        field_key: "schools",
        field_label: "Schools",
        field_source: "custom",
        runtime_enforced: false,
        form_coverage_supported: true,
        config_only: false,
    },
    {
        rule_id: CHILD_FIRST,
        entity: "child",
        field_key: "first_name",
        field_label: "First name",
        field_source: "catalog",
        runtime_enforced: true,
        form_coverage_supported: true,
        config_only: false,
    },
    {
        rule_id: PERSON_EMAIL,
        entity: "person",
        field_key: "email",
        field_label: "Email",
        field_source: "catalog",
        runtime_enforced: true,
        form_coverage_supported: true,
        config_only: false,
    },
];

function draftFromUi(input: {
    levels: Record<string, BuilderRequirementUiLevel>;
    timing: Record<string, BuilderRequirementTimingUi>;
}) {
    const ruleMeta = builderRuleMetaFromUi(palette, input.levels, input.timing);
    return builderStoredFieldRulesFromUiLevels(palette, input.levels, ruleMeta);
}

function saveLeadStage(existingMetadata: Record<string, unknown>, draft: ReturnType<typeof draftFromUi>) {
    const patch = buildLifecycleFieldRulesOverridePatch({
        stage: "lead",
        required_rule_ids: draft.required_rule_ids,
        recommended_rule_ids: draft.recommended_rule_ids,
        existingMetadata,
        explicit_rule_levels_v1: draft.rule_levels_v1 ?? null,
        explicit_rule_meta_v1: draft.rule_meta_v1 ?? null,
        mergedPalette: mergePalette,
    });
    return replacePatchedStageFieldRules(deepMergeJsonObjects(existingMetadata, patch), patch);
}

describe("requirement timing persistence (Builder → rule_meta_v1)", () => {
    it("timing selection serializes into rule_meta_v1 as record_creation", () => {
        const draft = draftFromUi({
            levels: { [SCHOOLS]: "required", [CHILD_FIRST]: "required", [PERSON_EMAIL]: "enforced" },
            timing: {
                [SCHOOLS]: "record_creation",
                [CHILD_FIRST]: "legacy_stage_progress",
                [PERSON_EMAIL]: "legacy_stage_progress",
            },
        });
        expect(draft.rule_meta_v1?.by_rule_id[SCHOOLS]?.timing).toBe("record_creation");
        expect(draft.rule_meta_v1?.by_rule_id[CHILD_FIRST]).toBeUndefined();
        expect(draft.rule_meta_v1?.by_rule_id[PERSON_EMAIL]).toBeUndefined();
    });

    it("save/reload preserves record_creation and does not invent it for legacy rules", () => {
        const draft = draftFromUi({
            levels: { [SCHOOLS]: "required", [CHILD_FIRST]: "required" },
            timing: { [SCHOOLS]: "record_creation", [CHILD_FIRST]: "legacy_stage_progress" },
        });
        const saved = saveLeadStage({}, draft);
        const stored = effectiveFieldRulesStoredForStage("lead", saved);
        expect(stored.rule_meta_v1?.by_rule_id[SCHOOLS]?.timing).toBe("record_creation");
        expect(builderTimingUiFromStored(stored, SCHOOLS)).toBe("record_creation");
        expect(builderTimingUiFromStored(stored, CHILD_FIRST)).toBe("legacy_stage_progress");
    });

    it("multiple rules preserve independent timings", () => {
        const draft = draftFromUi({
            levels: { [SCHOOLS]: "required", [CHILD_FIRST]: "required", [PERSON_EMAIL]: "enforced" },
            timing: {
                [SCHOOLS]: "record_creation",
                [CHILD_FIRST]: "stage_exit",
                [PERSON_EMAIL]: "stage_progress",
            },
        });
        const saved = saveLeadStage({}, draft);
        const stored = effectiveFieldRulesStoredForStage("lead", saved);
        expect(stored.rule_meta_v1?.by_rule_id[SCHOOLS]?.timing).toBe("record_creation");
        expect(stored.rule_meta_v1?.by_rule_id[CHILD_FIRST]?.timing).toBe("stage_exit");
        expect(stored.rule_meta_v1?.by_rule_id[PERSON_EMAIL]?.timing).toBe("stage_progress");
    });

    it("changing timing updates metadata; clearing returns to legacy default", () => {
        const first = draftFromUi({
            levels: { [SCHOOLS]: "required" },
            timing: { [SCHOOLS]: "record_creation" },
        });
        let metadata = saveLeadStage({}, first);
        expect(effectiveFieldRulesStoredForStage("lead", metadata).rule_meta_v1?.by_rule_id[SCHOOLS]?.timing).toBe(
            "record_creation",
        );

        const cleared = draftFromUi({
            levels: { [SCHOOLS]: "required" },
            timing: { [SCHOOLS]: "legacy_stage_progress" },
        });
        metadata = saveLeadStage(metadata, cleared);
        const stored = effectiveFieldRulesStoredForStage("lead", metadata);
        expect(stored.rule_meta_v1?.by_rule_id[SCHOOLS]).toBeUndefined();
        expect(builderTimingUiFromStored(stored, SCHOOLS)).toBe("legacy_stage_progress");
    });

    it("missing metadata does not hydrate as Creating the record", () => {
        const legacyOnly = {
            [LIFECYCLE_PROGRESSION_REQUIREMENTS_METADATA_KEY]: {
                version: 1,
                stages: {
                    lead: {
                        field_rules: {
                            required_rule_ids: [SCHOOLS],
                            recommended_rule_ids: [],
                            rule_levels_v1: { version: 1, by_rule_id: { [SCHOOLS]: "required" } },
                        },
                    },
                },
            },
        };
        const stored = effectiveFieldRulesStoredForStage("lead", legacyOnly);
        expect(stored.rule_meta_v1).toBeUndefined();
        expect(builderTimingUiFromStored(stored, SCHOOLS)).toBe("legacy_stage_progress");
        expect(builderTimingUiFromStored(stored, SCHOOLS)).not.toBe("record_creation");
    });

    it("parse override round-trips rule_meta_v1", () => {
        const draft = draftFromUi({
            levels: { [SCHOOLS]: "required" },
            timing: { [SCHOOLS]: "record_creation" },
        });
        const saved = saveLeadStage({}, draft);
        const parsed = parseLifecycleProgressionRequirementsOverride(saved);
        expect(parsed?.stages?.lead?.field_rules?.rule_meta_v1?.by_rule_id[SCHOOLS]?.timing).toBe(
            "record_creation",
        );
    });

    it("buildRuleMetaV1 drops empty entries", () => {
        expect(buildRuleMetaV1({ [SCHOOLS]: {} })).toBeNull();
        expect(buildRuleMetaV1({ [SCHOOLS]: { timing: "record_creation" } })?.by_rule_id[SCHOOLS]?.timing).toBe(
            "record_creation",
        );
    });
});

describe("Create Lead policy with persisted record_creation", () => {
    it("progression Off wins over stale builder_stage Schools with record_creation", () => {
        const LOCATION = "opportunity:location";
        const metadata = {
            lifecycle_builder_stage_field_rules_v1: {
                version: 1,
                by_stage_key: {
                    lead: {
                        required_rule_ids: [SCHOOLS],
                        recommended_rule_ids: [],
                        rule_levels_v1: { version: 1, by_rule_id: { [SCHOOLS]: "required" } },
                        rule_meta_v1: {
                            version: 1,
                            by_rule_id: { [SCHOOLS]: { timing: "record_creation" } },
                        },
                    },
                },
            },
            lifecycle_progression_requirements_v1: {
                version: 1,
                stages: {
                    lead: {
                        field_rules: {
                            required_rule_ids: [LOCATION],
                            recommended_rule_ids: [],
                            rule_levels_v1: { version: 1, by_rule_id: { [LOCATION]: "required" } },
                            rule_meta_v1: {
                                version: 1,
                                by_rule_id: { [LOCATION]: { timing: "record_creation" } },
                            },
                        },
                    },
                },
            },
        };
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            builder_stage_key: "lead",
            department_metadata: metadata,
        });
        expect(spec.required.some((f) => f.rule_id === SCHOOLS)).toBe(false);
        expect(spec.recommended.some((f) => f.rule_id === SCHOOLS)).toBe(false);
        expect(spec.required.some((f) => f.rule_id === LOCATION)).toBe(true);
    });

    it("record_creation field becomes Create Lead required; stage-only Required stays recommended", () => {
        const draft = draftFromUi({
            levels: {
                [SCHOOLS]: "required",
                [CHILD_FIRST]: "required",
                [PERSON_EMAIL]: "enforced",
            },
            timing: {
                [SCHOOLS]: "record_creation",
                [CHILD_FIRST]: "legacy_stage_progress",
                [PERSON_EMAIL]: "legacy_stage_progress",
            },
        });
        const metadata = saveLeadStage({}, draft);
        const orgDefs = {
            opportunity: [
                {
                    field_key: "schools",
                    label: "Schools",
                    entity_type: "opportunity",
                    is_system: false,
                    is_active: true,
                },
            ],
        };
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            department_metadata: metadata,
            org_field_definitions: orgDefs,
        });

        expect(spec.required.some((f) => f.rule_id === SCHOOLS)).toBe(true);
        expect(spec.required.some((f) => f.rule_id === CHILD_FIRST)).toBe(false);
        expect(spec.recommended.some((f) => f.rule_id === CHILD_FIRST)).toBe(true);

        const configInputs = createLeadConfigRequiredInputsFromIntakeSpec(spec);
        const schoolsKey = configInputs.find((i) => /school/i.test(i.key))?.key;
        expect(schoolsKey).toBeTruthy();

        const eligibility = buildCreateLeadEligibility(
            {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                phone: "",
            },
            configInputs,
        );
        expect(eligibility.eligible).toBe(false);
        expect(eligibility.blockers.some((b) => b.field === schoolsKey)).toBe(true);
    });

    it("client eligibility agrees once Schools is supplied", () => {
        const draft = draftFromUi({
            levels: { [SCHOOLS]: "required" },
            timing: { [SCHOOLS]: "record_creation" },
        });
        const metadata = saveLeadStage({}, draft);
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            department_metadata: metadata,
            org_field_definitions: {
                opportunity: [
                    {
                        field_key: "schools",
                        label: "Schools",
                        entity_type: "opportunity",
                        is_system: false,
                        is_active: true,
                    },
                ],
            },
        });
        const configInputs = createLeadConfigRequiredInputsFromIntakeSpec(spec);
        const schoolsKey = configInputs.find((i) => /school/i.test(i.key))?.key;
        expect(schoolsKey).toBeTruthy();

        const blocked = buildCreateLeadEligibility(
            {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                phone: "",
            },
            configInputs,
        );
        expect(blocked.eligible).toBe(false);

        const ok = buildCreateLeadEligibility(
            {
                first_name: "Ada",
                last_name: "Lovelace",
                email: "ada@example.com",
                phone: "",
                [schoolsKey!]: "North Campus",
            },
            configInputs,
        );
        expect(ok.eligible).toBe(true);
    });
});
