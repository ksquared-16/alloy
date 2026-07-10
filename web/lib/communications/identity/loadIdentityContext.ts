import type { SupabaseClient } from "@supabase/supabase-js";

import type {
    CommunicationIdentityRow,
    IdentityGrantRow,
    IdentityResolutionContext,
    LegacyBindingRow,
    LocationBindingRow,
    ProviderAccountRow,
} from "./types";

function mapAccount(row: Record<string, unknown>): ProviderAccountRow {
    return {
        id: String(row.id),
        org_id: String(row.org_id),
        provider_type: String(row.provider_type),
        display_label: row.display_label != null ? String(row.display_label) : null,
        status: String(row.status),
        verification_state: row.verification_state as ProviderAccountRow["verification_state"],
        health_status: row.health_status as ProviderAccountRow["health_status"],
        secret_ref: String(row.secret_ref ?? "unconfigured"),
        capabilities: (row.capabilities as Record<string, unknown>) ?? {},
        config: (row.config as Record<string, unknown>) ?? {},
        provider_account_ref: row.provider_account_ref != null ? String(row.provider_account_ref) : null,
        legacy_binding_id: row.legacy_binding_id != null ? String(row.legacy_binding_id) : null,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
    };
}

function mapIdentity(row: Record<string, unknown>): CommunicationIdentityRow {
    return {
        id: String(row.id),
        org_id: String(row.org_id),
        provider_account_id: String(row.provider_account_id),
        channel: row.channel as CommunicationIdentityRow["channel"],
        identity_type: String(row.identity_type),
        canonical_address: String(row.canonical_address),
        normalized_address: String(row.normalized_address),
        display_name: row.display_name != null ? String(row.display_name) : null,
        inbound_enabled: Boolean(row.inbound_enabled),
        outbound_enabled: Boolean(row.outbound_enabled),
        verification_state: row.verification_state as CommunicationIdentityRow["verification_state"],
        status: row.status as CommunicationIdentityRow["status"],
        health_status: row.health_status as CommunicationIdentityRow["health_status"],
        capabilities: (row.capabilities as Record<string, unknown>) ?? {},
        provider_resource_ref: row.provider_resource_ref != null ? String(row.provider_resource_ref) : null,
        scope: row.scope as CommunicationIdentityRow["scope"],
        is_default_for_scope: Boolean(row.is_default_for_scope),
        legacy_binding_id: row.legacy_binding_id != null ? String(row.legacy_binding_id) : null,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
    };
}

function mapLocationBinding(row: Record<string, unknown>): LocationBindingRow {
    return {
        id: String(row.id),
        org_id: String(row.org_id),
        identity_id: String(row.identity_id),
        location_id: String(row.location_id),
        channel: row.channel as LocationBindingRow["channel"],
        priority: Number(row.priority ?? 100),
        is_default: Boolean(row.is_default),
        inbound_routing_enabled: Boolean(row.inbound_routing_enabled),
        outbound_sending_enabled: Boolean(row.outbound_sending_enabled),
        status: String(row.status),
    };
}

function mapGrant(row: Record<string, unknown>): IdentityGrantRow {
    return {
        id: String(row.id),
        org_id: String(row.org_id),
        identity_id: String(row.identity_id),
        user_id: String(row.user_id),
        can_send: Boolean(row.can_send),
        can_receive: Boolean(row.can_receive),
        can_configure: Boolean(row.can_configure),
        can_manage: Boolean(row.can_manage),
        can_override_default: Boolean(row.can_override_default),
        can_use_across_locations: Boolean(row.can_use_across_locations),
        status: String(row.status),
    };
}

function mapLegacyBinding(row: Record<string, unknown>): LegacyBindingRow {
    return {
        id: String(row.id),
        org_id: String(row.org_id),
        channel: String(row.channel),
        provider: String(row.provider),
        scope: String(row.scope),
        location_id: row.location_id != null ? String(row.location_id) : null,
        status: String(row.status),
        is_primary: row.is_primary != null ? Boolean(row.is_primary) : null,
        secret_ref: row.secret_ref != null ? String(row.secret_ref) : null,
        inbound_to_e164: row.inbound_to_e164 != null ? String(row.inbound_to_e164) : null,
        config: (row.config as Record<string, unknown>) ?? null,
        display_label: row.display_label != null ? String(row.display_label) : null,
    };
}

/** Load identity platform rows for resolver (org-scoped). */
export async function loadIdentityResolutionContext(
    supabase: SupabaseClient,
    orgId: string
): Promise<IdentityResolutionContext> {
    const [accountsRes, identitiesRes, locRes, grantsRes, legacyRes] = await Promise.all([
        supabase
            .from("communication_provider_accounts")
            .select("*")
            .eq("org_id", orgId),
        supabase
            .from("communication_identities")
            .select("*")
            .eq("org_id", orgId),
        supabase
            .from("communication_identity_location_bindings")
            .select("*")
            .eq("org_id", orgId),
        supabase
            .from("communication_identity_grants")
            .select("*")
            .eq("org_id", orgId),
        supabase
            .from("communication_provider_bindings")
            .select("id, org_id, channel, provider, scope, location_id, status, is_primary, secret_ref, inbound_to_e164, config, display_label")
            .eq("org_id", orgId),
    ]);

    return {
        accounts: (accountsRes.data ?? []).map((r) => mapAccount(r as Record<string, unknown>)),
        identities: (identitiesRes.data ?? []).map((r) => mapIdentity(r as Record<string, unknown>)),
        locationBindings: (locRes.data ?? []).map((r) => mapLocationBinding(r as Record<string, unknown>)),
        grants: (grantsRes.data ?? []).map((r) => mapGrant(r as Record<string, unknown>)),
        legacyBindings: (legacyRes.data ?? []).map((r) => mapLegacyBinding(r as Record<string, unknown>)),
    };
}
