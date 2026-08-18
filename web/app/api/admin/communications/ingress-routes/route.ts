import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import {
    CERTIFICATION_RECEIVING_DOMAINS,
    certificationDiscoveryEnabled,
    extractReceivingDomains,
    validateReceivingDomain,
} from "@/lib/communications/ingress/receivingDomain";
import {
    decideProvisioning,
    describeDomainDrift,
} from "@/lib/communications/ingress/provisionIngressRoute";
import {
    CERTIFICATION_RESEND_KEY,
    RESEND_DOMAINS_ENDPOINT,
} from "@/lib/communications/resendConnection";
import {
    isOrgOwnedSecretRef,
    resolveOrgProviderCredential,
} from "@/lib/communications/orgProviderCredential";

/**
 * GET /api/admin/communications/ingress-routes — the ADMINISTRATOR'S setup detail.
 *
 * A SEPARATE endpoint on purpose. The ordinary bindings projection deliberately
 * carries no delivery destination: it feeds the channel cards, the composer's
 * From line and the operator's own identity display, and a transport address
 * reaching any of those would be shown to someone as an email address they might
 * then give to a parent.
 *
 * But an administrator setting up address-level routing genuinely needs the
 * destination — it is the value they paste into their own mail provider's
 * forwarding rule. So it is served here, from a route whose name says what it is,
 * rather than by widening the projection everything else reads.
 *
 * That split is the whole point: "never rendered in ordinary operator or parent
 * UX" stays true because ordinary UX cannot obtain it, not because each surface
 * remembers to omit it.
 */
export async function GET() {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("communication_ingress_routes")
        .select("id, communication_provider_binding_id, destination, verification_state, last_inbound_at")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        routes: (data ?? []).map((raw) => {
            const row = raw as {
                id: string;
                communication_provider_binding_id: string;
                destination: string;
                verification_state: string;
                last_inbound_at: string | null;
            };
            return {
                id: row.id,
                binding_id: row.communication_provider_binding_id,
                destination: row.destination,
                verification_state: row.verification_state,
                last_inbound_at: row.last_inbound_at,
                /**
                 * Whether inbound has actually been observed here. Reported as its
                 * own boolean rather than left for a caller to infer from
                 * `verification_state`, so the UI cannot accidentally treat
                 * "configured" as "working" — the exact substitution this whole
                 * model exists to prevent.
                 */
                inbound_observed: row.last_inbound_at !== null,
            };
        }),
    });
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The org's Resend account row, and the receiving domain configured on it. */
async function loadResendAccount(supabase: ReturnType<typeof createAdminClient>, orgId: string) {
    const { data } = await supabase
        .from("communication_provider_accounts")
        .select("id, secret_ref, config, status")
        .eq("org_id", orgId)
        .eq("provider_type", "resend")
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1);
    const row = (data ?? [])[0] as
        | { id: string; secret_ref: string | null; config: Record<string, unknown> | null; status: string }
        | undefined;
    if (!row) return null;
    const cfg = row.config && typeof row.config === "object" ? row.config : {};
    const domain = typeof cfg.receiving_domain === "string" ? cfg.receiving_domain.trim().toLowerCase() : null;
    return { id: row.id, secretRef: row.secret_ref ?? null, receivingDomain: domain || null, config: cfg };
}

/**
 * Receiving-enabled domains the connected account exposes.
 *
 * Discovery is a HINT, never a gate. An unreachable provider, an unreadable
 * payload or an account with no custom receiving domain all yield an empty list,
 * and the administrator falls back to pasting the Resend-assigned domain. Failing
 * setup because discovery failed would block a path that does not need the
 * provider at all.
 */
async function discoverReceivingDomains(apiKey: string | null): Promise<string[]> {
    // A certification run cannot reach Resend, so discovery there would always
    // answer "none" and the detected-domain path could never be exercised.
    // Mirrors `certificationVerifier`, and the domains are RFC 2606 `.invalid`.
    if (certificationDiscoveryEnabled(process.env as Record<string, string | undefined>)) {
        return [...CERTIFICATION_RECEIVING_DOMAINS];
    }
    const key = (apiKey ?? "").trim();
    // The certification credential is structurally incapable of reaching Resend.
    if (!key || key === CERTIFICATION_RESEND_KEY) return [];
    try {
        const res = await fetch(RESEND_DOMAINS_ENDPOINT, {
            method: "GET",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        });
        if (!res.ok) return [];
        return extractReceivingDomains(await res.json());
    } catch {
        // Never propagate: the thrown error can carry the request, and the
        // request carries the key.
        return [];
    }
}

