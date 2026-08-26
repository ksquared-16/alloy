/**
 * §1 — PROVE WHAT ACTUALLY LANDED.
 *
 * The Director's condition after the governed apply was not "it returned success" but a list of
 * facts to demonstrate: the entity exists, the grain correction matches the reviewed contract, both
 * permission keys exist, admin holds them, ops does not, and nothing unrelated was applied.
 *
 * Everything here is READ-ONLY. It exists so a 403 can be told apart from an unapplied migration —
 * two very different states that look identical from the outside, and only one of which is a
 * problem.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type HealthFoundationVerification = {
    /** H1 — does the entity exist and is it readable? */
    personHealthFacts: { exists: boolean; rowCount: number | null; error: string | null };
    /** M1 — the registry contract, read from the shipped code rather than assumed. */
    grain: {
        allergyNotesEntityType: string | null;
        allergyNotesMapping: string | null;
        medicationFlagEntityType: string | null;
        medicationFlagDeprecated: boolean;
        definitionsStillAtEnrollmentGrain: number;
    };
    /** D-H6 — the keys, and who actually holds them. */
    permissions: {
        /** 57 before D-H6, 59 after. The width IS the evidence of what landed. */
        catalogueWidth: number;
        healthKeysSeen: string[];
        healthViewDefined: boolean;
        healthManageDefined: boolean;
        grantsByRole: Record<string, string[]>;
        adminHoldsBoth: boolean;
        opsHoldsAny: boolean;
    };
    /** The caller, so a 403 can be explained rather than guessed at. */
    caller: { roleKeys: string[]; holdsHealthView: boolean; holdsHealthManage: boolean };
};

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export async function verifyHealthFoundation(
    supabase: SupabaseClient,
    orgId: string,
    caller: { roleKeys: readonly string[]; permissionKeys: readonly string[] | null },
): Promise<HealthFoundationVerification> {
    // ── H1 ──────────────────────────────────────────────────────────────────────────────────────
    const factsProbe = await supabase
        .from("person_health_facts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId);
    const personHealthFacts = {
        exists: !factsProbe.error,
        rowCount: factsProbe.error ? null : factsProbe.count ?? 0,
        error: factsProbe.error?.message ?? null,
    };

    // ── M1 ──────────────────────────────────────────────────────────────────────────────────────
    const { SYSTEM_FIELD_BY_ID } = await import("@/lib/forms/systemFieldRegistry");
    const allergy = SYSTEM_FIELD_BY_ID.get("allergy_notes") ?? null;
    const medication = SYSTEM_FIELD_BY_ID.get("medication_flag") ?? null;
    const { data: strayDefs } = await supabase
        .from("field_definitions")
        .select("id")
        .eq("org_id", orgId)
        .in("field_key", ["allergy_notes", "medication_flag"])
        .eq("entity_type", "enrollment");

    // ── D-H6 ────────────────────────────────────────────────────────────────────────────────────
    // Read the WHOLE catalogue, not just the two keys: "the key is absent" and "my filter missed it"
    // look identical otherwise, and the catalogue width is itself the evidence of what landed.
    const { data: defs, error: defsError } = await supabase
        .from("permission_definitions")
        .select("key, is_active");
    if (defsError) throw new Error(`permission catalogue unreadable: ${defsError.message}`);
    const definedKeys = new Set(
        ((defs ?? []) as unknown as Array<Record<string, unknown>>)
            .filter((d) => d.is_active !== false)
            .map((d) => t(d.key)),
    );

    const { data: grants } = await supabase
        .from("role_permission_grants")
        .select("role_key, permission_key, allowed")
        .eq("org_id", orgId)
        .in("permission_key", ["health.view", "health.manage"]);
    const grantsByRole: Record<string, string[]> = {};
    for (const raw of (grants ?? []) as unknown as Array<Record<string, unknown>>) {
        if (raw.allowed === false) continue;
        const role = t(raw.role_key);
        grantsByRole[role] = [...(grantsByRole[role] ?? []), t(raw.permission_key)].sort();
    }

    const callerKeys = Array.isArray(caller.permissionKeys) ? caller.permissionKeys : [];
    return {
        personHealthFacts,
        grain: {
            allergyNotesEntityType: allergy?.entity_type ?? null,
            allergyNotesMapping: allergy?.crm_mapping_key ?? null,
            medicationFlagEntityType: medication?.entity_type ?? null,
            medicationFlagDeprecated: Boolean(medication?.deprecated_reason),
            definitionsStillAtEnrollmentGrain: (strayDefs ?? []).length,
        },
        permissions: {
            catalogueWidth: definedKeys.size,
            healthKeysSeen: [...definedKeys].filter((k) => k.startsWith("health.")),
            healthViewDefined: definedKeys.has("health.view"),
            healthManageDefined: definedKeys.has("health.manage"),
            grantsByRole,
            adminHoldsBoth:
                (grantsByRole.admin ?? []).includes("health.view")
                && (grantsByRole.admin ?? []).includes("health.manage"),
            // The D-H6 decision, checked as a fact rather than trusted from the migration text.
            opsHoldsAny: (grantsByRole.ops ?? []).length > 0,
        },
        caller: {
            roleKeys: [...caller.roleKeys],
            holdsHealthView: callerKeys.includes("health.view"),
            holdsHealthManage: callerKeys.includes("health.manage"),
        },
    };
}
