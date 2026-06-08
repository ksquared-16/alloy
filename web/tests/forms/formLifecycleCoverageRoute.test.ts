import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/admin/forms/[formId]/lifecycle-coverage/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const FORM_ID = "8432c527-8799-4a55-88c7-f860bd78e747";
const DEPT_ID = "04958a78-32ca-4091-bcd3-4bbaef3fee4b";

const { mockGetAdminContext, mockGetAdminAccessContext, storeRef } = vi.hoisted(() => {
    const storeRef: {
        forms: Record<string, Record<string, unknown>>;
        versions: Record<string, Record<string, unknown>>;
        departments: Record<string, Record<string, unknown>>;
    } = {
        forms: {},
        versions: {},
        departments: {},
    };
    return {
        mockGetAdminContext: vi.fn(),
        mockGetAdminAccessContext: vi.fn(),
        storeRef,
    };
});

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return {
        ...actual,
        getAdminContextCached: mockGetAdminContext,
    };
});

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext"
    );
    return {
        ...actual,
        getAdminAccessContextCached: mockGetAdminAccessContext,
    };
});

vi.mock("@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle", () => ({
    loadOrgFieldDefinitionsForLifecycle: vi.fn(async () => ({})),
}));

function makeSupabaseMock() {
    type Q = {
        table: string;
        filters: Record<string, unknown>;
        mode: "none" | "insert" | "update" | "select";
        updatePatch: Record<string, unknown> | null;
        orderCol: string | null;
        orderAsc: boolean;
    };

    function resolveRows(q: Q): Record<string, unknown>[] {
        if (q.table === "form_definitions") {
            return Object.values(storeRef.forms).filter((r) => {
                for (const [k, v] of Object.entries(q.filters)) {
                    if ((r as Record<string, unknown>)[k] !== v) return false;
                }
                return true;
            });
        }
        if (q.table === "form_definition_versions") {
            return Object.values(storeRef.versions).filter((r) => {
                for (const [k, v] of Object.entries(q.filters)) {
                    if ((r as Record<string, unknown>)[k] !== v) return false;
                }
                return true;
            });
        }
        if (q.table === "departments") {
            return Object.values(storeRef.departments).filter((r) => {
                for (const [k, v] of Object.entries(q.filters)) {
                    if ((r as Record<string, unknown>)[k] !== v) return false;
                }
                return true;
            });
        }
        return [];
    }

    function createQuery(table: string): Q & Record<string, unknown> {
        const q: Q = {
            table,
            filters: {},
            mode: "none",
            updatePatch: null,
            orderCol: null,
            orderAsc: true,
        };

        const chain: Record<string, unknown> = {
            update: (patch: Record<string, unknown>) => {
                q.mode = "update";
                q.updatePatch = patch;
                return chain;
            },
            select: () => {
                if (q.mode === "none") q.mode = "select";
                return chain;
            },
            eq: (col: string, val: unknown) => {
                q.filters[col] = val;
                return chain;
            },
            order: (col: string, opts?: { ascending?: boolean }) => {
                q.orderCol = col;
                q.orderAsc = opts?.ascending !== false;
                return chain;
            },
            maybeSingle: async () => {
                const rows = resolveRows(q);
                if (q.mode === "update" && q.updatePatch && rows.length === 1) {
                    const id = (rows[0] as { id: string }).id;
                    storeRef.forms[id] = { ...rows[0], ...q.updatePatch };
                    return { data: storeRef.forms[id], error: null };
                }
                return { data: rows[0] ?? null, error: null };
            },
            single: async () => {
                const rows = resolveRows(q);
                if (q.mode === "update" && q.updatePatch && rows.length === 1) {
                    const id = (rows[0] as { id: string }).id;
                    storeRef.forms[id] = { ...rows[0], ...q.updatePatch };
                    return { data: storeRef.forms[id], error: null };
                }
                if (!rows.length) return { data: null, error: { code: "PGRST116" } };
                return { data: rows[0], error: null };
            },
        };

        chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            Promise.resolve(resolveThenable(q)).then(onFulfilled, onRejected);

        return chain as Q & Record<string, unknown>;
    }

    function resolveThenable(q: Q) {
        let rows = resolveRows(q);
        if (q.orderCol) {
            rows = [...rows].sort((a, b) => {
                const av = (a as Record<string, unknown>)[q.orderCol!];
                const bv = (b as Record<string, unknown>)[q.orderCol!];
                if (av === bv) return 0;
                const gt = String(av) > String(bv);
                return gt ? (q.orderAsc ? 1 : -1) : q.orderAsc ? -1 : 1;
            });
        }
        return { data: rows, error: null };
    }

    return { from: (table: string) => createQuery(table) };
}

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => makeSupabaseMock(),
}));

