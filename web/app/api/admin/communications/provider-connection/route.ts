import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    putOrgProviderCredential,
    revokeOrgProviderCredential,
} from "@/lib/communications/orgProviderCredential";
import { verifyResendApiKey } from "@/lib/communications/resendConnection";
import { verifyTwilioCredentials } from "@/lib/communications/twilioConnection";

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
    /** Twilio: NOT secrets. Identifiers visible in Twilio's own console. */
    account_sid?: unknown;
    auth_token?: unknown;
    messaging_service_sid?: unknown;
};

/** Providers an organization can connect itself. */
const SELF_SERVICE_PROVIDERS = new Set(["resend", "twilio"]);

/** Which channel a provider serves. */
const PROVIDER_CHANNEL: Record<string, string> = { resend: "email", twilio: "sms" };

function badRequest(error: string, code?: string) {
    return NextResponse.json({ error, code: code ?? null }, { status: 400 });
}


/** The account holding this organization's own credential, if there is one. */
async function findOrgOwnedAccount(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    provider: string,
): Promise<string | null> {
    const { data } = await supabase
        .from("communication_provider_accounts")
        .select("id, secret_ref")
        .eq("org_id", orgId)
        .eq("provider_type", provider);
    const rows = (data ?? []) as { id: string; secret_ref: string | null }[];
    const owned = rows.find((r) => String(r.secret_ref ?? "").startsWith("vault:"));
    return owned?.id ?? null;
}

/**
 * The account a connect should write to: the organization-owned one if it exists
 * (so replacement keeps every binding working), otherwise a fresh one. Never an
 * arbitrary pre-existing account — writing an organization credential onto a
 * seeded or certification account would conflate two different things.
 */
