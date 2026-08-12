/**
 * Write the identity projection for one binding, in the same request that wrote
 * the binding.
 *
 * Convergent by construction: every row is keyed by `legacy_binding_id`, so
 * running this twice for the same binding updates rather than duplicates. That
 * matters more than it sounds — this runs on create, on every edit, and on retry
 * after a failed save, and an accumulating projection would give the resolver
 * several identities for one channel and no way to choose.
 *
 * FAILURE POSTURE: projection failure is reported but never fails the operator's
 * save. The binding IS the authority; if the projection lags, the configuration
 * the administrator entered is still correct and still what the dispatcher reads.
 * Refusing the save would be strictly worse — it would make a derived, repairable
 * table able to block authoring. The caller surfaces the warning so a persistent
 * failure is visible rather than silent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    planBindingIdentityProjection,
    type ProjectableBinding,
} from "@/lib/communications/identity/projectBindingIdentity";

export type ProjectionOutcome =
    | { ok: true; identityId: string | null; accountId: string }
    | { ok: false; reason: string };

/** Columns the projection needs. Exported so route selects cannot drift from it. */
export const PROJECTABLE_BINDING_COLUMNS =
    "id, org_id, channel, provider, status, is_primary, scope, location_id, display_label, secret_ref, inbound_address, inbound_to_e164, config";

export async function applyBindingIdentityProjection(
    supabase: SupabaseClient,
    binding: ProjectableBinding,
): Promise<ProjectionOutcome> {
    const plan = planBindingIdentityProjection(binding);
    const now = new Date().toISOString();

    // ---- provider account -------------------------------------------------
    const { data: existingAccount } = await supabase
        .from("communication_provider_accounts")
        .select("id")
        .eq("legacy_binding_id", binding.id)
        .maybeSingle();

    let accountId = (existingAccount as { id?: string } | null)?.id ?? null;

    if (accountId) {
        const { error } = await supabase
            .from("communication_provider_accounts")
            .update({ ...plan.account, updated_at: now })
            .eq("id", accountId);
        if (error) return { ok: false, reason: `account_update: ${error.message}` };
    } else {
        const { data, error } = await supabase
            .from("communication_provider_accounts")
            .insert(plan.account)
            .select("id")
            .maybeSingle();
        if (error || !data) return { ok: false, reason: `account_insert: ${error?.message ?? "no row"}` };
        accountId = String((data as { id: string }).id);
    }

    // ---- identity ---------------------------------------------------------
    const { data: existingIdentity } = await supabase
        .from("communication_identities")
        .select("id")
        .eq("legacy_binding_id", binding.id)
        .maybeSingle();
    const identityId = (existingIdentity as { id?: string } | null)?.id ?? null;

    if (!plan.identity) {
        // The binding has no sendable address yet. Any identity previously
        // projected from it is now untrue, so it is disabled rather than left
        // advertising an address the operator has removed.
        if (identityId) {
            await supabase
                .from("communication_identities")
                .update({ status: "disabled", outbound_enabled: false, inbound_enabled: false, updated_at: now })
                .eq("id", identityId);
            await supabase
                .from("communication_identity_location_bindings")
                .update({ status: "disabled", outbound_sending_enabled: false, updated_at: now })
                .eq("identity_id", identityId);
        }
        return { ok: true, identityId: null, accountId };
    }

    const identityRow = { ...plan.identity, provider_account_id: accountId };
    let resolvedIdentityId = identityId;

    if (resolvedIdentityId) {
        const { error } = await supabase
            .from("communication_identities")
            .update({ ...identityRow, updated_at: now })
            .eq("id", resolvedIdentityId);
        if (error) return { ok: false, reason: `identity_update: ${error.message}` };
    } else {
        const { data, error } = await supabase
            .from("communication_identities")
            .insert(identityRow)
            .select("id")
            .maybeSingle();
        if (error || !data) return { ok: false, reason: `identity_insert: ${error?.message ?? "no row"}` };
        resolvedIdentityId = String((data as { id: string }).id);
    }

    // ---- location binding -------------------------------------------------
    const { data: existingLocationRows } = await supabase
        .from("communication_identity_location_bindings")
        .select("id, location_id")
        .eq("identity_id", resolvedIdentityId);

    const existingLocations = (existingLocationRows ?? []) as Array<{ id: string; location_id: string }>;

    if (plan.locationBinding) {
        const match = existingLocations.find((r) => r.location_id === plan.locationBinding!.location_id);
        if (match) {
            await supabase
                .from("communication_identity_location_bindings")
                .update({ ...plan.locationBinding, updated_at: now })
                .eq("id", match.id);
        } else {
            await supabase
                .from("communication_identity_location_bindings")
                .insert({ ...plan.locationBinding, identity_id: resolvedIdentityId });
        }
        // An identity moved from one location to another must stop being that
        // other location's default, or both locations would resolve to it.
        const stale = existingLocations.filter((r) => r.location_id !== plan.locationBinding!.location_id);
        for (const row of stale) {
            await supabase
                .from("communication_identity_location_bindings")
                .update({ status: "disabled", is_default: false, outbound_sending_enabled: false, updated_at: now })
                .eq("id", row.id);
        }
    } else if (existingLocations.length) {
        // The override was removed — the identity is organization-level again, so
        // no location may keep resolving to it as its own.
        for (const row of existingLocations) {
            await supabase
                .from("communication_identity_location_bindings")
                .update({ status: "disabled", is_default: false, outbound_sending_enabled: false, updated_at: now })
                .eq("id", row.id);
        }
    }

    return { ok: true, identityId: resolvedIdentityId, accountId };
}

/**
 * Re-project every binding in an organization.
 *
 * Not a scheduled reconciliation — it is the repair path for organizations whose
 * bindings predate synchronous projection (anything created before this slice,
 * including everything the one-time backfill missed). Called on read of the
 * configuration surface so an existing tenant converges the first time an
 * administrator looks at it, without anyone running a script.
 */
export async function projectOrganizationBindings(
    supabase: SupabaseClient,
    orgId: string,
): Promise<{ projected: number; failed: number }> {
    const { data } = await supabase
        .from("communication_provider_bindings")
        .select(PROJECTABLE_BINDING_COLUMNS)
        .eq("org_id", orgId);

    let projected = 0;
    let failed = 0;
    for (const row of (data ?? []) as ProjectableBinding[]) {
        const result = await applyBindingIdentityProjection(supabase, row);
        if (result.ok) projected += 1;
        else failed += 1;
    }
    return { projected, failed };
}
