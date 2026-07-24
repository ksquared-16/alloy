import { describe, expect, it } from "vitest";
import {
    isMissingColumnError,
    resolveProgramRevisionIdFromRow,
    stripUnavailableProgramCategoryPatchFields,
} from "@/lib/locations/locationProgramCategorySelect";

describe("locationProgramCategorySelect", () => {
    it("detects missing-column PostgREST errors", () => {
        expect(isMissingColumnError({ code: "42703", message: "column x does not exist" })).toBe(true);
        expect(
            isMissingColumnError({
                message: "Could not find the 'program_revision_id' column of 'location_program_categories' in the schema cache",
            }),
        ).toBe(true);
        expect(isMissingColumnError({ message: "permission denied" })).toBe(false);
    });

    it("resolves publication or assignment revision ids", () => {
        expect(resolveProgramRevisionIdFromRow({ program_revision_id: "pub-1" })).toBe("pub-1");
        expect(
            resolveProgramRevisionIdFromRow({
                assigned_program_revision_id: "asg-1",
                consumed_program_revision_id: "con-1",
            }),
        ).toBe("asg-1");
        expect(resolveProgramRevisionIdFromRow({ consumed_program_revision_id: "con-1" })).toBe("con-1");
        expect(resolveProgramRevisionIdFromRow({})).toBeNull();
    });

    it("strips publication-only patch fields when the column is missing", () => {
        const stripped = stripUnavailableProgramCategoryPatchFields(
            {
                updated_at: "t",
                label: "Infant",
                local_description_override: "Downtown",
            },
            { message: "column local_description_override does not exist" },
        );
        expect(stripped).toEqual({ updated_at: "t", label: "Infant" });
    });
});
