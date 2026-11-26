/**
 * Phase 1 Slice 1 — recipient resolution.
 *
 * Behavioural: every case drives the real resolver against a fake Supabase.
 * The claim under test is that resolution is server-authoritative, deterministic,
 * and never converts one recipient kind into another.
 */
import { describe, expect, it } from "vitest";

import { resolveRecipient } from "@/lib/communications/recipients/resolveRecipient";
import type { TypedRecipient } from "@/lib/communications/recipients/typedRecipient";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_ORG = "bbbbbbbb-0000-4000-8000-000000000002";
const PERSON = "11111111-0000-4000-8000-00000000000a";
const USER = "22222222-0000-4000-8000-00000000000b";

/** Fake matching the resolver's query shape: .from().select().eq().eq().maybeSingle() */
function supa(table: Record<string, unknown | null>, opts: { error?: boolean } = {}) {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
        },
        maybeSingle: async () => {
            if (opts.error) return { data: null, error: { message: "boom" } };
            const row = table[String(filters.org_id ?? "")] ?? null;
            return { data: row, error: null };
        },
    };
    return { from: () => builder } as never;
}

const person: TypedRecipient = { kind: "person", personId: PERSON };

const personRow = (over: Record<string, unknown> = {}) => ({
    id: PERSON,
    org_id: ORG,
    email: "dana@example.com",
    phone: "(503) 555-0123",
    full_name: "Dana Reyes",
    ...over,
});

describe("person resolution", () => {
    it("resolves email", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: personRow() }),
            orgId: ORG,
            recipient: person,
            requestedChannel: "email",
        });
        expect(r.status).toBe("resolved");
        if (r.status !== "resolved") return;
        expect(r.facts.toAddress).toBe("dana@example.com");
        expect(r.facts.personId).toBe(PERSON);
        expect(r.facts.displayName).toBe("Dana Reyes");
    });

    it("resolves and normalizes SMS to E.164", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: personRow() }),
            orgId: ORG,
            recipient: person,
            requestedChannel: "sms",
        });
        expect(r.status).toBe("resolved");
        if (r.status !== "resolved") return;
        expect(r.facts.toAddress).toBe("+15035550123");
    });

    it("blocks a person in another org — cross-org is not reachable", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [OTHER_ORG]: personRow({ org_id: OTHER_ORG }) }),
            orgId: ORG,
            recipient: person,
            requestedChannel: "email",
        });
        expect(r.status).toBe("blocked");
        if (r.status !== "blocked") return;
        expect(r.code).toBe("person_not_accessible");
    });

    it("FAILS CLOSED on a lookup error rather than treating it as not-found", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: personRow() }, { error: true }),
            orgId: ORG,
            recipient: person,
            requestedChannel: "email",
        });
        expect(r.status).toBe("blocked");
        if (r.status !== "blocked") return;
        expect(r.code).toBe("person_lookup_failed");
    });

    it("blocks when no usable identity exists", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: personRow({ email: null, phone: null }) }),
            orgId: ORG,
            recipient: person,
        });
        expect(r.status).toBe("blocked");
        if (r.status !== "blocked") return;
        expect(r.code).toBe("no_usable_identity");
    });

    it("blocks when the requested channel has no address", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: personRow({ email: null }) }),
            orgId: ORG,
            recipient: person,
            requestedChannel: "email",
        });
        expect(r.status).toBe("blocked");
        if (r.status !== "blocked") return;
        expect(r.code).toBe("no_usable_email");
    });

    it("requires selection when both channels exist and none was requested — never guesses", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: personRow() }),
            orgId: ORG,
            recipient: person,
        });
        expect(r.status).toBe("needs_selection");
        if (r.status !== "needs_selection") return;
        expect(r.availableChannels).toEqual(["email", "sms"]);
    });

    it("resolves deterministically when only one channel is usable", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: personRow({ phone: null }) }),
            orgId: ORG,
            recipient: person,
        });
        expect(r.status).toBe("resolved");
        if (r.status !== "resolved") return;
        expect(r.facts.channel).toBe("email");
    });

    it("ignores a caller-supplied address — the person's own identity wins", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: personRow() }),
            orgId: ORG,
            // A caller cannot smuggle an address in: the shape has no field for one.
            recipient: { kind: "person", personId: PERSON } as TypedRecipient,
            requestedChannel: "email",
        });
        expect(r.status).toBe("resolved");
        if (r.status !== "resolved") return;
        expect(r.facts.toAddress).toBe("dana@example.com");
    });

    it("gives operator-safe business reasons, never internals", async () => {
        const r = await resolveRecipient({
            supabase: supa({}),
            orgId: ORG,
            recipient: person,
            requestedChannel: "email",
        });
        if (r.status !== "blocked") throw new Error("expected blocked");
        expect(r.message).not.toMatch(/supabase|sql|column|undefined|null/i);
        expect(r.message).toMatch(/not found in this organization/i);
    });
});

