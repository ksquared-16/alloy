/**
 * Add Child — identity safety and separation from Enrollment.
 *
 * The scenario that drives this slice: two Emma Chens exist in the org with
 * nothing to tell them apart. The path this replaces
 * (`findOrCreateChildPersonInOrg`) matched org-wide on first/last name with
 * `ilike`, took the first row, and returned it SILENTLY — two children became
 * one with no operator involved. Add Staff refuses to guess in exactly this
 * case; Add Child now refuses the same way, through the same resolver.
 *
 * Every "nothing was written" assertion here is a WRITE-LOG assertion, not a row
 * count: a service that inserted and rolled back, or wrote a different table,
 * would pass a count check and fail this one.
 */

import { describe, expect, it } from "vitest";

import { addChild, ChildIdentityChoiceRequiredError } from "@/lib/records/addChildService";
import { RecordCreationError } from "@/lib/records/recordCreationErrors";
import { resolvePersonCandidates } from "@/lib/identity/resolveIdentityCandidates";
import { getRegisteredAction, hasRegisteredHandler } from "@/lib/adminV2/actions/actionRegistry";
import { CHILD_ADD_ACTION_KEY } from "@/lib/adminV2/actions/definitions/childAddAction";
import { relationshipActionRegistryEntry } from "@/lib/admin/relationship/relationshipActionRegistry";
import {
    createEmploymentMock,
    ORG_ID,
    OTHER_ORG_ID,
    type EmploymentMock,
} from "../employment/mockEmploymentSupabase";

const HOUSEHOLD = "household-chen";
const OTHER_HOUSEHOLD = "household-okafor";

const EMMA_ONE = {
    id: "person-emma-1",
    org_id: ORG_ID,
    first_name: "Emma",
    last_name: "Chen",
    date_of_birth: null,
    email: null,
    phone: null,
};
const EMMA_TWO = {
    id: "person-emma-2",
    org_id: ORG_ID,
    first_name: "Emma",
    last_name: "Chen",
    date_of_birth: null,
    email: null,
    phone: null,
};

/** Tables Add Child must never touch. Adding a child is not starting an enrollment. */
const PARTICIPATION_TABLES = [
    "opportunities",
    "process_instances",
    "opportunity_customer_members",
    "work_units",
];

function mockWith(extra?: Record<string, Record<string, unknown>[]>): EmploymentMock {
    return createEmploymentMock({
        customers: [
            { id: HOUSEHOLD, org_id: ORG_ID, name: "Chen Household" },
            { id: OTHER_HOUSEHOLD, org_id: ORG_ID, name: "Okafor Household" },
            { id: "household-other-org", org_id: OTHER_ORG_ID, name: "Elsewhere" },
        ],
        persons: [],
        customer_members: [],
        opportunities: [],
        process_instances: [],
        opportunity_customer_members: [],
        ...extra,
    });
}

function insertsTo(mock: EmploymentMock, table: string) {
    return mock.writes.filter((w) => w.table === table && w.op === "insert");
}

describe("Add Child — registered capability", () => {
    it("is a registered action on the existing command runtime, not a bespoke mutation route", () => {
        expect(CHILD_ADD_ACTION_KEY).toBe("child.add");
        expect(hasRegisteredHandler(CHILD_ADD_ACTION_KEY)).toBe(true);

        const action = getRegisteredAction(CHILD_ADD_ACTION_KEY);
        expect(action?.audit.mutates).toBe(true);
        expect(action?.confirmationPolicy).toBe("required");
        // Capture-first: there is no target record until this action creates one.
        expect(action?.requiredContext.requiresEntityId).toBe(false);
        expect(action?.requiredContext.requiresOpportunity).toBe(false);
        expect(action?.supportedEntityTypes).toContain("child");
    });
});

