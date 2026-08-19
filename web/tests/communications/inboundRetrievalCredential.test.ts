/**
 * Whose key fetches a received email — and whose key must never be reachable.
 *
 * The failure that produced this file: an organization with its own connected Resend
 * account, credential in Vault, binding pointing at it, still got `missing_api_key` because
 * retrieval read only `process.env.RESEND_API_KEY`. The tests below pin both halves of the
 * fix — the org credential is used, and the deployment key cannot stand in for it.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveInboundRetrievalCredential } from "@/lib/communications/email/inboundRetrievalCredential";
import {
    ingestResendInboundEmail,
    type InboundEmailIngestionDeps,
} from "@/lib/communications/email/inboundEmailIngestion";
import { normalizeResendReceivedEvent } from "@/lib/communications/email/inboundEmailNormalization";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const VAULT_REF = "vault:cred-a";

/**
 * Stands in for `org_provider_credential_resolve`, which is the real authority.
 *
 * It answers only for the (org, ref) pair it was given, exactly as the database function
 * does — which is what makes the cross-tenant test meaningful rather than decorative.
 */
function credentialAuthority(grants: Record<string, string>): SupabaseClient {
    return {
        rpc: (fn: string, args: Record<string, unknown>) => {
            if (fn !== "org_provider_credential_resolve") return Promise.resolve({ data: null, error: { code: "PGRST202" } });
            const key = `${args.p_org_id}|${args.p_secret_ref}`;
            return Promise.resolve({ data: grants[key] ?? null, error: null });
        },
    } as unknown as SupabaseClient;
}

describe("the organization's own credential is used", () => {
    it("resolves a vault reference through the canonical authority", async () => {
        const supabase = credentialAuthority({ [`${ORG_A}|${VAULT_REF}`]: "re_org_a_key" });
        await expect(
            resolveInboundRetrievalCredential({ supabase, orgId: ORG_A, secretRef: VAULT_REF, env: {} })
        ).resolves.toEqual({ ok: true, apiKey: "re_org_a_key", source: "org_owned" });
    });

    it("does not need a deployment key to exist at all", async () => {
        // The whole point: RESEND_API_KEY absent, and the tenant still retrieves.
        const supabase = credentialAuthority({ [`${ORG_A}|${VAULT_REF}`]: "re_org_a_key" });
        const result = await resolveInboundRetrievalCredential({
            supabase,
            orgId: ORG_A,
            secretRef: VAULT_REF,
            env: {},
        });
        expect(result.ok).toBe(true);
    });
});

describe("the deployment key is valid only where it is the intended authority", () => {
    it("is used when the binding names no org-owned credential", async () => {
        const supabase = credentialAuthority({});
        await expect(
            resolveInboundRetrievalCredential({
                supabase,
                orgId: ORG_A,
                secretRef: null,
                env: { RESEND_API_KEY: "re_deployment" },
            })
        ).resolves.toEqual({ ok: true, apiKey: "re_deployment", source: "deployment_env" });
    });

    it("is used when the binding names it explicitly", async () => {
        const supabase = credentialAuthority({});
        await expect(
            resolveInboundRetrievalCredential({
                supabase,
                orgId: ORG_A,
                secretRef: "env:RESEND_API_KEY",
                env: { RESEND_API_KEY: "re_deployment" },
            })
        ).resolves.toMatchObject({ ok: true, source: "deployment_env" });
    });

    it("FAILS CLOSED rather than standing in for a revoked org credential", async () => {
        // The dangerous shape this rules out: revoking an organization's connection would
        // otherwise silently promote Alloy's own key to act on that tenant's behalf, and the
        // connection the administrator just turned off would keep working.
        const supabase = credentialAuthority({}); // authority refuses — revoked/disabled
        await expect(
            resolveInboundRetrievalCredential({
                supabase,
                orgId: ORG_A,
                secretRef: VAULT_REF,
                env: { RESEND_API_KEY: "re_deployment" },
            })
        ).resolves.toEqual({ ok: false, reason: "org_credential_unavailable" });
    });

    it("reports honestly when there is no credential of either kind", async () => {
        await expect(
            resolveInboundRetrievalCredential({
                supabase: credentialAuthority({}),
                orgId: ORG_A,
                secretRef: null,
                env: {},
            })
        ).resolves.toEqual({ ok: false, reason: "no_credential_available" });
    });
});

