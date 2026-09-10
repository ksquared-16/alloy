/**
 * THE REPAIR, PROVED AGAINST A REAL DRIFTED PAYLOAD.
 *
 * `tests/runtime/fixtures/new-leads-entry.json` is a full tenant `lifecycle_builder_v1` carrying the
 * defect exactly as it was published — not a reconstruction:
 *
 *   enrolling   stage metadata `grain: "child"`, operating plan `journey_segment: "family"`,
 *               outcomes `packet_sent` / `packet_pending` and nothing that completes an enrollment
 *   waitlist    `spot_offered` moves a child to `stage_key: "enrollment"` — a stage this payload's
 *               stage list does not contain, so the child moved nowhere
 *   decision    a family-grain stage whose `family_enrolling` outcome moves the family Opportunity
 *               onto `enrolling`, the child's own stage
 *
 * There is no completion outcome anywhere in it. That is what "Complete Enrollment reported success
 * and changed nothing" looked like from the configuration side.
 *
 * The two things worth proving are opposite: the OLD payload must be REFUSED by publication, and
 * the corrected one must PASS it. A repair that only satisfies its own assertions has proved
 * nothing about the gate that was supposed to stop this.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
    PUBLISH_CHILD_COMPLETION_UNREACHABLE,
    PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH,
    validateParsedBusinessProcessForPublish,
} from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import {
    parseLifecycleBuilderV1,
    serializeLifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { businessProcessPayloadChecksum } from "@/lib/lifecycle/businessProcessPayloadChecksum";
import {
    CHILD_ENROLLMENT_STAGE_KEY,
    correctEnrollmentStageGrainDrift,
    LEGACY_ENROLLMENT_STAGE_KEY,
} from "@/lib/businessProcesses/configuration/correctEnrollmentStageGrainDrift";
import { ENROLLMENT_START_ENTRY_INTENT } from "@/lib/lifecycle/processEntryPointsV1";

function deployedDriftedPayload(): Record<string, unknown> {
    const raw = JSON.parse(
        readFileSync(new URL("../runtime/fixtures/new-leads-entry.json", import.meta.url), "utf8"),
    ) as { metadata: { lifecycle_builder_v1: Record<string, unknown> } };
    return raw.metadata.lifecycle_builder_v1;
}

/** The deployed payload never declared entry points; a child journey cannot begin without one. */
function withChildEntryDeclared(payload: Record<string, unknown>): Record<string, unknown> {
    const clone = structuredClone(payload);
    const processes = clone.processes as Record<string, unknown>[];
    processes[0]!.entry_points_v1 = {
        version: 1,
        by_intent: { create_lead: "lead", [ENROLLMENT_START_ENTRY_INTENT]: CHILD_ENROLLMENT_STAGE_KEY },
    };
    return clone;
}

const parse = (p: Record<string, unknown>) => parseLifecycleBuilderV1(p)!;
const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);
const stageOf = (b: ReturnType<typeof parse>, key: string) =>
    b.processes[0]!.stages.find((s) => s.key === key);

