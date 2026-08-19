/**
 * Participant Runtime V1 — the conversational Enrollment loop (Phase 3).
 *
 * The primary acceptance proof is one complete conversation, run against an in-memory model of the
 * real tables, with production code making every decision: turn selection, interpretation,
 * validation, the D-99 and shared-value commands, and recomputation.
 *
 * The invariant under test throughout: **the deterministic runtime decides WHAT is needed; a
 * provider may only help with HOW.** Every proof below is stated so that it would fail if a model's
 * output were ever allowed to become truth without validation.
 */

import { describe, expect, it, beforeEach } from "vitest";

import { resolveParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { applyParticipantTurnResponse } from "@/lib/enrollment/participantRuntime/applyParticipantTurnResponse";
import { interpretParticipantResponseDeterministically } from "@/lib/enrollment/participantRuntime/deterministicCandidateInterpreter";
import { disposeParticipantCandidate } from "@/lib/enrollment/participantRuntime/validateParticipantCandidate";
import { parseStructuredCandidate } from "@/lib/enrollment/participantRuntime/participantTurnTypes";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";
import { ENROLLMENT_CONFIRMATIONS_METADATA_KEY } from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import { validateFormSchema } from "@/lib/forms/schema";
import { __clearConfigReadCacheForTests } from "@/lib/runtime/provisioning/configReadCache";

const ORG = "11111111-1111-4111-8111-111111111111";
const PI = "aaaa1111-0000-4000-8000-000000000001";
const CHILD = "cccc0000-0000-4000-8000-00000000000a";
const REV = "bbbb1111-0000-4000-8000-00000000000a";
const FORM = "ffff0000-0000-4000-8000-00000000000a";
const VERSION = "vvvv0000-0000-4000-8000-00000000000a";
const DOB_KEY = "customer_member:dob";
const ALLERGY_KEY = "customer_member:allergies";
const NOW = "2026-08-16T10:00:00.000Z";

function field(id: string, entity: string, key: string, type = "text", label = "Detail") {
    return { id, label, required: true, type, field_source: { entity_type: entity, field_key: key } };
}

/** Five DOB targets plus one missing allergy fact, across one required Form. */
const SCHEMA = validateFormSchema({
    schema_version: 1,
    title: "Enrollment Form",
    sections: [
        {
            id: "s1",
            field_ids: ["dob_1", "dob_2", "dob_3", "dob_4", "dob_5", "allergies"],
        },
    ],
    fields: [
        field("dob_1", "customer_member", "dob", "date", "Date of Birth"),
        field("dob_2", "customer_member", "dob", "date", "Date of Birth"),
        field("dob_3", "customer_member", "dob", "date", "Date of Birth"),
        field("dob_4", "customer_member", "dob", "date", "Date of Birth"),
        field("dob_5", "customer_member", "dob", "date", "Date of Birth"),
        field("allergies", "customer_member", "allergies", "text", "Allergies"),
    ],
});

type World = {
    sharedValues: Record<string, unknown>;
    metadata: Record<string, unknown>;
    submissionStatus: string | null;
};

function freshWorld(): World {
    return { sharedValues: {}, metadata: {}, submissionStatus: null };
}

function revisionPayload() {
    return {
        version: 1,
        active_process_id: "p1",
        processes: [
            {
                id: "p1",
                key: "enrollment",
                name: "Enrollment",
                is_active: true,
                stages: [
                    {
                        id: "s1",
                        key: "enrollment",
                        label: "Enrollment",
                        sort_order: 1,
                        is_active: true,
                        requirements_v1: {
                            version: 1,
                            requirements: [
                                {
                                    requirement_id: "req-a",
                                    kind: "form",
                                    form_definition_id: FORM,
                                    level: "required",
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };
}

/** An in-memory model of the six tables this runtime touches. Writes land in `world`. */
function fakeSupabase(world: World) {
    return {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            let inIds: string[] = [];

            const rows = (): unknown[] => {
                switch (table) {
                    case "process_instances":
                        return [
                            {
                                id: PI,
                                org_id: ORG,
                                process_key: "enrollment",
                                context_type: null,
                                context_id: null,
                                stage_key: "enrollment",
                                subject_id: CHILD,
                                business_process_revision_id: REV,
                            },
                        ];
                    case "business_process_revisions":
                        return String(filters.id ?? "") === REV ? [{ payload: revisionPayload() }] : [];
                    case "form_packet_sessions":
                        return [
                            {
                                id: "session-1",
                                status: "in_progress",
                                shared_values: world.sharedValues,
                                metadata: world.metadata,
                            },
                        ];
                    case "form_packet_session_items":
                        return [
                            {
                                id: "si-a",
                                packet_item_id: "pi-a",
                                sequence_index: 0,
                                resolved_form_definition_version_id: VERSION,
                                form_submission_id: world.submissionStatus ? "sub-a" : null,
                            },
                        ];
                    case "form_packet_items":
                        return inIds.includes("pi-a") ? [{ id: "pi-a", form_definition_id: FORM }] : [];
                    case "form_definition_versions":
                        return inIds.includes(VERSION)
                            ? [{ id: VERSION, form_definition_id: FORM, schema_json: SCHEMA }]
                            : [];
                    case "form_submissions":
                        return world.submissionStatus
                            ? [{ id: "sub-a", status: world.submissionStatus }]
                            : [];
                    default:
                        return [];
                }
            };

            const chain: Record<string, unknown> = {
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (resolve: (v: unknown) => unknown) =>
                    Promise.resolve(resolve({ data: rows(), error: null })),
                update: (patch: Record<string, unknown>) => {
                    if (table === "form_packet_sessions") {
                        if (patch.shared_values) world.sharedValues = patch.shared_values as Record<string, unknown>;
                        if (patch.metadata) world.metadata = patch.metadata as Record<string, unknown>;
                    }
                    return { eq: () => ({ eq: async () => ({ error: null }) }) };
                },
            };
            chain.eq = (col: string, val: unknown) => {
                filters[col] = val;
                return chain;
            };
            chain.in = (_c: string, vals: string[]) => {
                inIds = vals;
                return chain;
            };
            for (const key of ["select", "is", "order", "limit"]) chain[key] = () => chain;
            return chain;
        },
    } as never;
}

async function objective(world: World) {
    const result = await resolveParticipantEnrollmentObjective(fakeSupabase(world), {
        orgId: ORG,
        processInstanceId: PI,
    });
    if (!result.ok) throw new Error(`refused: ${result.refusal.code}`);
    return result.value;
}

beforeEach(() => __clearConfigReadCacheForTests());

// ---------------------------------------------------------------------------
// THE PRIMARY ACCEPTANCE PROOF — one complete conversation
// ---------------------------------------------------------------------------

describe("V1 vertical — a complete conversational Enrollment path", () => {
    it("runs the full 17-step loop", async () => {
        const world = freshWorld();
        // A canonical DOB is already known to the platform (D-100 requires it be confirmed once).
        world.sharedValues[DOB_KEY] = "2021-05-04";

        // 1. The runtime selects confirm_known_value for DOB — deterministically, with no provider.
        const start = await objective(world);
        expect(start.next_turn.kind).toBe("confirm_known_value");
        expect(start.next_turn.proposed_value).toBe("2021-05-04");
        expect(start.next_turn.resolves_occurrences).toBe(5);
        expect(start.next_turn.prompt).toContain("Is that correct?");

        // 2-3. The parent answers naturally; interpretation returns a STRUCTURED CANDIDATE only.
        const candidate = interpretParticipantResponseDeterministically({
            turn: start.next_turn,
            text: "Yep, that's right.",
        });
        expect(candidate.kind).toBe("confirmed");

        // 4-6. Validation, the D-99 command, and recomputation — all platform-side.
        const confirmed = await applyParticipantTurnResponse(fakeSupabase(world), {
            orgId: ORG,
            processInstanceId: PI,
            candidate,
            nowIso: NOW,
        });
        if (!confirmed.ok) throw new Error("confirm failed");
        expect(confirmed.disposition.action).toBe("confirm_value");
        expect(Object.keys(world.metadata)).toContain(ENROLLMENT_CONFIRMATIONS_METADATA_KEY);

        // 7. DOB no longer needs participant action — for ANY of its five occurrences.
        const afterConfirm = confirmed.objective;
        const dobNeed = afterConfirm.needs.needs.find((n) => n.identity.canonical_key === DOB_KEY)!;
        expect(dobNeed.state).toBe("confirmed");
        expect(dobNeed.requires_participant_action).toBe(false);
        expect(dobNeed.occurrence_count).toBe(5);

        // 8. The runtime selects the next need on its own.
        expect(afterConfirm.next_turn.kind).toBe("collect_missing_value");
        expect(afterConfirm.next_turn.need?.identity.canonical_key).toBe(ALLERGY_KEY);

        // 9-12. The parent supplies the missing fact; it persists through the EXISTING shared path.
        const supplied = await applyParticipantTurnResponse(fakeSupabase(world), {
            orgId: ORG,
            processInstanceId: PI,
            candidate: { kind: "corrected_value", value: "Peanuts" },
            nowIso: NOW,
        });
        if (!supplied.ok) throw new Error("supply failed");
        expect(supplied.disposition.action).toBe("write_shared_value");
        expect(world.sharedValues[ALLERGY_KEY]).toBe("Peanuts");

        // 13-14. Recomputation advances: nothing is left for the participant to tell us.
        expect(supplied.objective.needs.needs_requiring_action).toBe(0);
        // The remaining work is the artifact itself, handed to the Form that owns it.
        expect(supplied.objective.next_turn.kind).toBe("complete_artifact");

        // 15-17. Leave, reopen the link, resume — and DOB is NOT asked again.
        const resumed = await objective(world);
        expect(resumed.next_turn.kind).toBe("complete_artifact");
        const resumedDob = resumed.needs.needs.find((n) => n.identity.canonical_key === DOB_KEY)!;
        expect(resumedDob.state).toBe("confirmed");
        expect(resumedDob.requires_participant_action).toBe(false);
    });

    it("a rejected known value re-opens the turn and never silently confirms", async () => {
        const world = freshWorld();
        world.sharedValues[DOB_KEY] = "2021-05-04";
        const start = await objective(world);

        // "No" says the value is wrong but not what it should be. Guessing would be the approximate
        // matching this program has refused at every layer.
        const candidate = interpretParticipantResponseDeterministically({
            turn: start.next_turn,
            text: "no",
        });
        expect(candidate.kind).toBe("clarification_needed");

        const applied = await applyParticipantTurnResponse(fakeSupabase(world), {
            orgId: ORG,
            processInstanceId: PI,
            candidate,
            nowIso: NOW,
        });
        if (!applied.ok) throw new Error("apply failed");
        expect(applied.disposition.action).toBe("no_change");
        expect(world.metadata[ENROLLMENT_CONFIRMATIONS_METADATA_KEY]).toBeUndefined();
        expect(applied.objective.next_turn.kind).toBe("confirm_known_value");
    });

    it("a value that changes AFTER confirmation re-opens the need", async () => {
        const world = freshWorld();
        world.sharedValues[DOB_KEY] = "2021-05-04";

        const confirmed = await applyParticipantTurnResponse(fakeSupabase(world), {
            orgId: ORG,
            processInstanceId: PI,
            candidate: { kind: "confirmed" },
            nowIso: NOW,
        });
        if (!confirmed.ok) throw new Error("confirm failed");
        expect(
            confirmed.objective.needs.needs.find((n) => n.identity.canonical_key === DOB_KEY)!.state,
        ).toBe("confirmed");

        // The DOB then changes by ANY other path — a Form submission, an operator correction. The
        // D-99 confirmation was about the old value, so it must stop satisfying the need with no
        // flag to clear anywhere.
        world.sharedValues[DOB_KEY] = "2021-05-06";

        const reopened = await objective(world);
        const dob = reopened.needs.needs.find((n) => n.identity.canonical_key === DOB_KEY)!;
        expect(dob.state).toBe("known_requires_confirmation");
        expect(dob.requires_participant_action).toBe(true);
        // Still ONE need covering all five targets — invalidation does not fragment it.
        expect(dob.occurrence_count).toBe(5);
        expect(reopened.next_turn.kind).toBe("confirm_known_value");
        expect(reopened.next_turn.proposed_value).toBe("2021-05-06");
    });

    it("a correction on the CURRENT turn writes once and reaches all five targets", async () => {
        const world = freshWorld();
        // DOB is the current turn while it is still missing.
        const start = await objective(world);
        expect(start.next_turn.need?.identity.canonical_key).toBe(DOB_KEY);
        expect(start.next_turn.resolves_occurrences).toBe(5);

        const corrected = await applyParticipantTurnResponse(fakeSupabase(world), {
            orgId: ORG,
            processInstanceId: PI,
            candidate: { kind: "corrected_value", value: "2021-05-06" },
            nowIso: NOW,
        });
        if (!corrected.ok) throw new Error("correction failed");

        // ONE shared value; five targets; no per-occurrence fan-out to keep in step.
        expect(world.sharedValues[DOB_KEY]).toBe("2021-05-06");
        const dob = corrected.objective.needs.needs.find((n) => n.identity.canonical_key === DOB_KEY)!;
        expect(dob.occurrence_count).toBe(5);
        expect(dob.current_value).toBe("2021-05-06");
    });
});

// ---------------------------------------------------------------------------
// The AI boundary
// ---------------------------------------------------------------------------

describe("the provider may never decide platform facts", () => {
    it("a candidate cannot name a field, a command or a semantic key", () => {
        // Everything a hostile or confused model might try to address is simply not parsed.
        const parsed = parseStructuredCandidate({
            kind: "corrected_value",
            value: "2021-05-06",
            field_key: "customer_member:ssn",
            command: "complete_enrollment",
            requirement_id: "req-anything",
        });
        expect(parsed).toEqual({ kind: "corrected_value", value: "2021-05-06" });
        expect(Object.keys(parsed)).toEqual(["kind", "value"]);
    });

    it("an unreadable candidate fails CLOSED to unresolved, never to confirmed", () => {
        expect(parseStructuredCandidate(null).kind).toBe("unresolved");
        expect(parseStructuredCandidate({ kind: "definitely_yes" }).kind).toBe("unresolved");
        expect(parseStructuredCandidate("confirmed").kind).toBe("unresolved");
    });

    it("an invalid corrected value is REFUSED and mutates nothing", async () => {
        const world = freshWorld();
        world.sharedValues[DOB_KEY] = "2021-05-04";

        const applied = await applyParticipantTurnResponse(fakeSupabase(world), {
            orgId: ORG,
            processInstanceId: PI,
            candidate: { kind: "corrected_value", value: "sometime in May" },
            nowIso: NOW,
            field: { id: "dob_1", label: "DOB", required: true, type: "date" },
        });
        if (!applied.ok) throw new Error("apply failed");

        expect(applied.disposition.action).toBe("refused");
        expect(world.sharedValues[DOB_KEY]).toBe("2021-05-04");
        // The participant is returned to the same question rather than advanced past it.
        expect(applied.objective.next_turn.kind).toBe("confirm_known_value");
    });

    it("a date that looks valid but is not a real calendar day is refused", () => {
        const turn = {
            kind: "collect_missing_value" as const,
            need: { identity: { field_key: "dob" } } as never,
            prompt: "",
            proposed_value: null,
            resolves_occurrences: 1,
        };
        const disposition = disposeParticipantCandidate({
            turn,
            candidate: { kind: "corrected_value", value: "2021-02-31" },
            field: { id: "d", label: "DOB", required: true, type: "date" },
        });
        expect(disposition.action).toBe("refused");
    });

    it("a select is validated against the CLOSED authored vocabulary", () => {
        const turn = {
            kind: "collect_missing_value" as const,
            need: { identity: { field_key: "program" } } as never,
            prompt: "",
            proposed_value: null,
            resolves_occurrences: 1,
        };
        const field = {
            id: "p",
            label: "Program",
            required: true,
            type: "select" as const,
            static_options: [{ value: "toddler", label: "Toddler" }],
        };
        expect(
            disposeParticipantCandidate({ turn, candidate: { kind: "corrected_value", value: "invented" }, field })
                .action,
        ).toBe("refused");
        expect(
            disposeParticipantCandidate({ turn, candidate: { kind: "corrected_value", value: "toddler" }, field })
                .action,
        ).toBe("write_shared_value");
    });

    it("`confirmed` is refused on a collect turn — there is nothing to agree with", () => {
        const disposition = disposeParticipantCandidate({
            turn: {
                kind: "collect_missing_value",
                need: { identity: { field_key: "dob" } } as never,
                prompt: "",
                proposed_value: null,
                resolves_occurrences: 1,
            },
            candidate: { kind: "confirmed" },
            field: null,
        });
        expect(disposition.action).toBe("refused");
    });
});

// ---------------------------------------------------------------------------
// Provider unavailable
// ---------------------------------------------------------------------------

describe("the runtime works with no provider at all", () => {
    it("selects turns and renders deterministic wording without any model", async () => {
        const world = freshWorld();
        world.sharedValues[DOB_KEY] = "2021-05-04";
        const view = await objective(world);

        expect(view.next_turn.prompt).toBe("We have Date of Birth as 2021-05-04. Is that correct?");
        expect(view.next_turn.kind).toBe("confirm_known_value");
    });

    it("a value typed into the deterministic control needs no interpretation", async () => {
        const world = freshWorld();
        const start = await objective(world);
        const candidate = interpretParticipantResponseDeterministically({
            turn: start.next_turn,
            directValue: "2021-05-04",
        });
        expect(candidate).toEqual({ kind: "corrected_value", value: "2021-05-04" });
    });

    it("natural language it cannot parse asks for clarification rather than guessing", () => {
        const turn = {
            kind: "confirm_known_value" as const,
            need: null,
            prompt: "",
            proposed_value: "2021-05-04",
            resolves_occurrences: 5,
        };
        expect(
            interpretParticipantResponseDeterministically({ turn, text: "actually she was born 5/6/21" }).kind,
        ).toBe("clarification_needed");
        expect(interpretParticipantResponseDeterministically({ turn, text: "I don't know" }).kind).toBe(
            "unresolved",
        );
    });
});

// ---------------------------------------------------------------------------
// The participant wire model
// ---------------------------------------------------------------------------

describe("participant surface", () => {
    it("exposes 'things remaining' backed by deterministic need state", async () => {
        const world = freshWorld();
        world.sharedValues[DOB_KEY] = "2021-05-04";
        const wire = participantObjectiveWireModel(await objective(world));

        // DOB awaiting confirmation + allergies missing.
        expect(wire.things_remaining).toBe(2);
        expect(wire.next_turn.resolves_occurrences).toBe(5);
        expect(wire.complete).toBe(false);
    });

    it("leaks no org, revision, requirement or session identifiers", async () => {
        const world = freshWorld();
        world.sharedValues[DOB_KEY] = "2021-05-04";
        const serialized = JSON.stringify(participantObjectiveWireModel(await objective(world)));

        for (const secret of [ORG, REV, PI, "session-1", "si-a", "req-a"]) {
            expect(serialized).not.toContain(secret);
        }
    });
});

// ---------------------------------------------------------------------------
// Stability
// ---------------------------------------------------------------------------

describe("deterministic selection is stable", () => {
    it("the same state always selects the same next turn", async () => {
        const world = freshWorld();
        world.sharedValues[DOB_KEY] = "2021-05-04";
        const a = await objective(world);
        const b = await objective(world);
        expect(b.next_turn.kind).toBe(a.next_turn.kind);
        expect(b.next_turn.need?.identity.key).toBe(a.next_turn.need?.identity.key);
    });

    it("the pinned BP revision and D-94 Form version stay put across the conversation", async () => {
        const world = freshWorld();
        world.sharedValues[DOB_KEY] = "2021-05-04";
        const before = await objective(world);

        await applyParticipantTurnResponse(fakeSupabase(world), {
            orgId: ORG,
            processInstanceId: PI,
            candidate: { kind: "confirmed" },
            nowIso: NOW,
        });
        const after = await objective(world);

        expect(after.business_process_revision_id).toBe(before.business_process_revision_id);
        expect(after.needs.needs[0]!.occurrences[0]!.form_definition_version_id).toBe(VERSION);
    });
});

describe("a correction is itself a confirmation — the John Peters loop", () => {
    beforeEach(() => __clearConfigReadCacheForTests());

    it("correcting a confirm turn settles the need once, with evidence, and is never re-asked", async () => {
        const world = freshWorld();
        // A known DOB awaiting its one D-100 confirmation — the exact state the parent corrects.
        world.sharedValues[DOB_KEY] = "2021-05-04";
        const before = await objective(world);
        expect(before.next_turn.kind).toBe("confirm_known_value");
        expect(before.next_turn.need?.identity.canonical_key).toBe(DOB_KEY);

        // The parent says "no, it's actually this" — ONE correction, through the turn command.
        const corrected = await applyParticipantTurnResponse(fakeSupabase(world), {
            orgId: ORG,
            processInstanceId: PI,
            candidate: { kind: "corrected_value", value: "2021-05-06" },
            nowIso: NOW,
        });
        if (!corrected.ok) throw new Error("correction failed");
        expect(corrected.disposition.action).toBe("write_shared_value");
        expect(world.sharedValues[DOB_KEY]).toBe("2021-05-06");

        // The write carried its own D-99 evidence: supplying a value IS confirming it. Without
        // this, the recompute re-opened the need and the runtime asked the parent to confirm the
        // value they had typed seconds earlier — observed live as the John Peters loop.
        expect(Object.keys(world.metadata)).toContain(ENROLLMENT_CONFIRMATIONS_METADATA_KEY);
        const dob = corrected.objective.needs.needs.find((n) => n.identity.canonical_key === DOB_KEY)!;
        expect(dob.state).toBe("confirmed");
        expect(dob.requires_participant_action).toBe(false);
        expect(corrected.objective.next_turn.need?.identity.canonical_key).not.toBe(DOB_KEY);

        // And a LATER change still re-opens it — the fingerprint binds to the corrected value,
        // never to "this need was once answered".
        world.sharedValues[DOB_KEY] = "2020-01-01";
        const drifted = await objective(world);
        const reopened = drifted.needs.needs.find((n) => n.identity.canonical_key === DOB_KEY)!;
        expect(reopened.state).toBe("known_requires_confirmation");
    });
});
