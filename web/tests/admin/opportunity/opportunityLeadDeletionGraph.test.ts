import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    customerHasBlockingReferences,
    customerMemberHasBlockingOcmReferences,
    personHasBlockingReferences,
    previewOpportunityLeadDeletionFromGraph,
    resolveOpportunityLeadDeletionGraph,
    type OpportunityLeadDeletionGraph,
} from "@/lib/admin/opportunity/opportunityLeadDeletionGraph";

function countResult(count: number) {
    return Promise.resolve({ count, error: null, data: null });
}

function rowsResult(rows: Record<string, unknown>[]) {
    return Promise.resolve({ data: rows, error: null, count: null });
}

function chainable(result: unknown) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "neq", "in", "maybeSingle", "delete"]) {
        chain[m] = vi.fn(self);
    }
    chain.maybeSingle = vi.fn(async () => result);
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
    return chain;
}

describe("opportunityLeadDeletionGraph reference checks", () => {
    it("personHasBlockingReferences returns false when only deletable household links remain", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunities" || table === "opportunity_persons" || table === "jobs" || table === "vendors") {
                    return chainable(countResult(0));
                }
                if (table === "customer_members") {
                    return chainable(rowsResult([{ id: "member-1" }]));
                }
                if (table === "customer_persons") {
                    return chainable(rowsResult([{ customer_id: "cust-1" }]));
                }
                throw new Error(`unexpected table ${table}`);
            }),
        } as unknown as SupabaseClient;

        const blocked = await personHasBlockingReferences(supabase, "org-1", "person-1", {
            excludingOpportunityId: "opp-1",
            deletableCustomerIds: new Set(["cust-1"]),
            deletableCustomerMemberIds: new Set(["member-1"]),
        });
        expect(blocked).toBe(false);
    });

    it("personHasBlockingReferences returns true when person linked to another opportunity", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunity_persons") return chainable(countResult(1));
                if (table === "opportunities" || table === "jobs" || table === "vendors") {
                    return chainable(countResult(0));
                }
                if (table === "customer_members" || table === "customer_persons") {
                    return chainable(rowsResult([]));
                }
                throw new Error(`unexpected table ${table}`);
            }),
        } as unknown as SupabaseClient;

        const blocked = await personHasBlockingReferences(supabase, "org-1", "person-1", {
            excludingOpportunityId: "opp-1",
            deletableCustomerIds: new Set(["cust-1"]),
            deletableCustomerMemberIds: new Set(["member-1"]),
        });
        expect(blocked).toBe(true);
    });

    it("customerHasBlockingReferences returns true when another opportunity shares the customer", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunities") return chainable(countResult(1));
                if (table === "jobs") return chainable(countResult(0));
                throw new Error(`unexpected table ${table}`);
            }),
        } as unknown as SupabaseClient;

        expect(await customerHasBlockingReferences(supabase, "org-1", "cust-1", "opp-1")).toBe(true);
    });

    it("customerMemberHasBlockingOcmReferences returns true when member on another opp", async () => {
        const supabase = {
            from: vi.fn(() => chainable(countResult(1))),
        } as unknown as SupabaseClient;

        expect(
            await customerMemberHasBlockingOcmReferences(supabase, "org-1", "member-1", "opp-1")
        ).toBe(true);
    });
});

