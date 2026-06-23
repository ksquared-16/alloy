import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
    opportunityMatchesEnrollmentNewLeadsQueue,
    RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2,
} from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import { coerceQueueDefinitionForExecution } from "@/lib/config/queueDefinitionV2Runtime";
import {
    expandEnrollmentNewLeadsQueueStatusKeys,
    isEnrollmentNewLeadsQueueKey,
} from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";
import { statusKeysForOperatorStageQueueSync } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import { resolveOpportunityQueueLaneRouting } from "@/lib/queues/queueMembershipRuntimeResolver";
import { defaultEnrollmentQueueMembershipForStage } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import { applyEnrollmentTemplateToProcess } from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

function tracksDepartmentMetadata() {
    const process = applyEnrollmentTemplateToProcess({
        id: "p1",
        key: ENROLLMENT_PROCESS_KEY,
        name: "Enrollment",
        primary_entity: "opportunity",
        sort_order: 0,
        is_active: true,
        stages: [],
    });
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: process.id,
            processes: [process],
        },
    };
}

describe("enrollmentLeadStageStatusAliases", () => {
    it("expands new_inquiry filters to include legacy open and new", () => {
        expect(expandEnrollmentNewLeadsQueueStatusKeys(["new_inquiry"]).sort()).toEqual([
            "new",
            "new_inquiry",
            "open",
        ]);
    });

    it("does not expand unrelated status keys", () => {
        expect(expandEnrollmentNewLeadsQueueStatusKeys(["tour_scheduled"])).toEqual(["tour_scheduled"]);
    });

    it("recognizes lifecycle new lead queue keys", () => {
        expect(isEnrollmentNewLeadsQueueKey("new_leads")).toBe(true);
        expect(isEnrollmentNewLeadsQueueKey("lifecycle_new_lead")).toBe(true);
        expect(isEnrollmentNewLeadsQueueKey("tours")).toBe(false);
    });
});

describe("New Leads queue execution filters", () => {
    it("coerces v2 new_leads compat filters to include legacy open", () => {
        const def = coerceQueueDefinitionForExecution(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2);
        const filters = def.queues.find((q) => q.key === "new_leads")?.filters;
        expect(filters?.[0]?.values).toEqual(expect.arrayContaining(["new_inquiry", "open", "new"]));
        expect(filters?.[0]?.values).toHaveLength(3);
    });

    it("coerces lifecycle stage queue with only new_inquiry to include open", () => {
        const doc = {
            version: 2,
            entity_type: "opportunity",
            ui: {
                layout: "single_section",
                sections: [{ key: "primary", label: "New Lead", queue_keys: ["lifecycle_new_lead"] }],
            },
            queues: [
                {
                    key: "lifecycle_new_lead",
                    label: "New Lead",
                    grain: "case",
                    filters_compat_v1: [{ type: "status", operator: "in", values: ["new_inquiry"] }],
                    filters: [{ type: "case_status", operator: "in", values: ["new_inquiry"] }],
                },
            ],
        };
        const def = coerceQueueDefinitionForExecution(doc);
        const filters = def.queues.find((q) => q.key === "lifecycle_new_lead")?.filters;
        expect(filters?.[0]?.values).toEqual(expect.arrayContaining(["new_inquiry", "open", "new"]));
    });
});

describe("New Leads status matching", () => {
    it("matches legacy open and fresh new_inquiry", () => {
        expect(opportunityMatchesEnrollmentNewLeadsQueue("open")).toBe(true);
        expect(opportunityMatchesEnrollmentNewLeadsQueue("new_inquiry")).toBe(true);
        expect(opportunityMatchesEnrollmentNewLeadsQueue("tour_scheduled")).toBe(false);
    });

    it("lead stage queue sync includes legacy aliases", () => {
        expect(statusKeysForOperatorStageQueueSync("lead", ["new_inquiry"]).sort()).toEqual([
            "new",
            "new_inquiry",
            "open",
        ]);
    });
});

describe("New Leads routing stays case-grain", () => {
    let restoreEnv: () => void;

    beforeEach(() => {
        const prev = process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
        delete process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
        restoreEnv = () => {
            if (prev === undefined) delete process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
            else process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER = prev;
        };
    });

    afterEach(() => {
        restoreEnv();
    });

    it("does not route new_leads through OCM child-track builder even when membership is child", () => {
        const base = defaultEnrollmentQueueMembershipForStage("lead")!;
        const membership: QueueMembershipV1 = {
            ...base,
            subject_type: "child",
            included_disposition_keys: ["new_inquiry"],
        };
        const routing = resolveOpportunityQueueLaneRouting({
            normalized: {
                isV2: true,
                version: 2,
                entity_type: "opportunity",
                def: { version: 1, entity_type: "opportunity", queues: [] },
                queues: [
                    {
                        key: "new_leads",
                        label: "New Leads",
                        domain: "new_leads",
                        grain: "case",
                        aliases: ["new_inquiry"],
                        overlay: false,
                        legacy: false,
                        filters: [],
                        raw: {},
                    },
                ],
            },
            executableQueueKey: "new_leads",
            workUnitMetadata: {
                lifecycle_stage_key: "lead",
                [QUEUE_MEMBERSHIP_METADATA_KEY]: membership,
            },
            departmentMetadata: tracksDepartmentMetadata(),
        });
        expect(routing.ocmTrackLaneCtx).toBeNull();
    });
});
