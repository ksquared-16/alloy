/**
 * THE UPGRADE PATH THAT DID NOT EXIST.
 *
 * `applyEnrollmentTemplateToProcess` refuses a process that already has stages, so mixed-grain
 * routing was reachable only by instantiating a template into an EMPTY process. A tenant whose
 * Business Process predated the template held a `builder_owned` process with `track_count = 0` and
 * no product operation that could change that — the resolver stayed on legacy routing forever, and
 * the repair reached for instead was a direct database edit.
 *
 * These tests pin the operation that closes it, and they pin it GENERICALLY. Every assertion below
 * drives the evaluator with a template DESCRIPTOR; the Enrollment descriptor is used because it is
 * the one the platform publishes, and a second, invented descriptor proves the code is reading the
 * descriptor rather than recognising Enrollment.
 *
 * The load-bearing property is that adoption is ALL OR NOTHING. `tracks_v1` is not an annotation:
 * its presence is the switch from legacy routing to builder membership routing for every lane at
 * once, so a process adopted with one stale `queue_membership_v1` does not get one wrong lane — it
 * gets a silent, whole-process change of who decides what each lane contains.
 */

import { describe, expect, it } from "vitest";

import {
    ADOPT_INSTANCE_STAGE_UNCONFIGURED,
    ADOPT_MEMBERSHIP_GRAIN_CONFLICT,
    ADOPT_MEMBERSHIP_STAGE_MISMATCH,
    ADOPT_SPLIT_STAGE_UNKNOWN,
    ADOPT_STAGE_GRAIN_MISSING,
    ADOPT_STAGE_GRAIN_UNMAPPABLE,
    adoptProcessTracks,
    evaluateProcessTrackAdoption,
} from "@/lib/businessProcesses/configuration/processTrackAdoption";
import {
    processKeysWithAdoptableTracks,
    trackAdoptionTemplateForProcessKey,
    type ProcessTrackAdoptionTemplate,
} from "@/lib/businessProcessTemplates/processTrackTemplates";
import {
    ENROLLMENT_DEFAULT_TRACKS,
    ENROLLMENT_TRACK_CHILD_KEY,
    ENROLLMENT_TRACK_FAMILY_KEY,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
    LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";
import type { QueueMembershipSubjectType } from "@/lib/lifecycle/queueMembershipV1";

/* ------------------------------------------------------------------ fixtures */

type StageSpec = {
    key: string;
    label?: string;
    grain?: StageGrain;
    track_key?: string;
    subject_type?: QueueMembershipSubjectType;
    membership_stage_key?: string;
    is_active?: boolean;
};

function stage(spec: StageSpec, index: number): LifecycleBuilderStageRecord {
    const s: LifecycleBuilderStageRecord = {
        id: `stage-${spec.key}`,
        key: spec.key,
        label: spec.label ?? spec.key,
        sort_order: index,
        is_active: spec.is_active ?? true,
        ...(spec.grain ? { grain: spec.grain } : {}),
        ...(spec.track_key ? { track_key: spec.track_key } : {}),
    };
    if (spec.subject_type) {
        s.queue_membership_v1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: spec.membership_stage_key ?? spec.key,
            subject_type: spec.subject_type,
            count_unit: spec.subject_type === "case" ? "cases" : "enrollment_tracks",
            included_disposition_keys: [],
        };
    }
    return s;
}

function processOf(specs: StageSpec[], overrides: Partial<LifecycleBuilderProcessRecord> = {}) {
    const p: LifecycleBuilderProcessRecord = {
        id: "proc-1",
        key: "enrollment",
        name: "Enrollment",
        primary_entity: "opportunity",
        sort_order: 0,
        is_active: true,
        stages: specs.map(stage),
        ...overrides,
    };
    return p;
}

function configOf(process: LifecycleBuilderProcessRecord): LifecycleBuilderV1 {
    return { version: 1, active_process_id: process.id, processes: [process] };
}

/**
 * The tenant's shape: a builder-owned Enrollment process with correct grain on every stage and no
 * tracks at all. This is what Phase 1A left behind once stage membership had been repaired.
 */
