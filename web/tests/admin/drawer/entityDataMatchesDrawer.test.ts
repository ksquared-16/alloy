import { describe, expect, it } from "vitest";
import { entityDataMatchesDrawer } from "@/lib/admin/drawer/entityDataMatchesDrawer";

describe("entityDataMatchesDrawer", () => {
    const PERSON_ID = "11111111-1111-4111-8111-111111111111";
    const OPP_ID = "22222222-2222-4222-8222-222222222222";

    it("requires matching id for persons drawer (rejects stale opportunity row)", () => {
        expect(
            entityDataMatchesDrawer({ id: OPP_ID, name: "Household" } as Record<string, unknown>, PERSON_ID, "persons")
        ).toBe(false);
        expect(
            entityDataMatchesDrawer(
                { id: PERSON_ID, first_name: "Jordan" } as Record<string, unknown>,
                PERSON_ID,
                "persons"
            )
        ).toBe(true);
    });

    it("rejects persons drawer when row id is missing", () => {
        expect(entityDataMatchesDrawer({ first_name: "Jordan" } as Record<string, unknown>, PERSON_ID, "persons")).toBe(
            false
        );
    });
});