describe("opportunityLeadDeletionGraph preview", () => {
    const baseGraph: OpportunityLeadDeletionGraph = {
        orgId: "org-1",
        opportunityId: "opp-1",
        opportunityName: "Test Lead",
        customerId: "cust-1",
        scopedCustomerMemberIds: ["member-1"],
        scopedPersonIds: ["person-adult", "person-child"],
        adultPersonIds: ["person-adult"],
        childPersonIds: ["person-child"],
        deletableCustomerId: "cust-1",
        deletableCustomerMemberIds: ["member-1"],
        deletablePersonIds: ["person-adult", "person-child"],
        threadIds: ["thread-1"],
        formSubmissionIds: ["form-1"],
        documentIds: ["doc-1"],
        blocked: false,
        blockReason: null,
    };

    it("preview lists household, comms, docs, and forms for full graph", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunity_customer_members" || table === "opportunity_persons") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => rowsResult([]),
                            }),
                        }),
                    };
                }
                if (table === "opportunities") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { primary_person_id: "person-adult" },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "customer_members") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => rowsResult([]),
                                in: () => rowsResult([]),
                            }),
                        }),
                    };
                }
                if (table === "operational_tasks") return chainable(countResult(2));
                if (table === "placement_candidates") return chainable(countResult(1));
                if (table === "communication_messages") return chainable(countResult(3));
                if (table === "communication_scheduled_sends") return chainable(countResult(1));
                if (table === "field_values") return chainable(countResult(0));
                throw new Error(`unexpected table ${table}`);
            }),
        } as unknown as SupabaseClient;

        const preview = await previewOpportunityLeadDeletionFromGraph(supabase, baseGraph);
        expect(preview.will_delete.opportunities).toBe(1);
        expect(preview.will_delete.customers).toBe(1);
        expect(preview.will_delete.persons).toBe(2);
        expect(preview.will_delete.tasks).toBe(2);
        expect(preview.will_delete.communication_threads).toBe(1);
        expect(preview.will_delete.documents).toBe(1);
        expect(preview.will_delete.form_submissions).toBe(1);
        expect(preview.blocked).toBe(false);
    });

    it("shared household is reported under will_retain", async () => {
        const sharedGraph: OpportunityLeadDeletionGraph = {
            ...baseGraph,
            deletableCustomerId: null,
            deletableCustomerMemberIds: [],
            deletablePersonIds: [],
        };
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunity_customer_members" || table === "opportunity_persons") {
                    return { select: () => ({ eq: () => ({ eq: () => rowsResult([]) }) }) };
                }
                if (table === "opportunities") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: { primary_person_id: null }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "customer_members") {
                    return { select: () => ({ eq: () => ({ eq: () => rowsResult([]), in: () => rowsResult([]) }) }) };
                }
                if (
                    table === "operational_tasks" ||
                    table === "placement_candidates" ||
                    table === "communication_messages" ||
                    table === "communication_scheduled_sends" ||
                    table === "field_values"
                ) {
                    return chainable(countResult(0));
                }
                throw new Error(`unexpected table ${table}`);
            }),
        } as unknown as SupabaseClient;

        const preview = await previewOpportunityLeadDeletionFromGraph(supabase, sharedGraph);
        expect(preview.will_delete.customers).toBe(0);
        expect(preview.will_delete.persons).toBe(0);
        expect(preview.will_retain.customers).toBe(1);
        expect(preview.will_retain.persons).toBe(2);
    });
});

describe("resolveOpportunityLeadDeletionGraph blockers", () => {
    it("blocks when linked jobs exist", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunities") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { id: "opp-1", name: "Lead", customer_id: null },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "opportunity_customer_members" || table === "opportunity_persons") {
                    return { select: () => ({ eq: () => ({ eq: () => rowsResult([]) }) }) };
                }
                if (table === "jobs") return chainable(countResult(1));
                if (table === "discount_redemptions") return chainable(countResult(0));
                if (table === "communication_threads") {
                    return { select: () => ({ eq: () => ({ in: () => ({ eq: () => rowsResult([]) }) }) }) };
                }
                if (table === "form_submissions") {
                    return {
                        select: () => ({
                            eq: () => ({
                                in: async () => ({ data: [], error: null }),
                            }),
                            in: () => ({
                                eq: async () => ({ data: [], error: null }),
                            }),
                        }),
                    };
                }
                if (table === "documents") {
                    return {
                        select: () => ({
                            eq: () => ({
                                in: async () => ({ data: [], error: null }),
                            }),
                            in: () => ({
                                eq: async () => ({ data: [], error: null }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            }),
        } as unknown as SupabaseClient;

        const graph = await resolveOpportunityLeadDeletionGraph(supabase, "org-1", "opp-1");
        expect(graph?.blocked).toBe(true);
        expect(graph?.blockReason).toContain("linked jobs");
    });
});

describe("executeOpportunityLeadDeletionGraph order", () => {
    it("cleans communication_scheduled_sends before persons in source order", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const src = readFileSync(join(webRoot, "lib/admin/opportunity/deleteOpportunityLead.ts"), "utf8");
        const schedIdx = src.indexOf('"communication_scheduled_sends"');
        const personsDeleteIdx = src.indexOf('"persons", "id", deletablePersons');
        expect(schedIdx).toBeGreaterThan(0);
        expect(personsDeleteIdx).toBeGreaterThan(schedIdx);
    });
});
