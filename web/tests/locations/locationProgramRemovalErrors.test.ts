import { describe, expect, it } from "vitest";
import { operatorProgramError } from "@/lib/programs/programsOperatorPresentation";

describe("operatorProgramError location offering removal", () => {
    it("does not map enrollment blocks to highlighted-fields copy", () => {
        const message =
            "This Program cannot be removed from North Campus because it has active enrollments.";
        expect(operatorProgramError(message)).toBe(message);
    });

    it("maps foreign-key failures to Not offered guidance", () => {
        expect(
            operatorProgramError('update or delete on table "location_program_categories" violates foreign key constraint'),
        ).toMatch(/Not offered/i);
    });
});
