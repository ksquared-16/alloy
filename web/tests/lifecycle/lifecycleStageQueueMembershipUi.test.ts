/**
 * Lifecycle stage workspace — queue membership editor wiring.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle stage queue membership UI", () => {
    it("stage workspace exposes Stage Membership section", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_MEMBERSHIP");
        expect(workspace).toContain("LifecycleStageQueueMembershipEditor");
        expect(workspace).toContain('id="membership"');
    });

    it("unified save includes queue_membership_v1 when dirty", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("isQueueMembershipDirty");
        expect(board).toContain("queue_membership_v1");
    });

    it("stage-runtime-config accepts queue_membership_v1", () => {
        const route = read("app/api/admin/enrollment-process/stage-runtime-config/route.ts");
        expect(route).toContain("queue_membership_v1");
        expect(route).toContain("parseQueueMembershipV1");
    });

    it("bootstrap includes queue membership payload", () => {
        const bootstrap = read("lib/lifecycle/buildLifecycleStageBootstrap.ts");
        expect(bootstrap).toContain("queue_membership");
        expect(bootstrap).toContain("queue_membership_status_options");
    });
});
