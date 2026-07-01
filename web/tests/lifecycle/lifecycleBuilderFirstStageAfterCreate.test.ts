import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    departmentMetadataHasLifecycleBuilderV1,
    lifecycleBuilderDepartmentNotFoundError,
    lifecycleBuilderDepartmentScopeError,
    lifecycleBuilderProcessNotFoundError,
    lifecycleBuilderV1MissingError,
} from "@/lib/lifecycle/lifecycleBuilderRouteErrors";
import { lifecycleCatalogId } from "@/lib/lifecycle/lifecycleCatalog";
import { buildIdentityForNewLifecycle } from "@/lib/lifecycle/lifecycleRuntimeIdentity";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle builder first stage after create", () => {
    it("create path returns runtimeDepartmentId and processId", () => {
        const client = read("lib/lifecycle/clientCreateLifecycleViaBuilder.ts");
        expect(client).toContain("runtimeDepartmentId");
        expect(client).toContain("processId: procJ.active_process.id");
        expect(client).toMatch(/return\s*\{[\s\S]*runtimeDepartmentId[\s\S]*processId/);
    });

    it("create form passes departmentId, processId, and lifecycleName to onCreated", () => {
        const form = read("components/adminV2/settings/lifecycle/LifecycleCreateForm.tsx");
        expect(form).toContain("lifecycleName: trimmed");
        expect(form).toContain("processId");
        expect(form).toContain("createLifecycleViaBuilderPath");
    });

    it("board hydrates identity from create result before add stage", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("buildIdentityForNewLifecycle");
        expect(board).toContain("result?.processId");
        expect(board).toContain("onIdentityChange(nextIdentity)");
        expect(board).toContain("lifecycle-add-stage-awaiting-identity");
        expect(board).toContain("!runtimeDepartmentId.trim() || !processId.trim()");
    });

    it("primary selects catalog row after create using returned ids", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("buildIdentityForNewLifecycle(deptId, procId, name)");
        expect(primary).toContain("lifecycleCatalogId(deptId, procId)");
        expect(primary).toContain("items.find((c) => c.id === id)");
        expect(primary).toContain("setCreatingNew(false)");
    });

    it("add stage PATCH uses trimmed department and process ids", () => {
        const form = read("components/adminV2/settings/lifecycle/LifecycleAddStageForm.tsx");
        expect(form).toContain('action: "add_stage"');
        expect(form).toContain("departmentId.trim()");
        expect(form).toContain("processId.trim()");
        expect(form).toContain("encodeURIComponent(dept)");
        expect(form).toContain("process_id: pid");
    });

    it("add stage does not reference enrollment department ids in create flow", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const createClient = read("lib/lifecycle/clientCreateLifecycleViaBuilder.ts");
        expect(board).not.toContain("04958a78");
        expect(createClient).not.toContain("enrollment");
    });

    it("lifecycle-builder route returns specific 404 messages", () => {
        const route = read("app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts");
        expect(route).toContain("lifecycleBuilderDepartmentScopeError");
        expect(route).toContain("lifecycleBuilderDepartmentNotFoundError");
        expect(route).toContain("requireProcessInConfig");
        expect(route).not.toMatch(/error:\s*"Not found"/);
    });

    it("lifecycle-builder route error helpers identify failure kind", () => {
        expect(lifecycleBuilderDepartmentScopeError("dept-a")).toContain("workspace scope");
        expect(lifecycleBuilderDepartmentNotFoundError("dept-a")).toContain("Department not found");
        expect(lifecycleBuilderV1MissingError("dept-a")).toContain("lifecycle_builder_v1");
        expect(lifecycleBuilderProcessNotFoundError("proc-1", "dept-a")).toContain("Process not found");
    });

    it("departmentMetadataHasLifecycleBuilderV1 detects missing config key", () => {
        expect(departmentMetadataHasLifecycleBuilderV1({})).toBe(false);
        expect(departmentMetadataHasLifecycleBuilderV1({ lifecycle_builder_v1: { version: 1 } })).toBe(
            true
        );
    });

    it("new lifecycle identity uses returned department and process for catalog id", () => {
        const deptId = "11111111-1111-4111-8111-111111111111";
        const procId = "22222222-2222-4222-8222-222222222222";
        const identity = buildIdentityForNewLifecycle(deptId, procId, "Billing");
        expect(identity.runtimeDepartmentId).toBe(deptId);
        expect(identity.processId).toBe(procId);
        expect(identity.lifecycleId).toBe(lifecycleCatalogId(deptId, procId));
    });
});