describe("internal user resolution", () => {
    const internal: TypedRecipient = { kind: "internal_user", userId: USER };

    it("resolves an org member", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: { user_id: USER, org_id: ORG, role: "ops" } }),
            orgId: ORG,
            recipient: internal,
        });
        expect(r.status).toBe("resolved");
        if (r.status !== "resolved") return;
        expect(r.facts.kind).toBe("internal_user");
        expect(r.facts.userId).toBe(USER);
        expect(r.facts.channel).toBe("in_app");
    });

    it("blocks a cross-org user", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [OTHER_ORG]: { user_id: USER, org_id: OTHER_ORG, role: "ops" } }),
            orgId: ORG,
            recipient: internal,
        });
        expect(r.status).toBe("blocked");
        if (r.status !== "blocked") return;
        expect(r.code).toBe("user_not_in_org");
    });

    it("fails closed on lookup error", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: {} }, { error: true }),
            orgId: ORG,
            recipient: internal,
        });
        expect(r.status).toBe("blocked");
    });
});

describe("external operational recipient resolution", () => {
    const ext = (over: Record<string, unknown> = {}): TypedRecipient =>
        ({
            kind: "external_operational_recipient",
            displayName: "Ace Plumbing",
            channel: "sms",
            address: "(503) 555-0199",
            recipientRole: "vendor",
            reason: "Emergency repair coordination.",
            ...over,
        }) as TypedRecipient;

    it("resolves from the bounded shape with no lookup and no Person creation", async () => {
        const r = await resolveRecipient({
            // An empty table proves no lookup is consulted for this kind.
            supabase: supa({}),
            orgId: ORG,
            recipient: ext(),
        });
        expect(r.status).toBe("resolved");
        if (r.status !== "resolved") return;
        expect(r.facts.toAddress).toBe("+15035550199");
        expect(r.facts.personId).toBeNull();
        expect(r.facts.recipientRole).toBe("vendor");
        expect(r.facts.reason).toBe("Emergency repair coordination.");
    });

    it("rejects a malformed destination", async () => {
        const r = await resolveRecipient({
            supabase: supa({}),
            orgId: ORG,
            recipient: ext({ channel: "email", address: "not-an-email" }),
        });
        expect(r.status).toBe("invalid");
        if (r.status !== "invalid") return;
        expect(r.code).toBe("malformed_address");
    });
});

describe("NO SILENT FALLBACK — the load-bearing invariant", () => {
    it("an unresolvable person never becomes an external operational recipient", async () => {
        const r = await resolveRecipient({
            supabase: supa({}),
            orgId: ORG,
            recipient: person,
            requestedChannel: "email",
        });
        expect(r.status).toBe("blocked");
        // The result carries no external-operational facts at all.
        expect(r).not.toHaveProperty("facts");
    });

    it("a person with no usable identity never becomes an external operational recipient", async () => {
        const r = await resolveRecipient({
            supabase: supa({ [ORG]: personRow({ email: null, phone: null }) }),
            orgId: ORG,
            recipient: person,
        });
        expect(r.status).toBe("blocked");
        expect(r).not.toHaveProperty("facts");
    });

    it("the resolver contains no kind-conversion path", async () => {
        // Structural: every resolved result echoes the kind it was given.
        const cases: Array<[TypedRecipient, string]> = [
            [{ kind: "person", personId: PERSON }, "person"],
            [{ kind: "internal_user", userId: USER }, "internal_user"],
        ];
        for (const [rec, expected] of cases) {
            const r = await resolveRecipient({
                supabase: supa({
                    [ORG]: rec.kind === "person" ? personRow() : { user_id: USER, org_id: ORG, role: "ops" },
                }),
                orgId: ORG,
                recipient: rec,
                requestedChannel: rec.kind === "person" ? "email" : undefined,
            });
            if (r.status !== "resolved") throw new Error(`expected resolved for ${expected}`);
            expect(r.facts.kind).toBe(expected);
        }
    });
});
