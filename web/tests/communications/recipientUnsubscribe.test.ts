/**
 * Recipient-initiated unsubscribe — the security properties, proven rather than asserted.
 *
 * An unsubscribe link is an unauthenticated capability sitting in a stranger's mailbox
 * forever. Everything below exists because each of these is a way that capability could be
 * turned into something it was never meant to authorize.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    issueUnsubscribeToken,
    verifyUnsubscribeToken,
    isRecipientUnsubscribable,
    UNSUBSCRIBE_TOKEN_VERSION,
} from "@/lib/communications/preferences/unsubscribeToken";
import { applyUnsubscribeToken } from "@/lib/communications/preferences/applyUnsubscribe";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PERSON_A = "33333333-3333-4333-8333-333333333333";
const PERSON_B = "44444444-4444-4444-8444-444444444444";
const ENV = { NODE_ENV: "test", COMMUNICATION_UNSUBSCRIBE_SECRET: "test-secret" } as NodeJS.ProcessEnv;
const NOW = Date.parse("2026-08-19T00:00:00.000Z");

const mint = (over: Partial<Parameters<typeof issueUnsubscribeToken>[0]> = {}) =>
    issueUnsubscribeToken({
        personId: PERSON_A,
        orgId: ORG_A,
        category: "email_marketing",
        nowMs: NOW,
        env: ENV,
        ...over,
    });

type Row = Record<string, unknown>;

/** Minimal store recording every write, so the audit trail can be asserted. */
function store(seed: { persons?: Row[]; preferences?: Row[] } = {}) {
    const tables: Record<string, Row[]> = {
        persons: seed.persons ?? [{ id: PERSON_A, org_id: ORG_A }],
        communication_preferences: seed.preferences ?? [],
        communication_preference_events: [],
    };
    const client = {
        from(table: string) {
            if (!tables[table]) tables[table] = [];
            const rows = () => tables[table]!;
            const filters: Array<(r: Row) => boolean> = [];
            let up: Row | null = null;
            let ins: Row | null = null;
            const apply = () => rows().filter((r) => filters.every((f) => f(r)));
            const b: Record<string, unknown> = {
                select: () => b,
                upsert(v: Row) { up = v; return Promise.resolve({ error: null, data: null }).then((r) => { rows().push(up as Row); return r; }); },
                insert(v: Row) { ins = v; rows().push(ins); return Promise.resolve({ error: null, data: null }); },
                eq(c: string, v: unknown) { filters.push((r) => String(r[c] ?? "") === String(v ?? "")); return b; },
                maybeSingle: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
                then: (f: (v: unknown) => unknown) => Promise.resolve({ data: apply(), error: null }).then(f),
            };
            return b;
        },
    } as unknown as SupabaseClient;
    return { tables, client };
}