describe("the ambiguous Emma Chen", () => {
    const ambiguous = () => mockWith({ persons: [EMMA_ONE, EMMA_TWO] });

    it("surfaces BOTH candidates rather than picking one", async () => {
        const mock = ambiguous();
        const resolution = await resolvePersonCandidates(mock.supabase, ORG_ID, {
            kind: "child",
            subjectRef: "child_add",
            firstName: "Emma",
            lastName: "Chen",
            dob: null,
            householdCustomerId: HOUSEHOLD,
        });

        expect(resolution.decision).toBe("operator_choice_required");
        const ids = resolution.candidates.map((c) => c.person_id);
        expect(ids).toContain(EMMA_ONE.id);
        expect(ids).toContain(EMMA_TWO.id);
    });

    it("refuses to write anything until the operator decides", async () => {
        const mock = ambiguous();

        await expect(
            addChild(mock.supabase, {
                orgId: ORG_ID,
                customerId: HOUSEHOLD,
                firstName: "Emma",
                lastName: "Chen",
                dob: null,
            })
        ).rejects.toBeInstanceOf(ChildIdentityChoiceRequiredError);

        // ZERO writes — to any table, of any kind.
        expect(mock.writes).toHaveLength(0);
    });

    it("carries both candidates on the error so the operator can choose", async () => {
        const mock = ambiguous();
        const err = await addChild(mock.supabase, {
            orgId: ORG_ID,
            customerId: HOUSEHOLD,
            firstName: "Emma",
            lastName: "Chen",
            dob: null,
        }).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ChildIdentityChoiceRequiredError);
        const candidates = (err as ChildIdentityChoiceRequiredError).candidates;
        expect(candidates.length).toBeGreaterThanOrEqual(2);
        expect(candidates.map((c) => c.person_id)).toEqual(
            expect.arrayContaining([EMMA_ONE.id, EMMA_TWO.id])
        );
    });

    it("still refuses when the override has no reason", async () => {
        const mock = ambiguous();
        await expect(
            addChild(mock.supabase, {
                orgId: ORG_ID,
                customerId: HOUSEHOLD,
                firstName: "Emma",
                lastName: "Chen",
                createNewChild: true,
                createNewReason: "   ",
            })
        ).rejects.toBeInstanceOf(ChildIdentityChoiceRequiredError);
        expect(mock.writes).toHaveLength(0);
    });

    it("creates a third Emma only on an explicit override carrying a reason", async () => {
        const mock = ambiguous();
        const result = await addChild(mock.supabase, {
            orgId: ORG_ID,
            customerId: HOUSEHOLD,
            firstName: "Emma",
            lastName: "Chen",
            createNewChild: true,
            createNewReason: "Different Emma Chen — confirmed with the family",
        });

        expect(result.identityOutcome).toBe("created_new");
        expect(insertsTo(mock, "customer_members")).toHaveLength(1);
        // Neither existing Emma was touched, and no third PERSON was invented.
        expect(insertsTo(mock, "persons")).toHaveLength(0);
        expect(result.personId).toBeNull();
    });
});

describe("a genuinely new sibling", () => {
    it("creates exactly one member row and no person row", async () => {
        const mock = mockWith();
        const result = await addChild(mock.supabase, {
            orgId: ORG_ID,
            customerId: HOUSEHOLD,
            firstName: "Rosalind",
            lastName: "Okonkwo-Vale",
            dob: "2021-04-04",
        });

        expect(result.identityOutcome).toBe("created_new");
        expect(result.membersCreated).toBe(1);
        expect(insertsTo(mock, "customer_members")).toHaveLength(1);
        expect(insertsTo(mock, "persons")).toHaveLength(0);

        const row = insertsTo(mock, "customer_members")[0]!.row;
        expect(row).toMatchObject({
            org_id: ORG_ID,
            customer_id: HOUSEHOLD,
            relationship: "child",
            is_active: true,
            person_id: null,
            dob: "2021-04-04",
        });
    });

    it("writes no opportunity and no process participation", async () => {
        const mock = mockWith();
        await addChild(mock.supabase, {
            orgId: ORG_ID,
            customerId: HOUSEHOLD,
            firstName: "Rosalind",
            lastName: "Okonkwo-Vale",
        });

        for (const table of PARTICIPATION_TABLES) {
            expect(mock.writes.filter((w) => w.table === table)).toHaveLength(0);
        }
    });

    it("refuses without a household — a child is never placed by name similarity", async () => {
        const mock = mockWith();
        await expect(
            addChild(mock.supabase, { orgId: ORG_ID, customerId: "", firstName: "Ada", lastName: "Lovelace" })
        ).rejects.toBeInstanceOf(RecordCreationError);
        expect(mock.writes).toHaveLength(0);
    });
});

