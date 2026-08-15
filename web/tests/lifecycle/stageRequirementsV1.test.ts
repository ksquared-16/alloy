/**
 * Enrollment Phase 1 — canonical Business Process requirement binding.
 *
 * Proves the contract (D-88), the absent-vs-authored-empty distinction (D-90),
 * stage-level authority with no row merging (D-91), and that the builder payload
 * carries requirements through parse → serialize → parse unchanged.
 */

import { describe, expect, it } from "vitest";

import {
    REQUIREMENT_KINDS_V1,
    REQUIREMENT_KINDS_AUTHORABLE_V1,
    REQUIREMENT_KIND_UNSUPPORTED_REASON_V1,
    isAuthorableRequirementKind,
    parseStageRequirementsV1,
    refuseUnauthorableRequirement,
    serializeStageRequirementsV1,
    validateFormRequirementReferences,
} from "@/lib/lifecycle/stageRequirementsV1";
import {
    canonicalStageRequirements,
    effectiveFormRequirements,
    resolveEffectiveStageRequirements,
} from "@/lib/lifecycle/effectiveStageRequirements";
import {
    parseLifecycleBuilderV1,
    serializeLifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    effectiveFieldRulesForDepartment,
    effectiveRequirementLabelsForDepartment,
} from "@/lib/lifecycle/enrollmentProcessDepartmentRequirements";

const FORM_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

function stagePayload(requirements_v1?: unknown) {
    return {
        version: 1,
        processes: [
            {
                id: "p1",
                key: "enrollment",
                name: "Enrollment",
                stages: [
                    {
                        id: "s1",
                        key: "enrollment",
                        label: "Enrollment",
                        ...(requirements_v1 !== undefined ? { requirements_v1 } : {}),
                    },
                ],
            },
        ],
    };
}

const FORM_REQUIREMENT = {
    requirement_id: "req-immunization",
    kind: "form",
    form_definition_id: FORM_ID,
    level: "required",
    timing: "stage_exit",
    scope: "each_child",
    enforcement: "blocking",
};

describe("requirement kinds — architectural vocabulary vs executable subset", () => {
    it("declares all six kinds", () => {
        expect([...REQUIREMENT_KINDS_V1]).toEqual([
            "field",
            "form",
            "document",
            "consent",
            "acknowledgment",
            "signature",
        ]);
    });

    it("authorizes only the kinds with real canonical substrate", () => {
        expect([...REQUIREMENT_KINDS_AUTHORABLE_V1]).toEqual(["field", "form"]);
        expect(isAuthorableRequirementKind("form")).toBe(true);
        expect(isAuthorableRequirementKind("consent")).toBe(false);
    });

    it("refuses an unsupported kind with a concrete missing-owner reason", () => {
        for (const kind of ["document", "consent", "acknowledgment", "signature"] as const) {
            const refusal = refuseUnauthorableRequirement({
                requirement_id: "r1",
                ref: { kind, [`${kind === "document" ? "document_type_key" : `${kind}_key`}`]: "x" } as never,
                level: "required",
            });
            expect(refusal?.code).toBe("unsupported_kind");
            // The reason must name the missing owner, not say "not implemented".
            expect(refusal?.detail).toBe(REQUIREMENT_KIND_UNSUPPORTED_REASON_V1[kind]);
            expect(refusal?.detail).not.toMatch(/not implemented|coming soon|todo/i);
        }
    });

    it("accepts an authorable form requirement", () => {
        expect(
            refuseUnauthorableRequirement({
                requirement_id: "req-1",
                ref: { kind: "form", form_definition_id: FORM_ID },
                level: "required",
            }),
        ).toBeNull();
    });

    it("refuses a duplicate requirement_id on the same stage", () => {
        const refusal = refuseUnauthorableRequirement(
            { requirement_id: "req-1", ref: { kind: "form", form_definition_id: FORM_ID }, level: "required" },
            ["req-1"],
        );
        expect(refusal?.code).toBe("duplicate_id");
    });
});

