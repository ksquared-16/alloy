import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
    __dirname,
    "../../../../supabase/migrations/20260529160000_location_metadata_field_definitions_convergence.sql"
);

describe("location metadata field_definitions migration", () => {
    const sql = readFileSync(migrationPath, "utf8");

    it("seeds all required location metadata field keys", () => {
        for (const key of [
            "category",
            "age_range_from",
            "age_range_to",
            "age_range_unit",
            "capacity",
            "student_teacher_ratio",
            "director_name",
            "director_email",
            "site_phone",
        ]) {
            expect(sql).toContain(`'${key}'`);
        }
    });

    it("uses metadata storage and option sets for selects", () => {
        expect(sql).toContain('"storage":"metadata"');
        expect(sql).toContain('"option_set_key":"childcare_program_type"');
        expect(sql).toContain('"option_set_key":"location_age_range_unit"');
        expect(sql).toContain("'location_age_range_unit'");
        expect(sql).toContain("'months'");
        expect(sql).toContain("'years'");
    });

    it("uses canonical labels and capacity number type", () => {
        expect(sql).toContain("'Student:Teacher Ratio'");
        expect(sql).toContain("'Age range unit'");
        expect(sql).toContain("'number'");
        expect(sql).toContain("'site_metadata'");
        expect(sql).toContain("'room_metadata'");
    });
});
