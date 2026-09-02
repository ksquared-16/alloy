/**
 * "Yes, that's right" settles N confirmations — INDEPENDENTLY.
 *
 * The whole risk of grouping the interaction is that it quietly becomes a grouping of the facts:
 * one confirmation record standing for four values, so that correcting one silently re-opens the
 * others, or leaves three values evidenced by a confirmation nobody gave for them.
 *
 * These assert the separation from both ends — one gesture writes four distinct fingerprints, and
 * one member that cannot settle leaves its siblings settled and itself outstanding.
 */

import { describe, expect, it } from "vitest";

import {
    applyConfirmationGroup,
    applyConfirmationGroupMemberEdit,
} from "@/lib/enrollment/participantRuntime/applyConfirmationGroup";
import {
    ENROLLMENT_CONFIRMATIONS_METADATA_KEY,
    enrollmentValueFingerprint,
    readEnrollmentNeedConfirmations,
} from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import { enrollmentConfirmationPolicy } from "@/lib/enrollment/participantRuntime/enrollmentConfirmationPolicy";
import {
    recomputeParticipantObjectiveFromContext,
    type ParticipantObjectiveContext,
} from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";
import { participantObjectiveWireModel } from "@/lib/enrollment/participantRuntime/participantObjectiveWireModel";

const ORG = "00000000-0000-4000-8000-000000000001";
const CHILD = "11111111-1111-4111-8111-111111111111";
const SESSION = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-08-27T10:00:00.000Z";

/** The bound fields a real packet carries, at the two binding shapes tenants actually use. */
const SCHEMA = {
    fields: [
        { id: "f_first", type: "text", label: "First Name", required: true, field_source: { entity_type: "child", field_key: "child_first_name", shared_value_key: "child_first_name" } },
        { id: "f_last", type: "text", label: "Childs Last Name", required: true, field_source: { entity_type: "child", field_key: "child_last_name", shared_value_key: "child_last_name" } },
        { id: "f_dob", type: "date", label: "Birth Date", required: true, field_source: { entity_type: "customer_member", field_key: "dob" } },
        { id: "f_gname", type: "text", label: "Parent/Guardian #1 Name", required: true, field_source: { entity_type: "guardian", field_key: "name", shared_value_key: "guardian_name" } },
        { id: "f_gphone", type: "text", label: "Parent/Guardian #1 Phone Number", required: true, field_source: { entity_type: "guardian", field_key: "guardian_phone", shared_value_key: "guardian_phone" } },
    ],
    sections: [{ id: "s", title: "Contact Information", field_ids: ["f_first", "f_last", "f_dob", "f_gname", "f_gphone"] }],
};

const CANONICAL = {
    child_first_name: "Solene",
    child_last_name: "Marchetti",
    "customer_member:dob": "2021-04-02",
    guardian_name: "Marisol Marchetti",
    guardian_phone: "5035550142",
};

function contextWith(session: { shared_values: Record<string, unknown>; metadata: Record<string, unknown> }): ParticipantObjectiveContext {
    return {
        progress: {
            process_instance_id: "pi",
            session_id: SESSION,
            business_process_revision_id: "rev",
            stage_key: "enrollment",
            requirements: [],
            total_requirements: 0,
            satisfied_requirements: 0,
            remaining_requirements: 0,
        } as never,
        needsContext: {
            prog: { process_instance_id: "pi", session_id: SESSION, business_process_revision_id: "rev", stage_key: "enrollment" } as never,
            session: { id: SESSION, ...session } as never,
            subjectId: CHILD,
            forms: [
                {
                    requirement_id: "r1",
                    form_definition_id: "fd1",
                    form_definition_version_id: "v1",
                    session_item_id: "si1",
                    schema: SCHEMA,
                } as never,
            ],
        },
        requiresConfirmation: enrollmentConfirmationPolicy(),
        canonicalValues: CANONICAL,
    };
}

/** A Supabase double that records the single patch and reports success. */
function fakeSupabase() {
    const writes: Record<string, unknown>[] = [];
    const client = {
        from() {
            return {
                update(patch: Record<string, unknown>) {
                    writes.push(patch);
                    const chain = { eq: () => chain, then: undefined as never, error: null };
                    return { eq: () => ({ eq: async () => ({ error: null }) }) };
                },
            };
        },
    };
    return { client: client as never, writes };
}

const EMPTY = { shared_values: {}, metadata: {} };