describe("parsing — a requirement without a referent is not a requirement", () => {
    it("drops a row whose reference identifier is missing", () => {
        const parsed = parseStageRequirementsV1({
            version: 1,
            requirements: [{ requirement_id: "r1", kind: "form", level: "required" }],
        });
        expect(parsed?.requirements).toEqual([]);
    });

    it("drops a row with no level rather than defaulting one", () => {
        // Defaulting would silently promote or demote enforcement nobody authored.
        const parsed = parseStageRequirementsV1({
            version: 1,
            requirements: [{ requirement_id: "r1", kind: "form", form_definition_id: FORM_ID }],
        });
        expect(parsed?.requirements).toEqual([]);
    });

    it("keeps the five dimensions independent", () => {
        const parsed = parseStageRequirementsV1({ version: 1, requirements: [FORM_REQUIREMENT] });
        const r = parsed!.requirements[0]!;
        expect(r.ref).toEqual({ kind: "form", form_definition_id: FORM_ID });
        expect(r.level).toBe("required");
        expect(r.timing).toBe("stage_exit");
        expect(r.scope).toBe("each_child");
        expect(r.enforcement).toBe("blocking");
    });

    it("stores form IDENTITY only — never a version, schema or label", () => {
        const parsed = parseStageRequirementsV1({
            version: 1,
            requirements: [{ ...FORM_REQUIREMENT, form_version_id: "v-9", name: "Immunization", schema_json: {} }],
        });
        expect(parsed!.requirements[0]!.ref).toEqual({ kind: "form", form_definition_id: FORM_ID });
        expect(JSON.stringify(parsed)).not.toMatch(/schema_json|Immunization|v-9/);
    });

    it("returns null for an absent or unreadable section", () => {
        expect(parseStageRequirementsV1(undefined)).toBeNull();
        expect(parseStageRequirementsV1(null)).toBeNull();
        expect(parseStageRequirementsV1({ version: 2, requirements: [] })).toBeNull();
    });

    it("distinguishes absent (null) from authored-empty (present)", () => {
        expect(parseStageRequirementsV1(undefined)).toBeNull();
        expect(parseStageRequirementsV1({ version: 1, requirements: [] })).toEqual({
            version: 1,
            requirements: [],
        });
    });
});

describe("builder payload round trip", () => {
    it("carries requirements through parse → serialize → parse", () => {
        const parsed = parseLifecycleBuilderV1(stagePayload({ version: 1, requirements: [FORM_REQUIREMENT] }));
        const round = parseLifecycleBuilderV1(serializeLifecycleBuilderV1(parsed!));
        expect(round!.processes[0]!.stages[0]!.requirements_v1?.requirements[0]!.ref).toEqual({
            kind: "form",
            form_definition_id: FORM_ID,
        });
    });

    it("preserves an authored-EMPTY section across the round trip", () => {
        // The single most losable fact in this slice: if serialization drops an empty
        // section, canonical authority silently reverts to legacy on the next read.
        const parsed = parseLifecycleBuilderV1(stagePayload({ version: 1, requirements: [] }));
        expect(parsed!.processes[0]!.stages[0]!.requirements_v1).toEqual({ version: 1, requirements: [] });
        const round = parseLifecycleBuilderV1(serializeLifecycleBuilderV1(parsed!));
        expect(round!.processes[0]!.stages[0]!.requirements_v1).toEqual({ version: 1, requirements: [] });
    });

    it("leaves the section absent when it was never authored", () => {
        const parsed = parseLifecycleBuilderV1(stagePayload());
        expect(parsed!.processes[0]!.stages[0]!.requirements_v1).toBeUndefined();
        const round = parseLifecycleBuilderV1(serializeLifecycleBuilderV1(parsed!));
        expect(round!.processes[0]!.stages[0]!.requirements_v1).toBeUndefined();
    });

    it("does not disturb unknown fields authored by a newer writer", () => {
        const payload = stagePayload({ version: 1, requirements: [FORM_REQUIREMENT] }) as Record<string, unknown>;
        (payload.processes as Record<string, unknown>[])[0]!.future_section_v9 = { keep: true };
        const round = serializeLifecycleBuilderV1(parseLifecycleBuilderV1(payload)!);
        expect((round.processes as Record<string, unknown>[])[0]!.future_section_v9).toEqual({ keep: true });
    });

    it("serializes the ref discriminant back onto the row", () => {
        const s = serializeStageRequirementsV1({
            version: 1,
            requirements: [
                { requirement_id: "r1", ref: { kind: "form", form_definition_id: FORM_ID }, level: "required" },
            ],
        });
        expect((s.requirements as Record<string, unknown>[])[0]).toMatchObject({
            kind: "form",
            form_definition_id: FORM_ID,
            level: "required",
        });
    });
});