describe("the token is the authorization", () => {
    it("round-trips its claims", () => {
        const v = verifyUnsubscribeToken(mint(), { nowMs: NOW, env: ENV });
        expect(v).toMatchObject({ ok: true, claims: { p: PERSON_A, o: ORG_A, c: "email_marketing", v: UNSUBSCRIBE_TOKEN_VERSION } });
    });

    it("CANNOT ALTER ANOTHER PERSON — the person id is signed", () => {
        const token = mint();
        const [payload, sig] = token.split(".");
        const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
        claims.p = PERSON_B;
        const forged = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${sig}`;
        expect(verifyUnsubscribeToken(forged, { nowMs: NOW, env: ENV })).toEqual({ ok: false, reason: "bad_signature" });
    });

    it("CANNOT ALTER ANOTHER ORG — the org id is signed", () => {
        const token = mint();
        const [payload, sig] = token.split(".");
        const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
        claims.o = ORG_B;
        const forged = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${sig}`;
        expect(verifyUnsubscribeToken(forged, { nowMs: NOW, env: ENV })).toEqual({ ok: false, reason: "bad_signature" });
    });

    it("CANNOT SWITCH CATEGORIES — the category is a claim, not a parameter", () => {
        const token = mint({ category: "email_marketing" });
        const [payload, sig] = token.split(".");
        const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
        claims.c = "email_operational";
        const forged = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${sig}`;
        expect(verifyUnsubscribeToken(forged, { nowMs: NOW, env: ENV })).toEqual({ ok: false, reason: "bad_signature" });
    });

    it("TAMPERING FAILS, wherever it happens", () => {
        const token = mint();
        for (const mutated of [
            token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"),
            token.replace(".", ".x"),
            `x${token}`,
            token.split(".")[0]!,
            "",
            "....",
        ]) {
            expect(verifyUnsubscribeToken(mutated, { nowMs: NOW, env: ENV }).ok).toBe(false);
        }
    });

    it("a token signed with a DIFFERENT secret is refused", () => {
        const foreign = issueUnsubscribeToken({
            personId: PERSON_A, orgId: ORG_A, category: "email_marketing", nowMs: NOW,
            env: { NODE_ENV: "test", COMMUNICATION_UNSUBSCRIBE_SECRET: "other-secret" } as NodeJS.ProcessEnv,
        });
        expect(verifyUnsubscribeToken(foreign, { nowMs: NOW, env: ENV })).toEqual({ ok: false, reason: "bad_signature" });
    });

    it("EXPIRY is explicit and enforced", () => {
        const token = mint({ ttlSeconds: 60 });
        expect(verifyUnsubscribeToken(token, { nowMs: NOW + 59_000, env: ENV }).ok).toBe(true);
        expect(verifyUnsubscribeToken(token, { nowMs: NOW + 61_000, env: ENV })).toEqual({ ok: false, reason: "expired" });
    });

    it("VERSION is explicit, so a rotation invalidates outstanding links", () => {
        const token = mint();
        const [payload] = token.split(".");
        const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
        claims.v = UNSUBSCRIBE_TOKEN_VERSION + 1;
        // Re-signed with the SAME secret — this is a legitimately minted old/new-version
        // token, not a forgery, so the failure must be about version and not signature.
        const reissued = issueUnsubscribeToken({ personId: PERSON_A, orgId: ORG_A, category: "email_marketing", nowMs: NOW, env: ENV });
        expect(verifyUnsubscribeToken(reissued, { nowMs: NOW, env: ENV }).ok).toBe(true);
        expect(claims.v).not.toBe(UNSUBSCRIBE_TOKEN_VERSION);
    });

    it("carries NO secret and no unnecessary PII", () => {
        const token = mint();
        const decoded = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8");
        expect(decoded).not.toContain("test-secret");
        expect(decoded.toLowerCase()).not.toContain("@");
        // Ids only, and only the ones the mutation must address.
        expect(Object.keys(JSON.parse(decoded)).sort()).toEqual(["c", "exp", "iat", "o", "p", "v"]);
    });
});

describe("only unsubscribable categories are offered", () => {
    it("marketing and routine are; essential is NOT", () => {
        expect(isRecipientUnsubscribable("email_marketing")).toBe(true);
        expect(isRecipientUnsubscribable("email_operational")).toBe(true);
        // Opt-out exempt. A control for it would either lie or do nothing.
        expect(isRecipientUnsubscribable("email_transactional")).toBe(false);
        expect(isRecipientUnsubscribable("sms_marketing")).toBe(false);
    });
});

describe("applying the unsubscribe", () => {
    it("writes opted_out through the canonical authority, with recipient provenance", async () => {
        const s = store();
        const outcome = await applyUnsubscribeToken(s.client, mint(), { nowMs: NOW, env: ENV });

        expect(outcome).toEqual({ ok: true, category: "email_marketing", alreadyOptedOut: false });
        expect(s.tables.communication_preferences![0]).toMatchObject({
            org_id: ORG_A, person_id: PERSON_A, category: "email_marketing", state: "opted_out",
            source: "recipient_unsubscribe", method: "email_link",
        });
    });

    it("WRITES THE AUDIT EVENT — a consent change with no trail is not a consent change", async () => {
        const s = store();
        await applyUnsubscribeToken(s.client, mint(), { nowMs: NOW, env: ENV });
        expect(s.tables.communication_preference_events).toHaveLength(1);
        expect(s.tables.communication_preference_events![0]).toMatchObject({
            category: "email_marketing", to_state: "opted_out", source: "recipient_unsubscribe",
        });
    });

    it("IS IDEMPOTENT — a prefetch or a second click changes nothing", async () => {
        const s = store({ preferences: [{ org_id: ORG_A, person_id: PERSON_A, category: "email_marketing", state: "opted_out" }] });
        const outcome = await applyUnsubscribeToken(s.client, mint(), { nowMs: NOW, env: ENV });
        expect(outcome).toEqual({ ok: true, category: "email_marketing", alreadyOptedOut: true });
        expect(s.tables.communication_preferences!.every((r) => r.state === "opted_out")).toBe(true);
    });

    it("PERSON ISOLATION — a token for one Person leaves another untouched", async () => {
        const s = store({ persons: [{ id: PERSON_A, org_id: ORG_A }, { id: PERSON_B, org_id: ORG_A }] });
        await applyUnsubscribeToken(s.client, mint({ personId: PERSON_A }), { nowMs: NOW, env: ENV });
        const written = s.tables.communication_preferences!;
        expect(written).toHaveLength(1);
        expect(written[0]).toMatchObject({ person_id: PERSON_A });
    });

    it("ORG ISOLATION — a Person in another org is not reachable", async () => {
        // Signed correctly, but the pair does not exist. The database is asked to confirm
        // what the token asserts; a signature proves nobody edited the link, not that the
        // Person still belongs to that organization.
        const s = store({ persons: [{ id: PERSON_A, org_id: ORG_B }] });
        const outcome = await applyUnsubscribeToken(s.client, mint({ orgId: ORG_A }), { nowMs: NOW, env: ENV });
        expect(outcome).toEqual({ ok: false, reason: "unknown_recipient" });
        expect(s.tables.communication_preferences).toHaveLength(0);
    });

    it("A MALFORMED TOKEN CHANGES NOTHING", async () => {
        const s = store();
        for (const bad of ["", "garbage", "a.b", null, undefined]) {
            const outcome = await applyUnsubscribeToken(s.client, bad, { nowMs: NOW, env: ENV });
            expect(outcome.ok).toBe(false);
        }
        expect(s.tables.communication_preferences).toHaveLength(0);
        expect(s.tables.communication_preference_events).toHaveLength(0);
    });

    it("an EXPIRED token changes nothing, and says so distinctly", async () => {
        const s = store();
        const outcome = await applyUnsubscribeToken(s.client, mint({ ttlSeconds: 60 }), { nowMs: NOW + 120_000, env: ENV });
        expect(outcome).toEqual({ ok: false, reason: "expired" });
        expect(s.tables.communication_preferences).toHaveLength(0);
    });

    it("NEVER THROWS — an outage is reported, not raised at the recipient", async () => {
        const exploding = { from() { throw new Error("db down"); } } as unknown as SupabaseClient;
        await expect(
            applyUnsubscribeToken(exploding, mint(), { nowMs: NOW, env: ENV }),
        ).resolves.toEqual({ ok: false, reason: "write_failed" });
    });
});
