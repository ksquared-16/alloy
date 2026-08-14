/**
 * How a failed credential write is reported.
 *
 * The first real use of this path produced one sentence — "Could not store the
 * connection securely." — for a failure the administrator could not have caused
 * and could not fix: the platform migration was absent from the database that
 * deployment was pointed at. A single generic message could not distinguish
 * "your key is bad" from "this environment cannot store keys at all", and only
 * the second was true.
 *
 * The classification never reads the provider's error MESSAGE, because that
 * message can quote the arguments and the arguments include the secret. Only the
 * code is inspected.
 */

import { describe, expect, it, vi } from "vitest";

import { putOrgProviderCredential } from "@/lib/communications/orgProviderCredential";

function client(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
    return { rpc: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })) } as never;
}

const PARAMS = { orgId: "org-1", providerAccountId: "acct-1", secret: "synthetic-not-a-real-key" };

describe("an environment that cannot store credentials says so", () => {
    it.each([
        ["PGRST202", "the function is absent — the migration never reached this database"],
        ["PGRST203", "the signature does not match"],
        ["42883", "PostgreSQL: undefined function"],
        ["42501", "PostgreSQL: not permitted — the caller is not service-role"],
    ])("%s is `storage_unavailable` (%s)", async (code) => {
        const res = await putOrgProviderCredential(client({ error: { code } }), PARAMS);
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.reason).toBe("storage_unavailable");
    });

    it("an authority that RAN and refused is not confused with an absent one", async () => {
        // e.g. the account belongs to another organization — a real refusal.
        const res = await putOrgProviderCredential(client({ error: { code: "P0001" } }), PARAMS);
        expect(res.ok === false && res.reason).toBe("authority_refused");
    });

    it("an answer that is not a reference is treated as an unusable authority", async () => {
        for (const data of [null, 42, {}, "not-a-reference", "env:RESEND_API_KEY"]) {
            const res = await putOrgProviderCredential(client({ data }), PARAMS);
            expect(res.ok === false && res.reason).toBe("storage_unavailable");
        }
    });

    it("a successful write returns the opaque reference", async () => {
        const res = await putOrgProviderCredential(client({ data: "vault:abc" }), PARAMS);
        expect(res).toEqual({ ok: true, secretRef: "vault:abc" });
    });

    it("an empty secret never reaches the authority", async () => {
        const c = client({ data: "vault:abc" });
        const res = await putOrgProviderCredential(c, { ...PARAMS, secret: "   " });
        expect(res.ok === false && res.reason).toBe("empty_credential");
        expect((c as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
    });
});

describe("the provider's error text is never read, so it cannot leak", () => {
    it("classifies on code alone, even when the message quotes the secret", async () => {
        const res = await putOrgProviderCredential(
            client({ error: { code: "PGRST202", message: 'params: {"p_secret":"synthetic-not-a-real-key"}' } }),
            PARAMS,
        );
        // The reason is a fixed token — there is nowhere for the message to travel.
        expect(res.ok === false && res.reason).toBe("storage_unavailable");
        expect(JSON.stringify(res)).not.toContain("synthetic-not-a-real-key");
    });
});