describe("a grouped confirmation", () => {
    it("settles every member of the ACTIVE subject, and nobody else's", async () => {
        const context = contextWith(EMPTY);
        const objective = recomputeParticipantObjectiveFromContext(context, context.needsContext.session);
        // The runtime selects the first confirmation; the group is the subject it belongs to.
        const { client, writes } = fakeSupabase();

        const result = await applyConfirmationGroup(client, {
            orgId: ORG,
            sessionId: SESSION,
            nowIso: NOW,
            current: { objective, context },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Three child facts settle. The guardian's two are a different subject and stay outstanding.
        expect(result.confirmed).toHaveLength(3);
        expect(result.skipped).toEqual([]);
        const still = result.objective.needs.needs.filter((n) => n.state === "known_requires_confirmation");
        expect(still.map((n) => n.identity.canonical_key).sort()).toEqual(["guardian_name", "guardian_phone"]);
    });

    it("writes ONE fingerprint per fact, each over that fact's OWN value", async () => {
        /*
         * The property that keeps the grouping an interaction rather than a merge. Four values, four
         * fingerprints, four need keys — a later reader cannot tell they arrived in one gesture, and
         * changing one invalidates only its own evidence.
         */
        const context = contextWith(EMPTY);
        const objective = recomputeParticipantObjectiveFromContext(context, context.needsContext.session);
        const { client, writes } = fakeSupabase();
        await applyConfirmationGroup(client, { orgId: ORG, sessionId: SESSION, nowIso: NOW, current: { objective, context } });

        const confirmations = readEnrollmentNeedConfirmations(writes[0]!.metadata);
        const keys = Object.keys(confirmations);
        expect(keys).toHaveLength(3);
        // Each entry's fingerprint is the one for ITS value — never a digest of the card.
        expect(confirmations[`child:${CHILD}:child_first_name`]!.value_fingerprint).toBe(
            enrollmentValueFingerprint("Solene"),
        );
        expect(confirmations[`child:${CHILD}:child_last_name`]!.value_fingerprint).toBe(
            enrollmentValueFingerprint("Marchetti"),
        );
        expect(confirmations[`child:${CHILD}:customer_member:dob`]!.value_fingerprint).toBe(
            enrollmentValueFingerprint("2021-04-02"),
        );
        // Three distinct fingerprints, not one repeated.
        expect(new Set(Object.values(confirmations).map((c) => c.value_fingerprint)).size).toBe(3);
    });

    it("carries each value into the session under its OWN canonical key", async () => {
        const context = contextWith(EMPTY);
        const objective = recomputeParticipantObjectiveFromContext(context, context.needsContext.session);
        const { client, writes } = fakeSupabase();
        await applyConfirmationGroup(client, { orgId: ORG, sessionId: SESSION, nowIso: NOW, current: { objective, context } });

        expect(writes[0]!.shared_values).toEqual({
            child_first_name: "Solene",
            child_last_name: "Marchetti",
            "customer_member:dob": "2021-04-02",
        });
    });

    it("leaves siblings settled when ONE member cannot settle", async () => {
        /*
         * Independence, proved from the failing side. A value that cannot be fingerprinted — an
         * empty string is the honest example — settles nothing, and must not take the card with it.
         */
        const context = contextWith(EMPTY);
        (context as { canonicalValues: Record<string, unknown> }).canonicalValues = {
            ...CANONICAL,
            child_last_name: "   ",
        };
        const objective = recomputeParticipantObjectiveFromContext(context, context.needsContext.session);
        const { client, writes } = fakeSupabase();
        const result = await applyConfirmationGroup(client, { orgId: ORG, sessionId: SESSION, nowIso: NOW, current: { objective, context } });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // A whitespace value is not "known" at all, so it is simply not a member — the other two
        // settle and the conversation still asks for the last name.
        expect(result.confirmed.length).toBeGreaterThanOrEqual(2);
        expect(Object.keys(readEnrollmentNeedConfirmations(writes[0]!.metadata))).not.toContain(
            `child:${CHILD}:child_last_name`,
        );
    });

    it("refuses when the platform is not currently offering a card", async () => {
        // A stale tab cannot settle a group the runtime has moved past.
        const context = contextWith({
            shared_values: { child_first_name: "Solene", child_last_name: "Marchetti", "customer_member:dob": "2021-04-02" },
            metadata: {
                [ENROLLMENT_CONFIRMATIONS_METADATA_KEY]: {
                    [`child:${CHILD}:child_first_name`]: { value_fingerprint: enrollmentValueFingerprint("Solene"), confirmed_at: NOW },
                    [`child:${CHILD}:child_last_name`]: { value_fingerprint: enrollmentValueFingerprint("Marchetti"), confirmed_at: NOW },
                    [`child:${CHILD}:customer_member:dob`]: { value_fingerprint: enrollmentValueFingerprint("2021-04-02"), confirmed_at: NOW },
                    [`household:-:guardian_phone`]: { value_fingerprint: enrollmentValueFingerprint("5035550142"), confirmed_at: NOW },
                },
            },
        });
        const objective = recomputeParticipantObjectiveFromContext(context, context.needsContext.session);
        const { client } = fakeSupabase();
        const result = await applyConfirmationGroup(client, { orgId: ORG, sessionId: SESSION, nowIso: NOW, current: { objective, context } });
        // Only the guardian's NAME is left — a subject with one fact is not a card.
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.refusal.code).toBe("no_group");
    });
});

describe("changing one fact", () => {
    it("changes that value and NOTHING beside it", async () => {
        const context = contextWith(EMPTY);
        const objective = recomputeParticipantObjectiveFromContext(context, context.needsContext.session);
        const card = participantObjectiveWireModel(objective, { subjectDisplayName: "Solene Marchetti" }).next_turn
            .confirmation_group;
        expect(card).not.toBeNull();
        const dob = card!.facts.find((f) => f.label === "Birthday")!;

        const { client, writes } = fakeSupabase();
        const edited = await applyConfirmationGroupMemberEdit(client, {
            orgId: ORG,
            sessionId: SESSION,
            ref: dob.ref,
            value: "2021-04-03",
            nowIso: NOW,
            current: { objective, context },
        });
        expect(edited.ok).toBe(true);
        if (!edited.ok) return;

        // ONE key written. The siblings are not in the patch at all.
        expect(writes[0]!.shared_values).toEqual({ "customer_member:dob": "2021-04-03" });
        // And exactly one confirmation recorded — of the corrected value, so the runtime does not
        // turn around and ask about the date the parent typed three seconds ago.
        const confirmations = readEnrollmentNeedConfirmations(writes[0]!.metadata);
        expect(Object.keys(confirmations)).toEqual([`child:${CHILD}:customer_member:dob`]);
        expect(confirmations[`child:${CHILD}:customer_member:dob`]!.value_fingerprint).toBe(
            enrollmentValueFingerprint("2021-04-03"),
        );
        // The siblings are still awaiting confirmation — untouched, not settled by the edit.
        const still = edited.objective.needs.needs.filter((n) => n.state === "known_requires_confirmation");
        expect(still.map((n) => n.identity.canonical_key)).toContain("child_first_name");
        expect(still.map((n) => n.identity.canonical_key)).toContain("child_last_name");
    });

    it("refuses a handle that is not on the card the platform is showing", async () => {
        const context = contextWith(EMPTY);
        const objective = recomputeParticipantObjectiveFromContext(context, context.needsContext.session);
        const { client } = fakeSupabase();
        const edited = await applyConfirmationGroupMemberEdit(client, {
            orgId: ORG,
            sessionId: SESSION,
            ref: "fdeadbeef",
            value: "anything",
            nowIso: NOW,
            current: { objective, context },
        });
        expect(edited.ok).toBe(false);
        if (edited.ok) return;
        expect(edited.refusal.code).toBe("unknown_fact");
    });
});

describe("the card the parent reads", () => {
    it("draws the names into ONE heading and keeps every fact independently addressable", () => {
        const context = contextWith(EMPTY);
        const objective = recomputeParticipantObjectiveFromContext(context, context.needsContext.session);
        const card = participantObjectiveWireModel(objective, { subjectDisplayName: "Solene Marchetti" }).next_turn
            .confirmation_group!;

        expect(card.title).toBe("Let's make sure I have Solene's details right.");
        expect(card.headline).toBe("Solene Marchetti");
        // Three needs on the card; two of them are the heading, and BOTH are still facts.
        expect(card.facts).toHaveLength(3);
        expect(card.facts.filter((f) => f.in_headline)).toHaveLength(2);
        expect(new Set(card.facts.map((f) => f.ref)).size).toBe(3);
        // The date is read as a parent reads it, never as it is stored.
        expect(card.facts.find((f) => f.label === "Birthday")!.value).toBe("Apr 2, 2021");
    });

    it("never leaks a canonical key, a field id or an internal identifier", () => {
        const context = contextWith(EMPTY);
        const objective = recomputeParticipantObjectiveFromContext(context, context.needsContext.session);
        const card = participantObjectiveWireModel(objective, { subjectDisplayName: "Solene Marchetti" }).next_turn
            .confirmation_group!;
        const wire = JSON.stringify(card);
        expect(wire).not.toContain(CHILD);
        expect(wire).not.toContain("customer_member:dob");
        expect(wire).not.toContain("f_dob");
    });
});
