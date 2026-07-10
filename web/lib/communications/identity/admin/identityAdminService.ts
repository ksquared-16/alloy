import type { SupabaseClient } from "@supabase/supabase-js";

import { buildBosDiscoverySnapshot } from "@/lib/communications/identity/bosDiscoverySignals";
import { evaluateIdentitySendAccess } from "@/lib/communications/identity/admin/defaultGrantPolicy";
import { loadIdentityResolutionContext } from "@/lib/communications/identity/loadIdentityContext";
import { resolveOutboundSender } from "@/lib/communications/identity/resolveOutboundSender";
import type { CommunicationChannel } from "@/lib/communications/identity/types";

export type SanitizedProviderAccount = {
    id: string;
    provider_type: string;
    display_label: string | null;
    status: string;
    verification_state: string;
    health_status: string;
    identity_count: number;
    legacy_binding_id: string | null;
};

export type SanitizedIdentity = {
    id: string;
    channel: CommunicationChannel;
    identity_type: string;
    display_name: string | null;
    canonical_address: string;
    status: string;
    verification_state: string;
    health_status: string;
    inbound_enabled: boolean;
    outbound_enabled: boolean;
    scope: string;
    is_default_for_scope: boolean;
    default_access_mode: string;
    provider_account_id: string;
    provider_type: string | null;
    location_binding_ids: string[];
    grant_count: number;
    legacy_binding_id: string | null;
};

export async function buildIdentityPlatformOverview(supabase: SupabaseClient, orgId: string) {
    const ctx = await loadIdentityResolutionContext(supabase, orgId);
    const bos = buildBosDiscoverySnapshot(ctx);

    const { data: locations } = await supabase
        .from("locations")
        .select("id, label, location_type")
        .eq("org_id", orgId)
        .eq("location_type", "site");

    const sites = (locations ?? []).filter((l) => String((l as { location_type?: string }).location_type) === "site");
    const smsIdentities = ctx.identities.filter((i) => i.channel === "sms" && i.status === "active");
    const emailIdentities = ctx.identities.filter((i) => i.channel === "email" && i.status === "active");
    const unverified = ctx.identities.filter((i) => i.verification_state !== "verified" && i.status === "active");

    let locationsWithSms = 0;
    let locationsWithEmail = 0;
    for (const site of sites) {
        const lid = String((site as { id: string }).id);
        if (ctx.locationBindings.some((b) => b.location_id === lid && b.channel === "sms" && b.status === "active")) {
            locationsWithSms += 1;
        }
        if (ctx.locationBindings.some((b) => b.location_id === lid && b.channel === "email" && b.status === "active")) {
            locationsWithEmail += 1;
        }
    }

    return {
        summary: {
            provider_accounts: ctx.accounts.length,
            identities: ctx.identities.length,
            sms_identities: smsIdentities.length,
            email_identities: emailIdentities.length,
            locations_total: sites.length,
            locations_with_sms: locationsWithSms,
            locations_with_email: locationsWithEmail,
            unverified_identities: unverified.length,
            degraded_providers: ctx.accounts.filter((a) => a.health_status === "degraded" || a.health_status === "unavailable").length,
        },
        issues: bos.signals,
        bos_discovery: bos,
    };
}

export async function listSanitizedProviderAccounts(supabase: SupabaseClient, orgId: string): Promise<SanitizedProviderAccount[]> {
    const ctx = await loadIdentityResolutionContext(supabase, orgId);
    return ctx.accounts.map((a) => ({
        id: a.id,
        provider_type: a.provider_type,
        display_label: a.display_label,
        status: a.status,
        verification_state: a.verification_state,
        health_status: a.health_status,
        identity_count: ctx.identities.filter((i) => i.provider_account_id === a.id).length,
        legacy_binding_id: a.legacy_binding_id,
    }));
}

