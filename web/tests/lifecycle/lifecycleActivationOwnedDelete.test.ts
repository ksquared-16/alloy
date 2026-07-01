import { describe, expect, it, vi } from "vitest";
import { deleteActivationLifecycleForDepartment } from "@/lib/lifecycle/lifecycleActivationOwned";

function chainable(result: { data: unknown; error: unknown }) {
    const self = {
        select: () => self,
        eq: () => self,
        maybeSingle: () => Promise.resolve(result),
        single: () => Promise.resolve(result),
        update: () => self,
        delete: () => self,
        in: () => self,
    };
    return self;
}

describe("deleteActivationLifecycleForDepartment", () => {
    it("deletes user_department_access and department when builder-owned", async () => {
        const deptId = "dept-1";
        const wuId = "wu-1";
        const placementId = "place-1";
        const actionDefId = "act-def-1";

        const udaDelete = vi.fn().mockReturnValue(chainable({ data: null, error: null }));
        const deptDelete = vi.fn().mockReturnValue(chainable({ data: null, error: null }));

        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "departments") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: () =>
                                        Promise.resolve({
                                            data: {
                                                id: deptId,
                                                metadata: {
                                                    lifecycle_builder_owned_v1: {
                                                        source: "lifecycle_builder",
                                                        created_by: "user-1",
                                                        created_at: "2026-01-01T00:00:00Z",
                                                    },
                                                    lifecycle_activation_v1: {
                                                        version: 1,
                                                        lifecycle_name: "Test",
                                                        primary_entity: "opportunity",
                                                        primary_record_label: "Lead",
                                                        process_id: "proc-1",
                                                        stage_key: "lead",
                                                        stage_label: "Lead",
                                                        work_unit_id: wuId,
                                                        work_unit_name: "Queue",
                                                        status_keys: ["new_inquiry"],
                                                        status_labels: ["New"],
                                                        action_definition_id: actionDefId,
                                                        action_placement_ids: [placementId],
                                                        activation_owned: true,
                                                        completed_steps: 3,
                                                        updated_at: "2026-01-01T00:00:00Z",
                                                    },
                                                },
                                            },
                                            error: null,
                                        }),
                                }),
                            }),
                        }),
                        delete: deptDelete,
                        update: () => chainable({ data: null, error: null }),
                    };
                }
                if (table === "work_units") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: () =>
                                        Promise.resolve({
                                            data: { id: wuId, department_id: deptId },
                                            error: null,
                                        }),
                                }),
                            }),
                        }),
                        update: () => chainable({ data: null, error: null }),
                    };
                }
                if (table === "action_placements") {
                    return { update: () => chainable({ data: null, error: null }) };
                }
                if (table === "user_department_access") {
                    return { delete: udaDelete };
                }
                return chainable({ data: null, error: null });
            }),
        };

        const result = await deleteActivationLifecycleForDepartment(
            supabase as never,
            "org-1",
            deptId
        );
        expect(result.ok).toBe(true);
        expect(udaDelete).toHaveBeenCalled();
        expect(deptDelete).toHaveBeenCalled();
    });

    it("refuses delete for non-builder-owned enrollment-style department", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: () =>
                                Promise.resolve({
                                    data: {
                                        id: "dept-enroll",
                                        metadata: { lifecycle_builder_v1: { version: 1, processes: [] } },
                                    },
                                    error: null,
                                }),
                        }),
                    }),
                }),
            })),
        };

        const result = await deleteActivationLifecycleForDepartment(
            supabase as never,
            "org-1",
            "dept-enroll"
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("activation-owned");
        }
    });
});
