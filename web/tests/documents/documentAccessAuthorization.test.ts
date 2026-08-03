/**
 * Phase 0 commit 6 — signed-document URL authorization.
 *
 * Behavioral: invokes the real route and the real decision function. The
 * storage client is a spy, so "the admin storage client is never invoked on a
 * blocked request" is asserted directly rather than inferred.
 *
 * No real document content is exposed; nothing produces a permanent URL.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const DOC = "dddddddd-0000-4000-8000-000000000001";

/** Row the fake DB returns; null = no row visible to this org. */
let documentRow: Record<string, unknown> | null = null;
/** Every createSignedUrl call. Must stay empty on any blocked request. */
let signCalls: Array<{ bucket: string; path: string; expires: number }> = [];

const { mockGetAdminContextCached, mockGetAdminAccessContextCached } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockGetAdminAccessContextCached: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext"
    );
    return { ...actual, getAdminAccessContextCached: mockGetAdminAccessContextCached };
});

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({ maybeSingle: async () => ({ data: documentRow, error: null }) }),
                }),
            }),
        }),
        storage: {
            from: (bucket: string) => ({
                createSignedUrl: async (path: string, expires: number) => {
                    signCalls.push({ bucket, path, expires });
                    return { data: { signedUrl: `https://storage.invalid/${path}?sig=x` }, error: null };
                },
            }),
        },
    })),
}));

import { GET as signedUrlGET } from "@/app/api/admin/documents/[id]/signed-url/route";
import {
    assertDocumentAccess,
    signedUrlExpirySeconds,
    DOCUMENT_READ_ROLES,
} from "@/lib/documents/assertDocumentAccess";
import { buildRequest, invokeRoute, routeParams } from "../harness/routeInvoker";

function row(over: Record<string, unknown> = {}) {
    return {
        id: DOC,
        org_id: ORG_A,
        bucket: "org_documents",
        storage_path: `${ORG_A}/persons/abc/file.pdf`,
        entity_type: "persons",
        entity_id: "11111111-0000-4000-8000-000000000001",
        status: null,
        ...over,
    };
}

function actor(role: string, roleKeys: string[] = [], permissionKeys: string[] = [], orgId = ORG_A) {
    mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, role, userId: "u1" });
    mockGetAdminAccessContextCached.mockResolvedValue({ ok: true, orgId, roleKeys, permissionKeys });
}

async function callRoute(id = DOC) {
    return invokeRoute(
        signedUrlGET,
        buildRequest({ method: "GET", path: `/api/admin/documents/${id}/signed-url` }),
        routeParams({ id })
    );
}

beforeEach(() => {
    documentRow = row();
    signCalls = [];
    vi.clearAllMocks();
});

describe("signed-url route — authorization", () => {
    it("unauthenticated access fails and never reaches storage", async () => {
        mockGetAdminContextCached.mockResolvedValue({ ok: false, status: 401 });
        mockGetAdminAccessContextCached.mockResolvedValue({ ok: false, status: 401 });

        const res = await callRoute();

        expect(res.status).toBe(401);
        expect(signCalls).toHaveLength(0);
    });

    it("a low-privilege org member is refused — the defect this commit closes", async () => {
        // BASELINE INVERSION: harnessSelfCheck recorded that a viewer was NOT
        // refused before this commit. It must be refused now.
        actor("viewer", ["viewer"]);

        const res = await callRoute();

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: "INSUFFICIENT_ROLE" });
        expect(signCalls).toHaveLength(0);
    });

    it("refuses every non-privileged role", async () => {
        for (const role of ["viewer", "staff", "guest"]) {
            signCalls = [];
            actor(role, [role]);
            const res = await callRoute();
            expect(res.status, role).toBe(403);
            expect(signCalls, role).toHaveLength(0);
        }
    });

    it("allows each privileged role", async () => {
        for (const role of DOCUMENT_READ_ROLES) {
            signCalls = [];
            actor(role, [role]);
            const res = await callRoute();
            expect(res.status, role).toBe(200);
            expect(signCalls, role).toHaveLength(1);
        }
    });

    it("allows an explicit documents.read permission without a legacy role", async () => {
        actor("viewer", ["viewer"], ["documents.read"]);
        const res = await callRoute();
        expect(res.status).toBe(200);
    });
});

describe("signed-url route — existence is not disclosed", () => {
    it("a guessed document id returns not-found, not a permission error", async () => {
        actor("admin", ["admin"]);
        documentRow = null;

        const res = await callRoute("99999999-0000-4000-8000-000000000009");

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ code: "NOT_FOUND" });
        expect(signCalls).toHaveLength(0);
    });

    it("a cross-org document is indistinguishable from an absent one", async () => {
        actor("admin", ["admin"]);
        documentRow = null; // org-scoped query returns nothing

        const res = await callRoute();

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ code: "NOT_FOUND" });
    });

    it("an unauthorized actor is refused BEFORE the row is read", async () => {
        // So a viewer cannot use response differences to enumerate ids.
        actor("viewer", ["viewer"]);
        documentRow = null;
        const missing = await callRoute();

        signCalls = [];
        actor("viewer", ["viewer"]);
        documentRow = row();
        const present = await callRoute();

        expect(missing.status).toBe(present.status);
        expect(missing.body).toEqual(present.body);
    });

    it("a malformed id fails safely", async () => {
        actor("admin", ["admin"]);
        for (const bad of ["not-a-uuid", "", "../../etc/passwd"]) {
            const res = await callRoute(bad);
            expect(res.status, bad).toBe(404);
            expect(signCalls, bad).toHaveLength(0);
        }
    });
});