export async function listSanitizedIdentities(supabase: SupabaseClient, orgId: string): Promise<SanitizedIdentity[]> {
    const ctx = await loadIdentityResolutionContext(supabase, orgId);
    const accountType = new Map(ctx.accounts.map((a) => [a.id, a.provider_type]));
    return ctx.identities.map((i) => ({
        id: i.id,
        channel: i.channel,
        identity_type: i.identity_type,
        display_name: i.display_name,
        canonical_address: i.canonical_address,
        status: i.status,
        verification_state: i.verification_state,
        health_status: i.health_status,
        inbound_enabled: i.inbound_enabled,
        outbound_enabled: i.outbound_enabled,
        scope: i.scope,
        is_default_for_scope: i.is_default_for_scope,
        default_access_mode: i.default_access_mode ?? "open_until_restricted",
        provider_account_id: i.provider_account_id,
        provider_type: accountType.get(i.provider_account_id) ?? null,
        location_binding_ids: ctx.locationBindings.filter((b) => b.identity_id === i.id).map((b) => b.id),
        grant_count: ctx.grants.filter((g) => g.identity_id === i.id && g.status === "active").length,
        legacy_binding_id: i.legacy_binding_id,
    }));
}

export async function getLocationSetup(supabase: SupabaseClient, orgId: string, locationId: string) {
    const ctx = await loadIdentityResolutionContext(supabase, orgId);
    const bindings = ctx.locationBindings.filter((b) => b.location_id === locationId && b.status === "active");
    const identityMap = new Map(ctx.identities.map((i) => [i.id, i]));

    const channelView = (channel: CommunicationChannel) => {
        const rows = bindings.filter((b) => b.channel === channel);
        return rows.map((b) => {
            const ident = identityMap.get(b.identity_id);
            return {
                binding_id: b.id,
                identity_id: b.identity_id,
                is_default: b.is_default,
                priority: b.priority,
                inbound_routing_enabled: b.inbound_routing_enabled,
                outbound_sending_enabled: b.outbound_sending_enabled,
                display_name: ident?.display_name ?? null,
                address: ident?.canonical_address ?? null,
                status: ident?.status ?? "unknown",
                verification_state: ident?.verification_state ?? "unknown",
            };
        });
    };

    const available = (channel: CommunicationChannel) =>
        ctx.identities
            .filter((i) => i.channel === channel && i.status === "active" && i.outbound_enabled)
            .map((i) => ({ id: i.id, display_name: i.display_name, address: i.canonical_address }));

    return {
        location_id: locationId,
        sms: { bindings: channelView("sms"), available_identities: available("sms") },
        email: { bindings: channelView("email"), available_identities: available("email") },
    };
}

export async function upsertLocationBinding(params: {
    supabase: SupabaseClient;
    orgId: string;
    locationId: string;
    identityId: string;
    channel: CommunicationChannel;
    isDefault?: boolean;
    priority?: number;
    inboundRoutingEnabled?: boolean;
    outboundSendingEnabled?: boolean;
    userId?: string | null;
}) {
    const { supabase, orgId, locationId, identityId, channel } = params;

    const { data: ident } = await supabase
        .from("communication_identities")
        .select("id, org_id, channel, status")
        .eq("id", identityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!ident || String(ident.channel) !== channel) {
        return { ok: false as const, error: "Identity not found for org/channel" };
    }
    if (ident.status === "disabled") {
        return { ok: false as const, error: "Inactive identity cannot be bound" };
    }

    if (params.isDefault) {
        await supabase
            .from("communication_identity_location_bindings")
            .update({ is_default: false })
            .eq("org_id", orgId)
            .eq("location_id", locationId)
            .eq("channel", channel)
            .eq("status", "active");
    }

    const row = {
        org_id: orgId,
        identity_id: identityId,
        location_id: locationId,
        channel,
        priority: params.priority ?? 100,
        is_default: Boolean(params.isDefault),
        inbound_routing_enabled: params.inboundRoutingEnabled ?? true,
        outbound_sending_enabled: params.outboundSendingEnabled ?? true,
        status: "active" as const,
        updated_by: params.userId ?? null,
    };

    const { data, error } = await supabase
        .from("communication_identity_location_bindings")
        .upsert(row, { onConflict: "identity_id,location_id" })
        .select("*")
        .maybeSingle();

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, binding: data };
}

