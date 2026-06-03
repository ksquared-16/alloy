import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function readLocal(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle runtime action placement isolation", () => {
    it("dept page requests department surface only", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain('placementSurfaces: ["department"]');
    });

    it("work-unit page requests work_unit surface only", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain('placementSurfaces: ["work_unit"]');
    });

    it("dept operational-bootstrap resolves department placements only", () => {
        const route = readLocal("app/api/admin/departments/[departmentId]/operational-bootstrap/route.ts");
        expect(route).toContain('placementSurfaces: ["department"]');
    });

    it("right-rail-bundle passes surfaces query to server loader", () => {
        const fetch = readLocal("lib/workspace/fetchWorkspaceRightRailResolvedActions.ts");
        expect(fetch).toContain('qs.set("surfaces"');
        const server = readLocal("lib/workspace/loadRightRailActionsBundleServer.ts");
        expect(server).toContain("placementSurfaces");
    });
});

describe("lifecycle in-page work unit pill switch", () => {
    it("uses history.replaceState and activeWorkUnitId without router.replace for sibling pills", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("replaceWorkUnitLocationHref(href)");
        expect(page).toContain("setActiveWorkUnitId(lifecycleNavWuId)");
        expect(page).not.toMatch(
            /parseLifecycleWorkUnitNavChipKey[\s\S]{0,600}router\.replace\(href/
        );
    });

    it("sibling pill click resolves target primary queue key and blocks nav token API fetch", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("resolveLifecycleWorkUnitPrimaryQueueKey");
        expect(page).toContain("lifecycle-wu-queue-fetch-blocked");
        expect(page).toContain('setSelectedQueueKeyTraced("lifecycleWuNav"');
        expect(page).toMatch(/fetchQueueItems\(\s*lifecycleNavWuId,\s*targetQueueKey/);
        expect(page).toMatch(/lifecycleNavWuId === workUnitId\) return/);
    });

    it("preserves right rail on in-page lifecycle switch", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("consumeLifecycleInPageWorkUnitSwitchFlag");
        expect(page).toMatch(/inPageLifecycleSwitch[\s\S]{0,400}fetchWorkspaceRightRailResolvedActions/);
    });

    it("dept and work-unit sibling order share deptOrderedLifecycleSiblingSource", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("orderLifecycleSiblingNavRows");
        expect(page).toContain("deptOrderedLifecycleSiblingSource");
    });
});

describe("schedule tour record picker", () => {
    it("work-unit page opens picker modal when no record selected", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("WorkUnitScheduleTourRecordPickerModal");
        expect(page).toContain("setScheduleTourPickerOpen(true)");
        expect(page).toContain("openScheduleTourForOpportunity");
        const modal = readLocal("components/admin/workspace/WorkUnitScheduleTourRecordPickerModal.tsx");
        expect(modal).toContain("searchScheduleTourAccessibleRecords");
    });

    it("department page wires accessible-record picker for rail schedule tour", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(page).toContain("WorkUnitScheduleTourRecordPickerModal");
        expect(page).toContain("openScheduleTourRecordPicker");
    });
});
