/**
 * End-to-end contract: enrolling stage status → work unit → validation.
 * Exercises saveLifecycleStageRuntimeConfig (not helper-only assertions).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    saveLifecycleStageRuntimeConfig,
    validateLifecycleStageRuntimeConfigSnapshot,
} from "@/lib/lifecycle/saveLifecycleStageRuntimeConfig";
import { summarizeBuilderOwnedQueueFilterValidation } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";
import { executableStatusKeysFromLifecycleQueueDefinition } from "@/lib/lifecycle/lifecycleStageQueueFilters";
import { ENROLLMENT_OPERATOR_STAGE_METADATA_KEY } from "@/lib/lifecycle/enrollmentOperatorStage";

const ORG = "org-contract";
const DEPT = "dept-contract";
const PROCESS = "proc-enroll";

type StatusRow = {
    id: string;
    status_key: string;
    status_label: string;
    sort_order: number;
    metadata: Record<string, unknown> | null;
    entity_type: string;
    org_id: string;
    is_active: boolean;
};

type WorkUnitRow = {
    id: string;
    org_id: string;
    department_id: string;
    key: string;
    name: string;
    sort_order: number;
    is_active: boolean;
    queue_definition: unknown;
    metadata: Record<string, unknown>;
    updated_at: string;
};

type DeptRow = {
    id: string;
    org_id: string;
    metadata: Record<string, unknown>;
};

function builderOwnedMetadata() {
    return {
        lifecycle_builder_owned_v1: {
            process_id: PROCESS,
            builder_owned: true,
        },
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: PROCESS,
            processes: [
                {
                    id: PROCESS,
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "stage-enrolling",
                            key: "enrolling",
                            label: "Enrolling",
                            sort_order: 3,
                            is_active: true,
                        },
                    ],
                },
            ],
        },
    };
}

function createContractStore() {
    const department: DeptRow = {
        id: DEPT,
        org_id: ORG,
        metadata: builderOwnedMetadata(),
    };
    const statusRows: StatusRow[] = [
        {
            id: "sd-enrolling",
            org_id: ORG,
            entity_type: "opportunities",
            status_key: "enrolling",
            status_label: "Enrolling",
            sort_order: 10,
            metadata: null,
            is_active: true,
        },
    ];
    const workUnits: WorkUnitRow[] = [];

    return { department, statusRows, workUnits };
}

function createContractSupabase(store: ReturnType<typeof createContractStore>): SupabaseClient {
    const from = (table: string) => {
        const filters: Array<{ col: string; val: string }> = [];

        const applyFilters = <T extends Record<string, unknown>>(rows: T[]): T[] => {
            let out = rows;
            for (const f of filters) {
                out = out.filter((r) => r[f.col] === f.val);
            }
            return out;
        };

        const resolveSelect = () => {
            if (table === "departments") {
                return { data: applyFilters([store.department as unknown as Record<string, unknown>]), error: null };
            }
            if (table === "status_definitions") {
                return { data: applyFilters(store.statusRows as unknown as Record<string, unknown>[]), error: null };
            }
            if (table === "work_units") {
                return { data: applyFilters(store.workUnits as unknown as Record<string, unknown>[]), error: null };
            }
            return { data: [], error: null };
        };

        const chain: Record<string, unknown> = {
            select: () => chain,
            eq: (col: string, val: string) => {
                filters.push({ col, val });
                return chain;
            },
            maybeSingle: async () => {
                const { data } = resolveSelect();
                return { data: (data[0] as unknown) ?? null, error: null };
            },
            single: async () => {
                const { data } = resolveSelect();
                if (!data[0]) throw new Error("not found");
                return { data: data[0], error: null };
            },
            then: (onfulfilled?: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) =>
                Promise.resolve(resolveSelect()).then(onfulfilled, onrejected),
        };

        if (table === "work_units") {
            chain.insert = (row: Record<string, unknown>) => {
                const ins: WorkUnitRow = {
                    ...(row as unknown as WorkUnitRow),
                    id: `wu-${store.workUnits.length + 1}`,
                };
                store.workUnits.push(ins);
                return {
                    select: () => ({
                        single: async () => ({ data: ins, error: null }),
                    }),
                };
            };
            chain.update = (patch: Partial<WorkUnitRow>) => ({
                eq: (_c: string, id: string) => ({
                    eq: () => ({
                        select: () => ({
                            single: async () => {
                                const row = store.workUnits.find((w) => w.id === id);
                                if (!row) return { data: null, error: { message: "missing" } };
                                Object.assign(row, patch);
                                return { data: row, error: null };
                            },
                        }),
                    }),
                }),
            });
        }

        if (table === "status_definitions") {
            chain.update = (patch: { metadata: Record<string, unknown> }) => {
                const updateFilters: Array<{ col: string; val: string }> = [];
                const updateChain = {
                    eq: (col: string, val: string) => {
                        updateFilters.push({ col, val });
                        return updateChain;
                    },
                    then: (
                        onfulfilled?: (v: { error: null }) => unknown,
                        onrejected?: (e: unknown) => unknown
                    ) => {
                        const id = updateFilters.find((f) => f.col === "id")?.val;
                        const row = store.statusRows.find((s) => s.id === id);
                        if (row) row.metadata = patch.metadata;
                        return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
                    },
                };
                return updateChain;
            };
        }

        return chain;
    };

    return { from } as unknown as SupabaseClient;
}

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn(),
}));

vi.mock("@/lib/lifecycle/ensureOrgOpportunityStatusRow", () => ({
    ensureOrgOpportunityStatusRow: vi.fn(
        async (
            _supabase: SupabaseClient,
            orgId: string,
            statusKey: string,
            eff: { status_label: string; sort_order: number; is_active: boolean }
        ) => ({
            id: `sd-${statusKey}`,
            metadata: { status_label: eff.status_label },
        })
    ),
}));

import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

describe("Lifecycle Builder — enrolling stage runtime config contract", () => {
    let store: ReturnType<typeof createContractStore>;
    let supabase: SupabaseClient;

    beforeEach(() => {
        store = createContractStore();
        supabase = createContractSupabase(store);
        vi.mocked(fetchEffectiveStatusDefinitions).mockImplementation(async () => ([
            {
                id: "sd-enrolling",
                industry_key: null,
                status_key: "enrolling",
                status_label: "Enrolling",
                sort_order: 10,
                metadata: store.statusRows[0]!.metadata,
                is_active: true,
                is_system: false,
                entity_type: "opportunities",
                org_id: ORG,
            },
        ]) as import("@/lib/admin/statusDefinitionsResolve").StatusDefinitionRow[]);
    });

    const activation: LifecycleActivationV1 = {
        version: 1,
        lifecycle_name: "Enrollment",
        primary_entity: "opportunity",
        primary_record_label: "Lead",
        process_id: PROCESS,
        stage_key: "enrolling",
        stage_label: "Enrolling",
        work_unit_id: null,
        work_unit_name: "Enrolling",
        status_keys: ["enrolling"],
        status_labels: ["Enrolling"],
        action_definition_id: null,
        action_placement_ids: [],
        activation_owned: true,
        completed_steps: 4,
        updated_at: "2026-06-01T00:00:00.000Z",
    };

    it("1–6: save statuses + work unit writes enrolling filters and metadata", async () => {
        const first = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrolling",
            selectedStatusKeys: ["enrolling"],
            workUnitName: "Enrolling",
        });

        expect(first.stageKey).toBe("enrolling");
        expect(first.selectedStatusKeys).toEqual(["enrolling"]);
        expect(first.workUnitKey).toBe(lifecycleStageWorkUnitKey("enrolling"));
        expect(first.workUnitId).toBeTruthy();
        expect(first.synced).toBe(true);
        expect(first.queueFilterKeys).toContain("enrolling");
        expect(first.metadataStatusKeys).toContain("enrolling");

        const assignedMeta = store.statusRows[0]!.metadata;
        expect(assignedMeta?.[ENROLLMENT_OPERATOR_STAGE_METADATA_KEY]).toBe("enrolling");

        const wu = store.workUnits.find((w) => w.key === lifecycleStageWorkUnitKey("enrolling"));
        expect(wu).toBeTruthy();
        expect(wu!.name).toBe("Enrolling");
        const filterKeys = executableStatusKeysFromLifecycleQueueDefinition(
            { key: wu!.key, queue_definition: wu!.queue_definition },
            "enrolling"
        );
        expect(filterKeys).toContain("enrolling");
        expect((wu!.metadata as { status_keys?: string[] }).status_keys).toContain("enrolling");

        const payload = buildEnrollmentStatusStagesPayload(
            store.statusRows.map((r) => ({
                status_key: r.status_key,
                status_label: r.status_label,
                sort_order: r.sort_order,
                metadata: r.metadata,
            })),
            ["enrolling"]
        );
        expect(payload.stages.enrolling?.statuses.map((s) => s.status_key)).toContain("enrolling");
    });

    it("7–8: runtime validation passes queue filters connected for contract snapshot", async () => {
        const snapshot = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrolling",
            selectedStatusKeys: ["enrolling"],
            workUnitName: "Enrolling",
        });

        const row = validateLifecycleStageRuntimeConfigSnapshot(snapshot, activation);
        expect(row.pass).toBe(true);
        const summary = summarizeBuilderOwnedQueueFilterValidation([row]);
        expect(summary.pass).toBe(true);
    });

    it("9–10: repeat save is idempotent — no missing-status error, still synced", async () => {
        await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrolling",
            selectedStatusKeys: ["enrolling"],
            workUnitName: "Enrolling",
        });

        const second = await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrolling",
            selectedStatusKeys: ["enrolling"],
            workUnitName: "Enrolling",
        });

        expect(second.synced).toBe(true);
        expect(second.selectedStatusKeys).toEqual(["enrolling"]);
        expect(store.workUnits.filter((w) => w.key === lifecycleStageWorkUnitKey("enrolling"))).toHaveLength(
            1
        );
    });

    it("rejects work unit save when selectedStatusKeys empty (no silent match-all)", async () => {
        await expect(
            saveLifecycleStageRuntimeConfig(supabase, {
                orgId: ORG,
                departmentId: DEPT,
                stageKey: "enrolling",
                selectedStatusKeys: [],
                workUnitName: "Enrolling",
            })
        ).rejects.toThrow(/status/i);
    });
});
