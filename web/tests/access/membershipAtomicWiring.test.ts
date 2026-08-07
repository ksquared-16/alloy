/**
 * W-5 / RL-4 (tier B) — every membership-creating product path goes through the
 * atomic RPC, and the helper maps the RPC's outcomes the way callers expect.
 *
 * The source-level half is deliberate: the defect W-5 closes is not "the RPC is
 * wrong", it is "someone inserts into user_roles directly". A behavioural test
 * of the helper cannot catch a sixth writer being added next month; this can.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    createMembershipWithAccessProfile,
    replaceMembershipWithAccessProfile,
} from "@/lib/admin/membershipWithProfile";

const webRoot = join(__dirname, "..", "..");

/**
 * The membership writers found by W-5's audit — enumerated BY TABLE across
 * lib/ and app/, not by name across route files, which is the census that
 * missed createOrgAndAssignAdmin twice.
 */
const MEMBERSHIP_WRITER_SOURCES = [
    "app/api/admin/users/route.ts",
    "app/api/admin/users/[userId]/role/route.ts",
    "lib/dev/createOrgAndAssignAdmin.ts",
];

/** A minimal Supabase stand-in that records the rpc call and returns a canned result. */
function fakeClient(result: { data?: unknown; error?: { code?: string; message: string } }) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const client = {
        rpc(fn: string, args: Record<string, unknown>) {
            calls.push({ fn, args });
            return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
        },
    };
    return { client: client as never, calls };
}

const membershipRow = { user_id: "u1", org_id: "o1", role: "ops" };

describe("W-5 — membership writers use the atomic path", () => {
    it.each(MEMBERSHIP_WRITER_SOURCES)("%s does not write user_roles directly", (relPath) => {
        const src = readFileSync(join(webRoot, relPath), "utf8");

        // Direct writes to the membership table re-open G4. Reads are fine.
        const directWrite = /from\(\s*["']user_roles["']\s*\)\s*\.\s*(insert|upsert|update)\b/.test(src);
        expect(directWrite, `${relPath} writes user_roles directly — route it through membershipWithProfile`).toBe(false);
    });

    it.each(MEMBERSHIP_WRITER_SOURCES)("%s imports the atomic helper", (relPath) => {
        const src = readFileSync(join(webRoot, relPath), "utf8");
        expect(src).toContain("@/lib/admin/membershipWithProfile");
    });

    it("the invite handler no longer maps a raw insert error to 409", () => {
        const src = readFileSync(join(webRoot, "app/api/admin/users/route.ts"), "utf8");
        // The 409 must come from the helper's classified outcome, not a bare SQLSTATE.
        expect(src).not.toContain('insertError.code === "23505"');
        expect(src).toContain('membership.kind === "duplicate"');
    });

    it("the role handler no longer deletes memberships outside the transaction", () => {
        const src = readFileSync(join(webRoot, "app/api/admin/users/[userId]/role/route.ts"), "utf8");
        expect(/from\(\s*["']user_roles["']\s*\)\s*\.\s*delete\b/.test(src)).toBe(false);
        expect(src).toContain("replaceMembershipWithAccessProfile");
    });
});

describe("W-5 — helper maps RPC outcomes", () => {
    it("calls the create RPC with the membership triple", async () => {
        const { client, calls } = fakeClient({ data: membershipRow });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });

        expect(res.ok).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].fn).toBe("create_membership_with_access_profile");
        expect(calls[0].args).toEqual({ p_user_id: "u1", p_org_id: "o1", p_role: "ops" });
    });

    it("classifies a unique violation as duplicate", async () => {
        const { client } = fakeClient({ error: { code: "23505", message: "duplicate key" } });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });
        expect(res).toMatchObject({ ok: false, kind: "duplicate" });
    });

    it("classifies the replace RPC's no-membership signal as not_found", async () => {
        const { client } = fakeClient({ error: { code: "P0002", message: "no membership" } });
        const res = await replaceMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });
        expect(res).toMatchObject({ ok: false, kind: "not_found" });
    });

    it("fails the whole call when the RPC errors — no partial success", async () => {
        const { client } = fakeClient({ error: { code: "23503", message: "profile insert failed" } });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });

        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.kind).toBe("error");
        expect(res.error).toContain("profile insert failed");
    });

    it("treats an empty RPC result as failure rather than a phantom success", async () => {
        const { client } = fakeClient({ data: null });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });
        expect(res.ok).toBe(false);
    });

    it("unwraps a single-row array result", async () => {
        const { client } = fakeClient({ data: [membershipRow] });
        const res = await createMembershipWithAccessProfile(client, { userId: "u1", orgId: "o1", role: "ops" });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.row.role).toBe("ops");
    });
});
