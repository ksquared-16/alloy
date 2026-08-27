import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listForms, POST as createForm } from "@/app/api/admin/forms/route";
import { POST as createVersion } from "@/app/api/admin/forms/[formId]/versions/route";
import { PATCH as patchVersion } from "@/app/api/admin/forms/[formId]/versions/[versionId]/route";
import { POST as publishVersion } from "@/app/api/admin/forms/[formId]/versions/[versionId]/publish/route";
import {
    GET as listSubmissions,
    POST as createSubmission,
} from "@/app/api/admin/forms/submissions/route";
import { POST as submitSubmission } from "@/app/api/admin/forms/submissions/[submissionId]/submit/route";
import { GET as listPublicLinks, POST as createPublicLink } from "@/app/api/admin/forms/[formId]/public-links/route";
import { PATCH as patchPublicLink } from "@/app/api/admin/forms/[formId]/public-links/[linkId]/route";
import { GET as getSubmission } from "@/app/api/admin/forms/submissions/[submissionId]/route";
import { POST as confirmLinkage } from "@/app/api/admin/forms/submissions/[submissionId]/confirm-linkage/route";
import { POST as manualLink } from "@/app/api/admin/forms/submissions/[submissionId]/manual-link/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const USER = "22222222-2222-4222-8222-222222222222";

const { mockGetAdminContext, storeRef } = vi.hoisted(() => {
    const storeRef: {
        forms: Record<string, Record<string, unknown>>;
        versions: Record<string, Record<string, unknown>>;
        submissions: Record<string, Record<string, unknown>>;
        publicLinks: Record<string, Record<string, unknown>>;
        persons: Record<string, { org_id: string }>;
        customers: Record<string, { org_id: string }>;
        customer_members: Record<string, { org_id: string; customer_id: string }>;
        opportunities: Record<string, { org_id: string; customer_id: string | null }>;
    } = {
        forms: {},
        versions: {},
        submissions: {},
        publicLinks: {},
        persons: {},
        customers: {},
        customer_members: {},
        opportunities: {},
    };
    return { mockGetAdminContext: vi.fn(), storeRef };
});

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return {
        ...actual,
        getAdminContextCached: mockGetAdminContext,
        getAdminContext: mockGetAdminContext,
    };
});

