import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Statuses enrollment stage integration", () => {
    it("StatusesClient shows Enrollment Stage column for opportunities", () => {
        const client = read("app/admin/system/statuses/StatusesClient.tsx");
        expect(client).toContain("Enrollment Stage");
        expect(client).toContain("statuses-opportunities-table");
        expect(client).toContain("enrollmentProcessStageDisplayLabel");
        expect(client).toContain("Manage in Enrollment Process");
        expect(client).not.toContain("enrollment_operator_stage");
    });

    it("form-coverage and stage-actions API routes exist", () => {
        expect(read("app/api/admin/enrollment-process/form-coverage/route.ts")).toContain(
            "buildEnrollmentProcessFormCoverageRows"
        );
        expect(read("app/api/admin/enrollment-process/stage-actions/route.ts")).toContain(
            "buildEnrollmentProcessStageActionRows"
        );
    });

    it("hub uses live forms and actions cards", () => {
        const hub = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessHubClient.tsx");
        expect(hub).toContain("EnrollmentProcessFormsCoverageCard");
        expect(hub).toContain("EnrollmentProcessActionsCard");
        expect(hub).toContain("enrollment-process-bos-suggest-stage-setup");
        expect(hub).not.toContain("LIFECYCLE_STAGE_TYPICAL_ACTIONS");
    });
});
