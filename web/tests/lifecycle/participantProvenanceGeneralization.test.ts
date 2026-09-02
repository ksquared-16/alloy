/**
 * Confirmation vs collection is decided by PROVENANCE and SEMANTIC SUBJECT — never by field names.
 *
 * The whole point is that the NEXT imported packet inherits this behaviour with no code change. So
 * every fixture here is a deliberately unrelated domain — a veterinary boarding intake — with field
 * keys, entities and labels this repository has never seen. If the classification depended on
 * anything about the School of Enrichment packet, these would fail.
 *
 * The defect being pinned: settled history was projected from `state === "confirmed"`, which reads
 * as "the parent confirmed this" and does not mean it — the runtime records a D-99 confirmation for
 * a value the participant SUPPLIES too. A card headed "Confirmed" therefore accumulated every
 * question they had just answered.
 */

import { describe, expect, it } from "vitest";

import { projectEnrollmentInformationNeeds } from "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds";
import {
    buildEnrollmentValueProvenancePatch,
    originForSettledTurn,
    readEnrollmentValueProvenance,
} from "@/lib/enrollment/informationNeeds/enrollmentValueProvenance";
import { enrollmentValueFingerprint } from "@/lib/enrollment/informationNeeds/enrollmentSessionConfirmations";
import {
    collectedAnswers,
    confirmationSubjectFor,
    groupSettledConfirmations,
} from "@/lib/enrollment/participantRuntime/confirmationGroup";

const PATIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AT = "2026-08-27T12:00:00.000Z";

/** A boarding intake for an animal clinic. Nothing here resembles a childcare packet. */
const SCHEMA = {
    title: "Boarding Intake",
    fields: [
        { id: "b1", type: "text", label: "Patient name", required: true, field_source: { entity_type: "customer_member", field_key: "call_name" } },
        { id: "b2", type: "text", label: "Microchip number", required: true, field_source: { entity_type: "customer_member", field_key: "microchip_id" } },
        { id: "b3", type: "text", label: "Owner name", required: true, field_source: { entity_type: "guardian", field_key: "name" } },
        { id: "b4", type: "text", label: "Which kennel block would you prefer?", required: false },
        { id: "b5", type: "text", label: "Vaccination certificate reference", required: false, field_source: { entity_type: "customer_member", field_key: "rabies_certificate" } },
        { id: "b6", type: "text", label: "Intake reference", required: false, read_only: true, derived: { kind: "execution_date" }, field_source: { entity_type: "customer_member", field_key: "intake_stamp" } },
    ],
    sections: [{ id: "s", title: "Boarding", field_ids: ["b1", "b2", "b3", "b4", "b5", "b6"] }],
};

const FORM = {
    requirement_id: "r",
    form_definition_id: "fd",
    form_definition_version_id: "v",
    session_item_id: "si",
    schema: SCHEMA,
} as never;

function project(over: {
    sharedValues?: Record<string, unknown>;
    canonicalValues?: Record<string, unknown>;
    confirmations?: Record<string, { value_fingerprint: string; confirmed_at: string }>;
    provenance?: Record<string, { origin: string; recorded_at: string }>;
}) {
    return projectEnrollmentInformationNeeds({
        forms: [FORM],
        subjectId: PATIENT,
        sharedValues: over.sharedValues ?? {},
        canonicalValues: over.canonicalValues,
        confirmations: (over.confirmations ?? {}) as never,
        provenance: (over.provenance ?? {}) as never,
        requiresConfirmation: new Set(["customer_member:call_name", "customer_member:microchip_id", "guardian:name"]),
    });
}

const key = (canonical: string, scope: "child" | "household") =>
    scope === "child" ? `child:${PATIENT}:${canonical}` : `household:-:${canonical}`;

const settled = (value: unknown, origin: string) => ({
    confirmations: { fingerprint: enrollmentValueFingerprint(value)!, at: AT },
    origin,
});

describe("a pre-existing canonical fact the participant verified", () => {
    it("becomes a CONFIRMATION group", () => {
        const microchip = "985141000123456";
        const needs = project({
            canonicalValues: { "customer_member:microchip_id": microchip, "customer_member:call_name": "Juno" },
            sharedValues: { "customer_member:microchip_id": microchip, "customer_member:call_name": "Juno" },
            confirmations: {
                [key("customer_member:microchip_id", "child")]: { value_fingerprint: enrollmentValueFingerprint(microchip)!, confirmed_at: AT },
                [key("customer_member:call_name", "child")]: { value_fingerprint: enrollmentValueFingerprint("Juno")!, confirmed_at: AT },
            },
            provenance: {
                [key("customer_member:microchip_id", "child")]: { origin: "confirmed_prior_truth", recorded_at: AT },
                [key("customer_member:call_name", "child")]: { origin: "confirmed_prior_truth", recorded_at: AT },
            },
        });

        const groups = groupSettledConfirmations(needs);
        expect(groups).toHaveLength(1);
        expect(groups[0]!.subject.key).toBe(`child:${PATIENT}`);
        expect(groups[0]!.members).toHaveLength(2);
        expect(collectedAnswers(needs)).toHaveLength(0);
    });
});