/**
 * POST — complete the Alloy side of Email receiving setup.
 *
 * Two things happen here, in this order, and both are idempotent:
 *
 *   1. If the administrator confirmed a receiving domain, store it ONCE on the
 *      provider account. That is the correct grain: one Resend connection, one
 *      receiving domain. Copying it onto every identity would make one provider
 *      fact editable in several places that could then disagree.
 *   2. Derive this binding's hidden destination, or return the one it already has.
 *
 * NOTHING IS CREATED AT THE PROVIDER. Resend has no endpoint that creates an
 * inbound address, and needs none — every local part at a receiving domain is
 * already deliverable.
 *
 * Creating a destination NEVER reports receiving as ready. That remains answered
 * by observed arrival alone.
 */
export async function POST(req: Request) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const bindingId = String(body.binding_id ?? "").trim();
    if (!UUID_RE.test(bindingId)) {
        return NextResponse.json({ error: "binding_id must be a UUID" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // ORG-SCOPED. A binding id arrives from a client, so naming one is never the
    // same as being allowed to configure it.
    const { data: bindingRow } = await supabase
        .from("communication_provider_bindings")
        .select("id, org_id, channel, inbound_address")
        .eq("id", bindingId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!bindingRow) return NextResponse.json({ error: "Binding not found" }, { status: 404 });
    if (String(bindingRow.channel ?? "").toLowerCase() !== "email") {
        return NextResponse.json({ error: "Mail routing applies to email channels only" }, { status: 400 });
    }

    const account = await loadResendAccount(supabase, ctx.orgId);
    if (!account) {
        return NextResponse.json(
            { error: "Connect your organization's Resend account before setting up mail routing." },
            { status: 409 }
        );
    }

    // ---- 1. receiving domain, at the PROVIDER ACCOUNT grain -----------------
    let receivingDomain = account.receivingDomain;
    const supplied = typeof body.receiving_domain === "string" ? body.receiving_domain : null;
    if (supplied !== null) {
        const decision = validateReceivingDomain(supplied);
        if (!decision.ok) {
            return NextResponse.json(
                { error: "invalid_receiving_domain", reason: decision.reason },
                { status: 400 }
            );
        }
        if (decision.domain !== receivingDomain) {
            const { error } = await supabase
                .from("communication_provider_accounts")
                .update({
                    config: { ...account.config, receiving_domain: decision.domain },
                    updated_at: new Date().toISOString(),
                })
                .eq("id", account.id)
                .eq("org_id", ctx.orgId);
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
        receivingDomain = decision.domain;
    }

    // ---- 2. this binding's destination -------------------------------------
    const { data: existingRows } = await supabase
        .from("communication_ingress_routes")
        .select("id, destination, last_inbound_at")
        .eq("org_id", ctx.orgId)
        .eq("communication_provider_binding_id", bindingId)
        .limit(1);
    const existing = (existingRows ?? [])[0] as
        | { id: string; destination: string; last_inbound_at: string | null }
        | undefined;

    const decision = decideProvisioning({ receivingDomain, existing: existing ?? null });

    if (decision.action === "needs_receiving_domain") {
        return NextResponse.json(
            {
                status: "needs_receiving_domain",
                // Discovery uses the ORGANIZATION'S OWN credential, resolved
                // through the canonical authority. The plaintext is passed
                // straight to the provider call and never returned, logged, or
                // serialized into the response.
                discovered_domains: await discoverReceivingDomains(
                    isOrgOwnedSecretRef(account.secretRef)
                        ? await resolveOrgProviderCredential(supabase, {
                              orgId: ctx.orgId,
                              secretRef: account.secretRef!,
                          })
                        : null
                ),
            },
            { status: 200 }
        );
    }

    if (decision.action === "create") {
        const { error } = await supabase.from("communication_ingress_routes").insert({
            org_id: ctx.orgId,
            communication_provider_binding_id: bindingId,
            channel: "email",
            destination: decision.destination,
        });
        if (error) {
            // A concurrent double-press loses the race on the unique index. That
            // is success, not failure: re-read and return the winner rather than
            // minting a second address the administrator might route to.
            const { data: raced } = await supabase
                .from("communication_ingress_routes")
                .select("id, destination, last_inbound_at")
                .eq("org_id", ctx.orgId)
                .eq("communication_provider_binding_id", bindingId)
                .limit(1);
            const winner = (raced ?? [])[0] as { destination: string; last_inbound_at: string | null } | undefined;
            if (!winner) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({
                status: "ready_for_routing",
                created: false,
                visible_identity: bindingRow.inbound_address ?? null,
                hidden_destination: winner.destination,
                last_inbound_at: winner.last_inbound_at,
                receiving_observed: winner.last_inbound_at !== null,
            });
        }
    }

    const destination = decision.destination;
    return NextResponse.json({
        status: "ready_for_routing",
        created: decision.action === "create",
        visible_identity: bindingRow.inbound_address ?? null,
        hidden_destination: destination,
        last_inbound_at: existing?.last_inbound_at ?? null,
        // Deliberately NOT "ready". A destination proves Alloy has somewhere to
        // receive; it says nothing about the external forwarding rule.
        receiving_observed: (existing?.last_inbound_at ?? null) !== null,
        domain_drift: describeDomainDrift(destination, receivingDomain),
    });
}
