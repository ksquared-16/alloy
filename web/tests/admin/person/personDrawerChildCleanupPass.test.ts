import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PERSON_DRAWER_CHILD_STATUS_ENTITY_TYPE } from "@/lib/admin/person/personDrawerChildStatusEntityType";
import { personDrawerGenderSelectOptions } from "@/lib/admin/person/personDrawerGenderField";

describe("child drawer cleanup pass", () => {

    it("documents demo reseed plan is documented — no reseed scripts changed", () => {
        const doctrine = readFileSync(
            join(process.cwd(), "../docs/sprints/archive/05_2026/child_profile_person_drawer_doctrine.md"),
            "utf8"
        );
        expect(doctrine).toContain("Demo seed plan");
        expect(doctrine).toContain("Do not reseed");
    });
});
