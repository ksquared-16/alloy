import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/operationalWork/operationalWorkService", () => ({
    cancelWorkInstance: vi.fn(async ({ workId }: { workId: string }) => {
        const row = (globalThis as { __reconcileRows?: Map<string, { status: string; metadata: Record<string, unknown> }> })
            .__reconcileRows?.get(workId);
        if (row) row.status = "canceled";
        return { ok: true };
    }),
    completeWorkInstance: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/lifecycle/instantiateStageWorkFromTemplate", () => ({
    instantiateStageWorkFromTemplate: vi.fn(async () => ({
        status: "created" as const,
        work_id: "work-conduct",
    })),
}));

vi.mock("@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate", () => ({
    resolveEffectiveWorkDefinitionKeyFromTemplate: (template: {
        template_key: string;
        work_definition_key?: string | null;
    }) => ({
        ok: true as const,
        work_definition_key: template.work_definition_key ?? template.template_key,
    }),
}));

import {
    buildBusinessProcessWorkRuntimeFingerprint,
    buildLegacyStageScopedBusinessProcessWorkRuntimeFingerprint,
    parseBusinessProcessWorkRuntimeFingerprint,
    resolveBusinessProcessSemanticWorkKey,
} from "@/lib/lifecycle/buildBusinessProcessWorkRuntimeFingerprint";
import { reconcileBusinessProcessWorkAcrossStageMove } from "@/lib/lifecycle/reconcileBusinessProcessWorkAcrossStageMove";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { instantiateStageWorkFromTemplate } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";

function plan(stageKey: string, templates: Array<Record<string, unknown>>) {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: stageKey,
        journey_segment: "family",
        work_templates: templates,
        outcomes: [],
        outcome_rules: [],
    };
}

function deptMetadataWithPlans() {
    return {
        [LIFECYCLE_BUILDER_METADATA_KEY]: {
            version: 1,
            active_process_id: "proc-1",
            processes: [
                {
                    id: "proc-1",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "s1",
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: plan("lead", [
                                {
                                    template_key: "schedule_tour",
                                    label: "Schedule Tour",
                                    required: true,
                                    primary: true,
                                    due_policy: { kind: "same_day" },
                                    owner_strategy: "record_owner",
                                    work_definition_key: "schedule_tour",
                                },
                                {
                                    template_key: "collect_program",
                                    label: "Collect Program",
                                    required: true,
                                    primary: false,
                                    due_policy: { kind: "same_day" },
                                    owner_strategy: "record_owner",
                                    work_definition_key: "collect_program",
                                },
                                {
                                    template_key: "contact_family",
                                    label: "Contact Family",
                                    required: false,
                                    primary: false,
                                    due_policy: { kind: "same_day" },
                                    owner_strategy: "record_owner",
                                    work_definition_key: "contact_family",
                                },
                            ]),
                        },
                        {
                            id: "s2",
                            key: "tour",
                            label: "Tour",
                            sort_order: 1,
                            is_active: true,
                            stage_operating_plan_v1: plan("tour", [
                                {
                                    template_key: "conduct_tour",
                                    label: "Conduct Tour",
                                    required: true,
                                    primary: true,
                                    due_policy: { kind: "same_day" },
                                    owner_strategy: "record_owner",
                                    work_definition_key: "record_tour_outcome",
                                },
                                {
                                    template_key: "collect_program",
                                    label: "Collect Program",
                                    required: true,
                                    primary: false,
                                    due_policy: { kind: "same_day" },
                                    owner_strategy: "record_owner",
                                    work_definition_key: "collect_program",
                                },
                            ]),
                        },
                    ],
                },
            ],
        },
    };
}

type Row = {
    id: string;
    title: string;
    status: string;
    source: string;
    metadata: Record<string, unknown>;
    updated_at: string;
};

function makeSupabase(rows: Row[]) {
    const rowById = new Map(rows.map((r) => [r.id, r]));
    (globalThis as { __reconcileRows?: Map<string, Row> }).__reconcileRows = rowById;

    const list = async () => ({
        data: [...rowById.values()].filter((r) => r.status === "open"),
        error: null,
    });

    function selectChain(state: { id?: string } = {}): Record<string, unknown> {
        const one = async () => ({
            data: state.id ? rowById.get(state.id) ?? null : null,
            error: null,
        });
        const node: Record<string, unknown> = {
            eq: (col: string, val: string) => {
                if (col === "id") state.id = val;
                return selectChain(state);
            },
            order: () => ({ limit: list }),
            limit: list,
            maybeSingle: one,
        };
        return node;
    }

    return {
        from: (table: string) => {
            if (table !== "operational_tasks") throw new Error(`unexpected ${table}`);
            return {
                select: () => selectChain(),
                update: (patch: Record<string, unknown>) => {
                    const apply = async (id: string | undefined) => {
                        if (id) {
                            const row = rowById.get(id);
                            if (row && patch.metadata) row.metadata = patch.metadata as Record<string, unknown>;
                            if (row && typeof patch.status === "string") row.status = patch.status;
                        }
                        return { error: null };
                    };
                    function updateChain(state: { id?: string } = {}): Record<string, unknown> {
                        const run = () => apply(state.id);
                        return {
                            eq: (col: string, val: string) => {
                                if (col === "id") state.id = val;
                                const next = updateChain(state);
                                // Allow awaiting terminal eq chains
                                (next as { then?: unknown }).then = (
                                    resolve: (v: unknown) => void,
                                    reject?: (e: unknown) => void,
                                ) => Promise.resolve(run()).then(resolve, reject);
                                return next;
                            },
                            then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
                                Promise.resolve(run()).then(resolve, reject),
                        };
                    }
                    return updateChain();
                },
            };
        },
    };
}

