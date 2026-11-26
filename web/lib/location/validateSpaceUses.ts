/**
 * Server validation of a space's configured uses — the configuration half of `spaceEligibleForUse`.
 *
 * Judged against the space AS IT WILL STAND (its role after the write, its uses after the write):
 * every use must be one of the org's assignment categories, and the space's structure must be able
 * to carry it (a physical space carries none; a shared space carries child uses only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalUnitRoleFromStorage } from "@/lib/location/canonicalLocationModel";
import { invalidSpaceUsesForRole, readSpaceUsesState, type SpaceUsesMalformedReason } from "@/lib/location/spaceUse";

const MALFORMED_COPY: Record<SpaceUsesMalformedReason, string> = {
    not_a_list: "Uses must be a list of assignment categories.",
    invalid_member: "Every use must be an assignment category; the list contains an empty or non-text entry.",
};

const REASON_COPY = {
    unknown_category: "is not one of this organization's assignment categories",
    physical_space_has_no_uses: "cannot be a use of a physical space — physical spaces hold classrooms and take no uses",
    staff_use_needs_classroom: "is a staff use; staff uses need a classroom (operational group)",
} as const;

export async function validateSpaceUsesConfiguration(
    supabase: SupabaseClient,
    orgId: string,
    space: { locationType: unknown; unitRole: unknown; metadata: Record<string, unknown> | null | undefined },
): Promise<{ ok: true } | { ok: false; message: string; code?: string }> {
    const state = readSpaceUsesState(space.metadata ?? null);
    if (state.kind === "malformed") return { ok: false, message: MALFORMED_COPY[state.reason], code: `space_uses_malformed_${state.reason}` };
    if (state.kind === "unconfigured" || state.uses.length === 0) return { ok: true };
    const uses = state.uses;
    const role = canonicalUnitRoleFromStorage(space.locationType, space.unitRole);
    if (!role) return { ok: false, message: "Only rooms and spaces (units) can declare uses." };
    const { data, error } = await supabase
        .from("operational_assignment_types")
        .select("id, label, subject_types")
        .eq("org_id", orgId)
        .in("id", uses);
    if (error) return { ok: false, message: error.message };
    const rows = (data ?? []) as Array<{ id: string; label: string | null; subject_types: string[] | null }>;
    const categories = rows.map((r) => ({
        id: r.id,
        subjectTypes: (r.subject_types ?? ["child"]).filter((s): s is "child" | "staff" => s === "child" || s === "staff"),
    }));
    const invalid = invalidSpaceUsesForRole(role, uses, categories);
    if (invalid.length === 0) return { ok: true };
    const labelOf = new Map(rows.map((r) => [r.id, r.label?.trim() || r.id]));
    return {
        ok: false,
        message: invalid.map((i) => `"${labelOf.get(i.id) ?? i.id}" ${REASON_COPY[i.reason]}`).join("; "),
    };
}
