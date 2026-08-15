/**
 * D-97 — a published Business Process revision is a self-contained executable artifact.
 *
 * The five mandatory publication proofs (P1–P5), plus the two properties that make them safe to
 * rely on: republish idempotency, and round-trip exactness against the legacy projection.
 *
 * These GATE the D-96 process-instance pin. If a published revision is not self-contained, pinning
 * an instance to it buys nothing — the runtime would still have to read live department metadata to
 * learn what a stage requires.
 *
 * The proofs are stated over the NORMALIZED PAYLOAD rather than over a database row on purpose. A
 * published revision IS its payload: the RPC inserts it verbatim and an immutability trigger blocks
 * UPDATE. So "the revision is self-contained" is exactly the claim "resolving this payload needs no
 * department metadata", which is what each proof below asserts by resolving against `null` metadata.
 * The storage-layer half — that the stored payload cannot be rewritten by a later metadata change —
 * is proven against a real Postgres in
 * `certification/business-process-revision-self-containment/`.
 */

import { describe, expect, it } from "vitest";

import {
    legacyMaterializedRequirementId,
    normalizeBusinessProcessPayloadRequirements,
} from "@/lib/businessProcesses/configuration/normalizePublishedStageRequirements";
import { businessProcessPayloadChecksum } from "@/lib/lifecycle/businessProcessPayloadChecksum";
import { resolveEffectiveStageRequirements } from "@/lib/lifecycle/effectiveStageRequirements";
import { effectiveRequirementLabelsForDepartment } from "@/lib/lifecycle/enrollmentProcessDepartmentRequirements";
import { deriveObjectLabelsFromFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { parseLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";

const FORM_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

/** Catalog rule ids, so the legacy projection has something real to say. */
const LEGACY_REQUIRED = ["child:first_name", "child:last_name"];
const LEGACY_RECOMMENDED = ["person:email"];

function legacyMetadata(required: string[], recommended: string[]) {
    return {
        lifecycle_progression_requirements_v1: {
            version: 1,
            stages: {
                enrollment: {
                    field_rules: {
                        required_rule_ids: required,
                        recommended_rule_ids: recommended,
                    },
                },
            },
        },
    };
}

/**
 * What `buildLifecycleFieldRulesOverridePatch` actually persists: field rules AND the labels
 * derived from them. Using the platform's own writer keeps the fixture from asserting a shape the
 * product never produces.
 */
function builderWrittenMetadata(required: string[], recommended: string[]) {
    const derived = deriveObjectLabelsFromFieldRules(required, recommended);
    return {
        lifecycle_progression_requirements_v1: {
            version: 1,
            stages: {
                enrollment: {
                    field_rules: {
                        required_rule_ids: required,
                        recommended_rule_ids: recommended,
                    },
                    required_labels: derived.required_labels,
                    recommended_labels: derived.recommended_labels,
                },
            },
        },
    };
}

function draftPayload(requirements_v1?: unknown) {
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

/** What the published artifact ALONE says a stage requires — no department metadata in sight. */
function requirementsFromPublishedPayload(payload: Record<string, unknown>) {
    return resolveEffectiveStageRequirements({
        stage: "enrollment",
        builder: parseLifecycleBuilderV1(payload),
        departmentMetadata: null,
    });
}

function publish(payload: unknown, departmentMetadata: Record<string, unknown> | null) {
    return normalizeBusinessProcessPayloadRequirements({ payload, departmentMetadata });
}

// ---------------------------------------------------------------------------
// P1 — an authored canonical section survives publication unchanged
// ---------------------------------------------------------------------------

describe("P1 — authored canonical requirements survive publication", () => {
    const AUTHORED = {
        version: 1,
        requirements: [
            {
                requirement_id: "req-immunization",
                kind: "form",
                form_definition_id: FORM_ID,
                level: "required",
                // A field a newer writer might add. Preservation has to mean PRESERVATION, not
                // "re-serialized through the parser I happen to have today".
                future_field_v9: { keep: true },
            },
        ],
    };

    it("is carried through byte-for-byte, unknown fields included", () => {
        const before = draftPayload(AUTHORED);
        const after = publish(before, legacyMetadata(LEGACY_REQUIRED, LEGACY_RECOMMENDED));

        expect(after.changed).toBe(false);
        // Identical by reference: nothing was rebuilt, so nothing could be dropped.
        expect(after.payload).toBe(before);
        const stage = (after.payload.processes as Record<string, unknown>[])[0]!.stages as Record<
            string,
            unknown
        >[];
        expect((stage[0]!.requirements_v1 as typeof AUTHORED).requirements[0]).toEqual(
            AUTHORED.requirements[0],
        );
    });

    it("the legacy set is NOT merged in (D-91)", () => {
        const after = publish(draftPayload(AUTHORED), legacyMetadata(LEGACY_REQUIRED, LEGACY_RECOMMENDED));
        const effective = requirementsFromPublishedPayload(after.payload);
        expect(effective.source).toBe("business_process");
        expect(effective.requirements.map((r) => r.requirement_id)).toEqual(["req-immunization"]);
        expect(JSON.stringify(after.payload)).not.toContain("child:first_name");
    });
});

// ---------------------------------------------------------------------------
// P2 — authored-empty stays empty (D-90)
// ---------------------------------------------------------------------------

describe("P2 — an authored-empty requirement set stays empty", () => {
    it("publication does not resurrect legacy requirements", () => {
        const before = draftPayload({ version: 1, requirements: [] });
        const after = publish(before, legacyMetadata(LEGACY_REQUIRED, LEGACY_RECOMMENDED));

        expect(after.changed).toBe(false);
        expect(after.payload).toBe(before);

        const effective = requirementsFromPublishedPayload(after.payload);
        expect(effective.source).toBe("business_process");
        expect(effective.requirements).toEqual([]);
        expect(effective.legacy.rules.required_rule_ids).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// P3 — an absent section materializes the legacy projection INTO the revision
// ---------------------------------------------------------------------------

describe("P3 — legacy-only configuration becomes revision-contained", () => {
    const META = legacyMetadata(LEGACY_REQUIRED, LEGACY_RECOMMENDED);

    it("materializes the legacy field rules as canonical requirements", () => {
        const after = publish(draftPayload(), META);

        expect(after.changed).toBe(true);
        expect(after.materialized).toEqual([
            { process_key: "enrollment", stage_key: "enrollment", requirement_count: 3 },
        ]);

        const effective = requirementsFromPublishedPayload(after.payload);
        expect(effective.source).toBe("business_process");
        expect(effective.requirements.map((r) => r.requirement_id)).toEqual([
            legacyMaterializedRequirementId("child:first_name"),
            legacyMaterializedRequirementId("child:last_name"),
            legacyMaterializedRequirementId("person:email"),
        ]);
        expect(effective.requirements.map((r) => r.level)).toEqual([
            "required",
            "required",
            "recommended",
        ]);
    });

    it("the revision alone answers what the stage requires — no metadata needed", () => {
        // The whole of D-97 in one assertion: same answer from the artifact with NO department
        // metadata as the legacy projection gave with it.
        const legacyAnswer = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: null,
            departmentMetadata: META,
        });
        const revisionAnswer = requirementsFromPublishedPayload(publish(draftPayload(), META).payload);

        expect(revisionAnswer.legacy.rules).toEqual(legacyAnswer.legacy.rules);
    });

    it("preserves the operator-facing requirement labels for builder-written configuration", () => {
        // Materialization must not blank the label lists the form-coverage route and the lifecycle
        // stage bootstrap render.
        //
        // The fixture is what `buildLifecycleFieldRulesOverridePatch` actually writes: field rules
        // PLUS the labels derived from them. That pairing is not incidental — it is the only shape
        // the platform's own write path produces, and it is what makes labels survive, because both
        // sides then derive from the same rule ids.
        const written = builderWrittenMetadata(LEGACY_REQUIRED, LEGACY_RECOMMENDED);
        const beforePublish = effectiveRequirementLabelsForDepartment("enrollment", written);
        const published = publish(draftPayload(), written).payload;
        const afterPublish = effectiveRequirementLabelsForDepartment("enrollment", {
            ...written,
            lifecycle_builder_v1: published,
        });

        expect(afterPublish.required_labels).toEqual(beforePublish.required_labels);
        expect(afterPublish.recommended_labels).toEqual(beforePublish.recommended_labels);
        expect(afterPublish.required_labels.length).toBeGreaterThan(0);
    });

    it("KNOWN NARROWING: a display-only label with no rule id does not survive materialization", () => {
        // Recorded, not hidden. The legacy store has two INDEPENDENT halves — a label list and a
        // field-rule list — and only rule ids carry an identity a canonical requirement can
        // reference. A label that maps to no catalog rule therefore cannot be materialized.
        //
        // It was already inert before this slice: `effectiveFieldRulesForStage` yields no rule for
        // it, so nothing evaluated or enforced it. What changes is that it stops being DISPLAYED
        // once the stage is published. The remedy is authoring the requirement canonically, which
        // is the point of D-88.
        const labelsOnly = {
            lifecycle_progression_requirements_v1: {
                version: 1,
                stages: { enrollment: { required_labels: ["Child", "Bespoke house rule"] } },
            },
        };

        expect(
            effectiveRequirementLabelsForDepartment("enrollment", labelsOnly).required_labels,
        ).toContain("Bespoke house rule");

        const published = publish(draftPayload(), labelsOnly).payload;
        const after = effectiveRequirementLabelsForDepartment("enrollment", {
            ...labelsOnly,
            lifecycle_builder_v1: published,
        });

        // The mapped label survives; the unmapped one does not.
        expect(after.required_labels).toContain("Child");
        expect(after.required_labels).not.toContain("Bespoke house rule");
        // And no enforcement changed: it had no rule id on either side of the publish.
        expect(
            requirementsFromPublishedPayload(published).legacy.rules.required_rule_ids,
        ).toEqual(
            resolveEffectiveStageRequirements({
                stage: "enrollment",
                builder: null,
                departmentMetadata: labelsOnly,
            }).legacy.rules.required_rule_ids,
        );
    });

    it("a stage key with no operator-stage identity materializes an explicit empty set", () => {
        // Not a gap: the legacy stores are keyed by operator stage, so legacy has nothing to say
        // about such a stage — and the revision must still SAY that rather than stay silent.
        const payload = {
            version: 1,
            processes: [
                {
                    id: "p1",
                    key: "enrollment",
                    name: "Enrollment",
                    stages: [{ id: "s9", key: "bespoke_review", label: "Bespoke Review" }],
                },
            ],
        };
        const after = publish(payload, META);
        const stages = (after.payload.processes as Record<string, unknown>[])[0]!.stages as Record<
            string,
            unknown
        >[];
        expect(stages[0]!.requirements_v1).toEqual({ version: 1, requirements: [] });
    });
});

// ---------------------------------------------------------------------------
// P4 — a later legacy edit cannot reach the published revision
// ---------------------------------------------------------------------------

describe("P4 — editing live legacy metadata does not alter a published revision", () => {
    it("the revision keeps the requirements it was published with", () => {
        const publishedAtRevisionN = publish(
            draftPayload(),
            legacyMetadata(LEGACY_REQUIRED, LEGACY_RECOMMENDED),
        ).payload;

        // The operator now rewrites the unversioned legacy keys — the exact write the publication
        // guard does NOT protect, which is why D-97 exists.
        const rewritten = legacyMetadata(["child:program_interest"], []);

        const answer = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: parseLifecycleBuilderV1(publishedAtRevisionN),
            departmentMetadata: rewritten,
        });

        expect(answer.source).toBe("business_process");
        expect(answer.legacy.rules.required_rule_ids).toEqual(LEGACY_REQUIRED);
        expect(JSON.stringify(publishedAtRevisionN)).not.toContain("child:program_interest");
    });
});

// ---------------------------------------------------------------------------
// P5 — rollback restores the chosen revision's own requirement set
// ---------------------------------------------------------------------------

describe("P5 — rollback restores self-contained requirements", () => {
    it("republishing revision N forward carries N's requirements, not today's metadata", () => {
        const revisionN = publish(draftPayload(), legacyMetadata(LEGACY_REQUIRED, [])).payload;

        // Time passes: the tenant authors different requirements canonically and publishes N+1.
        const revisionN1 = publish(
            draftPayload({
                version: 1,
                requirements: [
                    { requirement_id: "r-new", kind: "field", rule_id: "child:classroom", level: "required" },
                ],
            }),
            legacyMetadata(["child:program_interest"], []),
        ).payload;

        // Rollback republishes N's payload FORWARD verbatim (the RPC copies `v_target.payload`).
        const restored = revisionN;

        expect(requirementsFromPublishedPayload(revisionN1).legacy.rules.required_rule_ids).toEqual([
            "child:classroom",
        ]);
        expect(requirementsFromPublishedPayload(restored).legacy.rules.required_rule_ids).toEqual(
            LEGACY_REQUIRED,
        );
        // And the restored answer needs no metadata at all — that is what makes rollback complete.
        expect(requirementsFromPublishedPayload(restored).source).toBe("business_process");
    });
});

// ---------------------------------------------------------------------------
// Properties the five proofs rest on
// ---------------------------------------------------------------------------

describe("normalization is idempotent and checksum-stable", () => {
    const META = legacyMetadata(LEGACY_REQUIRED, LEGACY_RECOMMENDED);

    it("normalizing an already-normalized payload changes nothing", () => {
        const once = publish(draftPayload(), META);
        const twice = publish(once.payload, META);

        expect(once.changed).toBe(true);
        expect(twice.changed).toBe(false);
        expect(twice.payload).toBe(once.payload);
    });

    it("republishing unchanged configuration yields an identical checksum", () => {
        // The publish RPC's already-published no-op compares checksums. A non-deterministic
        // requirement_id here would make every republish a new revision.
        const a = businessProcessPayloadChecksum(publish(draftPayload(), META).payload);
        const b = businessProcessPayloadChecksum(publish(draftPayload(), META).payload);
        expect(a).toBe(b);
    });

    it("a payload needing no materialization keeps the checksum it had before this slice", () => {
        const before = draftPayload({ version: 1, requirements: [] });
        expect(businessProcessPayloadChecksum(publish(before, META).payload)).toBe(
            businessProcessPayloadChecksum(before),
        );
    });
});

describe("materialization is round-trip exact against the legacy projection", () => {
    it("projecting the materialized rows back down reproduces the legacy rules", () => {
        for (const [required, recommended] of [
            [LEGACY_REQUIRED, LEGACY_RECOMMENDED],
            [["child:classroom"], []],
            [[], ["child:start_date"]],
            [[], []],
        ] as const) {
            const meta = legacyMetadata([...required], [...recommended]);
            const legacyAnswer = resolveEffectiveStageRequirements({
                stage: "enrollment",
                builder: null,
                departmentMetadata: meta,
            });
            const revisionAnswer = requirementsFromPublishedPayload(publish(draftPayload(), meta).payload);
            expect(revisionAnswer.legacy.rules).toEqual(legacyAnswer.legacy.rules);
        }
    });

    it("a tenant with NO legacy configuration materializes the platform default, not nothing", () => {
        // Silence in the legacy store still resolves to platform requirements today. Publishing an
        // empty set for such a stage would silently drop them.
        const platformAnswer = resolveEffectiveStageRequirements({
            stage: "enrollment",
            builder: null,
            departmentMetadata: null,
        });
        const revisionAnswer = requirementsFromPublishedPayload(publish(draftPayload(), null).payload);
        expect(revisionAnswer.legacy.rules).toEqual(platformAnswer.legacy.rules);
        expect(platformAnswer.source).toBe("platform");
    });
});