describe("reusing an existing identity", () => {
    it("links the chosen person without creating a second one", async () => {
        const mock = mockWith({ persons: [EMMA_ONE] });
        const result = await addChild(mock.supabase, {
            orgId: ORG_ID,
            customerId: HOUSEHOLD,
            personId: EMMA_ONE.id,
        });

        expect(result.identityOutcome).toBe("linked_existing_person");
        expect(result.personId).toBe(EMMA_ONE.id);
        expect(insertsTo(mock, "persons")).toHaveLength(0);
        expect(insertsTo(mock, "customer_members")).toHaveLength(1);
    });

    it("explains the existing relationship instead of creating a second membership", async () => {
        const mock = mockWith({
            persons: [EMMA_ONE],
            customer_members: [
                {
                    id: "member-emma",
                    org_id: ORG_ID,
                    customer_id: HOUSEHOLD,
                    person_id: EMMA_ONE.id,
                    display_name: "Emma Chen",
                    first_name: "Emma",
                    last_name: "Chen",
                    relationship: "child",
                    is_active: true,
                },
            ],
        });

        const result = await addChild(mock.supabase, {
            orgId: ORG_ID,
            customerId: HOUSEHOLD,
            personId: EMMA_ONE.id,
        });

        expect(result.identityOutcome).toBe("already_in_household");
        expect(result.customerMemberId).toBe("member-emma");
        expect(result.membersCreated).toBe(0);
        expect(mock.writes).toHaveLength(0);
    });

    it("reuses a chosen member row without writing", async () => {
        const mock = mockWith({
            customer_members: [
                {
                    id: "member-noah",
                    org_id: ORG_ID,
                    customer_id: HOUSEHOLD,
                    person_id: null,
                    display_name: "Noah Bell",
                    first_name: "Noah",
                    last_name: "Bell",
                    relationship: "child",
                    is_active: true,
                },
            ],
        });

        const result = await addChild(mock.supabase, {
            orgId: ORG_ID,
            customerId: HOUSEHOLD,
            customerMemberId: "member-noah",
        });

        expect(result.identityOutcome).toBe("already_in_household");
        // person_id NULL stays valid — the member IS the child record.
        expect(result.personId).toBeNull();
        expect(mock.writes).toHaveLength(0);
    });

    it("will not move a child between households as a side effect", async () => {
        const mock = mockWith({
            customer_members: [
                {
                    id: "member-elsewhere",
                    org_id: ORG_ID,
                    customer_id: OTHER_HOUSEHOLD,
                    person_id: null,
                    display_name: "Ada Okafor",
                    relationship: "child",
                    is_active: true,
                },
            ],
        });

        await expect(
            addChild(mock.supabase, {
                orgId: ORG_ID,
                customerId: HOUSEHOLD,
                customerMemberId: "member-elsewhere",
            })
        ).rejects.toBeInstanceOf(RecordCreationError);
        expect(mock.writes).toHaveLength(0);
    });
});

describe("tenancy", () => {
    it("refuses a household in another organization", async () => {
        const mock = mockWith();
        await expect(
            addChild(mock.supabase, {
                orgId: ORG_ID,
                customerId: "household-other-org",
                firstName: "Ada",
                lastName: "Lovelace",
            })
        ).rejects.toBeInstanceOf(RecordCreationError);
        expect(mock.writes).toHaveLength(0);
    });

    it("refuses a chosen person in another organization", async () => {
        const mock = mockWith({
            persons: [{ ...EMMA_ONE, id: "person-elsewhere", org_id: OTHER_ORG_ID }],
        });
        await expect(
            addChild(mock.supabase, {
                orgId: ORG_ID,
                customerId: HOUSEHOLD,
                personId: "person-elsewhere",
            })
        ).rejects.toBeInstanceOf(RecordCreationError);
        expect(mock.writes).toHaveLength(0);
    });

    it("does not offer cross-organization identity candidates", async () => {
        const mock = mockWith({
            persons: [{ ...EMMA_ONE, id: "person-elsewhere", org_id: OTHER_ORG_ID }],
        });
        const resolution = await resolvePersonCandidates(mock.supabase, ORG_ID, {
            kind: "child",
            subjectRef: "child_add",
            firstName: "Emma",
            lastName: "Chen",
            dob: null,
            householdCustomerId: HOUSEHOLD,
        });
        expect(resolution.decision).toBe("no_match");
    });
});

describe("capability metadata is honest about what it writes", () => {
    it("no longer declares the removed opportunity_customer_members bridge on add_child", () => {
        const entry = relationshipActionRegistryEntry("add_child");
        expect(entry).not.toBeNull();
        expect(entry!.writeTargets).not.toContain("opportunity_customer_members");
        // process_instances is the participation owner that replaced it.
        expect(entry!.writeTargets).toContain("process_instances");
    });

    it("leaves link_existing_child's declared bridge alone", () => {
        const entry = relationshipActionRegistryEntry("link_existing_child");
        expect(entry!.writeTargets).toContain("opportunity_customer_members");
    });
});