function makeSupabaseMock() {
    type Q = {
        table: string;
        filters: Record<string, unknown>;
        mode: "none" | "insert" | "update" | "select";
        insertRow: Record<string, unknown> | null;
        updatePatch: Record<string, unknown> | null;
        orderCol: string | null;
        orderAsc: boolean;
        limitN: number | null;
        selectCols: string;
    };

    function createQuery(table: string): Q & Record<string, unknown> {
        const q: Q = {
            table,
            filters: {},
            mode: "none",
            insertRow: null,
            updatePatch: null,
            orderCol: null,
            orderAsc: true,
            limitN: null,
            selectCols: "*",
        };

        const chain: Record<string, unknown> = {
            insert: (row: Record<string, unknown>) => {
                q.mode = "insert";
                q.insertRow = row;
                return chain;
            },
            update: (patch: Record<string, unknown>) => {
                q.mode = "update";
                q.updatePatch = patch;
                return chain;
            },
            select: (cols?: string) => {
                if (q.mode === "none") q.mode = "select";
                q.selectCols = cols ?? "*";
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
            limit: (n: number) => {
                q.limitN = n;
                return chain;
            },
            maybeSingle: async () => resolveMaybeSingle(q),
            single: async () => resolveSingle(q),
        };

        chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            resolveThenable(q).then(onFulfilled, onRejected);

        return chain as Q & Record<string, unknown>;
    }

    async function resolveThenable(q: Q) {
        if (q.table === "form_submission_documents" && q.mode === "select") {
            return { data: [], error: null };
        }
        if (
            q.table === "form_definition_versions" &&
            q.mode === "select" &&
            q.filters.org_id &&
            q.filters.status === "published" &&
            q.filters.form_definition_id === undefined
        ) {
            const org = q.filters.org_id as string;
            const rows = Object.values(storeRef.versions).filter(
                (r) =>
                    (r as { org_id: string }).org_id === org &&
                    (r as { status: string }).status === "published"
            );
            const slim = rows.map((r) => ({
                form_definition_id: (r as { form_definition_id: string }).form_definition_id,
            }));
            return { data: slim, error: null };
        }
        if (q.table === "form_definitions" && q.mode === "select" && q.filters.org_id && !q.filters.id) {
            const org = q.filters.org_id as string;
            let rows = Object.values(storeRef.forms).filter((r) => (r as { org_id: string }).org_id === org);
            if (q.orderCol === "key") {
                rows = [...rows].sort((a, b) =>
                    String((a as { key: string }).key).localeCompare(String((b as { key: string }).key))
                );
            }
            return { data: rows, error: null };
        }
        if (q.table === "form_definition_versions" && q.mode === "select" && q.filters.form_definition_id) {
            const org = q.filters.org_id as string;
            const fd = q.filters.form_definition_id as string;
            let rows = Object.values(storeRef.versions).filter(
                (r) =>
                    (r as { org_id: string; form_definition_id: string }).org_id === org &&
                    (r as { form_definition_id: string }).form_definition_id === fd
            );
            if (q.orderCol === "version_number") {
                rows = [...rows].sort((a, b) => {
                    const va = (a as { version_number: number }).version_number;
                    const vb = (b as { version_number: number }).version_number;
                    return q.orderAsc ? va - vb : vb - va;
                });
            }
            return { data: rows, error: null };
        }
        if (q.table === "form_submissions" && q.mode === "select" && q.filters.org_id && !q.filters.id) {
            const org = q.filters.org_id as string;
            let rows = Object.values(storeRef.submissions).filter((r) => (r as { org_id: string }).org_id === org);
            for (const k of Object.keys(q.filters)) {
                if (k === "org_id") continue;
                rows = rows.filter((r) => (r as Record<string, unknown>)[k] === q.filters[k]);
            }
            if (q.orderCol === "created_at") {
                rows = [...rows].sort((a, b) => {
                    const ta = new Date((a as { created_at: string }).created_at).getTime();
                    const tb = new Date((b as { created_at: string }).created_at).getTime();
                    return q.orderAsc ? ta - tb : tb - ta;
                });
            }
            if (q.limitN != null) rows = rows.slice(0, q.limitN);
            return { data: rows, error: null };
        }
        if (
            q.table === "form_public_links" &&
            q.mode === "select" &&
            q.filters.org_id &&
            q.filters.form_definition_id &&
            !q.filters.id
        ) {
            const org = q.filters.org_id as string;
            const fd = q.filters.form_definition_id as string;
            let rows = Object.values(storeRef.publicLinks).filter(
                (r) =>
                    (r as { org_id: string }).org_id === org && (r as { form_definition_id: string }).form_definition_id === fd
            );
            if (q.orderCol === "created_at") {
                rows = [...rows].sort((a, b) => {
                    const ta = new Date((a as { created_at: string }).created_at).getTime();
                    const tb = new Date((b as { created_at: string }).created_at).getTime();
                    return q.orderAsc ? ta - tb : tb - ta;
                });
            }
            const stripped = rows.map((r) => {
                const copy = { ...(r as Record<string, unknown>) };
                delete copy.token_hash;
                return copy;
            });
            return { data: stripped, error: null };
        }
        return resolveMaybeSingle(q);
    }

    async function resolveMaybeSingle(q: Q) {
        if (q.table === "verticals" && q.mode === "select") {
            if (q.filters.slug === "cleaning" && q.filters.is_active === true) {
                return { data: { id: "77777777-7777-4777-8777-777777777777" }, error: null };
            }
            return { data: null, error: null };
        }
        if (
            q.table === "form_public_links" &&
            q.mode === "select" &&
            q.filters.id &&
            q.filters.org_id &&
            q.filters.form_definition_id === undefined
        ) {
            const org = q.filters.org_id as string;
            const id = q.filters.id as string;
            const row = storeRef.publicLinks[id] ?? null;
            if (!row || (row as { org_id: string }).org_id !== org) return { data: null, error: null };
            const safe = { ...(row as Record<string, unknown>) };
            delete safe.token_hash;
            return { data: safe, error: null };
        }
        if (q.table === "form_definitions" && q.mode === "select" && q.filters.id) {
            const org = q.filters.org_id as string;
            const id = q.filters.id as string;
            const row = storeRef.forms[id] ?? null;
            if (row && (row as { org_id: string }).org_id !== org) return { data: null, error: null };
            return { data: row, error: null };
        }
        if (q.table === "form_definition_versions" && q.mode === "select") {
            const org = q.filters.org_id as string | undefined;
            if (
                q.limitN === 1 &&
                q.selectCols.includes("version_number") &&
                q.filters.form_definition_id &&
                !q.filters.id
            ) {
                const fd = q.filters.form_definition_id as string;
                const rows = Object.values(storeRef.versions).filter((r) => {
                    const matchFd = (r as { form_definition_id: string }).form_definition_id === fd;
                    if (!org) return matchFd;
                    return matchFd && (r as { org_id: string }).org_id === org;
                });
                const sorted = rows.sort(
                    (a, b) =>
                        ((b as { version_number: number }).version_number ?? 0) -
                        ((a as { version_number: number }).version_number ?? 0)
                );
                return { data: sorted[0] ?? null, error: null };
            }
            if (q.filters.id) {
                const id = q.filters.id as string;
                const row = storeRef.versions[id] ?? null;
                if (row && (row as { org_id: string }).org_id !== org) return { data: null, error: null };
                return { data: row, error: null };
            }
        }
        if (q.table === "form_submissions" && q.mode === "select" && q.filters.id) {
            const org = q.filters.org_id as string;
            const id = q.filters.id as string;
            const row = storeRef.submissions[id] ?? null;
            if (row && (row as { org_id: string }).org_id !== org) return { data: null, error: null };
            return { data: row, error: null };
        }
        if (q.table === "persons" && q.mode === "select" && q.filters.id && q.filters.org_id) {
            const id = q.filters.id as string;
            const org = q.filters.org_id as string;
            const row = storeRef.persons[id];
            if (row && row.org_id === org) return { data: { id }, error: null };
            return { data: null, error: null };
        }
        if (q.table === "customers" && q.mode === "select" && q.filters.id && q.filters.org_id) {
            const id = q.filters.id as string;
            const org = q.filters.org_id as string;
            const row = storeRef.customers[id];
            if (row && row.org_id === org) return { data: { id }, error: null };
            return { data: null, error: null };
        }
        if (q.table === "customer_members" && q.mode === "select" && q.filters.id && q.filters.org_id) {
            const id = q.filters.id as string;
            const org = q.filters.org_id as string;
            const row = storeRef.customer_members[id];
            if (row && row.org_id === org) return { data: { customer_id: row.customer_id }, error: null };
            return { data: null, error: null };
        }
        if (q.table === "opportunities" && q.mode === "select" && q.filters.id && q.filters.org_id) {
            const id = q.filters.id as string;
            const org = q.filters.org_id as string;
            const row = storeRef.opportunities[id];
            if (row && row.org_id === org) return { data: { customer_id: row.customer_id }, error: null };
            return { data: null, error: null };
        }
        if (q.table === "form_public_links" && q.mode === "select" && q.filters.id) {
            const org = q.filters.org_id as string;
            const fd = q.filters.form_definition_id as string;
            const id = q.filters.id as string;
            const row = storeRef.publicLinks[id] ?? null;
            if (
                !row ||
                (row as { org_id: string }).org_id !== org ||
                (row as { form_definition_id: string }).form_definition_id !== fd
            ) {
                return { data: null, error: null };
            }
            const safe = { ...(row as Record<string, unknown>) };
            delete safe.token_hash;
            return { data: safe, error: null };
        }
        return { data: null, error: null };
    }

    async function resolveSingle(q: Q) {
        if (q.table === "form_definitions" && q.mode === "insert" && q.insertRow) {
            const id = crypto.randomUUID();
            const row = { ...q.insertRow, id, created_at: new Date().toISOString(), updated_at: null };
            storeRef.forms[id] = row;
            return { data: row, error: null };
        }
        if (q.table === "form_definitions" && q.mode === "update" && q.updatePatch) {
            const org = q.filters.org_id as string;
            const id = q.filters.id as string;
            const cur = storeRef.forms[id];
            if (!cur || (cur as { org_id: string }).org_id !== org) {
                return { data: null, error: { code: "PGRST116", message: "No rows" } };
            }
            const row = { ...cur, ...q.updatePatch, updated_at: new Date().toISOString() };
            storeRef.forms[id] = row;
            return { data: row, error: null };
        }
        if (q.table === "form_definition_versions" && q.mode === "insert" && q.insertRow) {
            const id = crypto.randomUUID();
            const row = { ...q.insertRow, id, created_at: new Date().toISOString(), updated_at: null };
            storeRef.versions[id] = row;
            return { data: row, error: null };
        }
        if (q.table === "form_definition_versions" && q.mode === "update" && q.updatePatch) {
            const org = q.filters.org_id as string;
            const id = q.filters.id as string;
            const cur = storeRef.versions[id];
            if (!cur || (cur as { org_id: string }).org_id !== org) {
                return { data: null, error: { code: "PGRST116", message: "No rows" } };
            }
            const curRow = cur as { status: string };
            if (q.filters.status === "draft" && curRow.status !== "draft") {
                return { data: null, error: { code: "PGRST116", message: "No rows" } };
            }
            if ((q.updatePatch as { status?: string }).status === "published" && q.filters.status === "draft") {
                if (curRow.status !== "draft") {
                    return { data: null, error: { code: "PGRST116", message: "No rows" } };
                }
                const row = { ...cur, ...q.updatePatch, updated_at: new Date().toISOString() };
                storeRef.versions[id] = row;
                return { data: row, error: null };
            }
            if ((q.updatePatch as { status?: string }).status === "archived" && q.filters.status === "published") {
                if (curRow.status !== "published") {
                    return { data: null, error: { code: "PGRST116", message: "No rows" } };
                }
                const row = { ...cur, ...q.updatePatch, updated_at: new Date().toISOString() };
                storeRef.versions[id] = row;
                return { data: row, error: null };
            }
            const row = { ...cur, ...q.updatePatch, updated_at: new Date().toISOString() };
            storeRef.versions[id] = row;
            return { data: row, error: null };
        }
        if (q.table === "form_submissions" && q.mode === "insert" && q.insertRow) {
            const id = crypto.randomUUID();
            const row = { ...q.insertRow, id, created_at: new Date().toISOString(), updated_at: null };
            storeRef.submissions[id] = row;
            return { data: row, error: null };
        }
        if (q.table === "form_submissions" && q.mode === "update" && q.updatePatch) {
            const org = q.filters.org_id as string;
            const id = q.filters.id as string;
            const cur = storeRef.submissions[id];
            if (!cur || (cur as { org_id: string }).org_id !== org) {
                return { data: null, error: { code: "PGRST116", message: "No rows" } };
            }
            if (q.filters.status === "draft" && (cur as { status: string }).status !== "draft") {
                return { data: null, error: { code: "PGRST116", message: "No rows" } };
            }
            const row = { ...cur, ...q.updatePatch, updated_at: new Date().toISOString() };
            storeRef.submissions[id] = row;
            return { data: row, error: null };
        }
        if (q.table === "form_public_links" && q.mode === "insert" && q.insertRow) {
            const id = crypto.randomUUID();
            const row = {
                ...q.insertRow,
                id,
                created_at: new Date().toISOString(),
                updated_at: null,
                last_used_at: null,
            };
            storeRef.publicLinks[id] = row;
            const safe = { ...(row as Record<string, unknown>) };
            delete safe.token_hash;
            return { data: safe, error: null };
        }
        if (q.table === "form_public_links" && q.mode === "update" && q.updatePatch) {
            const org = q.filters.org_id as string;
            const fd = q.filters.form_definition_id as string;
            const id = q.filters.id as string;
            const cur = storeRef.publicLinks[id];
            if (
                !cur ||
                (cur as { org_id: string }).org_id !== org ||
                (cur as { form_definition_id: string }).form_definition_id !== fd
            ) {
                return { data: null, error: { code: "PGRST116", message: "No rows" } };
            }
            const row = { ...cur, ...q.updatePatch, updated_at: new Date().toISOString() };
            storeRef.publicLinks[id] = row;
            const safe = { ...(row as Record<string, unknown>) };
            delete safe.token_hash;
            return { data: safe, error: null };
        }
        return { data: null, error: { message: "unmocked single" } };
    }

    return { from: (table: string) => createQuery(table) };
}

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => makeSupabaseMock()),
}));

