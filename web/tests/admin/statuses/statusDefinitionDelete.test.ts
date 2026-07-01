import { describe, expect, it } from "vitest";
import {
    planStatusDefinitionDelete,
    statusDefinitionDeleteMessage,
} from "@/lib/admin/statusDefinitionDeletePlan";
import {
    findStatusDefinitionConfigReferences,
    formatStatusDefinitionConfigReference,
} from "@/lib/admin/statusDefinitionConfigReferences";
import { isStatusDefinitionInUse } from "@/lib/admin/statusDefinitionUsage";

describe("statusDefinitionDeleteMessage", () => {
    it("returns inactivate message when used", () => {
        expect(statusDefinitionDeleteMessage("inactivated", true)).toContain("inactivated instead");
    });

    it("returns deleted message for hard delete", () => {
        expect(statusDefinitionDeleteMessage("deleted", false)).toBe("Status deleted.");
    });
});

describe("planStatusDefinitionDelete", () => {
    it("plans inactivation when records use the status", async () => {
        const supabase = {
            from(table: string) {
                if (table === "opportunities") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    limit: () => ({
                                        maybeSingle: async () => ({ data: { id: "opp-1" }, error: null }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "status_transition_rules") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    or: () => ({
                                        limit: () => ({
                                            maybeSingle: async () => ({ data: null, error: null }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "departments") {
                    return {
                        select: () => ({
                            eq: async () => ({ data: [], error: null }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        };

        const plan = await planStatusDefinitionDelete({
            supabase: supabase as never,
            orgId: "org-1",
            row: { entity_type: "opportunities", status_key: "open", is_system: false },
        });

        expect(plan.action).toBe("inactivated");
        expect(plan.inUse).toBe(true);
        expect(plan.blockHardDelete).toBe(false);
    });

    it("blocks hard delete when referenced in business process config but unused", async () => {
        const supabase = {
            from(table: string) {
                if (table === "opportunities") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    limit: () => ({
                                        maybeSingle: async () => ({ data: null, error: null }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "status_transition_rules") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    or: () => ({
                                        limit: () => ({
                                            maybeSingle: async () => ({ data: null, error: null }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "departments") {
                    return {
                        select: () => ({
                            eq: async () => ({
                                data: [
                                    {
                                        id: "dept-1",
                                        name: "Enrollment",
                                        metadata: {
                                            lifecycle_builder_v1: {
                                                version: 1,
                                                active_process_id: "p1",
                                                processes: [
                                                    {
                                                        id: "p1",
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
                                                                queue_membership_v1: {
                                                                    version: 1,
                                                                    lifecycle_key: "enrollment",
                                                                    stage_key: "lead",
                                                                    subject_type: "case",
                                                                    count_unit: "cases",
                                                                    included_status_keys: ["custom_lead"],
                                                                    included_disposition_keys: [],
                                                                },
                                                            },
                                                        ],
                                                    },
                                                ],
                                            },
                                        },
                                    },
                                ],
                                error: null,
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        };

        const plan = await planStatusDefinitionDelete({
            supabase: supabase as never,
            orgId: "org-1",
            row: { entity_type: "opportunities", status_key: "custom_lead", is_system: false },
        });

        expect(plan.action).toBe("deleted");
        expect(plan.blockHardDelete).toBe(true);
        expect(plan.configReferences.length).toBeGreaterThan(0);
    });

    it("plans hard delete when unused and not in config", async () => {
        const emptyMaybeSingle = () => ({
            limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
            }),
        });
        const supabase = {
            from(table: string) {
                if (table === "opportunities") {
                    return { select: () => ({ eq: () => ({ eq: emptyMaybeSingle }) }) };
                }
                if (table === "status_transition_rules") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    or: () => emptyMaybeSingle(),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "departments") {
                    return {
                        select: () => ({
                            eq: async () => ({ data: [], error: null }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        };

        const plan = await planStatusDefinitionDelete({
            supabase: supabase as never,
            orgId: "org-1",
            row: { entity_type: "opportunities", status_key: "unused_key", is_system: false },
        });

        expect(plan.action).toBe("deleted");
        expect(plan.blockHardDelete).toBe(false);
    });
});

describe("statusDefinitionConfigReferences", () => {
    it("formats queue membership references", () => {
        const text = formatStatusDefinitionConfigReference({
            kind: "queue_membership",
            department_id: "d1",
            department_name: "Enrollment",
            process_key: "enrollment",
            stage_key: "lead",
        });
        expect(text).toContain("Enrollment");
        expect(text).toContain("lead");
    });
});

describe("isStatusDefinitionInUse query shape", () => {
    it("uses limit 1 existence check", async () => {
        let limitCalled = false;
        const emptyHit = () => ({
            limit: (n: number) => {
                if (n === 1) limitCalled = true;
                return {
                    maybeSingle: async () => ({ data: null, error: null }),
                };
            },
        });
        const supabase = {
            from(table: string) {
                if (table === "opportunities") {
                    return { select: () => ({ eq: () => ({ eq: emptyHit }) }) };
                }
                if (table === "status_transition_rules") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    or: () => emptyHit(),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            },
        };
        await isStatusDefinitionInUse({
            supabase: supabase as never,
            orgId: "org-1",
            entityType: "opportunities",
            statusKey: "open",
        });
        expect(limitCalled).toBe(true);
    });
});
