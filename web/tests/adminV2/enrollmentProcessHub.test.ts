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
    it("Settings index includes Business Processes under Operations", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain('label="Operations"');
        expect(page).toContain('title="Business Processes"');
        expect(page).toContain("/admin/settings/lifecycle");
        expect(page).not.toContain('title="Enrollment Process"');
    });

    it("enrollment-process route redirects to lifecycle", () => {
        const page = read("app/adminV2/settings/enrollment-process/page.tsx");
        expect(page).toContain("redirect");
        expect(page).toContain("ADMIN_V2_SETTINGS_LIFECYCLE_PATH");
    });

    it("lifecycle page renders Business Processes primary shell", () => {
        const page = read("app/adminV2/settings/lifecycle/page.tsx");
        expect(page).toContain("settings-lifecycle-page");
        expect(page).toContain("LifecycleSettingsShell");
        expect(page).toContain("BUSINESS_PROCESS_SETTINGS_PAGE_TITLE");
    });

    it("advanced hub exposes legacy workbench behind toggle", () => {
        const shell = read("components/adminV2/settings/LifecycleSettingsShell.tsx");
        const hub = read("components/adminV2/settings/LifecycleHubClient.tsx");
        expect(shell).toContain("LifecycleActivationClient");
        expect(shell).toContain("lifecycle-advanced-configuration");
        expect(hub).toContain("lifecycle-hub");
        expect(read("app/api/admin/enrollment-process/status-stages/route.ts")).toContain(
            "persistEnrollmentStageStatusAssignments"
        );
    });

    it("status-stages API route supports GET and PATCH", () => {
        const route = read("app/api/admin/enrollment-process/status-stages/route.ts");
        expect(route).toContain("buildEnrollmentStatusStagesPayload");
        expect(route).toContain("reset_stage");
        expect(route).toContain("status_keys");
        expect(route).toContain("process_stage_key");
    });

    it("work unit card supports create and queue view copy", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).toContain("lifecycle-create-work-unit");
        expect(card).toContain("lifecycle-queue-view-copy");
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

    it("settings v2 doctrine doc exists", () => {
        const doc = readFileSync(resolve(root, "../docs/system/settings-v2-doctrine.md"), "utf8");
        expect(doc).toContain("Business Processes");
        expect(doc).toContain("Data Model");
    });

    it("cross-link banners point to business processes", () => {
        const banner = read("components/adminV2/settings/LifecycleSettingsCrossLinkBanner.tsx");
        expect(banner).toContain("ADMIN_V2_SETTINGS_LIFECYCLE_PATH");
        expect(banner).toContain("BUSINESS_PROCESS_CROSS_LINK_OPEN");
    });
});