describe("the SAME semantic fact answered during this session", () => {
    it("becomes a COLLECTED answer, not a confirmation", () => {
        /*
         * The control that matters. Identical field, identical value, identical D-99 evidence — the
         * ONLY difference is that it did not exist before the parent was asked. Anything reading
         * state, shared_values or "a value exists now" classifies these two identically, which is
         * exactly how employers and sleep routines ended up under "Confirmed".
         */
        const microchip = "985141000123456";
        const needs = project({
            sharedValues: { "customer_member:microchip_id": microchip },
            confirmations: {
                [key("customer_member:microchip_id", "child")]: { value_fingerprint: enrollmentValueFingerprint(microchip)!, confirmed_at: AT },
            },
            provenance: {
                [key("customer_member:microchip_id", "child")]: { origin: "collected_in_session", recorded_at: AT },
            },
        });

        expect(groupSettledConfirmations(needs)).toHaveLength(0);
        expect(collectedAnswers(needs).map((m) => m.need_key)).toEqual([key("customer_member:microchip_id", "child")]);
    });

    it("is classified from the need's STATE when it was asked, not from the write", () => {
        // The two lines that carry the whole distinction, over a domain with no childcare vocabulary.
        expect(originForSettledTurn("known_requires_confirmation")).toBe("confirmed_prior_truth");
        expect(originForSettledTurn("missing")).toBe("collected_in_session");
    });
});

describe("a process-scoped answer", () => {
    it("is collection — it has no canonical identity to have pre-existed", () => {
        // "Which kennel block would you prefer?" is unbound: the session remembers it under a key
        // naming one destination, and no canonical consumer can claim it.
        const needs = project({});
        const kennel = needs.find((n) => n.occurrences[0]?.form_field_id === "b4");
        expect(kennel, "the unbound question is still a need").toBeTruthy();
        expect(kennel!.identity.artifact_specific).toBe(true);
        expect(kennel!.identity.shared_value_key).toBeNull();
        // Whatever it is later answered with, it can never satisfy the prior-truth test.
        const provenance = readEnrollmentValueProvenance(
            buildEnrollmentValueProvenancePatch({
                metadata: {},
                needKey: kennel!.identity.key,
                origin: originForSettledTurn(kennel!.state),
                recordedAtIso: AT,
            }),
        );
        expect(provenance[kennel!.identity.key]!.origin).toBe("collected_in_session");
    });
});

describe("evidence and derived values", () => {
    it("an uploaded document does NOT become a retroactive confirmation", () => {
        /*
         * The future-proofing control. When Health extraction lands and populates a fact from an
         * attached certificate, that fact was never verified by the parent — it must not appear in a
         * card telling them they checked it.
         */
        const needs = project({
            sharedValues: { "customer_member:rabies_certificate": "RC-2026-118" },
            confirmations: {
                [key("customer_member:rabies_certificate", "child")]: {
                    value_fingerprint: enrollmentValueFingerprint("RC-2026-118")!,
                    confirmed_at: AT,
                },
            },
            provenance: {
                [key("customer_member:rabies_certificate", "child")]: { origin: "uploaded_evidence", recorded_at: AT },
            },
        });
        expect(groupSettledConfirmations(needs)).toHaveLength(0);
        expect(collectedAnswers(needs)).toHaveLength(0);
    });

    it("a derived value is neither a confirmation nor a participant question", () => {
        const needs = project({
            sharedValues: { "customer_member:intake_stamp": "2026-08-27" },
            provenance: {
                [key("customer_member:intake_stamp", "child")]: { origin: "derived", recorded_at: AT },
            },
        });
        expect(groupSettledConfirmations(needs)).toHaveLength(0);
        expect(collectedAnswers(needs)).toHaveLength(0);
        /*
         * Stronger than "requires no action": a read-only derived destination produces NO
         * participant need at all. `participantCollectionMode` classifies it `system`, so the
         * platform writes it and the conversation never sees it — which is why "neither a
         * confirmation nor a participant question" needs no rule of its own here.
         */
        expect(needs.find((n) => n.identity.canonical_key === "customer_member:intake_stamp")).toBeUndefined();
        // Its five siblings on the same form are unaffected — the exclusion is the derived
        // destination's own property, not a side effect on the schema.
        expect(needs.length).toBeGreaterThan(0);
    });

    it("fails CLOSED where nothing was recorded", () => {
        // A session that ran before provenance existed shows NO confirmation history rather than a
        // wrong one, and any future write path that forgets to record loses a card instead of
        // gaining a false claim.
        const needs = project({
            sharedValues: { "customer_member:call_name": "Juno" },
            confirmations: {
                [key("customer_member:call_name", "child")]: { value_fingerprint: enrollmentValueFingerprint("Juno")!, confirmed_at: AT },
            },
        });
        expect(needs.find((n) => n.identity.canonical_key === "customer_member:call_name")!.state).toBe("confirmed");
        expect(groupSettledConfirmations(needs)).toHaveLength(0);
    });
});

describe("the subject is semantic, in a domain this repository has never seen", () => {
    it("keeps the patient and the owner apart", () => {
        const needs = project({});
        const patient = needs.find((n) => n.identity.canonical_key === "customer_member:microchip_id")!;
        const owner = needs.find((n) => n.identity.canonical_key === "guardian:name")!;
        expect(confirmationSubjectFor(patient).key).not.toBe(confirmationSubjectFor(owner).key);
        expect(confirmationSubjectFor(patient).kind).toBe("child");
        expect(confirmationSubjectFor(owner).kind).toBe("person");
    });
});
