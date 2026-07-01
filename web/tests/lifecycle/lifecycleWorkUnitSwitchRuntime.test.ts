import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWaitlistCandidateGrainContext } from "@/lib/queues/candidateGrainWaitlistQueue";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { buildLifecycleWaitlistStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import { resolveDeptWorkUnitDisplayLabel } from "@/lib/workspace/workUnitShellDisplayTitle";
import {
    buildWorkUnitHref,
    logLifecycleWorkUnitPillClick,
} from "@/lib/lifecycle/lifecycleWorkUnitSwitchRuntime";
const root = resolve(__dirname, "../..");

function readLocal(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle work unit switch runtime", () => {
    it("buildWorkUnitHref encodes department and work unit", () => {
        expect(
            buildWorkUnitHref({
                workspaceBase: "/adminV2/workspace",
                departmentId: "dept-1",
                workUnitId: "wu-tour",
                selectedSiteId: "site-1",
            })
        ).toBe("/adminV2/workspace/dept/dept-1/work-unit/wu-tour?site_id=site-1");
    });

    it("dev pill click logger is no-op in test env", () => {
        expect(() =>
            logLifecycleWorkUnitPillClick({ from_work_unit_id: "a", to_work_unit_id: "b" })
        ).not.toThrow();
    });
});

describe("waitlist candidate grain for lifecycle waitlist WU", () => {
    it("resolves candidate grain for lifecycle_waitlist queue key", () => {
        const raw = buildLifecycleWaitlistStageQueueDefinition({
            stageKey: "waitlist",
            label: "Waitlist",
            statusKeys: ["waitlisted"],
        });
        const { normalized } = loadQueueDefinitionBundle(raw);
        const primary = normalized.queues[0]?.key ?? "";
        const ctx = resolveWaitlistCandidateGrainContext({
            normalized,
            executableQueueKey: primary,
        });
        expect(ctx).not.toBeNull();
        expect(ctx?.queueEntry.grain).toBe("candidate");
    });
});

describe("work unit page interaction wiring", () => {
    it("navigates lifecycle sibling pills to canonical route, warm-prep preserved (in-page switch removed)", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        // Sibling switching is navigation; the warm-prep (switch flag + stable sibling list) stays so
        // the destination mount hydrates instantly, but the in-page location/URL hack is gone.
        expect(page).toContain("router.push(siblingNavHref)");
        expect(page).toContain("setLifecycleWorkUnitSwitchPreserveSiblingsFlag(true)");
        expect(page).toContain("hasLifecycleInPageWorkUnitSwitchFlag()");
        expect(page).not.toContain("replaceWorkUnitLocationHref");
        expect(page).not.toContain("setActiveWorkUnitId");
    });

    it("Schedule Tour rail opens record picker then tour modal", () => {
        const page = readLocal("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("ADMINV2_OPEN_TOUR_SCHEDULE_MODAL");
        expect(page).toContain("WorkUnitScheduleTourRecordPickerModal");
        expect(page).toContain("openScheduleTourForOpportunity");
    });

    it("applyRegistryResolvedActionClient opens record picker without entity", () => {
        const client = readLocal("lib/admin/actions/applyRegistryResolvedActionClient.ts");
        expect(client).toContain("openScheduleTourRecordPicker");
        expect(client).toContain("isScheduleTourRegistryAction");
        expect(client).not.toContain("window.alert(msg)");
    });
});

describe("work unit label precedence", () => {
    it("renamed work unit name wins over stage metadata label", () => {
        expect(
            resolveDeptWorkUnitDisplayLabel({
                name: "New Leads",
                key: "lifecycle_wu_lead",
                metadata: { lifecycle_stage_label: "Lead" },
            })
        ).toBe("New Leads");
    });
});

describe("lifecycle builder stage reorder", () => {
    it("lifecycle-builder reorder_stage syncs work_units.sort_order", () => {
        const route = readLocal("app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts");
        expect(route).toContain("reorder_stage");
        expect(route).toContain("syncWorkUnitSortOrderFromBuilderStages");
    });

    it("LifecycleBuilderToolbar exposes stage reorder controls", () => {
        const toolbar = readLocal("components/adminV2/settings/lifecycle/LifecycleBuilderToolbar.tsx");
        expect(toolbar).toContain("reorder_stage");
    });

    it("LifecycleStageNav exposes visible stage reorder controls", () => {
        const nav = readLocal("components/adminV2/settings/lifecycle/LifecycleStageNav.tsx");
        expect(nav).toContain("lifecycle-stage-reorder-up");
        expect(nav).toContain("onReorderStage");
    });
});
