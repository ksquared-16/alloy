import { describe, expect, it, vi } from "vitest";
import { findOrCreateChildPersonInOrg } from "@/lib/admin/person/findOrCreateChildPersonInOrg";

describe("findOrCreateChildPersonInOrg", () => {
    it("reuses person_id from matching active household child member", async () => {
        const householdQuery = {
            select: vi.fn(() => householdQuery),
            eq: vi.fn(() => householdQuery),
        };
        Object.defineProperty(householdQuery, "then", {
            value: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                Promise.resolve({
                    data: [
                        {
                            person_id: "person-existing",
                            first_name: "Sam",
                            last_name: "Lee",
                            dob: "2020-01-15",
                        },
                    ],
                    error: null,
                }).then(resolve),
            enumerable: false,
        });
        const personSelect = {
            select: vi.fn(() => personSelect),
            eq: vi.fn(() => personSelect),
            maybeSingle: vi.fn(async () => ({ data: { date_of_birth: "2020-01-15" }, error: null })),
        };
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "customer_members") return householdQuery;
                if (table === "persons") {
                    return {
                        select: vi.fn(() => personSelect),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            }),
        };

        const result = await findOrCreateChildPersonInOrg(supabase as never, {
            orgId: "org-1",
            customerId: "cust-1",
            firstName: "Sam",
            lastName: "Lee",
            dob: "2020-01-15",
        });

        expect(result).toEqual({
            person_id: "person-existing",
            created: false,
            source: "household_member",
        });
    });

    it("inserts a new person when no household or org match exists", async () => {
        const emptyHousehold = {
            select: vi.fn(() => emptyHousehold),
            eq: vi.fn(() => emptyHousehold),
        };
        Object.defineProperty(emptyHousehold, "then", {
            value: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                Promise.resolve({ data: [], error: null }).then(resolve),
            enumerable: false,
        });
        const emptyPersons = {
            select: vi.fn(() => emptyPersons),
            eq: vi.fn(() => emptyPersons),
            ilike: vi.fn(() => emptyPersons),
            limit: vi.fn(() => emptyPersons),
        };
        Object.defineProperty(emptyPersons, "then", {
            value: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                Promise.resolve({ data: [], error: null }).then(resolve),
            enumerable: false,
        });
        const insertQuery = {
            select: vi.fn(function select() {
                return this;
            }),
            single: vi.fn(async () => ({ data: { id: "person-new" }, error: null })),
        };
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "customer_members") return emptyHousehold;
                if (table === "persons") {
                    return {
                        select: vi.fn(() => emptyPersons),
                        insert: vi.fn(() => insertQuery),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            }),
        };

        const result = await findOrCreateChildPersonInOrg(supabase as never, {
            orgId: "org-1",
            customerId: "cust-1",
            firstName: "Riley",
            lastName: "Nguyen",
            dob: "2021-06-02",
        });

        expect(result).toEqual({
            person_id: "person-new",
            created: true,
            source: "insert",
        });
    });

    it("syncs persons.date_of_birth when reusing household member without person DOB", async () => {
        const householdQuery = {
            select: vi.fn(() => householdQuery),
            eq: vi.fn(() => householdQuery),
        };
        Object.defineProperty(householdQuery, "then", {
            value: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                Promise.resolve({
                    data: [
                        {
                            person_id: "person-existing",
                            first_name: "Sam",
                            last_name: "Lee",
                            dob: "2020-01-15",
                        },
                    ],
                    error: null,
                }).then(resolve),
            enumerable: false,
        });
        const personSelect = {
            select: vi.fn(() => personSelect),
            eq: vi.fn(() => personSelect),
            maybeSingle: vi.fn(async () => ({ data: { date_of_birth: null }, error: null })),
        };
        const personUpdate = {
            update: vi.fn(() => personUpdate),
            eq: vi.fn(async () => ({ error: null })),
        };
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "customer_members") return householdQuery;
                if (table === "persons") {
                    return {
                        select: vi.fn(() => personSelect),
                        update: personUpdate.update,
                    };
                }
                throw new Error(`unexpected table ${table}`);
            }),
        };

        await findOrCreateChildPersonInOrg(supabase as never, {
            orgId: "org-1",
            customerId: "cust-1",
            firstName: "Sam",
            lastName: "Lee",
            dob: "2020-01-15",
        });

        expect(personUpdate.update).toHaveBeenCalledWith({ date_of_birth: "2020-01-15" });
    });
});