describe("tenancy", () => {
    it("another organization cannot resolve this organization's credential", async () => {
        const supabase = credentialAuthority({ [`${ORG_A}|${VAULT_REF}`]: "re_org_a_key" });
        await expect(
            resolveInboundRetrievalCredential({ supabase, orgId: ORG_B, secretRef: VAULT_REF, env: {} })
        ).resolves.toEqual({ ok: false, reason: "org_credential_unavailable" });
    });

    it("the org id is taken from the caller, never from the reference", async () => {
        // A reference is an opaque string that could be guessed or copied. It carries no
        // tenancy of its own — the pair does, and the pair is checked by the database.
        const supabase = credentialAuthority({ [`${ORG_A}|${VAULT_REF}`]: "k" });
        const asB = await resolveInboundRetrievalCredential({ supabase, orgId: ORG_B, secretRef: VAULT_REF, env: {} });
        expect(asB.ok).toBe(false);
    });
});

/* ---------------------------------------------------------------------------
 * ORDERING — proven against the real ingestion path
 * ------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

function store(seed: Partial<Record<string, Row[]>> = {}) {
    const tables: Record<string, Row[]> = {
        communication_inbound_ingress: [],
        communication_provider_bindings: [],
        communication_ingress_routes: [],
        communication_messages: [],
        communication_threads: [],
        persons: [],
        workflow_events: [],
        ...JSON.parse(JSON.stringify(seed)),
    };
    let seq = 0;
    const client = {
        from(table: string) {
            if (!tables[table]) tables[table] = [];
            const rows = () => tables[table]!;
            const filters: Array<(r: Row) => boolean> = [];
            let ins: Row | null = null;
            let upd: Row | null = null;
            const apply = () => rows().filter((r) => filters.every((f) => f(r)));
            const result = () => {
                if (ins) {
                    const row = { id: `${table}-${++seq}`, ...ins };
                    rows().push(row);
                    return { data: row, error: null };
                }
                if (upd) {
                    for (const r of apply()) Object.assign(r, upd);
                    return { data: null, error: null };
                }
                return { data: apply(), error: null };
            };
            const b: Record<string, unknown> = {
                insert(v: Row) { ins = v; return b; },
                update(v: Row) { upd = v; return b; },
                select: () => b,
                eq(c: string, v: unknown) { filters.push((r) => String(r[c] ?? "") === String(v ?? "")); return b; },
                in(c: string, v: unknown[]) { filters.push((r) => v.map(String).includes(String(r[c] ?? ""))); return b; },
                ilike(c: string, v: string) { filters.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase()); return b; },
                or: () => b,
                limit: () => b,
                maybeSingle() { const r = result(); return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }); },
                then: (f: (v: unknown) => unknown) => Promise.resolve(result()).then(f),
            };
            return b;
        },
    } as unknown as SupabaseClient;
    return { tables, client };
}

const HIDDEN = "hidden-abc@vvaxamo.resend.app";
const VISIBLE = "kelly@workwithalloy.com";

function bindingRow(over: Row = {}): Row {
    return {
        id: "bind-a", org_id: ORG_A, channel: "email", provider: "resend", status: "active",
        inbound_address: VISIBLE, location_id: null, secret_ref: VAULT_REF, ...over,
    };
}

function receivedEvent(receivedFor: string) {
    return normalizeResendReceivedEvent(
        {
            email_id: "7651459e-83ab-4ed1-b097-47f3c0164965",
            created_at: "2026-08-19T17:00:00.000Z",
            from: "kelly.kurzman@gmail.com",
            to: [receivedFor],
            cc: [], bcc: [], received_for: [receivedFor],
            message_id: "<gmail-1@mail.gmail.com>",
            subject: "DIRECT RESEND INBOUND TEST 2026-08-19",
            attachments: [],
        },
        { receivedAtFallback: "2026-08-19T17:00:00.000Z" }
    )!;
}

describe("ownership decides the credential, and decides it first", () => {
    const seeded = {
        communication_provider_bindings: [bindingRow()],
        communication_ingress_routes: [
            { id: "route-a", org_id: ORG_A, destination: HIDDEN, communication_provider_binding_id: "bind-a" },
        ],
    };

    it("retrieval receives the OWNING org and its binding's credential reference", async () => {
        const s = store(seeded);
        const retrieve = vi.fn(async () => ({ ok: true as const, payload: { text: "x", headers: {} } }));
        await ingestResendInboundEmail(receivedEvent(HIDDEN), { supabase: s.client, retrieve, now: () => "2026-08-19T17:00:00.000Z" } as unknown as InboundEmailIngestionDeps);

        expect(retrieve).toHaveBeenCalledTimes(1);
        expect(retrieve.mock.calls[0]![1]).toEqual({ orgId: ORG_A, secretRef: VAULT_REF });
    });

    it("a FORGED received_for reaches no credential at all — retrieval is never attempted", async () => {
        // The destination names nothing this deployment routes. Ownership fails, and the
        // message is quarantined before any secret is looked up. There is no path from an
        // attacker-supplied string to a credential lookup.
        const s = store(seeded);
        const retrieve = vi.fn();
        const outcome = await ingestResendInboundEmail(
            receivedEvent("attacker-invented@vvaxamo.resend.app"),
            { supabase: s.client, retrieve, now: () => "t" } as unknown as InboundEmailIngestionDeps
        );
        expect(outcome).toEqual({ status: "quarantined", disposition: "no_attributable_org" });
        expect(retrieve).not.toHaveBeenCalled();
    });

    it("a DISABLED connection owns nothing, so its credential is never resolved", async () => {
        const s = store({ ...seeded, communication_provider_bindings: [bindingRow({ status: "disabled" })] });
        const retrieve = vi.fn();
        const outcome = await ingestResendInboundEmail(receivedEvent(HIDDEN), {
            supabase: s.client, retrieve, now: () => "t",
        } as unknown as InboundEmailIngestionDeps);
        expect(outcome).toEqual({ status: "quarantined", disposition: "no_attributable_org" });
        expect(retrieve).not.toHaveBeenCalled();
    });

    it("a credential failure leaves the receipt PENDING — the message is not discarded", async () => {
        const s = store(seeded);
        const retrieve = vi.fn(async () => ({ ok: false as const, retryable: true as const, reason: "org_credential_unavailable" }));
        const outcome = await ingestResendInboundEmail(receivedEvent(HIDDEN), {
            supabase: s.client, retrieve, now: () => "t",
        } as unknown as InboundEmailIngestionDeps);
        expect(outcome).toMatchObject({ status: "retrieval_pending", reason: "org_credential_unavailable", retryable: true });
        expect(s.tables.communication_inbound_ingress).toHaveLength(1);
        expect(s.tables.communication_messages).toHaveLength(0);
    });

    it("NO SECRET is written to the receipt or to any canonical row", async () => {
        const s = store(seeded);
        const retrieve = vi.fn(async () => ({
            ok: true as const,
            payload: { text: "body", html: null, headers: { "in-reply-to": "<x@y>" } },
        }));
        await ingestResendInboundEmail(receivedEvent(HIDDEN), {
            supabase: s.client, retrieve, now: () => "2026-08-19T17:00:00.000Z",
        } as unknown as InboundEmailIngestionDeps);

        // Scoped to what ingestion WRITES. `communication_provider_bindings` is excluded
        // deliberately: the reference lives there by design, it is configuration rather
        // than a secret, and it is the seed this test supplied — asserting over it would
        // fail for the wrong reason and prove nothing about what ingestion copied.
        const written = JSON.stringify({
            receipts: s.tables.communication_inbound_ingress,
            messages: s.tables.communication_messages,
            threads: s.tables.communication_threads,
            workflowEvents: s.tables.workflow_events,
            observations: s.tables.communication_ingress_eligibility_observations ?? [],
        });
        for (const secretish of [VAULT_REF, "vault:", "re_org_a_key", "re_deployment", "secret_ref", "apiKey"]) {
            expect(written).not.toContain(secretish);
        }
    });
});
