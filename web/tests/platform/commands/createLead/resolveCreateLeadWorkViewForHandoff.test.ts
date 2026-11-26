import { describe, expect, it } from "vitest";
import { resolveCreateLeadWorkViewForHandoff } from "@/lib/platform/commands/createLead/resolveCreateLeadWorkViewForHandoff";

function deptMetadata(workViews: Array<Record<string, unknown>>): unknown {
    return {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    stages: [{ key: "lead", label: "Lead", is_active: true }],
                    work_views_v1: workViews,
                },
            ],
        },
    };
}

describe("resolveCreateLeadWorkViewForHandoff", () => {
    it("resolves Leads work view by compat_queue_key new_leads to label route key", () => {
        const handoff = resolveCreateLeadWorkViewForHandoff({
            departmentMetadata: deptMetadata([
                {
                    id: "new_leads",
                    label: "Leads",
                    compat_queue_key: "new_leads",
                    visible_in_runtime: true,
                    display_order: 1,
                },
            ]),
            statusKey: "new",
            stageKey: "lead",
        });
        expect(handoff).toEqual({
            workViewId: "new_leads",
            workViewRouteKey: "leads",
        });
    });
});
