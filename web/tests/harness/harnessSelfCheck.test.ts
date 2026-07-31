/**
 * Phase 0 harness self-check.
 *
 * Proves the harness machinery works against a REAL route handler before any
 * Phase 0 repair depends on it. Deliberately asserts only behavior that is
 * already true on this commit, so it is green from the moment it lands.
 *
 * The route under test is the documents signed-URL route — the same route P0-2
 * repairs — so the self-check doubles as the baseline: it records what the route
 * does TODAY, and the P0-2 commit will extend this file with the cases that are
 * currently unprotected.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetAdminContextCached } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
            }),
        }),
        storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    })),
}));

import { GET as documentSignedUrlGET } from "@/app/api/admin/documents/[id]/signed-url/route";
import { buildRequest, invokeRoute, routeParams } from "./routeInvoker";
import { ACTORS, adminContextFor, UNAUTHENTICATED, NO_ORG_MEMBERSHIP, LOW_PRIVILEGE_ACTORS } from "./actors";

const DOC_ID = "dddddddd-0000-4000-8000-000000000001";

function request() {
    return buildRequest({ method: "GET", path: `/api/admin/documents/${DOC_ID}/signed-url` });
}

describe("Phase 0 harness — route invocation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("invokes a real route handler and normalizes the response", async () => {
        mockGetAdminContextCached.mockResolvedValue(UNAUTHENTICATED);

        const res = await invokeRoute(documentSignedUrlGET, request(), routeParams({ id: DOC_ID }));

        expect(res.status).toBe(401);
        expect(res.ok).toBe(false);
        expect(res.body).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    });

    it("distinguishes unauthenticated (401) from no-org-membership (403)", async () => {
        mockGetAdminContextCached.mockResolvedValue(NO_ORG_MEMBERSHIP);

        const res = await invokeRoute(documentSignedUrlGET, request(), routeParams({ id: DOC_ID }));

        expect(res.status).toBe(403);
    });

    it("returns 404 for a document the caller's org does not own", async () => {
        mockGetAdminContextCached.mockResolvedValue(adminContextFor(ACTORS.orgAAdmin));

        const res = await invokeRoute(documentSignedUrlGET, request(), routeParams({ id: DOC_ID }));

        // Org scoping is already enforced via .eq("org_id", ctx.orgId) — the row
        // simply does not resolve. This is the one authorization dimension the
        // route gets right today.
        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ code: "NOT_FOUND" });
    });
});

describe("Phase 0 harness — database fixtures", () => {
    it("is disabled unless P0_DB_TESTS_ENABLED is set explicitly", async () => {
        const { dbTestsEnabled } = await import("./dbHarness");
        if (process.env.P0_DB_TESTS_ENABLED !== "true") {
            expect(dbTestsEnabled()).toBe(false);
        } else {
            expect(dbTestsEnabled()).toBe(true);
        }
    });

    it("refuses to mutate an org it did not create", async () => {
        const { assertOwnedOrg } = await import("./dbHarness");
        // Every managed worktree writes the same live tenant. Guarding this is
        // the difference between a test suite and an outage.
        expect(() => assertOwnedOrg("93667019-bd28-49b5-a688-acc9bb1e0a19")).toThrow(/refusing to mutate org/);
    });
});

describe.skipIf(process.env.P0_DB_TESTS_ENABLED !== "true")("Phase 0 harness — live database", () => {
    it("creates and tears down a disposable org", async () => {
        const { serviceClient, createDisposableOrg, createPerson } = await import("./dbHarness");
        const sb = serviceClient();
        const org = await createDisposableOrg(sb, "selfcheck");
        try {
            const personId = await createPerson(sb, org, { email: "p0-harness@example.invalid" });
            expect(personId).toBeTruthy();

            const { data } = await sb.from("persons").select("id").eq("id", personId).maybeSingle();
            expect(data?.id).toBe(personId);
        } finally {
            await org.cleanup();
        }
    });
});

describe("Phase 0 harness — actor matrix", () => {
    it("exposes low-privilege actors who currently pass the route's only auth check", async () => {
        expect(LOW_PRIVILEGE_ACTORS.length).toBeGreaterThan(0);

        for (const actor of LOW_PRIVILEGE_ACTORS) {
            const ctx = adminContextFor(actor);
            expect(ctx.ok).toBe(true);
        }
    });

    it("a viewer IS refused by the route's auth gate (P0-2 closed)", async () => {
        // Inverted from the commit-0 baseline, as planned there. Before commit 6
        // `ctx.ok` was the route's ONLY check, so a viewer got past it and
        // reached the row lookup. Authorization now lives in
        // assertDocumentAccess and a non-privileged role is refused outright.
        //
        // Full coverage lives in tests/documents/documentAccessAuthorization.test.ts;
        // this case stays here as the before/after record.
        mockGetAdminContextCached.mockResolvedValue(adminContextFor(ACTORS.orgAViewer));

        const res = await invokeRoute(documentSignedUrlGET, request(), routeParams({ id: DOC_ID }));

        expect(res.status).toBe(403);
    });
});