describe("the deployed payload carries the drift this repair is for", () => {
    const builder = parse(deployedDriftedPayload());

    it("declares the child stage family-grain while its own metadata says child", () => {
        const enrolling = stageOf(builder, CHILD_ENROLLMENT_STAGE_KEY)!;
        expect(enrolling.grain).toBe("child");
        expect(enrolling.stage_operating_plan_v1?.journey_segment).toBe("family");
    });

    it("has no way to complete an enrollment anywhere in the process", () => {
        const completing = builder.processes[0]!.stages.filter((s) =>
            (s.stage_operating_plan_v1?.outcome_rules ?? []).some((r) =>
                (r.targets ?? []).some(
                    (t) => t.kind === "update_child_enrollment_status" && t.disposition_key === "enrolled",
                ),
            ),
        );
        expect(completing).toEqual([]);
    });

    it("moves children to a stage the process does not contain", () => {
        const waitlist = stageOf(builder, "waitlist")!;
        const targets = (waitlist.stage_operating_plan_v1?.outcome_rules ?? []).flatMap((r) => r.targets ?? []);
        expect(targets.some((t) => t.kind === "move_to_stage" && t.stage_key === LEGACY_ENROLLMENT_STAGE_KEY)).toBe(true);
        expect(builder.processes[0]!.stages.some((s) => s.key === LEGACY_ENROLLMENT_STAGE_KEY)).toBe(false);
    });

    it("moves the FAMILY case onto the child's stage", () => {
        const decision = stageOf(builder, "decision")!;
        const exits = decision.stage_operating_plan_v1?.outgoing_transitions ?? [];
        expect(exits.some((t) => t.target_stage_key === CHILD_ENROLLMENT_STAGE_KEY)).toBe(true);
    });

    it("IS REFUSED BY PUBLICATION once a child entry is declared", () => {
        /*
         * The gate that should have stopped this. Without an entry declaration the payload predates
         * the question entirely; declaring the child entry it would need is what exposes the grain.
         */
        const result = validateParsedBusinessProcessForPublish(parse(withChildEntryDeclared(deployedDriftedPayload())));
        expect(codes(result)).toContain(PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH);
    });
});