/** Pure validation for safe default binding removal. */
export function validateLocationBindingRemoval(
    existing: { id: string; channel: string; is_default: boolean; status: string },
    siblings: Array<{ id: string; channel: string; is_default: boolean; status: string }>
): { ok: true } | { ok: false; error: string } {
    if (existing.status !== "active") return { ok: true };
    if (!existing.is_default) return { ok: true };

    const activeSameChannel = siblings.filter(
        (b) => b.channel === existing.channel && b.status === "active" && b.id !== existing.id
    );
    if (activeSameChannel.length === 0) {
        return { ok: false, error: "Cannot remove the only active binding for this channel at this location" };
    }
    if (!activeSameChannel.some((b) => b.is_default)) {
        return { ok: false, error: "Set another default before removing this default binding" };
    }
    return { ok: true };
}

export async function removeLocationBinding(supabase: SupabaseClient, orgId: string, bindingId: string) {
    const { data: existing } = await supabase
        .from("communication_identity_location_bindings")
        .select("*")
        .eq("id", bindingId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!existing) return { ok: false as const, error: "Binding not found" };

    const { data: siblings } = await supabase
        .from("communication_identity_location_bindings")
        .select("id, channel, is_default, status")
        .eq("org_id", orgId)
        .eq("location_id", existing.location_id);

    const validation = validateLocationBindingRemoval(
        existing as { id: string; channel: string; is_default: boolean; status: string },
        (siblings ?? []) as Array<{ id: string; channel: string; is_default: boolean; status: string }>
    );
    if (!validation.ok) return { ok: false as const, error: validation.error };

    const { error } = await supabase
        .from("communication_identity_location_bindings")
        .update({ status: "disabled", is_default: false })
        .eq("id", bindingId)
        .eq("org_id", orgId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
}

export async function patchIdentity(params: {
    supabase: SupabaseClient;
    orgId: string;
    identityId: string;
    patch: {
        display_name?: string | null;
        status?: "active" | "disabled";
        inbound_enabled?: boolean;
        outbound_enabled?: boolean;
        default_access_mode?: "open_until_restricted" | "explicit_grants_required";
    };
}) {
    const allowed: Record<string, unknown> = {};
    if (params.patch.display_name !== undefined) allowed.display_name = params.patch.display_name;
    if (params.patch.status !== undefined) allowed.status = params.patch.status;
    if (params.patch.inbound_enabled !== undefined) allowed.inbound_enabled = params.patch.inbound_enabled;
    if (params.patch.outbound_enabled !== undefined) allowed.outbound_enabled = params.patch.outbound_enabled;
    if (params.patch.default_access_mode !== undefined) allowed.default_access_mode = params.patch.default_access_mode;

    const { data, error } = await params.supabase
        .from("communication_identities")
        .update(allowed)
        .eq("id", params.identityId)
        .eq("org_id", params.orgId)
        .select("id, display_name, status, inbound_enabled, outbound_enabled, default_access_mode")
        .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    if (!data) return { ok: false as const, error: "Identity not found" };
    return { ok: true as const, identity: data };
}

export async function upsertGrant(params: {
    supabase: SupabaseClient;
    orgId: string;
    identityId: string;
    userId: string;
    grants: Partial<{
        can_send: boolean;
        can_receive: boolean;
        can_configure: boolean;
        can_manage: boolean;
        can_override_default: boolean;
        can_use_across_locations: boolean;
    }>;
}) {
    const { data: ident } = await params.supabase
        .from("communication_identities")
        .select("id")
        .eq("id", params.identityId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    if (!ident) return { ok: false as const, error: "Identity not found for organization" };

    const { data: member } = await params.supabase
        .from("user_roles")
        .select("user_id")
        .eq("user_id", params.userId)
        .eq("org_id", params.orgId)
        .limit(1)
        .maybeSingle();
    if (!member) return { ok: false as const, error: "User not found in organization" };

    const row = {
        org_id: params.orgId,
        identity_id: params.identityId,
        user_id: params.userId,
        can_send: params.grants.can_send ?? false,
        can_receive: params.grants.can_receive ?? false,
        can_configure: params.grants.can_configure ?? false,
        can_manage: params.grants.can_manage ?? false,
        can_override_default: params.grants.can_override_default ?? false,
        can_use_across_locations: params.grants.can_use_across_locations ?? false,
        status: "active" as const,
    };
    const { data, error } = await params.supabase
        .from("communication_identity_grants")
        .upsert(row, { onConflict: "org_id,identity_id,user_id" })
        .select("*")
        .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, grant: data };
}

export async function listEligibleIdentitiesForOperator(params: {
    supabase: SupabaseClient;
    orgId: string;
    operatorUserId: string;
    locationId?: string | null;
    channel: CommunicationChannel;
    hasCommunicationsSend: boolean;
}) {
    const ctx = await loadIdentityResolutionContext(params.supabase, params.orgId);
    const accountType = new Map(ctx.accounts.map((a) => [a.id, a.provider_type]));
    const results: Array<SanitizedIdentity & { access: ReturnType<typeof evaluateIdentitySendAccess> }> = [];

    for (const i of ctx.identities) {
        if (i.channel !== params.channel || i.status !== "active") continue;
        if (params.locationId) {
            const bound =
                i.scope === "tenant" ||
                ctx.locationBindings.some(
                    (b) => b.identity_id === i.id && b.location_id === params.locationId && b.status === "active"
                );
            if (!bound) continue;
        }
        const identityGrants = ctx.grants.filter((g) => g.identity_id === i.id);
        const access = evaluateIdentitySendAccess({
            defaultAccessMode: i.default_access_mode ?? "open_until_restricted",
            grantsForIdentity: identityGrants,
            operatorUserId: params.operatorUserId,
            operatorHasCommunicationsSend: params.hasCommunicationsSend,
        });
        if (!access.allowed) continue;
        results.push({
            id: i.id,
            channel: i.channel,
            identity_type: i.identity_type,
            display_name: i.display_name,
            canonical_address: i.canonical_address,
            status: i.status,
            verification_state: i.verification_state,
            health_status: i.health_status,
            inbound_enabled: i.inbound_enabled,
            outbound_enabled: i.outbound_enabled,
            scope: i.scope,
            is_default_for_scope: i.is_default_for_scope,
            default_access_mode: i.default_access_mode ?? "open_until_restricted",
            provider_account_id: i.provider_account_id,
            provider_type: accountType.get(i.provider_account_id) ?? null,
            location_binding_ids: ctx.locationBindings.filter((b) => b.identity_id === i.id).map((b) => b.id),
            grant_count: identityGrants.filter((g) => g.status === "active").length,
            legacy_binding_id: i.legacy_binding_id,
            access,
        });
    }
    return results;
}

export async function previewSender(params: {
    supabase: SupabaseClient;
    orgId: string;
    channel: CommunicationChannel;
    operatorUserId: string | null;
    locationId?: string | null;
    requestedIdentityId?: string | null;
    hasCommunicationsSend: boolean;
}) {
    return resolveOutboundSender({
        supabase: params.supabase,
        orgId: params.orgId,
        channel: params.channel,
        operatorUserId: params.operatorUserId,
        locationId: params.locationId ?? null,
        requestedIdentityId: params.requestedIdentityId ?? null,
        operatorHasCommunicationsSend: params.hasCommunicationsSend,
    });
}

export async function getInboundTestStatus(supabase: SupabaseClient, orgId: string, identityId?: string | null) {
    let q = supabase
        .from("communication_messages")
        .select("id, channel, direction, from_address, to_address, created_at, metadata, communication_identity_id, thread_id")
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .eq("channel", "sms")
        .order("created_at", { ascending: false })
        .limit(5);
    if (identityId) q = q.eq("communication_identity_id", identityId);
    const { data } = await q;
    return (data ?? []).map((m) => ({
        message_id: m.id,
        created_at: m.created_at,
        from_address: m.from_address,
        to_address: m.to_address,
        communication_identity_id: m.communication_identity_id,
        ambiguous_location: Boolean((m.metadata as Record<string, unknown>)?.inbound_location_ambiguous),
        inbound_resolution: (m.metadata as Record<string, unknown>)?.inbound_resolution ?? null,
    }));
}