describe("enrollment consumers read the canonical resolver (D-92)", () => {
    // These are the two helpers the enrollment form-coverage route and the lifecycle
    // stage bootstrap call. Proving THEM proves the consumer path, without asserting
    // through an HTTP handler that would only add Supabase mocking.
    const LEGACY_META = {
        lifecycle_progression_requirements_v1: {
            version: 1,
            stages: { enrollment: { required_labels: ["Legacy requirement"] } },
        },
    };

    function metaWithBuilder(requirements_v1?: unknown) {
        return { ...LEGACY_META, lifecycle_builder_v1: stagePayload(requirements_v1) };
    }

    it("legacy-only tenant is unchanged by this slice", () => {
        expect(effectiveRequirementLabelsForDepartment("enrollment", LEGACY_META).required_labels).toContain(
            "Legacy requirement",
        );
    });

    it("canonical field requirements replace the legacy answer", () => {
        const { rules } = effectiveFieldRulesForDepartment(
            "enrollment",
            metaWithBuilder({
                version: 1,
                requirements: [
                    { requirement_id: "f1", kind: "field", rule_id: "child.dob", level: "required" },
                ],
            }),
        );
        expect(rules.required_rule_ids).toEqual(["child.dob"]);
    });

    it("authored-empty canonical suppresses legacy at the consumer", () => {
        const labels = effectiveRequirementLabelsForDepartment(
            "enrollment",
            metaWithBuilder({ version: 1, requirements: [] }),
        );
        expect(labels.required_labels).toEqual([]);
        expect(labels.recommended_labels).toEqual([]);
    });

    it("absent canonical still yields the legacy answer at the consumer", () => {
        expect(
            effectiveRequirementLabelsForDepartment("enrollment", metaWithBuilder()).required_labels,
        ).toContain("Legacy requirement");
    });

    it("reports a canonical answer as tenant configuration, not platform default", () => {
        const { source } = effectiveFieldRulesForDepartment(
            "enrollment",
            metaWithBuilder({ version: 1, requirements: [] }),
        );
        expect(source).toBe("department");
    });
});

describe("form reference validation — follows settled runtime doctrine", () => {
    const req = {
        requirement_id: "req-immunization",
        ref: { kind: "form", form_definition_id: FORM_ID },
        level: "required",
    } as const;

    it("accepts a form with a published version", () => {
        expect(
            validateFormRequirementReferences([req], [{ id: FORM_ID, has_published_version: true }]),
        ).toEqual([]);
    });

    it("refuses a form that does not exist in the org", () => {
        const refusals = validateFormRequirementReferences([req], []);
        expect(refusals[0]!.code).toBe("unknown_form");
    });

    it("refuses a draft-only form, matching published-version resolution", () => {
        // loadPacketProjection selects status='published' and reports a form with none
        // as missing, so a draft-only requirement would be permanently unsatisfiable.
        const refusals = validateFormRequirementReferences(
            [req],
            [{ id: FORM_ID, has_published_version: false }],
        );
        expect(refusals[0]!.code).toBe("no_published_version");
    });

    it("ignores non-form requirements", () => {
        expect(
            validateFormRequirementReferences(
                [{ requirement_id: "f1", ref: { kind: "field", rule_id: "child.dob" }, level: "required" }],
                [],
            ),
        ).toEqual([]);
    });

    it("republishing a form does not change requirement identity", () => {
        // The requirement holds only the definition id, so a new published version is
        // picked up with no configuration edit and no re-keying.
        const before = validateFormRequirementReferences([req], [{ id: FORM_ID, has_published_version: true }]);
        const after = validateFormRequirementReferences([req], [{ id: FORM_ID, has_published_version: true }]);
        expect(before).toEqual(after);
        expect(req.ref.form_definition_id).toBe(FORM_ID);
    });
});

