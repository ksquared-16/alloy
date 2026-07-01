/**
 * saveLifecycleStageRuntimeConfig — queue_membership_v1 persistence on stage save.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveLifecycleStageRuntimeConfig } from "@/lib/lifecycle/saveLifecycleStageRuntimeConfig";
import { buildLifecycleStageQueueDefinition, lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { QUEUE_MEMBERSHIP_METADATA_KEY } from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

const ORG = "org-membership-save";
const DEPT = "dept-membership-save";
const PROCESS = "proc-enroll";

type DeptRow = { id: string; org_id: string; metadata: Record<string, unknown> };
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

function enrollmentBuilderMetadata(stageKey: string, stageMembership?: QueueMembershipV1) {
    return {
        lifecycle_builder_owned_v1: { process_id: PROCESS, builder_owned: true },
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
                            id: "stage-enrollment",
                            key: stageKey,
                            label: "Enrolling",
                            sort_order: 3,
                            is_active: true,
                            ...(stageMembership ? { queue_membership_v1: stageMembership } : {}),
                        },
                    ],
                },
            ],
        },
    };
}

function createStore(stageKey: string, stageMembership?: QueueMembershipV1) {
    const department: DeptRow = {
        id: DEPT,
        org_id: ORG,
        metadata: enrollmentBuilderMetadata(stageKey, stageMembership),
    };
    const workUnits: WorkUnitRow[] = [];
    return { department, workUnits, stageKey };
}

function createSupabase(store: ReturnType<typeof createStore>): SupabaseClient {
    const from = (table: string) => {
        const filters: Array<{ col: string; val: string }> = [];
        const apply = <T extends Record<string, unknown>>(rows: T[]) => {
            let out = rows;
            for (const f of filters) out = out.filter((r) => r[f.col] === f.val);
            return out;
        };

        const chain: Record<string, unknown> = {
            select: () => chain,
            eq: (col: string, val: string) => {
                filters.push({ col, val });
                return chain;
            },
            maybeSingle: async () => {
                const data =
                    table === "departments"
                        ? apply([store.department as unknown as Record<string, unknown>])
                        : [];
                return { data: data[0] ?? null, error: null };
            },
            single: async () => {
                const data =
                    table === "work_units"
                        ? apply(store.workUnits as unknown as Record<string, unknown>[])
                        : apply([store.department as unknown as Record<string, unknown>]);
                if (!data[0]) throw new Error("not found");
                return { data: data[0], error: null };
            },
            then: (onfulfilled?: (v: unknown) => unknown, onrejected?: (e: unknown) => unknown) => {
                const data =
                    table === "departments"
                        ? apply([store.department as unknown as Record<string, unknown>])
                        : apply(store.workUnits as unknown as Record<string, unknown>[]);
                return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
            },
        };

        if (table === "departments") {
            chain.update = (patch: Partial<DeptRow>) => ({
                eq: (_c: string, id: string) => ({
                    eq: () => ({
                        then: (
                            onfulfilled?: (v: { error: null }) => unknown,
                            onrejected?: (e: unknown) => unknown,
                        ) => {
                            if (store.department.id === id) Object.assign(store.department, patch);
                            return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
                        },
                    }),
                }),
            });
        }

        if (table === "work_units") {
            chain.insert = (row: Record<string, unknown>) => {
                const ins = {
                    ...(row as unknown as WorkUnitRow),
                    id: `wu-${store.workUnits.length + 1}`,
                };
                store.workUnits.push(ins);
                return { select: () => ({ single: async () => ({ data: ins, error: null }) }) };
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

        return chain;
    };

    return { from } as unknown as SupabaseClient;
}

vi.mock("@/lib/lifecycle/persistEnrollmentStageStatusAssignments", () => ({
    persistEnrollmentStageStatusAssignments: vi.fn(async () => undefined),
}));

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn(async () => [
        {
            status_key: "offer_pending",
            status_label: "Offer pending",
            sort_order: 10,
            metadata: null,
            is_active: true,
            is_system: false,
            entity_type: "opportunities",
            org_id: ORG,
        },
        {
            status_key: "tour_scheduled",
            status_label: "Tour scheduled",
            sort_order: 11,
            metadata: null,
            is_active: true,
            is_system: false,
            entity_type: "opportunities",
            org_id: ORG,
        },
    ]),
}));

describe("saveLifecycleStageRuntimeConfig queue_membership_v1", () => {
    it("writes enrollment default membership when stage lacks config", async () => {
        const store = createStore("enrollment");
        const supabase = createSupabase(store);

        await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrollment",
            selectedStatusKeys: ["offer_pending"],
            workUnitName: "Enrolling",
        });

        const stage = (store.department.metadata.lifecycle_builder_v1 as { processes: Array<{ stages: unknown[] }> })
            .processes[0].stages[0] as Record<string, unknown>;
        expect(stage[QUEUE_MEMBERSHIP_METADATA_KEY]).toBeTruthy();
        expect((stage[QUEUE_MEMBERSHIP_METADATA_KEY] as QueueMembershipV1).subject_type).toBe("child");

        const wu = store.workUnits[0];
        expect(wu.metadata[QUEUE_MEMBERSHIP_METADATA_KEY]).toBeTruthy();
        expect((wu.metadata[QUEUE_MEMBERSHIP_METADATA_KEY] as QueueMembershipV1).stage_key).toBe("enrollment");

        const qd = wu.queue_definition as { metadata?: { subject_type?: string } };
        expect(qd.metadata?.subject_type).toBe("child");
    });

    it("preserves explicit stage membership on save", async () => {
        const explicit: QueueMembershipV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "tour",
            subject_type: "child",
            count_unit: "enrollment_tracks",
            included_disposition_keys: ["custom_disposition"],
        };
        const store = createStore("tour", explicit);
        const supabase = createSupabase(store);

        await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "tour",
            selectedStatusKeys: ["tour_scheduled"],
            workUnitName: "Tour",
        });

        const stage = (store.department.metadata.lifecycle_builder_v1 as { processes: Array<{ stages: unknown[] }> })
            .processes[0].stages[0] as Record<string, unknown>;
        expect((stage[QUEUE_MEMBERSHIP_METADATA_KEY] as QueueMembershipV1).included_disposition_keys).toEqual([
            "custom_disposition",
        ]);
    });

    it("does not write membership for unknown enrolling slug stage", async () => {
        const store = createStore("enrolling");
        const supabase = createSupabase(store);

        await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrolling",
            selectedStatusKeys: ["offer_pending"],
            workUnitName: "Enrolling",
        });

        const stage = (store.department.metadata.lifecycle_builder_v1 as { processes: Array<{ stages: unknown[] }> })
            .processes[0].stages[0] as Record<string, unknown>;
        expect(stage[QUEUE_MEMBERSHIP_METADATA_KEY]).toBeUndefined();
    });

    it("denormalizes membership to existing work unit without name change", async () => {
        const store = createStore("enrollment");
        const wuKey = lifecycleStageWorkUnitKey("enrollment");
        store.workUnits.push({
            id: "wu-existing",
            org_id: ORG,
            department_id: DEPT,
            key: wuKey,
            name: "Enrolling",
            sort_order: 3,
            is_active: true,
            queue_definition: buildLifecycleStageQueueDefinition({
                stageKey: "enrollment",
                label: "Enrolling",
                statusKeys: ["offer_pending"],
            }),
            metadata: { lifecycle_stage_key: "enrollment", lifecycle_builder_owned_v1: { builder_owned: true } },
            updated_at: "2026-06-01T00:00:00.000Z",
        });
        const supabase = createSupabase(store);

        await saveLifecycleStageRuntimeConfig(supabase, {
            orgId: ORG,
            departmentId: DEPT,
            processId: PROCESS,
            stageKey: "enrollment",
            selectedStatusKeys: ["offer_pending"],
        });

        expect(store.workUnits[0].metadata[QUEUE_MEMBERSHIP_METADATA_KEY]).toBeTruthy();
    });
});
