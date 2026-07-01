import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { buildLifecycleWaitlistStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import {
    buildLifecycleBuilderOwnedAboveFoldHeaderSections,
    buildLifecycleSiblingNavRowsFromDepartmentWorkUnits,
    filterActiveLifecycleSiblingWorkUnits,
    isLifecycleWorkUnitNavChipKey,
    lifecycleWorkUnitNavChipKey,
    orderLifecycleSiblingNavRows,
    parseLifecycleWorkUnitNavChipKey,
    resolveLifecycleSiblingPillLabel,
    resolveLifecycleWorkUnitPrimaryQueueKey,
} from "@/lib/lifecycle/lifecycleWorkUnitShellPills";
import { resolveWorkUnitFetchQueueKeyFromPill } from "@/lib/adminV2/workUnitQueueSelection";
import { buildWorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/buildWorkUnitAboveFoldRenderModel";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycleWorkUnitShellPills", () => {
    it("shows all sibling lifecycle work units with current selected", () => {
        const sections = buildLifecycleBuilderOwnedAboveFoldHeaderSections({
            siblings: [
                { id: "wu-lead", name: "Lead", key: "lifecycle_wu_lead", total: 17 },
                { id: "wu-qual", name: "Qualification", key: "lifecycle_wu_qualification", total: 3 },
            ],
            currentWorkUnitId: "wu-lead",
            selectedQueueKey: "lead",
        });
        expect(sections.map((s) => s.label)).toEqual(["Work Units"]);
        const wu = sections[0]!;
        expect(wu.chips.map((c) => c.label)).toEqual(["Lead", "Qualification"]);
        expect(wu.chips[0]?.selected).toBe(true);
        expect(wu.chips[1]?.selected).toBe(false);
        expect(wu.chips[0]?.lifecycle_work_unit_nav_id).toBe("wu-lead");
    });

    it("parses lifecycle work unit nav chip keys for routing", () => {
        const key = lifecycleWorkUnitNavChipKey("abc-123");
        expect(parseLifecycleWorkUnitNavChipKey(key)).toBe("abc-123");
    });

    it("work_units.name wins over stage metadata for pill label", () => {
        expect(
            resolveLifecycleSiblingPillLabel({
                name: "New Leads",
                key: "lifecycle_wu_lead",
                metadata: { lifecycle_stage_label: "Lead" },
            })
        ).toBe("New Leads");
    });

    it("resolves lifecycle stage primary queue key from queue_definition", () => {
        const raw = buildLifecycleWaitlistStageQueueDefinition({
            stageKey: "waitlist",
            label: "Waitlist",
            statusKeys: ["waitlisted"],
        });
        const { normalized } = loadQueueDefinitionBundle(raw);
        const primary = normalized.queues[0]?.key ?? "";
        expect(
            resolveLifecycleWorkUnitPrimaryQueueKey({
                queue_definition: raw,
                metadata: { lifecycle_stage_key: "waitlist" },
            })
        ).toBe(primary);
        expect(primary.startsWith("lifecycle_")).toBe(true);
    });

    it("orderLifecycleSiblingNavRows matches dept sort_order", () => {
        const siblings = [
            { id: "b", name: "Tours", key: "lifecycle_wu_tour", total: 1 },
            { id: "a", name: "New Leads", key: "lifecycle_wu_lead", total: 2 },
        ];
        const ordered = orderLifecycleSiblingNavRows(siblings, [
            { id: "a", name: "New Leads", key: "lifecycle_wu_lead", sort_order: 0 },
            { id: "b", name: "Tours", key: "lifecycle_wu_tour", sort_order: 1 },
        ]);
        expect(ordered.map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("resolveWorkUnitFetchQueueKeyFromPill never returns lifecycle_wu_nav as API key", () => {
        const nav = lifecycleWorkUnitNavChipKey("wu-target");
        expect(isLifecycleWorkUnitNavChipKey(nav)).toBe(true);
        expect(resolveWorkUnitFetchQueueKeyFromPill(nav, "", undefined).queueKey).toBe("");
    });

    it("omits Needs Attention row when no attention queues configured", () => {
        const sections = buildLifecycleBuilderOwnedAboveFoldHeaderSections({
            siblings: [{ id: "wu1", name: "Lead", key: "lifecycle_wu_lead", total: 1 }],
            currentWorkUnitId: "wu1",
            selectedQueueKey: "lead",
            attentionQueues: [],
        });
        expect(sections.find((s) => s.key === "needs_attention")).toBeUndefined();
    });

    it("includes Needs Attention row when attention queues exist", () => {
        const sections = buildLifecycleBuilderOwnedAboveFoldHeaderSections({
            siblings: [{ id: "wu1", name: "Lead", key: "lifecycle_wu_lead", total: 1 }],
            currentWorkUnitId: "wu1",
            selectedQueueKey: "lead",
            attentionQueues: [{ key: "na-1", label: "Stale leads", count: 2 }],
        });
        const na = sections.find((s) => s.key === "needs_attention");
        expect(na?.label).toBe("Needs Attention");
        expect(na?.chips[0]?.count).toBe(2);
    });

    it("filters inactive and non-lifecycle work units from sibling list", () => {
        const rows = filterActiveLifecycleSiblingWorkUnits([
            { id: "1", name: "Lead", key: "lifecycle_wu_lead", is_active: true },
            { id: "2", name: "Pipe", key: "enrollment_pipeline", is_active: false },
            { id: "3", name: "Qual", key: "lifecycle_wu_qualification", is_active: true },
        ]);
        expect(rows.map((r) => r.id)).toEqual(["1", "3"]);
    });

    it("includes builder stages missing lifecycle work unit rows (sidebar parity)", () => {
        const metadata = {
            lifecycle_builder_v1: {
                version: 1,
                active_process_id: "proc-1",
                processes: [
                    {
                        id: "proc-1",
                        key: "enrollment",
                        name: "Enrollment",
                        primary_entity: "family",
                        sort_order: 0,
                        is_active: true,
                        stages: [
                            { id: "s1", key: "lead", label: "New Leads", sort_order: 0, is_active: true },
                            { id: "s2", key: "qualification", label: "Qualification", sort_order: 1, is_active: true },
                            { id: "s3", key: "tour", label: "Tours", sort_order: 2, is_active: true },
                        ],
                    },
                ],
            },
        };
        const rows = buildLifecycleSiblingNavRowsFromDepartmentWorkUnits({
            departmentId: "dept-1",
            departmentMetadata: metadata,
            workUnits: [
                { id: "wu-lead", name: "New Leads", key: "lifecycle_wu_lead", is_active: true, metadata: { lifecycle_stage_key: "lead" } },
                { id: "wu-tour", name: "Tours", key: "lifecycle_wu_tour", is_active: true, metadata: { lifecycle_stage_key: "tour" } },
            ],
        });
        expect(rows.map((r) => r.name)).toEqual(["New Leads", "Qualification", "Tours"]);
        expect(rows[1]?.nav_platform_key).toBe("communications_followup");
    });

    it("above-fold model uses lifecycle header sections override", () => {
        const sections = buildLifecycleBuilderOwnedAboveFoldHeaderSections({
            siblings: [
                { id: "a", name: "Lead", key: "lifecycle_wu_lead", total: 5 },
                { id: "b", name: "Qualification", key: "lifecycle_wu_qualification", total: 2 },
            ],
            currentWorkUnitId: "a",
            selectedQueueKey: null,
        });
        const model = buildWorkUnitAboveFoldRenderModel({
            work_unit_shell_ready: true,
            reserve_actions_rail: true,
            queue_summaries: [{ key: "lead", label: "Lead", priority: "standard", count: 5 }],
            queue_summaries_error: null,
            queue_pill_sections: null,
            queue_tab_placeholders: null,
            selected_queue_key: "lead",
            attention_bucket_key: "",
            lane_unmapped_only: false,
            all_records_queue_key: null,
            other_pill_section_key: null,
            unmapped_pill_count: null,
            enrollment_right_rail_resolved: [],
            queue_items_loading: false,
            queue_lane_reveal_state: "ready_empty",
            queue_items_error: null,
            lifecycle_builder_owned_header_sections: sections,
        });
        expect(model.header.sections.map((s) => s.label)).toEqual(["Work Units"]);
        expect(model.header.sections[0]?.chips).toHaveLength(2);
    });
});

describe("lifecycle shell parity page wiring", () => {
    it("work-unit page wires sibling pills and lifecycle header sections", () => {
        const wu = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(wu).toContain("buildLifecycleBuilderOwnedAboveFoldHeaderSections");
        expect(wu).toContain("lifecycle_builder_owned_header_sections");
        expect(wu).toContain("buildLifecycleSiblingNavRowsFromDepartmentWorkUnits");
        expect(wu).toContain("parseLifecyclePlatformNavChipKey");
        expect(wu).not.toContain("applyLifecycleVisibilityKpiLabels");
        expect(wu).toContain("builderOwnedLifecycleShell");
    });

    it("dept page shows empty Needs Attention placeholder copy", () => {
        const dept = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(dept).toContain("dept-needs-attention-placeholder");
        expect(dept).toContain("No needs attention rules configured");
        expect(dept).toContain("reserveDeptActionsRail && enrollmentDepartmentRailModel");
    });
});
