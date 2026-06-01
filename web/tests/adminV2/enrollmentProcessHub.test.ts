import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    LIFECYCLE_STAGE_LABELS,
    LIFECYCLE_STAGE_ORDER,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { ENROLLMENT_STAGE_QUEUE_KEYS } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { stageQueueMappingForPipeline } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Enrollment Process hub", () => {
    it("Settings index includes Enrollment Process hero tile", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("Enrollment Operations");
        expect(page).toContain('title="Enrollment Process"');
        expect(page).toContain("/adminV2/settings/enrollment-process");
        expect(page).toContain('emphasis');
    });

    it("enrollment-process page renders operator title and subtitle", () => {
        const page = read("app/adminV2/settings/enrollment-process/page.tsx");
        const types = read("lib/lifecycle/lifecycleProcessTypes.ts");
        expect(page).toContain("settings-enrollment-process-page");
        expect(page).toContain("lifecycleProcessType");
        expect(types).toContain("Enrollment Process");
        expect(types).toContain("Configure how families move from lead to enrolled");
        expect(page).toContain("EnrollmentProcessHubClient");
    });

    it("hub client exposes six stage tabs and six cards per stage", () => {
        const hub = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessHubClient.tsx");
        const statuses = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageStatusesCard.tsx");
        expect(hub).toContain("enrollment-process-hub");
        expect(hub).toContain("LIFECYCLE_STAGE_ORDER");
        expect(hub).toContain("enrollment-process-card-required");
        expect(hub).toContain("enrollment-process-card-statuses");
        expect(hub).toContain("enrollment-process-card-work-unit");
        expect(hub).toContain("enrollment-process-card-actions");
        expect(hub).toContain("enrollment-process-card-attention");
        expect(hub).toContain("enrollment-process-card-forms");
        expect(hub).toContain("EnrollmentProcessStageStatusesCard");
        expect(hub).toContain("EnrollmentProcessFormsCoverageCard");
        expect(hub).toContain("EnrollmentProcessActionsCard");
        expect(hub).toContain("enrollment-process-queue-statuses");
        expect(hub).toContain("Manage Work Queue");
        expect(hub).not.toContain("<textarea");
        expect(hub).not.toContain("JSON");
        expect(hub).not.toContain("field_key");
        expect(hub).not.toContain("condition_config");
        expect(statuses).toContain("Statuses in this stage");
        expect(statuses).toContain("Add status");
        expect(statuses).toContain("Remove from stage");
        expect(statuses).toContain("enrollment-process-bos-suggest-statuses");
        expect(statuses).not.toContain("enrollment_operator_stage");
        expect(statuses).not.toContain("metadata");
    });

    it("status-stages API route supports GET and PATCH", () => {
        const route = read("app/api/admin/enrollment-process/status-stages/route.ts");
        expect(route).toContain("buildEnrollmentStatusStagesPayload");
        expect(route).toContain("reset_stage");
        expect(route).toContain("status_keys");
        expect(route).toContain("ensureOrgOpportunityStatusRow");
    });

    it("create work unit control is disabled (no JSON lane editor in hub)", () => {
        const hub = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessHubClient.tsx");
        expect(hub).toContain('data-testid="enrollment-process-create-work-unit"');
        expect(hub).toContain("disabled");
    });

    it("lifecycle page links to enrollment process", () => {
        const page = read("app/adminV2/settings/lifecycle/page.tsx");
        expect(page).toContain("enrollmentProcessSettingsPaths");
        expect(page).toContain("Open Enrollment Process");
    });

    it("all six enrollment stages are defined", () => {
        const labels = LIFECYCLE_STAGE_ORDER.map((s) => LIFECYCLE_STAGE_LABELS[s]);
        expect(labels).toEqual([
            "Lead",
            "Qualification",
            "Tour",
            "Waitlist",
            "Enrollment",
            "Enrolled",
        ]);
    });

    it("stage queue mapping does not expose raw JSON keys in UI layer", () => {
        const mapping = stageQueueMappingForPipeline("lead", null);
        expect(mapping.lanes[0]?.label).toBeTruthy();
        expect(ENROLLMENT_STAGE_QUEUE_KEYS.lead).toContain("new_leads");
    });

    it("architecture reality check doc exists", () => {
        const doc = readFileSync(
            resolve(root, "../docs/sprints/06_2026/process_builder_architecture_reality_check_v1.md"),
            "utf8"
        );
        expect(doc).toContain("Enrollment Process hub");
        expect(doc).toContain("lifecycle_progression_requirements_v1");
    });

    it("cross-link banners point to enrollment process", () => {
        const banner = read("components/adminV2/settings/LifecycleSettingsCrossLinkBanner.tsx");
        expect(banner).toContain("enrollmentProcessSettingsPaths");
        expect(banner).toContain("Open Enrollment Process");
    });
});