describe("buildBusinessProcessWorkRuntimeFingerprint", () => {
    it("builds durable semantic identity without stage", () => {
        expect(
            buildBusinessProcessWorkRuntimeFingerprint({
                orgId: "org-1",
                entityType: "opportunities",
                entityId: "opp-1",
                workDefinitionKey: "collect_program",
                templateKey: "collect_program",
                stageKey: "lead",
            }),
        ).toBe("bpw:org-1:opportunities:opp-1:collect_program");
    });

    it("prefers workDefinitionKey over templateKey", () => {
        expect(
            resolveBusinessProcessSemanticWorkKey({
                workDefinitionKey: "collect_missing_information",
                templateKey: "collect_program",
            }),
        ).toBe("collect_missing_information");
    });

    it("parses semantic and legacy stage-scoped fingerprints", () => {
        expect(parseBusinessProcessWorkRuntimeFingerprint("bpw:org-1:opportunities:opp-1:conduct_tour")).toMatchObject({
            format: "semantic",
            semanticWorkKey: "conduct_tour",
            stageKey: null,
        });
        expect(
            parseBusinessProcessWorkRuntimeFingerprint(
                buildLegacyStageScopedBusinessProcessWorkRuntimeFingerprint({
                    orgId: "org-1",
                    entityType: "opportunities",
                    entityId: "opp-1",
                    stageKey: "tour",
                    templateKey: "confirm_tour_date",
                }),
            ),
        ).toMatchObject({
            format: "legacy_stage_scoped",
            stageKey: "tour",
            semanticWorkKey: "confirm_tour_date",
        });
    });
});

describe("reconcileBusinessProcessWorkAcrossStageMove", () => {
    beforeEach(() => {
        vi.mocked(instantiateStageWorkFromTemplate).mockClear();
        vi.mocked(instantiateStageWorkFromTemplate).mockResolvedValue({
            status: "created",
            work_id: "work-conduct",
        });
    });

    it("Lead→Tour: completes schedule, carries Collect Program id, cancels Contact Family, creates Conduct Tour", async () => {
        const rows: Row[] = [
            {
                id: "work-collect",
                title: "Collect Program",
                status: "open",
                source: "lifecycle_stage_work",
                metadata: {
                    lifecycle_provenance: "lifecycle_template",
                    operating_plan_template: true,
                    operating_plan_template_key: "collect_program",
                    work_intent_key: "collect_program",
                    work_definition_key: "collect_program",
                    lifecycle_stage_key: "lead",
                    bp_runtime_fingerprint: "bp:org-1:opportunities:opp-1:lead:collect_program",
                },
                updated_at: "2026-01-01T00:00:00.000Z",
            },
            {
                id: "work-contact",
                title: "Contact Family",
                status: "open",
                source: "lifecycle_stage_work",
                metadata: {
                    lifecycle_provenance: "lifecycle_template",
                    operating_plan_template: true,
                    operating_plan_template_key: "contact_family",
                    work_intent_key: "contact_family",
                    work_definition_key: "contact_family",
                    lifecycle_stage_key: "lead",
                    bp_runtime_fingerprint: "bp:org-1:opportunities:opp-1:lead:contact_family",
                },
                updated_at: "2026-01-01T00:00:01.000Z",
            },
        ];

        const result = await reconcileBusinessProcessWorkAcrossStageMove({
            supabase: makeSupabase(rows) as never,
            orgId: "org-1",
            userId: "user-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            sourceStageKey: "lead",
            destinationStageKey: "tour",
            departmentMetadata: deptMetadataWithPlans(),
            initiatingWorkId: "work-schedule",
        });

        expect(result.degraded).toBeUndefined();
        expect(result.items.find((i) => i.work_id === "work-schedule")?.result).toBe("completed");
        expect(result.items.find((i) => i.work_id === "work-collect")).toEqual(
            expect.objectContaining({ result: "carried_forward", work_id: "work-collect" }),
        );
        expect(result.items.find((i) => i.work_id === "work-contact")?.result).toMatch(/canceled|superseded/);
        expect(result.items.find((i) => i.result === "created")?.work_id).toBe("work-conduct");

        expect(rows[0]!.metadata.lifecycle_stage_key).toBe("tour");
        expect(String(rows[0]!.metadata.bp_runtime_fingerprint)).toBe(
            "bpw:org-1:opportunities:opp-1:collect_program",
        );

        // Second pass is idempotent — no duplicate create / cancel.
        vi.mocked(instantiateStageWorkFromTemplate).mockResolvedValue({
            status: "deduped",
            work_id: "work-conduct",
            reason: "bp_runtime_fingerprint",
        });
        const second = await reconcileBusinessProcessWorkAcrossStageMove({
            supabase: makeSupabase(rows) as never,
            orgId: "org-1",
            userId: "user-1",
            opportunityId: "opp-1",
            departmentId: "dept-1",
            sourceStageKey: "lead",
            destinationStageKey: "tour",
            departmentMetadata: deptMetadataWithPlans(),
            initiatingWorkId: "work-schedule",
        });
        expect(second.items.filter((i) => i.result === "created")).toHaveLength(0);
        expect(second.items.filter((i) => i.result === "canceled" || i.result === "superseded")).toHaveLength(0);
        expect(second.idempotent_noop).toBe(true);
    });
});
