import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    attachOperationalTaskPresentationFields,
    enrichOperationalTasksForWorkspace,
} from "@/lib/admin/operationalTasksWorkspaceEnrichment";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: vi.fn(async () => [
        { status_key: "new_lead", status_label: "New Lead", entity_type: "opportunities" },
    ]),
    displayLabelsFromDefinitions: vi.fn((defs: { status_key: string; status_label: string }[]) =>
        new Map(defs.map((d) => [d.status_key, d.status_label]))
    ),
}));

vi.mock("@/lib/admin/entityLabelsResolve", () => ({
    resolveEntityLabelsForOrgCached: vi.fn(async () => ({
        effective: [{ entity_type: "opportunities", singular: "Lead", plural: "Leads" }],
        defaults: [],
        overrides: [],
        org_industry_id: null,
        industry: null,
    })),
}));

const orgId = "11111111-1111-4111-8111-111111111111";
const oppId = "33333333-3333-4333-8333-333333333333";
const customerId = "44444444-4444-4444-8444-444444444444";
const personId = "55555555-5555-4555-8555-555555555555";
const taskId = "66666666-6666-4666-8666-666666666666";

function baseTask(overrides: Partial<OperationalTaskRow> = {}): OperationalTaskRow {
    return {
        id: taskId,
        org_id: orgId,
        entity_type: "opportunities",
        entity_id: oppId,
        assigned_to_user_id: null,
        created_by: "22222222-2222-4222-8222-222222222222",
        title: "Call back",
        description: null,
        due_at: "2026-06-01T12:00:00.000Z",
        status: "open",
        source: "task_assist",
        proposal_id: null,
        metadata: {},
        created_at: "2026-05-01T12:00:00.000Z",
        updated_at: "2026-05-01T12:00:00.000Z",
        ...overrides,
    };
}

function mockSupabase(responses: {
    opportunities?: unknown[];
    customers?: unknown[];
    persons?: unknown[];
    ocm?: unknown[];
    roleTypes?: unknown[];
}) {
    const from = vi.fn((table: string) => {
        const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            in: vi.fn(async () => {
                if (table === "opportunities") {
                    return { data: responses.opportunities ?? [], error: null };
                }
                if (table === "customers") {
                    return { data: responses.customers ?? [], error: null };
                }
                if (table === "persons") {
                    return { data: responses.persons ?? [], error: null };
                }
                if (table === "opportunity_customer_members") {
                    return { data: responses.ocm ?? [], error: null };
                }
                if (table === "customer_person_role_types") {
                    return { data: responses.roleTypes ?? [], error: null };
                }
                return { data: [], error: null };
            }),
        };
        return chain;
    });
    return { from } as never;
}

describe("operationalTasksWorkspaceEnrichment", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("attachOperationalTaskPresentationFields falls back when opportunity missing", () => {
        const row = attachOperationalTaskPresentationFields(baseTask(), new Map());
        expect(row.entity_label).toBeNull();
        expect(row.children_labels).toEqual([]);
        expect(row.contact_field_label).toBeNull();
    });

    it("enrichOperationalTasksForWorkspace bulk-attaches opportunity, household, contact, children, status", async () => {
        const supabase = mockSupabase({
            opportunities: [
                {
                    id: oppId,
                    name: "Chen family lead",
                    title: null,
                    status: null,
                    status_key: "new_lead",
                    customer_id: customerId,
                    primary_person_id: personId,
                    location_id: "77777777-7777-4777-8777-777777777777",
                    metadata: { inquiry_children: [{ display_name: "Avery Chen" }] },
                },
            ],
            customers: [{ id: customerId, name: "Chen Family" }],
            persons: [{ id: personId, full_name: null, first_name: "Jamie", last_name: "Chen" }],
            ocm: [
                {
                    opportunity_id: oppId,
                    customer_members: {
                        display_name: "Avery Chen",
                        first_name: "Avery",
                        last_name: "Chen",
                        relationship: "child",
                        persons: null,
                    },
                },
            ],
            roleTypes: [{ key: "guardian", label: "Guardian" }],
        });

        const enriched = await enrichOperationalTasksForWorkspace({
            supabase,
            orgId,
            tasks: [baseTask()],
        });

        expect(enriched).toHaveLength(1);
        expect(enriched[0]?.entity_label).toBe("Chen family lead");
        expect(enriched[0]?.household_label).toBe("Chen Family");
        expect(enriched[0]?.contact_label).toBe("Jamie Chen");
        expect(enriched[0]?.status_label).toBe("New Lead");
        expect(enriched[0]?.contact_field_label).toBe("Guardian");
        expect(enriched[0]?.children_labels).toContain("Avery Chen");
        expect(enriched[0]?.location_id).toBe("77777777-7777-4777-8777-777777777777");
    });

    it("enrichOperationalTasksForWorkspace gracefully handles missing customer and person", async () => {
        const supabase = mockSupabase({
            opportunities: [
                {
                    id: oppId,
                    name: "Standalone lead",
                    title: null,
                    status: "Open",
                    status_key: null,
                    customer_id: null,
                    primary_person_id: null,
                    location_id: null,
                    metadata: {},
                },
            ],
            roleTypes: [],
        });

        const enriched = await enrichOperationalTasksForWorkspace({
            supabase,
            orgId,
            tasks: [baseTask()],
        });

        expect(enriched[0]?.entity_label).toBe("Standalone lead");
        expect(enriched[0]?.household_label).toBeNull();
        expect(enriched[0]?.contact_label).toBeNull();
        expect(enriched[0]?.children_labels).toEqual([]);
    });
});
