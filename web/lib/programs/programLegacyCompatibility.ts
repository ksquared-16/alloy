/**
 * Program vocabulary + legacy-compatibility seam (Phase A, A2).
 *
 * Program IDENTITY is the org-level `program_key` vocabulary, stored today as the
 * `childcare_program_type` option set. This module centralizes the ONE remaining
 * legacy fallback — the deprecated `classroom_age_group` option set (consolidated
 * into `childcare_program_type` by migration 20260430120000, but still present on
 * un-migrated orgs). Consumers never touch option-set internals directly; the
 * Program provider reads through here.
 *
 * Phase A retires nothing: the legacy fallback stays until the `classroom_age_group`
 * reads are removed in Phase E.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The canonical program-identity vocabulary option set. */
export const CANONICAL_PROGRAM_OPTION_SET_KEY = "childcare_program_type";
/** Deprecated predecessor; read-only fallback for un-migrated orgs. */
export const LEGACY_PROGRAM_OPTION_SET_KEY = "classroom_age_group";

export type ProgramVocabularyItem = {
    itemKey: string;
    label: string;
    sortOrder: number;
};

export type ProgramVocabularySource = "vocabulary" | "legacy_classroom_age_group" | "none";

export type ProgramVocabularyResult = {
    items: ProgramVocabularyItem[];
    source: ProgramVocabularySource;
};

function str(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function intOr(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return fallback;
}

async function loadOptionSetItems(
    supabase: SupabaseClient,
    orgId: string,
    setKey: string
): Promise<ProgramVocabularyItem[]> {
    const { data: set, error: setError } = await supabase
        .from("option_sets")
        .select("id, org_id, set_key")
        .eq("org_id", orgId)
        .eq("set_key", setKey)
        .maybeSingle();
    if (setError) throw new Error(setError.message);
    const setId = set ? str((set as Record<string, unknown>).id) : null;
    if (!setId) return [];

    const { data: items, error: itemsError } = await supabase
        .from("option_set_items")
        .select("id, option_set_id, item_key, label, sort_order")
        .eq("option_set_id", setId);
    if (itemsError) throw new Error(itemsError.message);

    return ((items ?? []) as Array<Record<string, unknown>>)
        .map((row, index): ProgramVocabularyItem | null => {
            const itemKey = str(row.item_key);
            const label = str(row.label);
            if (!itemKey || !label) return null;
            return { itemKey, label, sortOrder: intOr(row.sort_order, index) };
        })
        .filter((v): v is ProgramVocabularyItem => v != null)
        .sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.itemKey.localeCompare(b.itemKey)));
}

/**
 * Load the program-identity vocabulary for an org: the canonical option set,
 * falling back to the deprecated `classroom_age_group` set only when the
 * canonical set is empty/absent and `allowLegacyFallback` is true.
 */
export async function loadProgramVocabulary(
    supabase: SupabaseClient,
    orgId: string,
    options: { allowLegacyFallback?: boolean } = {}
): Promise<ProgramVocabularyResult> {
    const allowLegacyFallback = options.allowLegacyFallback !== false;
    const canonical = await loadOptionSetItems(supabase, orgId, CANONICAL_PROGRAM_OPTION_SET_KEY);
    if (canonical.length > 0) return { items: canonical, source: "vocabulary" };

    if (allowLegacyFallback) {
        const legacy = await loadOptionSetItems(supabase, orgId, LEGACY_PROGRAM_OPTION_SET_KEY);
        if (legacy.length > 0) return { items: legacy, source: "legacy_classroom_age_group" };
    }
    return { items: [], source: "none" };
}