async function findOrCreateOrgAccount(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    provider: string,
    displayLabel: string,
): Promise<string | null> {
    const owned = await findOrgOwnedAccount(supabase, orgId, provider);
    if (owned) return owned;

    const { data: created, error } = await supabase
        .from("communication_provider_accounts")
        .insert({
            org_id: orgId,
            provider_type: provider,
            display_label: displayLabel || (provider === "twilio" ? "Twilio" : "Resend"),
            status: "pending_verification",
            verification_state: "pending",
            secret_ref: "unconfigured",
        })
        .select("id")
        .single();
    if (error || !created) return null;
    return (created as { id: string }).id;
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

    const env = process.env as Record<string, string | undefined>;
    const isTwilio = provider === "twilio";

    // The SECRET for each provider. Twilio also needs identifiers, which are not
    // secrets and are handled as ordinary configuration below.
    const secret = isTwilio
        ? typeof body.auth_token === "string"
            ? body.auth_token.trim()
            : ""
        : typeof body.api_key === "string"
          ? body.api_key.trim()
          : "";
    const accountSid = typeof body.account_sid === "string" ? body.account_sid.trim() : "";
    const messagingServiceSid =
        typeof body.messaging_service_sid === "string" ? body.messaging_service_sid.trim() : "";

    if (!secret) {
        return badRequest(
            isTwilio ? "Enter the Auth Token from your Twilio account." : "Enter the API key from your Resend account.",
            "missing_credential",
        );
    }
    if (isTwilio && !accountSid) {
        return badRequest("Enter the Account SID from your Twilio account.", "missing_account_sid");
    }

    // VERIFY BEFORE STORING. "The vault write succeeded" is not provider
    // readiness, and calling it Connected on that basis is the exact class of lie
    // this surface exists to prevent.
    const verification = isTwilio
        ? await verifyTwilioCredentials(accountSid, secret, { env })
        : await verifyResendApiKey(secret, { env });

    if (verification.outcome === "invalid_credential") {
        return NextResponse.json(
            {
                error: isTwilio
                    ? "Twilio did not accept those credentials. Check the Account SID and Auth Token."
                    : "Resend did not accept that API key. Check it was copied in full and has not been revoked.",
                code: "invalid_credential",
            },
            { status: 422 },
        );
    }
    if (verification.outcome === "certification_only") {
        // Honest about WHY: this build refuses to contact Resend, so a real key
        // cannot be proven here — and must not be stored on an unverified guess.
        return NextResponse.json(
            {
                error:
                    "This environment cannot verify real provider keys, so the connection was not saved. " +
                    "Your key was not stored. Use a deployment connected to Resend to complete setup.",
                code: "certification_only",
            },
            { status: 503 },
        );
    }
    if (verification.outcome === "unavailable") {
        // Deliberately NOT 422: nothing is wrong with what the operator typed, so
        // the connection must not be recorded as rejected.
        return NextResponse.json(
            {
                error: `Alloy could not reach ${isTwilio ? "Twilio" : "Resend"} to confirm those credentials. Nothing was changed — try again.`,
                code: "provider_unavailable",
            },
            { status: 503 },
        );
    }

    const supabase = createAdminClient();
    const displayLabel = typeof body.display_label === "string" ? body.display_label.trim().slice(0, 80) : "";

    // WHICH ACCOUNT IS "the organization's connection"? The one already holding an
    // organization-owned credential — i.e. a `vault:` reference. A tenant can carry
    // several provider accounts (seeded, migrated, certification), so "the oldest"
    // is arbitrary: it picked a synthetic account here and left the real connection
    // untouched, which made revoke silently succeed while the tenant stayed
    // connected. Identity by role, not by age.
    const accountId = await findOrCreateOrgAccount(supabase, ctx.orgId, provider, displayLabel);
    if (!accountId) return badRequest("Could not create the connection.", "account_create_failed");

    const stored = await putOrgProviderCredential(supabase, {
        orgId: ctx.orgId,
        providerAccountId: accountId,
        secret,
        actorUserId: admin.userId ?? null,
    });
    if (!stored.ok) {
        // Say WHICH kind of failure. A single generic sentence could not tell an
        // administrator apart "your key is bad" from "this environment cannot
        // store keys at all" — and the second is not their fault, cannot be
        // retried, and needs a different person. No database or vault language.
        if (stored.reason === "storage_unavailable") {
            return NextResponse.json(
                {
                    error:
                        "Secure credential storage is unavailable in this environment, so the connection was not saved. " +
                        "Your key was not stored. This needs an Alloy administrator — it cannot be fixed by retrying.",
                    code: "storage_unavailable",
                },
                { status: 503 },
            );
        }
        return badRequest("Could not save the connection. Nothing was stored.", "credential_store_failed");
    }

    // Verified above, so this is a fact rather than an assumption.
    //
    // The Account SID and Messaging Service SID are NOT secrets — they appear in
    // Twilio's console and in webhook payloads — so they are stored as ordinary
    // configuration an administrator can read and correct. Hiding a non-secret
    // behind a write-once field would make the connection unmanageable for no
    // security gain.
    const providerLabel =
        displayLabel || (verification.outcome === "ok" && isTwilio ? (verification.accountLabel ?? "") : "");
    await supabase
        .from("communication_provider_accounts")
        .update({
            status: "active",
            verification_state: "verified",
            health_status: "healthy",
            ...(providerLabel ? { display_label: providerLabel } : {}),
            ...(isTwilio ? { provider_account_ref: accountSid } : {}),
            updated_at: new Date().toISOString(),
        })
        .eq("id", accountId)
        .eq("org_id", ctx.orgId);

    // Point this organization's email bindings at the account they now own. A
    // binding still naming the deployment credential would keep sending through
    // Alloy's account after the organization connected its own.
    const channel = PROVIDER_CHANNEL[provider] ?? "email";
    await supabase
        .from("communication_provider_bindings")
        .update({ secret_ref: stored.secretRef, updated_at: new Date().toISOString() })
        .eq("org_id", ctx.orgId)
        .eq("channel", channel)
        .eq("provider", provider);

    return NextResponse.json({
        ok: true,
        provider,
        connection: {
            state: "connected",
            /** What the account can send from today. Never a credential. */
            verified_domains: verification.outcome === "ok" && !isTwilio ? verification.verifiedDomains : [],
            account_label: verification.outcome === "ok" && isTwilio ? verification.accountLabel : null,
            messaging_service_sid: messagingServiceSid || null,
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
    // Revoke the ORGANIZATION-owned connection specifically — the account holding a
    // `vault:` reference. Revoking "the first account" would report success while
    // leaving the real credential live.
    const accountId = await findOrgOwnedAccount(supabase, ctx.orgId, provider);
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
        .eq("channel", PROVIDER_CHANNEL[provider] ?? "email")
        .eq("provider", provider);

    return NextResponse.json({ ok: true, connection: { state: "not_connected" } });
}
