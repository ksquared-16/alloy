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

describe("Lifecycle hub", () => {
    it("Settings index includes Lifecycle hero tile", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("Enrollment Operations");
        expect(page).toContain('title="Business Processes"');
        expect(page).toContain("/adminV2/settings/lifecycle");
        expect(page).toContain('emphasis');
        expect(page).not.toContain('title="Enrollment Process"');
    });

    it("enrollment-process route redirects to lifecycle", () => {
        const page = read("app/adminV2/settings/enrollment-process/page.tsx");
        expect(page).toContain("redirect");
        expect(page).toContain("ADMIN_V2_SETTINGS_LIFECYCLE_PATH");
    });

    it("lifecycle page renders operator title and hub client", () => {
        const page = read("app/adminV2/settings/lifecycle/page.tsx");
        const types = read("lib/lifecycle/lifecycleProcessTypes.ts");
        expect(page).toContain("settings-lifecycle-page");
        expect(page).toContain("LifecycleHubClient");
        expect(page).toContain("Build processes from scratch");
        expect(types).toContain('settingsPath: "/adminV2/settings/lifecycle"');
        expect(types).toContain('title: "Enrollment"');
    });

    it("hub client exposes scratch setup workbench", () => {
        const hub = read("components/adminV2/settings/LifecycleHubClient.tsx");
        const createForm = read("components/adminV2/settings/lifecycle/LifecycleCreateForm.tsx");
        const wizard = read("components/adminV2/settings/lifecycle/LifecycleStageSetupWizard.tsx");
        const statuses = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageStatusesCard.tsx");
        expect(hub).toContain("lifecycle-hub");
        expect(hub).toContain("LifecycleCreateForm");
        expect(hub).toContain("LifecycleStageSetupWizard");
        expect(hub).toContain("LifecycleWorkbenchHeader");
        expect(hub).not.toContain("lifecycle-department-select");
        expect(hub).not.toContain("LifecycleBuilderToolbar");
        expect(hub).not.toContain("LIFECYCLE_STAGE_ORDER");
        expect(createForm).toContain("lifecycle-create-lifecycle");
        expect(wizard).toContain("lifecycle-stage-setup-wizard");
        expect(statuses).toContain("Work Unit Queue filter");
        expect(read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx")).toContain(
            "lifecycle-create-work-unit"
        );
        expect(read("app/api/admin/enrollment-process/status-stages/route.ts")).toContain(
            "syncDepartmentQueueForStage"
        );
    });

    it("status-stages API route supports GET and PATCH", () => {
        const route = read("app/api/admin/enrollment-process/status-stages/route.ts");
        expect(route).toContain("buildEnrollmentStatusStagesPayload");
        expect(route).toContain("reset_stage");
        expect(route).toContain("status_keys");
        expect(route).toContain("ensureOrgOpportunityStatusRow");
    });

    it("work unit card supports in-hub create without manual sync", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).toContain("Work Units &amp; Queues");
        expect(card).toContain("lifecycle-create-work-unit");
        expect(card).toContain("lifecycle-work-unit-queue-copy");
        expect(card).not.toContain("lifecycle-sync-queue-statuses");
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
            resolve(root, "../docs/sprints/06_2026/lifecycle_builder_architecture_reality_check_v1.md"),
            "utf8"
        );
        expect(doc).toContain("lifecycle");
    });

    it("cross-link banners point to lifecycle hub", () => {
        const banner = read("components/adminV2/settings/LifecycleSettingsCrossLinkBanner.tsx");
        expect(banner).toContain("ADMIN_V2_SETTINGS_LIFECYCLE_PATH");
        expect(banner).toContain("Open Lifecycle");
    });
});