const TENANT_STAGES: StageSpec[] = [
    { key: "lead", label: "New Lead", grain: "family", subject_type: "case" },
    { key: "tour", label: "Tour", grain: "family", subject_type: "case" },
    { key: "decision", label: "Placement / Decision", grain: "family", subject_type: "case" },
    { key: "closed", label: "Closed", grain: "family", subject_type: "case" },
    { key: "waitlist", label: "Waitlist", grain: "child", subject_type: "candidate" },
    { key: "enrolling", label: "Enrolling", grain: "child", subject_type: "child" },
    { key: "enrolled", label: "Enrolled", grain: "child", subject_type: "child" },
    { key: "closed_withdrawn", label: "Closed / Withdrawn", grain: "child", subject_type: "child" },
];

const ENROLLMENT_TEMPLATE = trackAdoptionTemplateForProcessKey("enrollment")!;

describe("track adoption — the capability", () => {
    it("publishes a canonical track model for enrollment and nothing it was not given", () => {
        expect(processKeysWithAdoptableTracks()).toEqual(["enrollment"]);
        expect(trackAdoptionTemplateForProcessKey("billing")).toBeNull();
        expect(trackAdoptionTemplateForProcessKey("")).toBeNull();
        expect(trackAdoptionTemplateForProcessKey(null)).toBeNull();
    });

    it("hands out a copy, so a caller cannot mutate the published model", () => {
        const a = trackAdoptionTemplateForProcessKey("enrollment")!;
        a.tracks.tracks[0]!.label = "Vandalised";
        expect(trackAdoptionTemplateForProcessKey("enrollment")!.tracks.tracks[0]!.label).toBe(
            "Family Track",
        );
    });

    it("1. a builder-owned process without tracks can preview adoption", () => {
        const process = processOf(TENANT_STAGES);
        expect(process.tracks_v1).toBeUndefined();

        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });

        expect(result.ok).toBe(true);
        expect(result.already_adopted).toBe(false);
        expect(result.preview.before).toEqual({
            tracks_configured: false,
            track_count: 0,
            routing: "legacy",
        });
        expect(result.preview.after.routing).toBe("builder");
        // The preview is the thing an operator reads before pressing apply — it must be populated.
        expect(result.preview.stage_routing_changes).toHaveLength(TENANT_STAGES.length);
    });

    it("2. adoption uses the canonical template tracks, not an invented model", () => {
        const process = processOf(TENANT_STAGES);
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });
        const next = adoptProcessTracks(configOf(process), process.id, ENROLLMENT_TEMPLATE, result.assignments);

        expect(next.processes[0]!.tracks_v1).toEqual(ENROLLMENT_DEFAULT_TRACKS);
    });

    it("2b. the preview names the tenant's expected family and child stages, from config", () => {
        const process = processOf(TENANT_STAGES);
        const { preview } = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });

        const family = preview.after.tracks.find((t) => t.key === ENROLLMENT_TRACK_FAMILY_KEY)!;
        const child = preview.after.tracks.find((t) => t.key === ENROLLMENT_TRACK_CHILD_KEY)!;

        expect(family.stage_keys).toEqual(["lead", "tour", "decision", "closed"]);
        expect(child.stage_keys).toEqual(["waitlist", "enrolling", "enrolled", "closed_withdrawn"]);
        // And the split point is reported against the tenant's own label for that stage.
        expect(preview.after.split_points).toEqual([
            expect.objectContaining({
                from_stage_key: "decision",
                from_stage_label: "Placement / Decision",
                into_track_key: ENROLLMENT_TRACK_CHILD_KEY,
            }),
        ]);
    });

    it("3. a stage with no configured grain refuses adoption", () => {
        const process = processOf(
            TENANT_STAGES.map((s) => (s.key === "tour" ? { ...s, grain: undefined } : s)),
        );
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });

        expect(result.ok).toBe(false);
        expect(result.blockers.map((b) => b.code)).toContain(ADOPT_STAGE_GRAIN_MISSING);
        // Operator-meaningful: it names the stage as the operator sees it.
        expect(result.blockers.find((b) => b.code === ADOPT_STAGE_GRAIN_MISSING)!.message).toContain("Tour");
    });

    it("3b. a grain the track model has no track for refuses adoption", () => {
        const process = processOf([...TENANT_STAGES, { key: "billing_hold", grain: "account" }]);
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });

        expect(result.ok).toBe(false);
        expect(result.blockers.map((b) => b.code)).toContain(ADOPT_STAGE_GRAIN_UNMAPPABLE);
    });

    it("4. a membership that contradicts the stage's grain refuses adoption", () => {
        /*
         * THE CENTRAL REFUSAL. Before adoption this membership is largely inert, because the legacy
         * path builds the lane. After adoption the membership IS the lane definition, so a
         * family-grain stage carrying a child subject would begin listing children the instant
         * tracks landed — with nothing in the operator's diff to say so.
         */
        const process = processOf(
            TENANT_STAGES.map((s) => (s.key === "decision" ? { ...s, subject_type: "child" as const } : s)),
        );
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });

        expect(result.ok).toBe(false);
        const blocker = result.blockers.find((b) => b.code === ADOPT_MEMBERSHIP_GRAIN_CONFLICT)!;
        expect(blocker.stage_key).toBe("decision");
        expect(blocker.message).toContain("Placement / Decision");
        expect(blocker.message).toContain('"case"');
    });

    it("4b. a membership that claims a different stage refuses adoption", () => {
        const process = processOf(
            TENANT_STAGES.map((s) =>
                s.key === "enrolling" ? { ...s, membership_stage_key: "waitlist" } : s,
            ),
        );
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });

        expect(result.ok).toBe(false);
        expect(result.blockers.map((b) => b.code)).toContain(ADOPT_MEMBERSHIP_STAGE_MISMATCH);
    });

    it("4c. both child subject vocabularies are accepted for a child-grain stage", () => {
        // `candidate` before an enrollment track exists, `child` once it does. Both are one row per
        // child; refusing either would make Waitlist unadoptable for a correctly configured tenant.
        for (const subject of ["child", "candidate"] as const) {
            const process = processOf(
                TENANT_STAGES.map((s) => (s.key === "waitlist" ? { ...s, subject_type: subject } : s)),
            );
            expect(evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE }).ok).toBe(true);
        }
    });

    it("5. a valid mixed-grain process adopts successfully and assigns every stage a track", () => {
        const process = processOf(TENANT_STAGES);
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });
        expect(result.ok).toBe(true);

        const next = adoptProcessTracks(configOf(process), process.id, ENROLLMENT_TEMPLATE, result.assignments);
        const adopted = next.processes[0]!;

        expect(adopted.stages.map((s) => [s.key, s.track_key])).toEqual([
            ["lead", ENROLLMENT_TRACK_FAMILY_KEY],
            ["tour", ENROLLMENT_TRACK_FAMILY_KEY],
            ["decision", ENROLLMENT_TRACK_FAMILY_KEY],
            ["closed", ENROLLMENT_TRACK_FAMILY_KEY],
            ["waitlist", ENROLLMENT_TRACK_CHILD_KEY],
            ["enrolling", ENROLLMENT_TRACK_CHILD_KEY],
            ["enrolled", ENROLLMENT_TRACK_CHILD_KEY],
            ["closed_withdrawn", ENROLLMENT_TRACK_CHILD_KEY],
        ]);
    });

    it("5b. adoption changes nothing else about a stage", () => {
        const process = processOf(TENANT_STAGES);
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });
        const next = adoptProcessTracks(configOf(process), process.id, ENROLLMENT_TEMPLATE, result.assignments);

        for (const before of process.stages) {
            const after = next.processes[0]!.stages.find((s) => s.id === before.id)!;
            const { track_key: _t, ...afterRest } = after;
            const { track_key: _b, ...beforeRest } = before;
            expect(afterRest).toEqual(beforeRest);
        }
        // And the stage INVENTORY is untouched, which is the whole difference from applying a template.
        expect(next.processes[0]!.stages).toHaveLength(process.stages.length);
    });

    it("6. a roundtrip through JSON preserves the adopted tracks exactly", () => {
        const process = processOf(TENANT_STAGES);
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });
        const next = adoptProcessTracks(configOf(process), process.id, ENROLLMENT_TEMPLATE, result.assignments);

        const reloaded = JSON.parse(JSON.stringify(next)) as LifecycleBuilderV1;
        expect(reloaded.processes[0]!.tracks_v1).toEqual(ENROLLMENT_DEFAULT_TRACKS);
        expect(reloaded.processes[0]!.stages.map((s) => s.track_key)).toEqual(
            next.processes[0]!.stages.map((s) => s.track_key),
        );
    });

    it("11. adoption is idempotent — a repeated apply returns the very same config", () => {
        const process = processOf(TENANT_STAGES);
        const first = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });
        const once = adoptProcessTracks(configOf(process), process.id, ENROLLMENT_TEMPLATE, first.assignments);

        const second = evaluateProcessTrackAdoption({
            process: once.processes[0]!,
            template: ENROLLMENT_TEMPLATE,
        });
        expect(second.already_adopted).toBe(true);
        expect(second.ok).toBe(true);

        const twice = adoptProcessTracks(once, process.id, ENROLLMENT_TEMPLATE, second.assignments);
        // Reference equality: no new object, so no diff, no new revision content, no duplicate tracks.
        expect(twice).toBe(once);
        expect(twice.processes[0]!.tracks_v1!.tracks).toHaveLength(2);
    });

    it("12. a running instance on a stage no track would claim refuses adoption", () => {
        const process = processOf(TENANT_STAGES);
        const result = evaluateProcessTrackAdoption({
            process,
            template: ENROLLMENT_TEMPLATE,
            observedInstanceStageKeys: ["lead", "enrolling", "qualification"],
        });

        expect(result.ok).toBe(false);
        const blocker = result.blockers.find((b) => b.code === ADOPT_INSTANCE_STAGE_UNCONFIGURED)!;
        expect(blocker.stage_key).toBe("qualification");
    });

    it("12b. instances standing only on configured stages do not block", () => {
        const process = processOf(TENANT_STAGES);
        const result = evaluateProcessTrackAdoption({
            process,
            template: ENROLLMENT_TEMPLATE,
            observedInstanceStageKeys: ["lead", "waitlist", "enrolling", "enrolled"],
        });
        expect(result.ok).toBe(true);
    });

    it("refuses when the canonical split point is not a stage this process has", () => {
        const process = processOf(TENANT_STAGES.filter((s) => s.key !== "decision"));
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });

        expect(result.ok).toBe(false);
        expect(result.blockers.map((b) => b.code)).toContain(ADOPT_SPLIT_STAGE_UNKNOWN);
    });

    it("is generic — a different descriptor produces different tracks through the same code", () => {
        /*
         * The anti-hardcoding proof. Nothing in the evaluator may recognise "enrollment",
         * "family_track" or "waitlist": swap the descriptor and the same input process must land on
         * the descriptor's vocabulary instead.
         */
        const billing: ProcessTrackAdoptionTemplate = {
            process_key: "billing",
            tracks: {
                version: 1,
                tracks: [
                    { key: "payer_track", label: "Payer", subject: "payer", sort_order: 0 },
                    { key: "obligation_track", label: "Obligation", subject: "obligation", sort_order: 1 },
                ],
                split_rules: [],
            },
            track_key_by_stage_key: {},
            track_key_by_grain: { family: "payer_track", child: "obligation_track" },
        };

        const process = processOf(TENANT_STAGES, { key: "billing" });
        const result = evaluateProcessTrackAdoption({ process, template: billing });

        expect(result.ok).toBe(true);
        expect(new Set(result.assignments.map((a) => a.track_key))).toEqual(
            new Set(["payer_track", "obligation_track"]),
        );
        // Assigned purely from grain, since this descriptor names no stage keys at all.
        expect(result.assignments.every((a) => a.source === "stage_grain")).toBe(true);
    });

    it("an inactive stage keeps out of routing without blocking adoption", () => {
        const process = processOf([
            ...TENANT_STAGES,
            { key: "retired_stage", grain: undefined, is_active: false },
        ]);
        const result = evaluateProcessTrackAdoption({ process, template: ENROLLMENT_TEMPLATE });

        // No grain, but inactive: it produces no rows, so it cannot route anything wrongly.
        expect(result.ok).toBe(true);
        expect(result.assignments.map((a) => a.stage_key)).not.toContain("retired_stage");
    });
});
