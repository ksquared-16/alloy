/**
 * Add Staff — identity safety and access separation.
 *
 * The scenario that drives this whole slice: Jane Wilson already exists as a
 * parent. Adding her as staff must add employment to the person who is already
 * there, and must never produce a second Jane Wilson.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { addStaff, StaffIdentityChoiceRequiredError } from "@/lib/staff/addStaffService";
import { resolveStaffPersonCandidates } from "@/lib/staff/resolveStaffPersonCandidates";
import { getRegisteredAction, hasRegisteredHandler } from "@/lib/adminV2/actions/actionRegistry";
import { STAFF_ADD_ACTION_KEY } from "@/lib/adminV2/actions/definitions/staffAddAction";
import {
    EMPLOYMENT_END_ACTION_KEY,
    EMPLOYMENT_UPDATE_ACTION_KEY,
} from "@/lib/adminV2/actions/definitions/employmentEndAction";
import {
    ACCESS_TABLES,
    createEmploymentMock,
    ORG_ID,
    OTHER_ORG_ID,
    SITE_ID,
    type EmploymentMock,
} from "./mockEmploymentSupabase";

const TODAY = "2026-08-11";

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

function seeded(extra?: Record<string, Record<string, unknown>[]>): EmploymentMock {
    return createEmploymentMock({
        persons: [JANE],
        locations: [{ id: SITE_ID, org_id: ORG_ID, label: "Riverside", location_type: "site" }],
        ...extra,
    });
}

function baseEmploymentFacts() {
    return { startDate: "2026-09-01", todayYmd: TODAY, orgId: ORG_ID };
}

describe("Add Staff — registered capability", () => {
    it("is a registered action on the existing action runtime, not a bespoke mutation", () => {
        expect(STAFF_ADD_ACTION_KEY).toBe("staff.add");
        expect(hasRegisteredHandler(STAFF_ADD_ACTION_KEY)).toBe(true);
        expect(hasRegisteredHandler(EMPLOYMENT_END_ACTION_KEY)).toBe(true);
        expect(hasRegisteredHandler(EMPLOYMENT_UPDATE_ACTION_KEY)).toBe(true);

        const action = getRegisteredAction(STAFF_ADD_ACTION_KEY);
        expect(action?.audit.mutates).toBe(true);
        expect(action?.confirmationPolicy).toBe("required");
        // Staff is a person, not a new entity type.
        expect(action?.supportedEntityTypes).toContain("person");
    });
});

describe("identity resolution gate", () => {
    it("surfaces an existing person by name + email instead of reporting no match", async () => {
        const mock = seeded();
        const resolution = await resolveStaffPersonCandidates(mock.supabase, ORG_ID, {
            firstName: "Jane",
            lastName: "Wilson",
            email: "jane.wilson@example.com",
            phone: null,
        });
        expect(resolution.decision).toBe("operator_choice_required");
        expect(resolution.candidates.map((c) => c.person_id)).toContain(JANE.id);
    });

    it("reports no match for a genuinely new human", async () => {
        const mock = seeded();
        const resolution = await resolveStaffPersonCandidates(mock.supabase, ORG_ID, {
            firstName: "Rosalind",
            lastName: "Okonkwo-Vale",
            email: "rosalind.okonkwo-vale@example.com",
            phone: "+15559998888",
        });
        expect(resolution.decision).toBe("no_match");
        expect(resolution.candidates).toHaveLength(0);
    });
});

describe("existing parent becomes staff", () => {
    it("adds employment to the existing person and creates no second Jane Wilson", async () => {
        const mock = seeded();
        const personsBefore = mock.store.persons.length;

        const result = await addStaff(mock.supabase, {
            ...baseEmploymentFacts(),
            personId: JANE.id,
            positionId: null,
            employmentType: "full_time",
            primaryLocationId: SITE_ID,
        });

        expect(result.identityOutcome).toBe("linked_existing");
        expect(result.personId).toBe(JANE.id);
        expect(mock.store.persons).toHaveLength(personsBefore);
        expect(mock.writes.filter((w) => w.table === "persons" && w.op === "insert")).toHaveLength(0);
        expect(mock.store.employments).toHaveLength(1);
        expect(mock.store.employments[0].person_id).toBe(JANE.id);
    });

    it("leaves the existing person record untouched", async () => {
        const mock = seeded();
        await addStaff(mock.supabase, { ...baseEmploymentFacts(), personId: JANE.id });
        expect(mock.store.persons[0]).toMatchObject({
            full_name: "Jane Wilson",
            email: "jane.wilson@example.com",
        });
        expect(mock.writes.some((w) => w.table === "persons")).toBe(false);
    });
});

describe("duplicate protection", () => {
    it("refuses to create silently when a candidate exists, and writes nothing", async () => {
        const mock = seeded();

        await expect(
            addStaff(mock.supabase, {
                ...baseEmploymentFacts(),
                firstName: "Jane",
                lastName: "Wilson",
                email: "jane.wilson@example.com",
            })
        ).rejects.toBeInstanceOf(StaffIdentityChoiceRequiredError);

        // The gate runs before any write. Nothing at all was persisted.
        expect(mock.store.persons).toHaveLength(1);
        expect(mock.store.employments).toHaveLength(0);
        expect(mock.writes).toHaveLength(0);
    });

    it("surfaces the matching candidate on the error so the operator can choose", async () => {
        const mock = seeded();
        try {
            await addStaff(mock.supabase, {
                ...baseEmploymentFacts(),
                firstName: "Jane",
                lastName: "Wilson",
                email: "jane.wilson@example.com",
            });
            throw new Error("expected the identity gate to block");
        } catch (err) {
            expect(err).toBeInstanceOf(StaffIdentityChoiceRequiredError);
            const candidates = (err as StaffIdentityChoiceRequiredError).candidates;
            expect(candidates.map((c) => c.person_id)).toContain(JANE.id);
        }
    });

    it("still refuses when create_new_person is set without a reason", async () => {
        const mock = seeded();
        await expect(
            addStaff(mock.supabase, {
                ...baseEmploymentFacts(),
                firstName: "Jane",
                lastName: "Wilson",
                email: "jane.wilson@example.com",
                createNewPerson: true,
                createNewReason: null,
            })
        ).rejects.toBeInstanceOf(StaffIdentityChoiceRequiredError);
        expect(mock.store.persons).toHaveLength(1);
    });

    it("creates a new person only with an explicit override and reason", async () => {
        const mock = seeded();
        const result = await addStaff(mock.supabase, {
            ...baseEmploymentFacts(),
            firstName: "Jane",
            lastName: "Wilson",
            email: "jane.wilson@example.com",
            createNewPerson: true,
            createNewReason: "Different Jane Wilson — confirmed by phone with the director",
        });
        expect(result.identityOutcome).toBe("created_new");
        expect(mock.store.persons).toHaveLength(2);
    });
});

describe("new staff", () => {
    it("creates exactly one person and exactly one employment", async () => {
        const mock = seeded();
        const result = await addStaff(mock.supabase, {
            ...baseEmploymentFacts(),
            firstName: "Rosalind",
            lastName: "Okonkwo-Vale",
            email: "rosalind.okonkwo-vale@example.com",
        });

        expect(result.identityOutcome).toBe("created_new");
        expect(mock.writes.filter((w) => w.table === "persons" && w.op === "insert")).toHaveLength(1);
        expect(mock.writes.filter((w) => w.table === "employments" && w.op === "insert")).toHaveLength(1);
        expect(mock.store.employments[0].person_id).toBe(result.personId);
    });

    it("stores identity on persons and only a reference on employments", async () => {
        const mock = seeded();
        const result = await addStaff(mock.supabase, {
            ...baseEmploymentFacts(),
            firstName: "Rosalind",
            lastName: "Okonkwo-Vale",
            email: "rosalind.okonkwo-vale@example.com",
        });
        const employment = mock.store.employments[0];
        expect(employment.person_id).toBe(result.personId);
        for (const identityColumn of ["first_name", "last_name", "full_name", "email", "phone"]) {
            expect(employment).not.toHaveProperty(identityColumn);
        }
    });
});

describe("access separation", () => {
    it("creating employment writes nothing to any access table", async () => {
        const mock = seeded();
        await addStaff(mock.supabase, { ...baseEmploymentFacts(), personId: JANE.id });

        for (const t of ACCESS_TABLES) {
            expect(mock.store[t]).toHaveLength(0);
            expect(mock.writes.filter((w) => w.table === t)).toHaveLength(0);
        }
    });

    it("does not grant access even when the person already has a user role", async () => {
        const mock = seeded({
            user_roles: [{ user_id: "auth-user-jane", org_id: ORG_ID, role: "ops" }],
        });
        await addStaff(mock.supabase, { ...baseEmploymentFacts(), personId: JANE.id });

        // The pre-existing role is untouched — not replaced, not recreated.
        expect(mock.store.user_roles).toHaveLength(1);
        expect(mock.store.user_roles[0]).toMatchObject({ user_id: "auth-user-jane", role: "ops" });
        expect(mock.writes.filter((w) => w.table === "user_roles")).toHaveLength(0);
    });

    it("only ever writes persons, employments, and field values", async () => {
        const mock = seeded();
        await addStaff(mock.supabase, {
            ...baseEmploymentFacts(),
            firstName: "Rosalind",
            lastName: "Okonkwo-Vale",
        });
        const touched = [...new Set(mock.writes.map((w) => w.table))];
        expect(touched.sort()).toEqual(["employments", "persons"]);
    });
});

describe("tenancy", () => {
    it("rejects a person from another organization", async () => {
        const mock = createEmploymentMock({
            persons: [{ ...JANE, id: "person-otherorg", org_id: OTHER_ORG_ID }],
        });
        await expect(
            addStaff(mock.supabase, { ...baseEmploymentFacts(), personId: "person-otherorg" })
        ).rejects.toMatchObject({ code: "not_found" });
        expect(mock.store.employments).toHaveLength(0);
    });
});
