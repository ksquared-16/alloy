import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    putOrgProviderCredential,
    revokeOrgProviderCredential,
} from "@/lib/communications/orgProviderCredential";
import { verifyResendApiKey } from "@/lib/communications/resendConnection";

/**
 * Connect, replace or revoke an organization's own provider account.
 *
 * THIS IS THE ONLY PLACE AN API KEY MAY ENTER ALLOY. Every other Communications
 * route refuses a body carrying a secret by field name
 * (`detectSecretBoundaryViolation`) and must keep doing so — a general-purpose
 * endpoint that tolerates credentials is how they end up in logs, workflow events
 * and error messages. Here the key is expected, named, and never leaves again:
 *
 *   · it is verified with the provider before anything is stored;
 *   · it is stored through the organization-owned credential authority;
 *   · it is never returned by this route, and there is no GET;
 *   · it is never logged, and provider errors are replaced with our own wording
 *     because a provider's error can quote the request that carried the key.
 *
 * REPLACEMENT IS VERIFY-FIRST. A working connection is never destroyed to try a
 * new key: the replacement is proven against the provider, and only then does it
 * take over. A failed replacement leaves the organization exactly as it was —
 * still sending, still receiving.
 */

type ConnectBody = {
    provider?: unknown;
    api_key?: unknown;
    display_label?: unknown;
};

/** Providers an organization can connect itself, today. */
const SELF_SERVICE_PROVIDERS = new Set(["resend"]);

function badRequest(error: string, code?: string) {
    return NextResponse.json({ error, code: code ?? null }, { status: 400 });
}

export async function POST(request: Request) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const admin = await getAdminContextCached();
    if (!admin.ok) return adminContextFailureResponse(admin);

    let body: ConnectBody;
    try {
        body = (await request.json()) as ConnectBody;
    } catch {
        return badRequest("Invalid request body.");
    }

    const provider = String(body.provider ?? "").trim().toLowerCase();
    if (!SELF_SERVICE_PROVIDERS.has(provider)) {
        return badRequest("That provider cannot be connected from here yet.", "unsupported_provider");
    }

    const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
    if (!apiKey) {
        return badRequest("Enter the API key from your Resend account.", "missing_credential");
    }

    // VERIFY BEFORE STORING. "The vault write succeeded" is not provider
    // readiness, and calling it Connected on that basis is the exact class of lie
    // this surface exists to prevent.
    const verification = await verifyResendApiKey(apiKey, { env: process.env as Record<string, string | undefined> });
    if (verification.outcome === "invalid_credential") {
        return NextResponse.json(
            {
                error: "Resend did not accept that API key. Check it was copied in full and has not been revoked.",
                code: "invalid_credential",
            },
            { status: 422 },
        );
    }
    if (verification.outcome === "unavailable") {
        // Deliberately NOT 422: nothing is wrong with what the operator typed, so
        // the connection must not be recorded as rejected.
        return NextResponse.json(
            { error: "Alloy could not reach Resend to confirm that key. Nothing was changed — try again.", code: "provider_unavailable" },
            { status: 503 },
        );
    }

    const supabase = createAdminClient();
    const displayLabel = typeof body.display_label === "string" ? body.display_label.trim().slice(0, 80) : "";

    // One provider account per organization per provider. Reused on replacement so
    // every binding already pointing at it keeps working.
    const { data: existing } = await supabase
        .from("communication_provider_accounts")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("provider_type", provider)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    let accountId = (existing as { id?: string } | null)?.id ?? null;

    if (!accountId) {
        const { data: created, error: createError } = await supabase
            .from("communication_provider_accounts")
            .insert({
                org_id: ctx.orgId,
                provider_type: provider,
                display_label: displayLabel || "Resend",
                status: "pending_verification",
                verification_state: "pending",
                secret_ref: "unconfigured",
            })
            .select("id")
            .single();
        if (createError || !created) return badRequest("Could not create the connection.", "account_create_failed");
        accountId = (created as { id: string }).id;
    }

    const stored = await putOrgProviderCredential(supabase, {
        orgId: ctx.orgId,
        providerAccountId: accountId,
        secret: apiKey,
        actorUserId: admin.userId ?? null,
    });
    if (!stored.ok) return badRequest("Could not store the connection securely.", "credential_store_failed");

    // Verified above, so this is a fact rather than an assumption.
    await supabase
        .from("communication_provider_accounts")
        .update({
            status: "active",
            verification_state: "verified",
            health_status: "healthy",
            ...(displayLabel ? { display_label: displayLabel } : {}),
            updated_at: new Date().toISOString(),
        })
        .eq("id", accountId)
        .eq("org_id", ctx.orgId);

    // Point this organization's email bindings at the account they now own. A
    // binding still naming the deployment credential would keep sending through
    // Alloy's account after the organization connected its own.
    await supabase
        .from("communication_provider_bindings")
        .update({ secret_ref: stored.secretRef, updated_at: new Date().toISOString() })
        .eq("org_id", ctx.orgId)
        .eq("channel", "email")
        .eq("provider", provider);

    return NextResponse.json({
        ok: true,
        provider,
        connection: {
            state: "connected",
            /** What the account can send from today. Never a credential. */
            verified_domains: verification.verifiedDomains,
        },
    });
}

/** DELETE — revoke. Destroys the secret and disables the connection. */
export async function DELETE(request: Request) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const admin = await getAdminContextCached();
    if (!admin.ok) return adminContextFailureResponse(admin);

    const url = new URL(request.url);
    const provider = String(url.searchParams.get("provider") ?? "").trim().toLowerCase();
    if (!SELF_SERVICE_PROVIDERS.has(provider)) return badRequest("Unknown provider.", "unsupported_provider");

    const supabase = createAdminClient();
    const { data: account } = await supabase
        .from("communication_provider_accounts")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("provider_type", provider)
        .limit(1)
        .maybeSingle();

    const accountId = (account as { id?: string } | null)?.id ?? null;
    if (!accountId) return NextResponse.json({ ok: true, connection: { state: "not_connected" } });

    const revoked = await revokeOrgProviderCredential(supabase, {
        orgId: ctx.orgId,
        providerAccountId: accountId,
        actorUserId: admin.userId ?? null,
    });
    if (!revoked) return badRequest("Could not revoke the connection.", "revoke_failed");

    // Bindings must stop naming a secret that no longer exists, or they would read
    // as connected and fail at dispatch.
    await supabase
        .from("communication_provider_bindings")
        .update({ secret_ref: "unconfigured", updated_at: new Date().toISOString() })
        .eq("org_id", ctx.orgId)
        .eq("channel", "email")
        .eq("provider", provider);

    return NextResponse.json({ ok: true, connection: { state: "not_connected" } });
}
