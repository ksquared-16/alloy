import { describe, expect, it } from "vitest";
import {
    buildPersonDrawerSeedRecord,
    isPersonDrawerSeedRecord,
    personDrawerOpenSeedFromContactValues,
    personDrawerSeedFromOpportunityRecord,
} from "@/lib/admin/drawer/personDrawerOpenSeed";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";

describe("personDrawerOpenSeed", () => {
    it("builds seed record with display name for first paint", () => {
        const record = buildPersonDrawerSeedRecord({
            personId: PERSON_ID,
            first_name: "Jane",
            last_name: "Doe",
            email: "jane@example.com",
            phone: "555-0100",
        });
        expect(record.id).toBe(PERSON_ID);
        expect(record._person_name).toBe("Jane Doe");
        expect(record.email).toBe("jane@example.com");
        expect(isPersonDrawerSeedRecord(record)).toBe(true);
    });

    it("derives seed from opportunity primary person mirror fields", () => {
        const seed = personDrawerSeedFromOpportunityRecord(
            {
                id: "opp-1",
                primary_person_id: PERSON_ID,
                _primary_person_name: "Jane Doe",
                _primary_person_email: "jane@example.com",
                _primary_person_phone: "555-0100",
            },
            PERSON_ID
        );
        expect(seed).toMatchObject({
            personId: PERSON_ID,
            display_name: "Jane Doe",
            email: "jane@example.com",
            phone: "555-0100",
        });
    });

    it("maps contact card values to open seed", () => {
        expect(
            personDrawerOpenSeedFromContactValues(PERSON_ID, {
                first_name: "Sam",
                last_name: "Lee",
                email: "sam@example.com",
                phone: "",
                display_name: "Sam Lee",
            })
        ).toMatchObject({
            personId: PERSON_ID,
            first_name: "Sam",
            last_name: "Lee",
            email: "sam@example.com",
        });
    });
});