const validSchema = {
    schema_version: 1 as const,
    title: "Form",
    sections: [{ id: "s1", field_ids: ["name", "color"] }],
    fields: [
        { id: "name", type: "text" as const, label: "Name", required: true },
        {
            id: "color",
            type: "select" as const,
            label: "Color",
            required: true,
            option_set_key: "colors",
        },
    ],
};

beforeEach(() => {
    storeRef.forms = {};
    storeRef.versions = {};
    storeRef.submissions = {};
    storeRef.publicLinks = {};
    storeRef.persons = {};
    storeRef.customers = {};
    storeRef.customer_members = {};
    storeRef.opportunities = {};
    mockGetAdminContext.mockResolvedValue({
        ok: true,
        orgId: ORG,
        userId: USER,
        role: "admin",
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("Admin forms routes", () => {
    it("creates a form without key by slugifying name", async () => {
        const res = await createForm(
            new NextRequest("http://x/api/admin/forms", {
                method: "POST",
                body: JSON.stringify({ name: "Waitlist Intake", kind: "center" }),
                headers: { "Content-Type": "application/json" },
            })
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as { data: { key: string; id: string } };
        expect(j.data.key).toBe("waitlist_intake");
    });

    it("defaults kind to center when omitted on create", async () => {
        const res = await createForm(
            new NextRequest("http://x/api/admin/forms", {
                method: "POST",
                body: JSON.stringify({ name: "Website Inquiry" }),
                headers: { "Content-Type": "application/json" },
            })
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as { data: { id: string; kind: string } };
        expect(j.data.kind).toBe("center");
    });

    it("allocates unique key when slug collides with existing form", async () => {
        const fid = crypto.randomUUID();
        storeRef.forms[fid] = {
            id: fid,
            org_id: ORG,
            key: "waitlist_intake",
            name: "Existing",
            kind: "center",
            is_active: true,
            metadata: {},
        };
        const res = await createForm(
            new NextRequest("http://x/api/admin/forms", {
                method: "POST",
                body: JSON.stringify({ name: "Waitlist Intake", kind: "center" }),
                headers: { "Content-Type": "application/json" },
            })
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as { data: { key: string } };
        expect(j.data.key).toBe("waitlist_intake_2");
    });

    it("creates a form", async () => {
        const res = await createForm(
            new NextRequest("http://x/api/admin/forms", {
                method: "POST",
                body: JSON.stringify({ key: "enrollment", name: "Enrollment", kind: "center" }),
                headers: { "Content-Type": "application/json" },
            })
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as { data: { key: string; id: string } };
        expect(j.data.key).toBe("enrollment");
    });

    it("creates a draft version with valid schema", async () => {
        const fid = crypto.randomUUID();
        storeRef.forms[fid] = {
            id: fid,
            org_id: ORG,
            key: "k",
            name: "N",
            kind: "center",
            is_active: true,
            metadata: {},
        };
        const res = await createVersion(
            new NextRequest("http://x/api/admin/forms/x/versions", {
                method: "POST",
                body: JSON.stringify({ schema_json: validSchema }),
                headers: { "Content-Type": "application/json" },
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as { data: { status: string; version_number: number } };
        expect(j.data.status).toBe("draft");
        expect(j.data.version_number).toBe(1);
    });

    it("rejects invalid schema on version create", async () => {
        const fid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        const res = await createVersion(
            new NextRequest("http://x/api/admin/forms/x/versions", {
                method: "POST",
                body: JSON.stringify({ schema_json: { bad: true } }),
                headers: { "Content-Type": "application/json" },
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(400);
        const j = (await res.json()) as { error: string; validation_errors?: unknown[] };
        expect(j.error).toBeTruthy();
        expect(j.validation_errors?.length).toBeGreaterThan(0);
    });

    it("publishes a valid draft version", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "draft",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };
        const res = await publishVersion(new NextRequest("http://x"), {
            params: Promise.resolve({ formId: fid, versionId: vid }),
        });
        expect(res.status).toBe(200);
        const j = (await res.json()) as { data: { status: string } };
        expect(j.data.status).toBe("published");
    });

    it("rejects publish when draft has no questions", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "draft",
            schema_json: {
                schema_version: 1,
                title: "Empty",
                sections: [{ id: "main", title: "Questions", field_ids: [] }],
                fields: [],
            },
            pdf_mapping_json: null,
            metadata: {},
        };
        const res = await publishVersion(new NextRequest("http://x"), {
            params: Promise.resolve({ formId: fid, versionId: vid }),
        });
        expect(res.status).toBe(400);
        const j = (await res.json()) as { error: string };
        expect(j.error).toMatch(/at least one question/i);
    });

    it("rejects PATCH on published version", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };
        const res = await patchVersion(
            new NextRequest("http://x", {
                method: "PATCH",
                body: JSON.stringify({ schema_json: validSchema }),
                headers: { "Content-Type": "application/json" },
            }),
            { params: Promise.resolve({ formId: fid, versionId: vid }) }
        );
        expect(res.status).toBe(409);
    });

    it("creates draft submission and submits valid payload", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };

        const cr = await createSubmission(
            new NextRequest("http://x", {
                method: "POST",
                body: JSON.stringify({
                    form_definition_version_id: vid,
                    payload: { values: {} },
                }),
                headers: { "Content-Type": "application/json" },
            })
        );
        expect(cr.status).toBe(201);
        const cj = (await cr.json()) as { data: { id: string; status: string } };
        expect(cj.data.status).toBe("draft");

        const sr = await submitSubmission(
            new NextRequest("http://x", {
                method: "POST",
                body: JSON.stringify({
                    payload: {
                        values: { name: "Ada", color: "blue" },
                    },
                    option_values_by_field_id: { color: ["blue", "red"] },
                }),
                headers: { "Content-Type": "application/json" },
            }),
            { params: Promise.resolve({ submissionId: cj.data.id }) }
        );
        expect(sr.status).toBe(200);
        const sj = (await sr.json()) as { data: { status: string } };
        expect(sj.data.status).toBe("submitted");
    });

    it("rejects submit with invalid payload", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };

        const cr = await createSubmission(
            new NextRequest("http://x", {
                method: "POST",
                body: JSON.stringify({
                    form_definition_version_id: vid,
                    payload: { values: {} },
                }),
                headers: { "Content-Type": "application/json" },
            })
        );
        const cj = (await cr.json()) as { data: { id: string } };

        const sr = await submitSubmission(
            new NextRequest("http://x", {
                method: "POST",
                body: JSON.stringify({
                    payload: { values: { name: "", color: "blue" } },
                    option_values_by_field_id: { color: ["blue"] },
                }),
                headers: { "Content-Type": "application/json" },
            }),
            { params: Promise.resolve({ submissionId: cj.data.id }) }
        );
        expect(sr.status).toBe(400);
    });

    it("filters submissions list", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        const sid = crypto.randomUUID();
        storeRef.submissions[sid] = {
            id: sid,
            org_id: ORG,
            form_definition_id: fid,
            form_definition_version_id: vid,
            status: "draft",
            payload: {},
            created_at: new Date().toISOString(),
        };
        const res = await listSubmissions(
            new NextRequest(`http://x/api/admin/forms/submissions?form_definition_id=${fid}&status=draft`)
        );
        expect(res.status).toBe(200);
        const j = (await res.json()) as { data: Array<{ id: string }> };
        expect(j.data.length).toBe(1);
        expect(j.data[0].id).toBe(sid);
    });

    it("GET submission includes schema_json and linked_documents", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        const sid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
            published_at: new Date().toISOString(),
        };
        storeRef.submissions[sid] = {
            id: sid,
            org_id: ORG,
            form_definition_id: fid,
            form_definition_version_id: vid,
            status: "submitted",
            payload: { values: { name: "Ada", color: "blue" } },
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
        };
        const res = await getSubmission(new NextRequest("http://x"), {
            params: Promise.resolve({ submissionId: sid }),
        });
        expect(res.status).toBe(200);
        const j = (await res.json()) as {
            data: { schema_json: unknown; linked_documents: unknown[]; id: string };
        };
        expect(j.data.id).toBe(sid);
        expect(j.data.schema_json).toEqual(validSchema);
        expect(Array.isArray(j.data.linked_documents)).toBe(true);
        expect(j.data.linked_documents.length).toBe(0);
        expect((j.data as { org_id?: string }).org_id).toBeUndefined();
        expect((j.data as { public_link_intake_debug?: unknown }).public_link_intake_debug ?? null).toBeNull();
    });

    it("GET submission includes public_link_intake_debug when created via public link", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        const sid = crypto.randomUUID();
        const lid = crypto.randomUUID();
        const vert = "77777777-7777-4777-8777-777777777777";
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
            published_at: new Date().toISOString(),
        };
        storeRef.publicLinks[lid] = {
            id: lid,
            org_id: ORG,
            form_definition_id: fid,
            token_hash: "h",
            token_prefix: "pre",
            pinned_form_definition_version_id: null,
            is_active: true,
            expires_at: null,
            allowed_embed_origins: null,
            metadata: { lead_capture: true, default_vertical_id: vert },
            rate_limit_profile: null,
            created_at: new Date().toISOString(),
            updated_at: null,
            last_used_at: null,
        };
        storeRef.submissions[sid] = {
            id: sid,
            org_id: ORG,
            form_definition_id: fid,
            form_definition_version_id: vid,
            status: "submitted",
            payload: { values: { name: "Ada", color: "blue" } },
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
            created_via_public_link_id: lid,
        };
        const res = await getSubmission(new NextRequest("http://x"), {
            params: Promise.resolve({ submissionId: sid }),
        });
        expect(res.status).toBe(200);
        const j = (await res.json()) as {
            data: { public_link_intake_debug?: { public_link_id: string | null; lead_capture: boolean } };
        };
        expect(j.data.public_link_intake_debug?.public_link_id).toBe(lid);
        expect(j.data.public_link_intake_debug?.lead_capture).toBe(true);
    });

    it("POST public link merges medication demo intake defaults", async () => {
        const fid = crypto.randomUUID();
        storeRef.forms[fid] = {
            id: fid,
            org_id: ORG,
            key: "medication_authorization_demo",
            name: "Med demo",
            kind: "center",
            is_active: true,
            metadata: {},
        };
        const res = await createPublicLink(
            new NextRequest("http://localhost:3000/api/x", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Host: "localhost:3000",
                    "x-forwarded-proto": "http",
                },
                body: JSON.stringify({ metadata: { label: "Test link" } }),
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as {
            data: { metadata: Record<string, unknown>; id: string };
        };
        expect(j.data.metadata.lead_capture).toBe(true);
        expect(j.data.metadata.default_vertical_id).toBe("77777777-7777-4777-8777-777777777777");
        expect(j.data.metadata.auto_create_person).toBe(true);
        expect(j.data.metadata.label).toBe("Test link");
    });

    it("returns 403 for mutations when role is ops", async () => {
        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId: ORG,
            userId: USER,
            role: "ops",
        });
        const res = await createForm(
            new NextRequest("http://x", {
                method: "POST",
                body: JSON.stringify({ key: "a", name: "A", kind: "center" }),
                headers: { "Content-Type": "application/json" },
            })
        );
        expect(res.status).toBe(403);
    });

    it("returns 401 when context fails unauthenticated", async () => {
        mockGetAdminContext.mockResolvedValue({ ok: false, status: 401 });
        const res = await listForms(new NextRequest("http://x"));
        expect(res.status).toBe(401);
    });

    it("POST public link returns plaintext_token once and embed_path, on the CONFIGURED origin", async () => {
        // The embed origin used to be derived from the request's own Host /
        // X-Forwarded-Host headers. Those are caller-supplied, and this link is copied
        // into messages that leave the building — so the hostile Host below must have no
        // effect at all, and the configured public origin must win.
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.workwithalloy.com");
        const fid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        const res = await createPublicLink(
            new NextRequest("http://localhost:3000/api/x", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Host: "attacker.example.com",
                    "x-forwarded-host": "attacker.example.com",
                    "x-forwarded-proto": "http",
                },
                body: JSON.stringify({ label: "Camp", allowed_embed_origins: ["http://localhost:3000"] }),
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as {
            data: {
                plaintext_token: string;
                embed_path: string;
                embed_url: string | null;
                token_hash?: string;
                metadata: Record<string, unknown>;
            };
        };
        expect(j.data.plaintext_token.length).toBeGreaterThan(20);
        expect(j.data.embed_path).toContain("/forms/embed/");
        expect(j.data.embed_url?.startsWith("https://staging.workwithalloy.com/forms/embed/")).toBe(true);
        expect(j.data.embed_url).not.toContain("attacker.example.com");
        expect(j.data.token_hash).toBeUndefined();
        expect(j.data.metadata.label).toBe("Camp");
        vi.unstubAllEnvs();
    });

    it("POST public link launch_from_entity stamps existing_record metadata", async () => {
        const fid = crypto.randomUUID();
        const pid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.persons[pid] = { org_id: ORG };
        const res = await createPublicLink(
            new NextRequest("http://localhost:3000/api/x", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Host: "localhost:3000",
                    "x-forwarded-proto": "http",
                },
                body: JSON.stringify({
                    launch_from_entity: { entity_type: "person", entity_id: pid },
                }),
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as { data: { metadata: Record<string, unknown> } };
        expect(j.data.metadata.form_context_mode).toBe("existing_record");
        expect(j.data.metadata.source_entity_type).toBe("person");
        expect(j.data.metadata.source_entity_id).toBe(pid);
        expect(j.data.metadata.prefill_enabled).toBe(true);
        expect(j.data.metadata.lead_capture).toBe(true);
        expect(j.data.metadata.intake).toBe(true);
        expect(j.data.metadata.auto_create_opportunity).toBe(false);
    });

    it("POST public link launch_from_entity prefill_only skips intake", async () => {
        const fid = crypto.randomUUID();
        const pid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.persons[pid] = { org_id: ORG };
        const res = await createPublicLink(
            new NextRequest("http://localhost:3000/api/x", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Host: "localhost:3000",
                    "x-forwarded-proto": "http",
                },
                body: JSON.stringify({
                    launch_from_entity: { entity_type: "person", entity_id: pid, prefill_only: true },
                }),
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as { data: { metadata: Record<string, unknown> } };
        expect(j.data.metadata.lead_capture).toBe(false);
        expect(j.data.metadata.intake).toBe(false);
    });

    it("POST public link launch_from_entity rejects entity from another org", async () => {
        const fid = crypto.randomUUID();
        const pid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.persons[pid] = { org_id: OTHER_ORG };
        const res = await createPublicLink(
            new NextRequest("http://localhost:3000/api/x", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Host: "localhost:3000",
                    "x-forwarded-proto": "http",
                },
                body: JSON.stringify({
                    launch_from_entity: { entity_type: "person", entity_id: pid },
                }),
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(400);
    });

    it("POST public link accepts trusted prefill_field_map body", async () => {
        const fid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        const res = await createPublicLink(
            new NextRequest("http://localhost:3000/api/x", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Host: "localhost:3000",
                    "x-forwarded-proto": "http",
                },
                body: JSON.stringify({
                    prefill_field_map: { child_first_name: "customer_member.first_name" },
                }),
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as { data: { metadata: Record<string, unknown> } };
        expect(j.data.metadata.prefill_field_map).toEqual({
            child_first_name: "customer_member.first_name",
        });
    });

    it("POST public link rejects invalid prefill_field_map paths", async () => {
        const fid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        const res = await createPublicLink(
            new NextRequest("http://localhost:3000/api/x", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Host: "localhost:3000",
                    "x-forwarded-proto": "http",
                },
                body: JSON.stringify({
                    prefill_field_map: { x: "not.valid.path" },
                }),
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(400);
    });

    it("GET public links omits token_hash and plaintext", async () => {
        const fid = crypto.randomUUID();
        const lid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.publicLinks[lid] = {
            id: lid,
            org_id: ORG,
            form_definition_id: fid,
            token_hash: "secret-hash",
            token_prefix: "abc",
            pinned_form_definition_version_id: null,
            is_active: true,
            expires_at: null,
            allowed_embed_origins: null,
            metadata: {},
            rate_limit_profile: null,
            created_at: new Date().toISOString(),
            updated_at: null,
            last_used_at: null,
        };
        const res = await listPublicLinks(new NextRequest("http://x"), { params: Promise.resolve({ formId: fid }) });
        expect(res.status).toBe(200);
        const j = (await res.json()) as { data: Array<Record<string, unknown>> };
        expect(j.data.length).toBe(1);
        expect(j.data[0].token_hash).toBeUndefined();
        expect(j.data[0].plaintext_token).toBeUndefined();
        expect(j.data[0].id).toBe(lid);
    });

    it("PATCH public link updates mutable fields", async () => {
        const fid = crypto.randomUUID();
        const lid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.publicLinks[lid] = {
            id: lid,
            org_id: ORG,
            form_definition_id: fid,
            token_hash: "h",
            token_prefix: "pre",
            pinned_form_definition_version_id: null,
            is_active: true,
            expires_at: null,
            allowed_embed_origins: null,
            metadata: {},
            rate_limit_profile: null,
            created_at: new Date().toISOString(),
            updated_at: null,
            last_used_at: null,
        };
        const res = await patchPublicLink(
            new NextRequest("http://x", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    is_active: false,
                    metadata: { note: "paused" },
                    allowed_embed_origins: ["https://example.com"],
                }),
            }),
            { params: Promise.resolve({ formId: fid, linkId: lid }) }
        );
        expect(res.status).toBe(200);
        const j = (await res.json()) as { data: { is_active: boolean; metadata: { note: string } } };
        expect(j.data.is_active).toBe(false);
        expect(j.data.metadata.note).toBe("paused");
        expect(storeRef.publicLinks[lid].token_hash).toBe("h");
    });

    it("PATCH public link merges metadata without dropping unknown keys (IC-1c)", async () => {
        const fid = crypto.randomUUID();
        const lid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.publicLinks[lid] = {
            id: lid,
            org_id: ORG,
            form_definition_id: fid,
            token_hash: "h",
            token_prefix: "pre",
            pinned_form_definition_version_id: null,
            is_active: true,
            expires_at: null,
            allowed_embed_origins: null,
            metadata: { runtime_test: "keep", label: "Demo" },
            rate_limit_profile: null,
            created_at: new Date().toISOString(),
            updated_at: null,
            last_used_at: null,
        };
        const res = await patchPublicLink(
            new NextRequest("http://x", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    metadata: { lead_capture: true, auto_operationalize: true, review_mode: "confidence" },
                }),
            }),
            { params: Promise.resolve({ formId: fid, linkId: lid }) }
        );
        expect(res.status).toBe(200);
        const j = (await res.json()) as { data: { metadata: Record<string, unknown> } };
        expect(j.data.metadata.runtime_test).toBe("keep");
        expect(j.data.metadata.label).toBe("Demo");
        expect(j.data.metadata.auto_operationalize).toBe(true);
        expect(j.data.metadata.review_mode).toBe("confidence");
    });

    it("returns 404 when form belongs to another org", async () => {
        const fid = crypto.randomUUID();
        storeRef.forms[fid] = {
            id: fid,
            org_id: OTHER_ORG,
            key: "k",
            name: "N",
            kind: "center",
            is_active: true,
            metadata: {},
        };
        const res = await listPublicLinks(new NextRequest("http://x"), { params: Promise.resolve({ formId: fid }) });
        expect(res.status).toBe(404);
    });

    it("rejects pinned version from another form", async () => {
        const fid = crypto.randomUUID();
        const otherFid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "a", name: "A", kind: "center", is_active: true, metadata: {} };
        storeRef.forms[otherFid] = {
            id: otherFid,
            org_id: ORG,
            key: "b",
            name: "B",
            kind: "center",
            is_active: true,
            metadata: {},
        };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: otherFid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };
        const res = await createPublicLink(
            new NextRequest("http://x", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pinned_form_definition_version_id: vid }),
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(400);
        const j = (await res.json()) as { error: string };
        expect(j.error.toLowerCase()).toContain("pinned");
    });

    it("returns 403 when ops tries to create public link", async () => {
        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId: ORG,
            userId: USER,
            role: "ops",
        });
        const fid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        const res = await createPublicLink(
            new NextRequest("http://x", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            }),
            { params: Promise.resolve({ formId: fid }) }
        );
        expect(res.status).toBe(403);
    });

    it("POST confirm-linkage clears intake_needs_review and stamps reviewer", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        const sid = crypto.randomUUID();
        const pid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };
        storeRef.submissions[sid] = {
            id: sid,
            org_id: ORG,
            form_definition_id: fid,
            form_definition_version_id: vid,
            status: "submitted",
            person_id: pid,
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
            payload: {
                values: { name: "Ada", color: "blue" },
                meta: {
                    intake_resolution_path: "matched_email",
                    intake_needs_review: true,
                },
            },
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
        };
        const res = await confirmLinkage(new NextRequest("http://x"), {
            params: Promise.resolve({ submissionId: sid }),
        });
        expect(res.status).toBe(200);
        const j = (await res.json()) as { data: { payload: { meta: Record<string, unknown> } } };
        expect(j.data.payload.meta.intake_needs_review).toBe(false);
        expect(j.data.payload.meta.intake_review_result).toBe("confirmed");
        expect(j.data.payload.meta.intake_reviewed_by).toBe(USER);
        expect((storeRef.submissions[sid].payload as { meta: Record<string, unknown> }).meta.intake_review_result).toBe(
            "confirmed"
        );
    });

    it("POST confirm-linkage allowed for ops role", async () => {
        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId: ORG,
            userId: USER,
            role: "ops",
        });
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        const sid = crypto.randomUUID();
        const pid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };
        storeRef.submissions[sid] = {
            id: sid,
            org_id: ORG,
            form_definition_id: fid,
            form_definition_version_id: vid,
            status: "submitted",
            person_id: pid,
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
            payload: {
                values: { name: "Ada", color: "blue" },
                meta: { intake_resolution_path: "matched_email", intake_needs_review: true },
            },
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
        };
        const res = await confirmLinkage(new NextRequest("http://x"), {
            params: Promise.resolve({ submissionId: sid }),
        });
        expect(res.status).toBe(200);
    });

    it("POST manual-link sets FKs, derives customer from member, and stamps meta", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        const sid = crypto.randomUUID();
        const cid = crypto.randomUUID();
        const mid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };
        storeRef.customers[cid] = { org_id: ORG };
        storeRef.customer_members[mid] = { org_id: ORG, customer_id: cid };
        storeRef.submissions[sid] = {
            id: sid,
            org_id: ORG,
            form_definition_id: fid,
            form_definition_version_id: vid,
            status: "submitted",
            person_id: null,
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
            payload: {
                values: { name: "Ada", color: "blue" },
                meta: { intake_resolution_path: "needs_human_review", intake_needs_review: true },
            },
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
        };
        const res = await manualLink(
            new NextRequest("http://x", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer_member_id: mid }),
            }),
            { params: Promise.resolve({ submissionId: sid }) }
        );
        expect(res.status).toBe(200);
        const j = (await res.json()) as {
            data: {
                customer_member_id: string;
                customer_id: string;
                payload: { meta: Record<string, unknown> };
            };
        };
        expect(j.data.customer_member_id).toBe(mid);
        expect(j.data.customer_id).toBe(cid);
        expect(j.data.payload.meta.intake_resolution_path).toBe("manually_linked");
        expect(j.data.payload.meta.intake_review_result).toBe("corrected");
    });

    it("POST manual-link rejects customer_member from another org", async () => {
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        const sid = crypto.randomUUID();
        const mid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };
        storeRef.customer_members[mid] = { org_id: OTHER_ORG, customer_id: crypto.randomUUID() };
        storeRef.submissions[sid] = {
            id: sid,
            org_id: ORG,
            form_definition_id: fid,
            form_definition_version_id: vid,
            status: "submitted",
            person_id: null,
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
            payload: { values: { name: "Ada", color: "blue" }, meta: {} },
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
        };
        const res = await manualLink(
            new NextRequest("http://x", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customer_member_id: mid }),
            }),
            { params: Promise.resolve({ submissionId: sid }) }
        );
        expect(res.status).toBe(400);
    });

    it("POST manual-link returns 403 for ops role", async () => {
        mockGetAdminContext.mockResolvedValue({
            ok: true,
            orgId: ORG,
            userId: USER,
            role: "ops",
        });
        const fid = crypto.randomUUID();
        const vid = crypto.randomUUID();
        const sid = crypto.randomUUID();
        storeRef.forms[fid] = { id: fid, org_id: ORG, key: "k", name: "N", kind: "center", is_active: true, metadata: {} };
        storeRef.versions[vid] = {
            id: vid,
            org_id: ORG,
            form_definition_id: fid,
            version_number: 1,
            status: "published",
            schema_json: validSchema,
            pdf_mapping_json: null,
            metadata: {},
        };
        storeRef.submissions[sid] = {
            id: sid,
            org_id: ORG,
            form_definition_id: fid,
            form_definition_version_id: vid,
            status: "submitted",
            person_id: null,
            customer_id: null,
            customer_member_id: null,
            opportunity_id: null,
            payload: { values: { name: "Ada", color: "blue" }, meta: {} },
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
        };
        const res = await manualLink(
            new NextRequest("http://x", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ person_id: crypto.randomUUID() }),
            }),
            { params: Promise.resolve({ submissionId: sid }) }
        );
        expect(res.status).toBe(403);
    });
});
