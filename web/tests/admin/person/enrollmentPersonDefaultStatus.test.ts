import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENROLLMENT_INTAKE_PERSON_STATUS_KEY } from "@/lib/admin/person/enrollmentPersonDefaultStatus";
import { DEFAULT_LEAD_CASE_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";

describe("enrollmentPersonDefaultStatus wiring", () => {
    it("create lead sets open case status and pre_enrolled person default", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/admin/actions/entryLifecycleActions.ts"),
            "utf8"
        );
        expect(src).toContain("DEFAULT_LEAD_CASE_STATUS_KEY");
        expect(src).toContain("ENROLLMENT_INTAKE_PERSON_STATUS_KEY");
        expect(src).toContain("default_status_key_on_create");
        expect(DEFAULT_LEAD_CASE_STATUS_KEY).toBe("open");
        expect(ENROLLMENT_INTAKE_PERSON_STATUS_KEY).toBe("pre_enrolled");
    });

    it("create lead child OCM sets enrollment outcome_status_key", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/admin/actions/createLeadChildOcmPersistence.ts"),
            "utf8"
        );
        expect(src).toContain("outcome_status_key: NEW_LEAD_STATUS_KEY");
    });

    it("reseed script requires EXECUTE flag", () => {
        const src = readFileSync(
            join(process.cwd(), "scripts/reseedStatusDefinitionsForOrg.ts"),
            "utf8"
        );
        expect(src).toContain("EXECUTE");
        expect(src).toContain("Dry run complete");
    });
});
