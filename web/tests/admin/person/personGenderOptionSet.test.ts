import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { personDrawerGenderSelectOptions } from "@/lib/admin/person/personDrawerGenderField";

describe("person gender option set", () => {
    it("migration normalizes person_gender to Male, Female, Not Specified", () => {
        const sql = readFileSync(
            join(process.cwd(), "../supabase/migrations/20260602150000_demo_kurzman_cleanup_person_gender_options.sql"),
            "utf8"
        );
        expect(sql).toContain("'person_gender'");
        expect(sql).toContain("'not_specified'");
        expect(sql).toContain("'Not Specified'");
        expect(sql).toContain("'non_binary'");
        expect(sql).toContain("'prefer_not_to_say'");
        expect(sql).toContain("vendors");
        expect(sql).toContain("primary_person_id = NULL");
    });

    it("drawer reads gender options from field_definitions config", () => {
        const options = personDrawerGenderSelectOptions({
            _field_definitions: [
                {
                    field_key: "gender",
                    field_type: "select",
                    config: {
                        option_set_key: "person_gender",
                        options: [
                            { value: "male", label: "Male" },
                            { value: "female", label: "Female" },
                            { value: "not_specified", label: "Not Specified" },
                        ],
                    },
                },
            ],
        });
        expect(options.map((o) => o.label)).toEqual(["Male", "Female", "Not Specified"]);
    });

    it("fallback options match canonical labels when definitions missing", () => {
        const options = personDrawerGenderSelectOptions({});
        expect(options.map((o) => o.label)).toEqual(["Male", "Female", "Not Specified"]);
    });
});
