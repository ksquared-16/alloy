import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../..");

describe("dept operational bootstrap runtime hardening", () => {
    it("exposes operational-bootstrap admin route", () => {
        const routePath = path.join(
            repoRoot,
            "web/app/api/admin/departments/[departmentId]/operational-bootstrap/route.ts"
        );
        expect(fs.existsSync(routePath)).toBe(true);
        const src = fs.readFileSync(routePath, "utf8");
        expect(src).toContain("loadAdminRouteGate");
        expect(src).toContain("loadDeptOperationalBootstrap");
    });

    it("bootstrap loader shares work unit ids with queue summaries", () => {
        const loaderPath = path.join(repoRoot, "web/lib/workspace/loadDeptOperationalBootstrap.ts");
        const src = fs.readFileSync(loaderPath, "utf8");
        expect(src).toContain("workUnitIds");
        expect(src).toContain("resolveDeptPipelineExecSurfaceServer");
        expect(src).toContain("loadDeptAttentionPreviewServer");
    });

    it("dept page prefers operational-bootstrap over legacy fan-out", () => {
        const pagePath = path.join(
            repoRoot,
            "web/app/adminV2/workspace/dept/[departmentId]/page.tsx"
        );
        const src = fs.readFileSync(pagePath, "utf8");
        expect(src).toContain("operational-bootstrap");
        expect(src).toContain("bootstrap_ready");
        expect(src.indexOf("operational-bootstrap")).toBeLessThan(src.indexOf("legacy fan-out"));
    });

    it("getDepartmentWorkUnitQueueSummaries accepts preset work unit ids", () => {
        const svcPath = path.join(repoRoot, "web/lib/queues/QueueService.ts");
        const src = fs.readFileSync(svcPath, "utf8");
        expect(src).toContain("workUnitIds?: string[]");
        expect(src).toContain("skipWuListQuery");
    });
});
