import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyStageWorkSliceToVm } from "@/lib/adminV2/viewModel/drawer/opportunity/applyStageWorkSliceToVm";
import {
    resetOpportunityStageWorkCacheForTests,
    seedOpportunityStageWork,
} from "@/lib/adminV2/viewModel/drawer/opportunity/stageWork/opportunityStageWorkResource";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import {
    completeVmWithStageWork,
    resolveStageWorkSliceForVm,
} from "@/lib/presentation/runtime/useRecordWorkRuntime";

const SLICE = {
    stage_work_runtime: {
        stage_key: "lead",
        primary: { template_key: "contact_family", state: "open", work_id: "w1" },
        additional: [],
    },
    published_stage_inputs: { stageKey: "lead" },
    work_intent_runtime: null,
};

function pendingVm(): OpportunityDrawerViewModel {
    return {
        entity: { id: "opp-1", type: "opportunities" },
        generation: 1,
        above_fold: { record: { id: "opp-1" } },
        workspace: {
            department_id: "dept-1",
            work_unit_id: "wu-1",
            lifecycle_rail: { current_stage_key: "lead" },
            stage_context: { stage_label: "New Lead" },
            stage_work: { status: "pending" },
            stage_work_runtime: null,
            published_stage_inputs: null,
            work_intent_runtime: null,
        },
        summaries: {
            tasks: {
                state: "loaded",
                open_tasks: [],
                completed_tasks: [],
            },
        },
    } as unknown as OpportunityDrawerViewModel;
}

beforeEach(() => resetOpportunityStageWorkCacheForTests());
afterEach(() => vi.restoreAllMocks());

describe("completeVmWithStageWork — single stage-work ownership", () => {
    it("reuses a CP-2 seed and does not fetch /stage-work", async () => {
        const calls: string[] = [];
        (globalThis as { fetch?: unknown }).fetch = vi.fn(async (url: string) => {
            calls.push(String(url));
            return { ok: true, json: async () => SLICE } as unknown as Response;
        });

        seedOpportunityStageWork(
            {
                opportunityId: "opp-1",
                departmentId: "dept-1",
                stageKey: "lead",
                stageLabel: "New Lead",
            },
            SLICE as never,
        );

        const slice = await resolveStageWorkSliceForVm(pendingVm());
        expect(slice).toEqual(SLICE);
        expect(calls).toHaveLength(0);

        const complete = await completeVmWithStageWork(pendingVm());
        expect(complete.workspace.stage_work?.status).not.toBe("pending");
        expect(complete.workspace.stage_work_runtime).toEqual(SLICE.stage_work_runtime);
        expect(calls).toHaveLength(0);
    });

    it("force=true bypasses warm seed after work-lifecycle invalidation", async () => {
        const calls: string[] = [];
        (globalThis as { fetch?: unknown }).fetch = vi.fn(async (url: string) => {
            calls.push(String(url));
            return {
                ok: true,
                json: async () => ({
                    ...SLICE,
                    stage_work_runtime: {
                        ...SLICE.stage_work_runtime,
                        primary: { template_key: "conduct_tour", state: "open", work_id: "w2" },
                        additional: [],
                    },
                }),
            } as unknown as Response;
        });

        seedOpportunityStageWork(
            {
                opportunityId: "opp-1",
                departmentId: "dept-1",
                stageKey: "lead",
            },
            SLICE as never,
        );

        const forced = await completeVmWithStageWork(pendingVm(), { force: true });
        expect(calls).toHaveLength(1);
        expect(forced.workspace.stage_work_runtime?.primary?.template_key).toBe("conduct_tour");
    });

    it("applyStageWorkSliceToVm marks the region ready so deferred fetch does not re-run", () => {
        const applied = applyStageWorkSliceToVm(pendingVm(), SLICE as never);
        expect(applied.workspace.stage_work?.status).toBe("ready");
    });
});