const WEBSITE_SCHEMA = {
    schema_version: 1,
    title: "Website Inquiry",
    sections: [{ id: "main", field_ids: ["guardian_first_name", "guardian_last_name", "guardian_email"] }],
    fields: [
        {
            id: "guardian_first_name",
            type: "text",
            label: "Guardian first name",
            required: true,
            field_source: {
                entity_type: "guardian",
                field_key: "guardian_first_name",
                crm_mapping_key: "guardian.first_name",
            },
        },
        {
            id: "guardian_last_name",
            type: "text",
            label: "Guardian last name",
            required: true,
            field_source: {
                entity_type: "guardian",
                field_key: "guardian_last_name",
                crm_mapping_key: "guardian.last_name",
            },
        },
        {
            id: "guardian_email",
            type: "text",
            label: "Guardian email",
            required: false,
            field_source: {
                entity_type: "guardian",
                field_key: "guardian_email",
                crm_mapping_key: "guardian.email",
            },
        },
    ],
};

describe("form lifecycle coverage API", () => {
    beforeEach(() => {
        storeRef.forms = {
            [FORM_ID]: {
                id: FORM_ID,
                org_id: ORG,
                key: "website_inquiry",
                name: "Website Inquiry",
                metadata: {},
            },
        };
        storeRef.versions = {
            v1: {
                id: "v1",
                org_id: ORG,
                form_definition_id: FORM_ID,
                version_number: 1,
                status: "published",
                schema_json: WEBSITE_SCHEMA,
            },
        };
        storeRef.departments = {
            [DEPT_ID]: {
                id: DEPT_ID,
                org_id: ORG,
                name: "Enrollment",
                metadata: {},
            },
        };

        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId: ORG,
            userId: USER,
            role: "admin",
        });
        mockGetAdminAccessContext.mockResolvedValue({
            ok: true,
            userId: USER,
            orgId: ORG,
            roleKeys: ["admin"],
            permissionKeys: [],
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        });
    });

    it("GET returns empty presentation when lifecycle usage is not configured", async () => {
        const res = await GET(new NextRequest("http://localhost/test"), {
            params: Promise.resolve({ formId: FORM_ID }),
        });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.configured).toBe(false);
        expect(json.data.presentation.status).toBe("empty");
    });

    it("GET returns coverage when lifecycle usage is configured", async () => {
        storeRef.forms[FORM_ID] = {
            ...storeRef.forms[FORM_ID],
            metadata: {
                lifecycle_usage_v1: {
                    version: 1,
                    department_id: DEPT_ID,
                    stage_key: "lead",
                    intake_intent: "enrollment_lead",
                },
            },
        };

        const res = await GET(new NextRequest("http://localhost/test"), {
            params: Promise.resolve({ formId: FORM_ID }),
        });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.configured).toBe(true);
        expect(json.data.presentation.status).toBe("ready");
        expect(json.data.department_name).toBe("Enrollment");
    });

    it("PATCH stores lifecycle_usage_v1 and syncs intake_intent", async () => {
        const res = await PATCH(
            new NextRequest("http://localhost/test", {
                method: "PATCH",
                body: JSON.stringify({
                    lifecycle_usage_v1: {
                        department_id: DEPT_ID,
                        stage_key: "lead",
                        intake_intent: "enrollment_lead",
                    },
                }),
            }),
            { params: Promise.resolve({ formId: FORM_ID }) }
        );
        const json = await res.json();

        expect(res.status).toBe(200);
        const md = json.data.form.metadata as Record<string, unknown>;
        expect(md.intake_intent).toBe("enrollment_lead");
        expect(md.lifecycle_usage_v1).toMatchObject({
            department_id: DEPT_ID,
            stage_key: "lead",
            intake_intent: "enrollment_lead",
        });
        expect(json.data.presentation.status).toBe("ready");
    });
});
