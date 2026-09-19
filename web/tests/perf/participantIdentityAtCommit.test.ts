/**
 * PARTICIPANT IDENTITY AT COMMIT — the measured gate, and the refusals that keep it honest.
 *
 * Deployed measurement showed six Summary areas whose first paints spread over ~3.3s all receiving
 * their FINAL authoritative mutation at one timestamp: a SHARED PARENT HOLD. The cause was that
 * participant-scoped cards could not MOUNT at commit, because commit truth never said which child
 * the panel was about; they mounted ~3.3s later and that mount re-rendered the whole grid.
 *
 * The repair states the identity. Its safety is entirely in what it REFUSES to state.
 *
 * The decision lives in the DOMAIN composer, not the platform builder: `provisioningDomainPlatformBoundary`
 * requires the platform work-mode builder to forward the identity bag opaquely and name no domain
 * truth key. A first attempt put it there and that guard caught it.
 */
import { describe, expect, it } from "vitest";

import { soleParticipantIdentityBindings } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { participantScopeFromChildSubjectTruth } from "@/lib/adminV2/runtime/operationalContext/resolveParticipantScope";
import { MOUNTABLE_CARD_SPECS, PARTICIPANT_IDENTITY_TRUTH_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/**
 * The real `_inquiry_children` row shape: `id` IS the participation id. That is the contract
 * `participantCandidatesFromTruth` reads, and this fixture follows it rather than inventing a
 * field name — the first version used `participation_id` and the test failed while the code was
 * right.
 */
const child = (name: string, member: string, participation: string) => ({
    id: participation,
    customer_member_id: member,
    display_name: name,
});

const participantSpecs = MOUNTABLE_CARD_SPECS.filter(
    (s) => s.identityTruthKeys === PARTICIPANT_IDENTITY_TRUTH_KEYS,
);
/** Mount eligibility, asked exactly as the runtime asks it. */
const mountable = (truth: Record<string, unknown>) =>
    participantSpecs
        .filter((s) => s.identityKnowable({ truth } as unknown as OperationalContext))
        .map((s) => s.key)
        .sort();

describe("a sole participant is a fact; several children are not", () => {
    it("states both identity keys when the case has exactly one child", () => {
        const b = soleParticipantIdentityBindings([child("Avery", "mem-1", "part-1")]);
        expect(b).toEqual({
            "child.customer_member_id": "mem-1",
            "child.process_instance_id": "part-1",
        });
        // The EXISTING mount predicate is satisfied — not weakened.
        expect(mountable(b)).toEqual(["attendance", "health_safety"]);
        // And the existing scope resolver accepts it, so the card can address its own read.
        expect(participantScopeFromChildSubjectTruth(b)?.customerMemberId).toBe("mem-1");
    });

    it("REFUSES a multi-child case, so those cards still reserve (defect A)", () => {
        const b = soleParticipantIdentityBindings([
            child("Avery", "mem-1", "part-1"),
            child("Riley", "mem-2", "part-2"),
        ]);
        expect(b).toEqual({});
        expect(mountable(b), "participant cards must not mount for an ambiguous case").toEqual([]);
    });

    it("never picks first-of-many under either ordering", () => {
        const a = [child("A", "m1", "p1"), child("B", "m2", "p2")];
        expect(soleParticipantIdentityBindings(a)).toEqual({});
        expect(soleParticipantIdentityBindings([...a].reverse())).toEqual({});
    });

    it("states nothing when there are no children, or the input is not a list", () => {
        for (const input of [[], null, undefined, {}, "nope"]) {
            expect(soleParticipantIdentityBindings(input)).toEqual({});
        }
    });

    it("refuses a candidate carrying no participation identity (defect B)", () => {
        // A member id without a participation is not a participation.
        expect(soleParticipantIdentityBindings([{ customer_member_id: "mem-1", display_name: "Avery" }]))
            .toEqual({});
        // …and equally, a participation with no member id is not an addressable participant.
        expect(soleParticipantIdentityBindings([{ id: "part-1", display_name: "Avery" }])).toEqual({});
    });
});

describe("the mount contract is satisfied, not weakened (defect D)", () => {
    it("still requires a non-blank participant identity", () => {
        expect(PARTICIPANT_IDENTITY_TRUTH_KEYS).toEqual(["child.customer_member_id"]);
        expect(mountable({ "child.customer_member_id": "   " }), "blank is absent").toEqual([]);
        expect(mountable({}), "absent is absent").toEqual([]);
    });

    it("carries identity only — no content, no permission answer (defect E)", () => {
        const b = soleParticipantIdentityBindings([child("Avery", "mem-1", "part-1")]);
        expect(Object.keys(b).sort()).toEqual(["child.customer_member_id", "child.process_instance_id"]);
        for (const forbidden of ["allowedLocationIds", "canViewParticipant", "attendance", "balance"]) {
            expect(b).not.toHaveProperty(forbidden);
        }
    });

    it("does not mutate the caller's list (defect H — no second projection)", () => {
        const rows = [child("Avery", "mem-1", "part-1")];
        const before = JSON.stringify(rows);
        soleParticipantIdentityBindings(rows);
        expect(JSON.stringify(rows)).toBe(before);
    });
});