describe("effective resolver — D-90 and D-91", () => {
    const LEGACY_META = {
        lifecycle_progression_requirements_v1: {
            version: 1,
            stages: { enrollment: { required_labels: ["Legacy requirement"] } },
        },
    };

    function builderWith(requirements_v1?: unknown) {
        return parseLifecycleBuilderV1(stagePayload(requirements_v1));
    }

    it("canonical present → business_process wins outright", () => {
        const e = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: builderWith({ version: 1, requirements: [FORM_REQUIREMENT] }),
            departmentMetadata: LEGACY_META,
        });
        expect(e.source).toBe("business_process");
        expect(e.requirements).toHaveLength(1);
    });

    it("D-91: canonical never merges legacy rows in", () => {
        const e = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: builderWith({ version: 1, requirements: [FORM_REQUIREMENT] }),
            departmentMetadata: LEGACY_META,
        });
        expect(e.legacy.required).toEqual([]);
        expect(JSON.stringify(e)).not.toMatch(/Legacy requirement/);
    });

    it("D-90: authored-EMPTY suppresses legacy entirely", () => {
        const e = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: builderWith({ version: 1, requirements: [] }),
            departmentMetadata: LEGACY_META,
        });
        expect(e.source).toBe("business_process");
        expect(e.requirements).toEqual([]);
        expect(e.legacy.required).toEqual([]);
        expect(JSON.stringify(e)).not.toMatch(/Legacy requirement/);
    });

    it("D-90: ABSENT falls back to the legacy projection", () => {
        const e = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: builderWith(),
            departmentMetadata: LEGACY_META,
        });
        expect(e.source).toBe("department");
        expect(e.legacy.required.map((r) => r.label)).toContain("Legacy requirement");
    });

    it("legacy parity: a tenant with no builder resolves exactly as before", () => {
        const withoutBuilder = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: null,
            departmentMetadata: LEGACY_META,
        });
        const withEmptyBuilder = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: builderWith(),
            departmentMetadata: LEGACY_META,
        });
        expect(withoutBuilder.legacy).toEqual(withEmptyBuilder.legacy);
        expect(withoutBuilder.source).toBe("department");
    });

    it("no legacy configuration at all resolves to the platform catalog", () => {
        const e = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: builderWith(),
            departmentMetadata: {},
        });
        expect(e.source).toBe("platform");
    });

    it("resolves only for the intended stage", () => {
        expect(
            canonicalStageRequirements(builderWith({ version: 1, requirements: [FORM_REQUIREMENT] }), "tour"),
        ).toBeUndefined();
    });

    it("projects field-kind requirements down into the legacy rule shape", () => {
        const e = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: builderWith({
                version: 1,
                requirements: [
                    { requirement_id: "f1", kind: "field", rule_id: "child.dob", level: "required" },
                    { requirement_id: "f2", kind: "field", rule_id: "child.allergies", level: "recommended" },
                    { requirement_id: "f3", kind: "field", rule_id: "child.legal_name", level: "enforced" },
                ],
            }),
        });
        expect(e.legacy.rules.required_rule_ids).toEqual(["child.dob", "child.legal_name"]);
        expect(e.legacy.rules.recommended_rule_ids).toEqual(["child.allergies"]);
    });

    it("exposes canonical form requirements to consumers", () => {
        const e = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: builderWith({ version: 1, requirements: [FORM_REQUIREMENT] }),
        });
        expect(effectiveFormRequirements(e)).toEqual([
            { requirement_id: "req-immunization", form_definition_id: FORM_ID, level: "required" },
        ]);
    });

    it("reports no canonical rows under a legacy source", () => {
        // Legacy cannot express a KIND; synthesizing one would fake a canonical statement.
        const e = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: null,
            departmentMetadata: LEGACY_META,
        });
        expect(e.requirements).toEqual([]);
        expect(effectiveFormRequirements(e)).toEqual([]);
    });
});
