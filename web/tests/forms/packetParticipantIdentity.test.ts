/**
 * Phase 7 Slice 3 — Participant Identity.
 *
 * The claim under test: a packet session's `crm_snapshot` carries HOUSEHOLD identity; the resolving
 * link carries PARTICIPANT identity; a shared session never overwrites who is answering.
 *
 * Before this, `crm_snapshot.person_id` was pinned by whichever recipient link launched the shared
 * session first, every later draft preferred that pin over its own recipient, and every submit merged
 * the submitter's person back into the shared snapshot — so all submissions carried one person and two
 * guardians could not be told apart.
 */
import { describe, expect, it } from "vitest";
import type { LaunchFkStamp } from "@/lib/forms/formLaunchFkDerivation";
import {
    crmSnapshotFromLaunchFks,
    linkNamesRecipientPerson,
    mergeNonNullSubmissionFksIntoCrmSnapshot,
    resolveParticipantFksForPacketDraft,
} from "@/lib/forms/packets/formPacketService";

const GUARDIAN_A = "11111111-1111-4111-8111-111111111111";
const GUARDIAN_B = "55555555-5555-4555-8555-555555555555";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OPPORTUNITY = "44444444-4444-4444-8444-444444444444";

/** What a recipient link derives server-side: its own recipient plus the household it points at. */
function linkFor(personId: string | null): LaunchFkStamp {
    return {
        person_id: personId,
        customer_id: CUSTOMER,
        customer_member_id: MEMBER,
        opportunity_id: OPPORTUNITY,
    };
}

describe("linkNamesRecipientPerson", () => {
    it("is presence-only — a blank or absent recipient does not claim participant authority", () => {
        expect(linkNamesRecipientPerson({ recipient_person_id: GUARDIAN_A })).toBe(true);
        expect(linkNamesRecipientPerson({ recipient_person_id: "   " })).toBe(false);
        expect(linkNamesRecipientPerson({})).toBe(false);
        expect(linkNamesRecipientPerson({ recipient_person_id: 42 })).toBe(false);
    });
});

describe("crmSnapshotFromLaunchFks", () => {
    it("omits person_id for a shared session so the first launcher cannot pin the participant", () => {
        const snap = crmSnapshotFromLaunchFks(linkFor(GUARDIAN_A), { householdOnly: true });
        expect(snap).not.toHaveProperty("person_id");
        expect(snap.customer_id).toBe(CUSTOMER);
        expect(snap.opportunity_id).toBe(OPPORTUNITY);
    });

    it("keeps person_id for a single-recipient session (unchanged behaviour)", () => {
        expect(crmSnapshotFromLaunchFks(linkFor(GUARDIAN_A)).person_id).toBe(GUARDIAN_A);
    });
});

describe("resolveParticipantFksForPacketDraft", () => {
    it("the resolving link's recipient beats a pinned snapshot person", () => {
        const resolved = resolveParticipantFksForPacketDraft({
            launchFks: linkFor(GUARDIAN_B),
            crmSnapshot: { person_id: GUARDIAN_A, customer_id: CUSTOMER },
            linkNamesRecipient: true,
        });
        expect(resolved.person_id).toBe(GUARDIAN_B);
    });

    it("household identity still comes from the shared snapshot", () => {
        const resolved = resolveParticipantFksForPacketDraft({
            launchFks: { person_id: GUARDIAN_B, customer_id: null, customer_member_id: null, opportunity_id: null },
            crmSnapshot: { customer_id: CUSTOMER, customer_member_id: MEMBER, opportunity_id: OPPORTUNITY },
            linkNamesRecipient: true,
        });
        expect(resolved).toEqual({
            person_id: GUARDIAN_B,
            customer_id: CUSTOMER,
            customer_member_id: MEMBER,
            opportunity_id: OPPORTUNITY,
        });
    });

    it("a link with no recipient keeps the previous snapshot-wins behaviour", () => {
        const resolved = resolveParticipantFksForPacketDraft({
            launchFks: linkFor(GUARDIAN_B),
            crmSnapshot: { person_id: GUARDIAN_A },
            linkNamesRecipient: false,
        });
        expect(resolved.person_id).toBe(GUARDIAN_A);
    });

    it("falls back to the link when a recipient link resolves no person", () => {
        const resolved = resolveParticipantFksForPacketDraft({
            launchFks: linkFor(null),
            crmSnapshot: { person_id: GUARDIAN_A },
            linkNamesRecipient: true,
        });
        // The link claimed authority but resolved nobody: it must not silently inherit the pin.
        expect(resolved.person_id).toBeNull();
    });
});

describe("mergeNonNullSubmissionFksIntoCrmSnapshot", () => {
    it("householdOnly withholds the submitter's person but still merges household facts", () => {
        const merged = mergeNonNullSubmissionFksIntoCrmSnapshot(
            { customer_id: CUSTOMER },
            linkFor(GUARDIAN_A),
            { householdOnly: true }
        );
        expect(merged).not.toHaveProperty("person_id");
        expect(merged.customer_member_id).toBe(MEMBER);
        expect(merged.opportunity_id).toBe(OPPORTUNITY);
    });

    it("without the flag it behaves exactly as before", () => {
        expect(mergeNonNullSubmissionFksIntoCrmSnapshot({}, linkFor(GUARDIAN_A)).person_id).toBe(GUARDIAN_A);
    });
});

describe("two guardians on ONE shared session", () => {
    /**
     * Replays the real runtime order: seed the shared snapshot, then for each recipient resolve a
     * draft and merge that submit back. Returns who each submission was attributed to.
     */
    function runPacket(order: readonly string[]): { attributed: string[]; finalSnapshot: Record<string, unknown> } {
        let snapshot = crmSnapshotFromLaunchFks(linkFor(order[0]), { householdOnly: true });
        const attributed: string[] = [];
        for (const guardian of order) {
            const resolved = resolveParticipantFksForPacketDraft({
                launchFks: linkFor(guardian),
                crmSnapshot: snapshot,
                linkNamesRecipient: true,
            });
            attributed.push(resolved.person_id as string);
            snapshot = mergeNonNullSubmissionFksIntoCrmSnapshot(snapshot, resolved, { householdOnly: true });
        }
        return { attributed, finalSnapshot: snapshot };
    }

    it("attributes each submission to the guardian who actually answered", () => {
        expect(runPacket([GUARDIAN_A, GUARDIAN_B]).attributed).toEqual([GUARDIAN_A, GUARDIAN_B]);
    });

    it("is order-independent — whoever goes first does not pin the other", () => {
        expect(runPacket([GUARDIAN_B, GUARDIAN_A]).attributed).toEqual([GUARDIAN_B, GUARDIAN_A]);
    });

    it("never lets a participant leak into the shared household snapshot", () => {
        const { finalSnapshot } = runPacket([GUARDIAN_A, GUARDIAN_B]);
        expect(finalSnapshot).not.toHaveProperty("person_id");
        expect(finalSnapshot.customer_id).toBe(CUSTOMER);
    });

    it("stays stable when the same guardian submits repeatedly", () => {
        expect(runPacket([GUARDIAN_A, GUARDIAN_A, GUARDIAN_B]).attributed).toEqual([
            GUARDIAN_A,
            GUARDIAN_A,
            GUARDIAN_B,
        ]);
    });
});
