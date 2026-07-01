import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    createLifecycleProcess,
    emptyLifecycleBuilderV1,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle scratch setup reset", () => {
    it("empty lifecycle state when no metadata", () => {
        const config = lifecycleBuilderFromDepartmentMetadata(null);
        expect(config.processes).toHaveLength(0);
        expect(config.active_process_id).toBeNull();
    });

    it("create lifecycle starts with no stages", () => {
        const next = createLifecycleProcess("Billing", emptyLifecycleBuilderV1());
        const process = next.processes[0]!;
        expect(process.name).toBe("Billing");
        expect(process.stages).toHaveLength(0);
    });

    it("hub shows empty create form without department selector", () => {
        const hub = read("components/adminV2/settings/LifecycleHubClient.tsx");
        expect(hub).toContain("lifecycle-empty-state");
        expect(hub).toContain("LifecycleCreateForm");
        expect(hub).not.toContain("lifecycle-department-select");
        expect(hub).not.toContain("LifecycleBuilderToolbar");
        expect(hub).not.toContain("LifecycleStageSummary");
        expect(hub).not.toContain("LIFECYCLE_STAGE_ORDER");
    });

    it("landing offers start new and open existing", () => {
        const landing = read("components/adminV2/settings/lifecycle/LifecycleLanding.tsx");
        expect(landing).toContain("lifecycle-start-new");
        expect(landing).toContain("lifecycle-open-existing");
    });

    it("add first stage form collects name and optional description only", () => {
        const form = read("components/adminV2/settings/lifecycle/LifecycleAddStageForm.tsx");
        expect(form).toContain("lifecycle-add-stage-name");
        expect(form).toContain("lifecycle-add-stage-description");
        expect(form).not.toContain("lifecycle-add-stage-status");
        expect(form).toContain("Add your first stage");
    });

    it("stage setup wizard expands one step at a time", () => {
        const wizard = read("components/adminV2/settings/lifecycle/LifecycleStageSetupWizard.tsx");
        expect(wizard).toContain("lifecycle-stage-setup-wizard");
        expect(wizard).toContain("data-expanded");
        expect(wizard).toContain("Only one section is open at a time");
        expect(wizard).toMatch(/expandedStep === step\.id/);
    });

    it("page subtitle does not reference enrollment demo", () => {
        const page = read("app/adminV2/settings/business-processes/page.tsx");
        expect(page).not.toContain("Enrollment is the first working example");
        expect(page).toContain("BUSINESS_PROCESS_SETTINGS_PAGE_SUBTITLE");
    });

    it("GET lifecycle builder does not auto-seed enrollment", () => {
        const route = read("app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts");
        const getBlock = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function PATCH"));
        expect(getBlock).not.toContain("saveConfig(");
        expect(route).toContain("empty when never configured");
    });
});
