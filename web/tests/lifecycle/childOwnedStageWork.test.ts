/**
 * At a child stage each child owns their own work: the projection binds a child's row to that child's
 * item, never a sibling's; legacy unowned work is still found.
 */
import { describe, expect, it } from "vitest";

import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { stageWorkBelongsTo, stageWorkChildMetadata } from "@/lib/lifecycle/stageWorkChildSubject";

const offeredPlan = {
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "offered",
    journey_segment: "child",
    outcomes: [{ outcome_key: "offer_accepted", label: "Family accepted", successful: true }],
    outcome_rules: [],
    work_templates: [
        {
            template_key: "offer_response",
            label: "Get the family's answer",
            primary: true,
            required: true,
            due_policy: { kind: "offset_days", days: 2 },
            owner_strategy: "record_owner",
            work_definition_key: "offer_spot",
            execution_mode: "outcome_led",
            outcome_refs: [{ outcome_ref: "offer_accepted" }],
        },
    ],
};

const metadata = {
    [LIFECYCLE_BUILDER_METADATA_KEY]: {
        version: 1,
        active_process_id: "p",
        processes: [
            {
                id: "p",
                key: "enrollment",
                name: "Enrollment",
                primary_entity: "opportunity",
                sort_order: 0,
                is_active: true,
                stages: [{ id: "s", key: "offered", label: "Offered", grain: "child", sort_order: 5, is_active: true, stage_operating_plan_v1: offeredPlan }],
            },
        ],
    },
};

const row = (id: string, child: string | null) => ({
    id,
    title: "Get the family's answer",
    status: "open",
    due_at: "2026-10-20T00:00:00.000Z",
    source: "lifecycle_stage_work",
    metadata: {
        work_intent_key: "offer_response",
        operating_plan_template_key: "offer_response",
        lifecycle_stage_key: "offered",
        work_definition_key: "offer_spot",
        operating_plan_template: true,
        ...(child ? stageWorkChildMetadata({ customerMemberId: child }) : {}),
    },
});

const project = (child: string, rows: ReturnType<typeof row>[]) =>
    projectStageWorkRuntimeSync({
        departmentMetadata: metadata,
        departmentId: "dept",
        opportunityId: "opp",
        builderStageKey: "offered",
        openRows: rows as never,
        completedRows: [],
        customerMemberId: child,
        processInstanceId: `pi-${child}`,
    } as never);

describe("child-owned stage work", () => {
    it("binds each sibling to their own item, whichever is listed first", () => {
        const rows = [row("w-ben", "ben"), row("w-ava", "ava")];
        expect(project("ava", rows)?.primary?.work_id).toBe("w-ava");
        expect(project("ben", rows)?.primary?.work_id).toBe("w-ben");
    });

    it("never binds a sibling's item when the child's own is closed", () => {
        expect(project("ava", [row("w-ben", "ben")])?.primary?.work_id ?? null).toBeNull();
    });

    it("still finds legacy work that names no child", () => {
        expect(project("ava", [row("w-legacy", null)])?.primary?.work_id).toBe("w-legacy");
    });

    it("ownership is exact: a child matches only their own, family only unowned", () => {
        const md = stageWorkChildMetadata({ customerMemberId: "ava", processInstanceId: "pi-ava" });
        expect(stageWorkBelongsTo(md, "ava")).toBe(true);
        expect(stageWorkBelongsTo(md, "ben")).toBe(false);
        expect(stageWorkBelongsTo(md, null)).toBe(false);
        expect(stageWorkBelongsTo({}, null)).toBe(true);
    });
});
