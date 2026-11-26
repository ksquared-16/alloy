/**
 * The shared identity gate — one resolver, two subjects.
 *
 * `resolveStaffPersonCandidates` is now a projection of
 * `resolvePersonCandidates`. That is only worth doing if Staff's answer is
 * IDENTICAL afterwards, so these tests compare the two directly rather than
 * re-asserting Staff's behaviour in isolation: Staff is the regression control
 * for the generalization, and a control that only checks itself proves nothing.
 */

import { describe, expect, it } from "vitest";

import { resolvePersonCandidates, IDENTITY_MATCH_BANDS } from "@/lib/identity/resolveIdentityCandidates";
import { resolveStaffPersonCandidates } from "@/lib/staff/resolveStaffPersonCandidates";
import { createEmploymentMock, ORG_ID } from "../employment/mockEmploymentSupabase";

const JANE = {
    id: "person-jane",
    org_id: ORG_ID,
    first_name: "Jane",
    last_name: "Wilson",
    full_name: "Jane Wilson",
    email: "jane.wilson@example.com",
    phone: "+15551230001",
    archived_at: null,
};

const JANE_TWIN = {
    id: "person-jane-2",
    org_id: ORG_ID,
    first_name: "Jane",
    last_name: "Wilson",
    full_name: "Jane Wilson",
    email: null,
    phone: null,
    archived_at: null,
};

function mock(persons: Record<string, unknown>[]) {
    return createEmploymentMock({ persons, customers: [], customer_members: [] });
}

const STAFF_INPUT = {
    firstName: "Jane",
    lastName: "Wilson",
    email: "jane.wilson@example.com",
    phone: null,
};

describe("Staff reads the shared resolver, unchanged", () => {
    it("returns the same decision and the same person ids as the shared module", async () => {
        const a = mock([JANE]);
        const b = mock([JANE]);

        const viaStaff = await resolveStaffPersonCandidates(a.supabase, ORG_ID, STAFF_INPUT);
        const viaShared = await resolvePersonCandidates(b.supabase, ORG_ID, {
            kind: "person",
            subjectRef: "staff_add",
            ...STAFF_INPUT,
        });

        expect(viaStaff.decision).toBe(viaShared.decision);
        expect(viaStaff.candidates.map((c) => c.person_id)).toEqual(
            viaShared.candidates.map((c) => c.record_id)
        );
        expect(viaStaff.candidates.map((c) => c.confidence_band)).toEqual(
            viaShared.candidates.map((c) => c.confidence_band)
        );
    });

    it("agrees on no_match for a genuinely new human", async () => {
        const a = mock([JANE]);
        const b = mock([JANE]);
        const input = {
            firstName: "Rosalind",
            lastName: "Okonkwo-Vale",
            email: "rosalind@example.com",
            phone: null,
        };

        expect((await resolveStaffPersonCandidates(a.supabase, ORG_ID, input)).decision).toBe("no_match");
        expect(
            (
                await resolvePersonCandidates(b.supabase, ORG_ID, {
                    kind: "person",
                    subjectRef: "staff_add",
                    ...input,
                })
            ).decision
        ).toBe("no_match");
    });

    it("still forces a choice when two people share a name and nothing else", async () => {
        const a = mock([JANE, JANE_TWIN]);
        const resolution = await resolveStaffPersonCandidates(a.supabase, ORG_ID, {
            firstName: "Jane",
            lastName: "Wilson",
            email: null,
            phone: null,
        });
        expect(resolution.decision).toBe("operator_choice_required");
    });
});

describe("the gate's own rule", () => {
    it("treats weak and conflicted as matches — the whole point of the gate", () => {
        // Excluding either would let the resolver auto-create past real evidence.
        expect(IDENTITY_MATCH_BANDS).toContain("weak");
        expect(IDENTITY_MATCH_BANDS).toContain("conflicted");
        expect(IDENTITY_MATCH_BANDS).not.toContain("excluded");
    });

    it("never returns a decision that resolves identity on its own", async () => {
        const a = mock([JANE]);
        const resolution = await resolvePersonCandidates(a.supabase, ORG_ID, {
            kind: "person",
            subjectRef: "staff_add",
            ...STAFF_INPUT,
        });
        // There is no "matched" decision to return. Every non-empty answer is a question.
        expect(["no_match", "operator_choice_required"]).toContain(resolution.decision);
        expect(resolution.decision).toBe("operator_choice_required");
    });
});

describe("the child subject uses the same gate", () => {
    it("prefers the household member the child already is", async () => {
        const m = createEmploymentMock({
            persons: [],
            customers: [{ id: "hh-1", org_id: ORG_ID, name: "Bell Household" }],
            customer_members: [
                {
                    id: "member-noah",
                    org_id: ORG_ID,
                    customer_id: "hh-1",
                    person_id: null,
                    display_name: "Noah Bell",
                    first_name: "Noah",
                    last_name: "Bell",
                    dob: "2020-11-30",
                    relationship: "child",
                    is_active: true,
                },
            ],
        });

        const resolution = await resolvePersonCandidates(m.supabase, ORG_ID, {
            kind: "child",
            subjectRef: "child_add",
            firstName: "Noah",
            lastName: "Bell",
            dob: "2020-11-30",
            householdCustomerId: "hh-1",
        });

        expect(resolution.decision).toBe("operator_choice_required");
        const candidate = resolution.candidates[0]!;
        // The durable child subject is the MEMBER — a person-keyed answer would be unusable
        // here, because this child has no person row at all.
        expect(candidate.customer_member_id).toBe("member-noah");
        expect(candidate.person_id).toBeNull();
        expect(candidate.in_household).toBe(true);
    });
});