describe("the repair produces a payload publication accepts", () => {
    const corrected = correctEnrollmentStageGrainDrift(parse(deployedDriftedPayload()));

    it("reports every change it made, rather than editing silently", () => {
        expect(corrected.alreadyCorrect).toBe(false);
        const changes = corrected.corrections.map((c) => c.change).join("\n");
        expect(changes).toContain("enrolling");
        expect(changes).toContain("waitlist");
        expect(changes).toContain("decision");
        expect(changes).toContain(ENROLLMENT_START_ENTRY_INTENT);
    });

    it("the child stage now agrees with itself and owns the completion outcome", () => {
        const enrolling = stageOf(corrected.builder, CHILD_ENROLLMENT_STAGE_KEY)!;
        expect(enrolling.grain).toBe("child");
        expect(enrolling.stage_operating_plan_v1?.journey_segment).toBe("child");
        const rule = (enrolling.stage_operating_plan_v1?.outcome_rules ?? []).find(
            (r) => r.when_outcome_key === "enrollment_complete",
        );
        expect(rule).toBeDefined();
        const kinds = (rule?.targets ?? []).map((t) => t.kind);
        expect(kinds).toContain("update_child_enrollment_status");
        expect(kinds).toContain("move_to_stage");
        expect(kinds).toContain("mark_stage_work_complete");
    });

    it("children offered a spot now move to a stage that exists", () => {
        const waitlist = stageOf(corrected.builder, "waitlist")!;
        const targets = (waitlist.stage_operating_plan_v1?.outcome_rules ?? []).flatMap((r) => r.targets ?? []);
        expect(targets.some((t) => t.kind === "move_to_stage" && t.stage_key === CHILD_ENROLLMENT_STAGE_KEY)).toBe(true);
        expect(targets.some((t) => t.stage_key === LEGACY_ENROLLMENT_STAGE_KEY)).toBe(false);
    });

    it("the family case no longer moves onto the child's stage, and still hands the child off", () => {
        const decision = stageOf(corrected.builder, "decision")!;
        const plan = decision.stage_operating_plan_v1!;
        expect((plan.outgoing_transitions ?? []).some((t) => t.target_stage_key === CHILD_ENROLLMENT_STAGE_KEY)).toBe(false);
        const rule = (plan.outcome_rules ?? []).find((r) => r.when_outcome_key === "family_enrolling")!;
        expect(rule.targets.some((t) => t.kind === "move_to_stage")).toBe(false);
        // A rule stripped to nothing would silently do nothing; it says "stay put" explicitly.
        expect(rule.targets.length).toBeGreaterThan(0);
    });

    it("declares the child entry intent at the canonical child stage", () => {
        expect(corrected.builder.processes[0]!.entry_points_v1?.by_intent?.[ENROLLMENT_START_ENTRY_INTENT])
            .toBe(CHILD_ENROLLMENT_STAGE_KEY);
    });

    it("PASSES publication on both invariants the drift violated", () => {
        const result = validateParsedBusinessProcessForPublish(corrected.builder);
        expect(codes(result)).not.toContain(PUBLISH_ENTRY_STAGE_GRAIN_MISMATCH);
        expect(codes(result)).not.toContain(PUBLISH_CHILD_COMPLETION_UNREACHABLE);
    });

    it("is idempotent — re-running it changes nothing and reports nothing", () => {
        /*
         * This is what makes the repair safe to apply to a tenant another lane may already have
         * fixed. `alreadyCorrect` is the signal the publication step reads to decide whether to
         * publish a revision at all.
         */
        const again = correctEnrollmentStageGrainDrift(corrected.builder);
        expect(again.alreadyCorrect).toBe(true);
        expect(again.corrections).toEqual([]);
        expect(businessProcessPayloadChecksum(serializeLifecycleBuilderV1(again.builder)))
            .toBe(businessProcessPayloadChecksum(serializeLifecycleBuilderV1(corrected.builder)));
    });

    it("computes the Law 4 checksum through the product's own serializer", () => {
        /*
         * Not a re-implementation. The checksum is sha256 over a JS-canonical serialization, and a
         * SQL equivalent would have to reproduce localeCompare key ordering and JSON.stringify
         * escaping exactly — which is why the corrected payload is built here and emitted to the
         * migration as a literal rather than transformed in the database.
         */
        const checksum = businessProcessPayloadChecksum(serializeLifecycleBuilderV1(corrected.builder));
        expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("the repair introduces nothing it did not set out to change", () => {
    /*
     * THE SAFETY PROPERTY FOR A MIGRATION, and the one worth pinning hardest.
     *
     * A repair that fixes its target while quietly breaking something else is worse than no repair,
     * because it arrives with a green report. So the comparison is not "does the corrected payload
     * validate" — the deployed one does not either — but "is every error in the corrected payload
     * also an error in the deployed one".
     *
     * It is not: the deployed payload carries pre-existing configuration debt that blocks
     * republication independently of this drift — a `closed_lost` stage referenced by three Close as
     * Lost transitions but absent from the stage list, family stages moving the family case onto the
     * child-grain `waitlist`, and `waitlist` itself declaring no exits. Those are neither caused nor
     * resolved here, and the migration generator refuses to publish while any of them stand.
     */
    const deployed = parse(deployedDriftedPayload());
    const corrected = correctEnrollmentStageGrainDrift(deployed).builder;
    const signature = (r: { errors: { code: string; message: string }[] }) =>
        new Set(r.errors.map((e) => `${e.code} :: ${e.message}`));

    const before = signature(validateParsedBusinessProcessForPublish(deployed, serializeLifecycleBuilderV1(deployed)));
    const after = signature(validateParsedBusinessProcessForPublish(corrected, serializeLifecycleBuilderV1(corrected)));

    it("adds NO publication error that the deployed payload did not already have", () => {
        expect([...after].filter((e) => !before.has(e))).toEqual([]);
    });

    it("resolves exactly the grain-drift errors, named rather than counted", () => {
        const resolved = [...before].filter((e) => !after.has(e)).join("\n");
        expect(resolved).toContain("moves to “Enrollment”, but that stage is missing");
        expect(resolved).toContain('moves a family to "Enrolling", which is configured for individual children');
    });

    it("leaves the pre-existing debt visible instead of masking it", () => {
        // If a later change makes these disappear, that is a real edit someone should have to justify.
        const remaining = [...after].join("\n");
        expect(remaining).toContain("Closed Lost");
        expect(remaining).toContain('moves a family to "Waitlist"');
    });
});
