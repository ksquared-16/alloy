import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY,
    PERSON_DRAWER_CHILD_START_DATE_KEY,
} from "@/lib/admin/person/personDrawerChildLifecycleFields";
import { personDrawerGenderSelectOptions } from "@/lib/admin/person/personDrawerGenderField";

describe("child drawer operational pass", () => {

    it("header lead pill uses Lead label — not child status text", () => {
        const executive = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildHeaderExecutive.tsx"),
            "utf8"
        );
        expect(executive).toContain("personDrawerChildLeadPillLabel");
        expect(executive).not.toContain("Family Lead:");
        expect(executive).not.toContain("Enrollment Tour Scheduled");
        expect(executive).not.toContain('aria-label="Enrollment"');
    });

    it("seeds person child lifecycle statuses and date fields", () => {
        const migration = readFileSync(
            join(process.cwd(), "../supabase/migrations/20260530120000_person_child_lifecycle_statuses_and_dates.sql"),
            "utf8"
        );
        expect(migration).toContain("'persons'");
        expect(migration).toContain("'future_start'");
        expect(migration).toContain("'enrollment_date'");
        expect(migration).toContain("'start_date'");
    });
});
