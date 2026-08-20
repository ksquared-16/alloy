import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { buildBosDiscoverySnapshot } from "@/lib/communications/identity/bosDiscoverySignals";
import { loadIdentityResolutionContext } from "@/lib/communications/identity/loadIdentityContext";
import { resolveOutboundSender } from "@/lib/communications/identity/resolveOutboundSender";
import { visibleEmailAddress } from "@/lib/communications/identity/visibleEmailIdentity";

function sanitizeIdentity(row: Record<string, unknown>) {
    /*
     * An identity's address must never be a transport destination.
     *
     * This surface answers "what address does this organization communicate as",
     * and its answer reaches the composer's From line and the operator's own
     * identity display. A provider ingress address arriving here — written into
     * the wrong field, or migrated from a configuration that overloaded one
     * column for both jobs — would be presented to an operator as their email
     * address, and they may then give it to a parent.
     *
     * Withheld rather than substituted: `null` sends someone to the setting,
     * while a plausible wrong address teaches them something false.
     */
    const channel = String(row.channel ?? "").trim().toLowerCase();
    const canonicalAddress =
        channel === "email"
            ? visibleEmailAddress(row.canonical_address as string | null | undefined)
            : (row.canonical_address as unknown);

    return {
        id: row.id,
        channel: row.channel,
        identity_type: row.identity_type,
        display_name: row.display_name ?? null,
        canonical_address: canonicalAddress,
        status: row.status,
        verification_state: row.verification_state,
        health_status: row.health_status,
        scope: row.scope,
        inbound_enabled: row.inbound_enabled,
        outbound_enabled: row.outbound_enabled,
        is_default_for_scope: row.is_default_for_scope,
        capabilities: row.capabilities ?? {},
    };
}

/**
 * GET /api/admin/communications/identities — read-only identity discovery.
 * Query: channel, location_id, include_bos_signals
 * Never returns secret_ref, tokens, or raw credentials.
 */
export async function GET(req: Request) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const url = new URL(req.url);
    const channel = url.searchParams.get("channel");
    const locationId = url.searchParams.get("location_id");
    const includeBos = url.searchParams.get("include_bos_signals") === "true";

    const supabase = createAdminClient();
    const resolutionCtx = await loadIdentityResolutionContext(supabase, ctx.orgId);

    let identities = resolutionCtx.identities.filter((i) => i.status === "active");
    if (channel === "sms" || channel === "email") {
        identities = identities.filter((i) => i.channel === channel);
    }
    if (locationId) {
        const boundIds = new Set(
            resolutionCtx.locationBindings
                .filter((b) => b.location_id === locationId && b.status === "active")
                .map((b) => b.identity_id)
        );
        identities = identities.filter((i) => i.scope === "tenant" || boundIds.has(i.id));
    }

    const defaultResolution =
        channel === "sms" || channel === "email"
            ? await resolveOutboundSender({
                  supabase,
                  orgId: ctx.orgId,
                  channel,
                  operatorUserId: ctx.userId ?? null,
                  locationId,
                  operatorHasCommunicationsSend: true,
              })
            : null;

    const payload: Record<string, unknown> = {
        identities: identities.map((i) => sanitizeIdentity(i as unknown as Record<string, unknown>)),
        provider_accounts: resolutionCtx.accounts.map((a) => ({
            id: a.id,
            provider_type: a.provider_type,
            display_label: a.display_label,
            status: a.status,
            verification_state: a.verification_state,
            health_status: a.health_status,
        })),
        default_identity:
            defaultResolution && defaultResolution.ok
                ? sanitizeIdentity(defaultResolution.communicationIdentity as unknown as Record<string, unknown>)
                : null,
        permission_stub: { gate: "admin_or_ops", finer_key: "communications.send" },
    };

    if (includeBos) {
        payload.bos_discovery = buildBosDiscoverySnapshot(resolutionCtx, {
            locationId,
            userId: ctx.userId ?? null,
        });
    }

    return NextResponse.json(payload);
}
