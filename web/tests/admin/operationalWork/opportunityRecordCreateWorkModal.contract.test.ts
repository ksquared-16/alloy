import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const modal = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/opportunity/OpportunityRecordCreateWorkModal.tsx"
);
const client = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../lib/admin/actions/applyRegistryResolvedActionClient.ts"
);
const vmRegistryModals = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals.tsx"
);
const drawerRouter = join(dirname(fileURLToPath(import.meta.url)), "../../../components/admin/AdminEntityDrawer.tsx");

describe("OpportunityRecordCreateWorkModal", () => {
    it("uses operator language and posts through operational task API", () => {
        const src = readFileSync(modal, "utf8");
        expect(src).toContain("Create work");
        expect(src).toContain("What needs to happen?");
        expect(src).toContain("Type of work");
        expect(src).toContain("createOperationalTask");
        expect(src).toContain('source: "manual"');
        expect(src).toContain("OperationalWorkAssigneeSelect");
        expect(src).toContain("assignedToUserId");
        expect(src).toContain("data-operational-work-create-submit");
        expect(src).not.toContain("work_framework_version");
        expect(src).not.toContain("provenance");
    });
});

describe("create_task registry routing", () => {
    it("opens record create work modal instead of tasks panel when entity is known", () => {
        const src = readFileSync(client, "utf8");
        expect(src).toContain('actionKey === "create_task"');
        expect(src).toContain("ADMIN_V2_OPEN_CREATE_WORK_MODAL");
        expect(src).toContain("host.openCreateWork");
        expect(src).not.toMatch(/create_task[\s\S]*adminv2:open-tasks-panel[\s\S]*opportunity_id: eid \|\| null/);
    });

    it("VM opportunity drawer mounts create work modal and listens for open event", () => {
        const runtime = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), "../../../components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx"),
            "utf8"
        );
        const host = readFileSync(vmRegistryModals, "utf8");
        expect(runtime).toContain("useOpportunityDrawerVmRegistryModals");
        expect(host).toContain("OpportunityRecordCreateWorkModal");
        expect(host).toContain("ADMIN_V2_OPEN_CREATE_WORK_MODAL");
        expect(host).toContain("openCreateWorkDirect");
        expect(runtime).toContain("data-vm-drawer-action-modals-host");
        expect(runtime).toContain("overlayChildren");
        expect(readFileSync(drawerRouter, "utf8")).toContain("OpportunityDrawerVmRuntime");
    });
});