describe("signed-url route — path is row-driven", () => {
    it("signs exactly the bucket and path stored on the row", async () => {
        actor("admin", ["admin"]);
        await callRoute();
        expect(signCalls[0].bucket).toBe("org_documents");
        expect(signCalls[0].path).toBe(`${ORG_A}/persons/abc/file.pdf`);
    });

    it("an orphaned storage object cannot be signed — it has no row", async () => {
        actor("admin", ["admin"]);
        documentRow = null;
        const res = await callRoute();
        expect(res.status).toBe(404);
        expect(signCalls).toHaveLength(0);
    });

    it("a row with no storage location is refused", async () => {
        actor("admin", ["admin"]);
        documentRow = row({ bucket: null, storage_path: null });
        const res = await callRoute();
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: "STORAGE_LOCATION_MISSING" });
        expect(signCalls).toHaveLength(0);
    });

    it("never echoes the storage path in a response", async () => {
        actor("viewer", ["viewer"]);
        const res = await callRoute();
        expect(JSON.stringify(res.body)).not.toContain("org_documents");
        expect(JSON.stringify(res.body)).not.toContain("file.pdf");
    });
});

describe("signed-url route — expiry", () => {
    it("uses a short, operation-scoped expiry", async () => {
        actor("admin", ["admin"]);
        await callRoute();
        expect(signCalls[0].expires).toBe(signedUrlExpirySeconds("download"));
        expect(signCalls[0].expires).toBeLessThanOrEqual(60 * 15);
    });

    it("no operation may be signed for longer than 15 minutes", async () => {
        // The profile-photo route previously used SEVEN DAYS on a child's photo.
        for (const op of ["preview", "download", "attachment"] as const) {
            expect(signedUrlExpirySeconds(op)).toBeLessThanOrEqual(60 * 15);
            expect(signedUrlExpirySeconds(op)).toBeGreaterThan(0);
        }
    });

    it("never returns a permanent or public URL", async () => {
        actor("admin", ["admin"]);
        const res = await callRoute();
        const body = res.body as { signedUrl?: string };
        expect(body.signedUrl).toBeTruthy();
        expect(body.signedUrl).toContain("sig=");
    });
});

describe("assertDocumentAccess — decision function", () => {
    function supa(data: Record<string, unknown> | null) {
        return {
            from: () => ({
                select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }) }),
            }),
        };
    }

    it("blocks a caller-supplied path that disagrees with the row", async () => {
        const d = await assertDocumentAccess({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: supa(row()) as any,
            actor: { ok: true, orgId: ORG_A, role: "admin", roleKeys: ["admin"] },
            documentId: DOC,
            operation: "download",
            expected: { storagePath: `${ORG_B}/persons/other/secret.pdf` },
        });
        expect(d.outcome).toBe("blocked");
        if (d.outcome === "blocked") expect(d.code).toBe("PATH_MISMATCH");
    });

    it("blocks a caller-supplied bucket that disagrees with the row", async () => {
        const d = await assertDocumentAccess({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: supa(row()) as any,
            actor: { ok: true, orgId: ORG_A, role: "admin", roleKeys: ["admin"] },
            documentId: DOC,
            operation: "download",
            expected: { bucket: "some_other_bucket" },
        });
        expect(d.outcome).toBe("blocked");
        if (d.outcome === "blocked") expect(d.code).toBe("PATH_MISMATCH");
    });

    it("blocks a restricted document regardless of role", async () => {
        for (const status of ["deleted", "quarantined", "restricted"]) {
            const d = await assertDocumentAccess({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                supabase: supa(row({ status })) as any,
                actor: { ok: true, orgId: ORG_A, role: "owner", roleKeys: ["owner"] },
                documentId: DOC,
                operation: "download",
            });
            expect(d.outcome, status).toBe("blocked");
            if (d.outcome === "blocked") expect(d.code).toBe("DOCUMENT_RESTRICTED");
        }
    });

    it("blocks when the session has no organization", async () => {
        const d = await assertDocumentAccess({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: supa(row()) as any,
            actor: { ok: true, role: "admin", roleKeys: ["admin"] },
            documentId: DOC,
            operation: "download",
        });
        expect(d.outcome).toBe("blocked");
        if (d.outcome === "blocked") expect(d.code).toBe("NO_ORG");
    });

    it("falls back to privileged-role only for an entity type without ownership metadata", async () => {
        // Documented gap: `documents` has no location/department/household
        // columns, so unmodelled types must not default to all org members.
        const d = await assertDocumentAccess({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: supa(row({ entity_type: "vendors" })) as any,
            actor: { ok: true, orgId: ORG_A, role: "viewer", roleKeys: ["viewer"] },
            documentId: DOC,
            operation: "download",
        });
        expect(d.outcome).toBe("blocked");
    });
});
