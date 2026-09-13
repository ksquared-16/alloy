/**
 * A business refusal is not a server failure.
 *
 * Mounted Gate 2 certification found `credential_not_active` answering HTTP 500.
 * The rule had worked — the credential exists, the caller is authorized, and the
 * credential's own state forbids the operation — but the route reported it the
 * same way it reports a database fault, because every non-audit outcome fell
 * through to one branch.
 *
 * `web/lib/api/apiErrors.ts` and `docs/api/api-response-contract.md` define
 * `CONFLICT` as "State conflict" at 409, which is exactly this. These lock the
 * corrected mapping and, just as importantly, lock what must NOT change: a
 * genuine failure still answers 500, and no refusal reveals credential state to
 * a caller who was never allowed to ask.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase } from "../principal/fakeSupabase";
import { credentialBusinessRefusal, CREDENTIAL_BUSINESS_REFUSALS } from "@/lib/platform/principal/applicationCredential";
import { DEFAULT_STATUS_BY_CODE } from "@/lib/api/apiErrors";

const ORG = "org-1";
const INSTALLATION = "inst-1";
const CREDENTIAL = "cred-1";

let guard: { ok: boolean; ctx?: unknown; response?: unknown };
let installation: { ok: boolean; status?: number; message?: string; installation?: unknown };

vi.mock("@/app/api/admin/integrations/_guard", () => ({
    requireIntegrationsAccess: async () => guard,
}));
vi.mock("@/lib/platform/admin/integrationsService", async () => {
    const actual = await vi.importActual<typeof import("@/lib/platform/admin/integrationsService")>(
        "@/lib/platform/admin/integrationsService",
    );
    return { ...actual, getInstallation: async () => installation };
});

const route = await import(
    "@/app/api/admin/integrations/installations/[id]/credentials/[credentialId]/route"
);

function db(credentialStatus: string) {
    return createFakeSupabase({
        app_credentials: [
            {
                id: CREDENTIAL,
                installation_id: INSTALLATION,
                status: credentialStatus,
                secret_hash: "digest-of-current",
                secret_hash_secondary: null,
                secondary_expires_at: null,
                secret_last_four: "abcd",
            },
        ],
        app_security_audit: [],
    });
}

function authorize(fake: ReturnType<typeof createFakeSupabase>) {
    guard = { ok: true, ctx: { supabase: fake.client, orgId: ORG, actorUserId: "user-1" } };
    installation = { ok: true, installation: { applicationId: "app-1" } };
}

const params = Promise.resolve({ id: INSTALLATION, credentialId: CREDENTIAL });
const req = {} as never;

beforeEach(() => {
    guard = { ok: false };
    installation = { ok: false, status: 404, message: "That integration does not exist." };
});

describe("credential_not_active is a refusal, not a failure", () => {
    it("rotate answers 409, the canonical status for a state conflict", async () => {
        const supabase = db("revoked");
        authorize(supabase);
        const res = await route.POST(req, { params });
        expect(res.status).toBe(409);
    });

    it("rotate keeps credential_not_active as the machine-readable reason", async () => {
        const supabase = db("revoked");
        authorize(supabase);
        const body = await (await route.POST(req, { params })).json();
        expect(body.code).toBe("credential_not_active");
        // The client-facing sentence is the one the domain declares — an
        // explanation, not a reason code and not a thrown message.
        expect(body.error).toBe(CREDENTIAL_BUSINESS_REFUSALS.credential_not_active.message);
        expect(body.error).not.toContain("Error:");
        expect(body.error).not.toMatch(/\n\s+at\s/);
    });

    it("a revoked credential is still not rotated — the refusal is real", async () => {
        const supabase = db("revoked");
        authorize(supabase);
        const body = await (await route.POST(req, { params })).json();
        expect(body.clientSecret).toBeUndefined();
        const after = supabase.rows("app_credentials")[0] as { secret_hash: string };
        expect(after.secret_hash).toBe("digest-of-current");
    });

    it("revoke shares the mapper, so it refuses the same way", async () => {
        const supabase = db("revoked");
        authorize(supabase);
        const res = await route.DELETE(req, { params });
        // revoke does not currently gate on status, so it must not 500 either;
        // whatever it answers, an unexpected-failure status is the wrong answer.
        expect(res.status).not.toBe(500);
    });
});

describe("what must not change", () => {
    it("an active credential still rotates successfully", async () => {
        const supabase = db("active");
        authorize(supabase);
        const res = await route.POST(req, { params });
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(typeof body.clientSecret).toBe("string");
        expect(body.shownOnce).toBe(true);
    });

    it("an active credential is still revocable", async () => {
        const supabase = db("active");
        authorize(supabase);
        const res = await route.DELETE(req, { params });
        expect(res.status).toBe(200);
        expect((await res.json()).revoked).toBe(true);
    });

    it("an unauthorized caller gets the auth response, and learns nothing about credential state", async () => {
        guard = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
        installation = { ok: true, installation: { applicationId: "app-1" } };
        const res = await route.POST(req, { params });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(JSON.stringify(body)).not.toContain("credential_not_active");
    });

    it("an unknown credential keeps its not-found answer and leaks nothing", async () => {
        const supabase = createFakeSupabase({ app_credentials: [], app_security_audit: [] });
        authorize(supabase);
        const res = await route.POST(req, { params });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(JSON.stringify(body)).not.toContain("credential_not_active");
        expect(body.clientSecret).toBeUndefined();
    });

    it("a genuine internal failure still answers 500, and does not echo the raw fault", async () => {
        const supabase = db("active");
        authorize(supabase);
        // A Postgres constraint message can quote the offending value, which on
        // this table is a secret digest. It must not reach the client.
        const client = supabase.client as unknown as { from: (t: string) => Record<string, unknown> };
        const original = client.from.bind(client);
        client.from = (table: string) => {
            const builder = original(table);
            if (table !== "app_credentials") return builder;
            // Ownership and the status read still succeed; the WRITE is what fails,
            // so the failure happens inside rotateCredential rather than before it.
            return {
                ...builder,
                update: () => ({
                    eq: async () => ({
                        error: {
                            message:
                                'duplicate key value violates unique constraint "x" Key (secret_hash)=(digest-of-current)',
                        },
                    }),
                }),
            } as never;
        };
        const res = await route.POST(req, { params });
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.code).toBe("INTERNAL");
        expect(JSON.stringify(body)).not.toContain("digest-of-current");
    });
});

describe("the mapping comes from the shared taxonomy, not from taste", () => {
    it("credential_not_active maps to the contract's CONFLICT status", () => {
        expect(CREDENTIAL_BUSINESS_REFUSALS.credential_not_active.status).toBe(DEFAULT_STATUS_BY_CODE.CONFLICT);
        expect(DEFAULT_STATUS_BY_CODE.CONFLICT).toBe(409);
    });

    it("only stated business rules are matched, and matching is exact", () => {
        expect(credentialBusinessRefusal("credential_not_active")).not.toBeNull();
        // A database message that merely CONTAINS a rule name must not borrow its 4xx.
        expect(credentialBusinessRefusal("update failed: credential_not_active column missing")).toBeNull();
        expect(credentialBusinessRefusal("some pg error")).toBeNull();
        expect(credentialBusinessRefusal(undefined)).toBeNull();
    });
});
