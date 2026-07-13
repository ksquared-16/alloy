/**
 * Canonical Program provider (Phase A, A2).
 *
 * Exposes Program IDENTITY (the `program_key` vocabulary) and per-Location
 * AVAILABILITY (`location_program_categories`) through one surface so consumers
 * never query the `childcare_program_type` option set or the categories table
 * directly. This decouples identity from storage — a future first-class
 * `programs` entity can replace the option set with no consumer rewrite. No
 * `programs` table is created in Phase A.
 *
 * OFFERING (`program_offerings` / variants) is a DISTINCT concept and is NOT
 * merged into Program identity (RFC §6); this provider only diagnoses orphan
 * `program_key` references without migrating them (Phase C work).
 *
 * Phase A wraps existing reads and migrates no consumers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    type CanonicalProgram,
    type CanonicalProgramAvailability,
    type CanonicalProgramSource,
} from "@/lib/programs/canonicalProgramModel";
import {
    loadProgramVocabulary,
    type ProgramVocabularySource,
} from "@/lib/programs/programLegacyCompatibility";

function vocabularySourceToProgramSource(source: ProgramVocabularySource): CanonicalProgramSource {
    return source === "legacy_classroom_age_group" ? "legacy_classroom_age_group" : "vocabulary";
}

/**
 * Org-level Program identity catalog. Reads the canonical vocabulary (with the
 * `classroom_age_group` legacy fallback). Vocabulary items are always active.
 */
export async function resolveProgramsForOrganization(
    supabase: SupabaseClient,
    orgId: string,
    options: { allowLegacyFallback?: boolean } = {}
): Promise<CanonicalProgram[]> {
    const { items, source } = await loadProgramVocabulary(supabase, orgId, options);
    const programSource = vocabularySourceToProgramSource(source);
    return items.map((item) => ({
        key: item.itemKey,
        label: item.label,
        description: null,
        status: "active",
        source: programSource,
    }));
}

/** Resolve a single Program identity by key, or null when unknown. */
export async function resolveProgramByKey(
    supabase: SupabaseClient,
    orgId: string,
    key: string,
    options: { allowLegacyFallback?: boolean } = {}
): Promise<CanonicalProgram | null> {
    const trimmed = key.trim();
    if (!trimmed) return null;
    const programs = await resolveProgramsForOrganization(supabase, orgId, options);
    return programs.find((p) => p.key === trimmed) ?? null;
}

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

/**
 * Programs available at a specific Location. Never returns a program that is not
 * offered at that location. Active-only by default. Ordered by sort order then key.
 */
export async function resolveProgramsForLocation(
    supabase: SupabaseClient,
    orgId: string,
    locationId: string,
    options: { includeInactive?: boolean } = {}
): Promise<CanonicalProgramAvailability[]> {
    if (!locationId) return [];
    const { data, error } = await supabase
        .from("location_program_categories")
        .select("id, org_id, location_id, key, label, sort_order, is_active")
        .eq("org_id", orgId)
        .eq("location_id", locationId);
    if (error) throw new Error(error.message);

    return ((data ?? []) as Array<Record<string, unknown>>)
        .map((row, index): CanonicalProgramAvailability | null => {
            const availabilityId = str(row.id);
            const key = str(row.key);
            const label = str(row.label);
            const rowLocationId = str(row.location_id);
            // Defensive: a category row must belong to the requested location.
            if (!availabilityId || !key || !label || rowLocationId !== locationId) return null;
            const isActive = row.is_active !== false;
            if (!options.includeInactive && !isActive) return null;
            return {
                key,
                label,
                description: null,
                status: isActive ? "active" : "inactive",
                source: "location_availability",
                locationId,
                availabilityId,
                sortOrder: intOr(row.sort_order, index),
            };
        })
        .filter((v): v is CanonicalProgramAvailability => v != null)
        .sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.key.localeCompare(b.key)));
}

/**
 * Diagnostic (read-only, no migration): `program_offerings.program_key` values
 * that do not resolve to a canonical Program identity. Surfaces the offering→
 * identity drift for Phase C without changing anything.
 */
export async function findOrphanOfferingProgramKeys(
    supabase: SupabaseClient,
    orgId: string
): Promise<string[]> {
    const programs = await resolveProgramsForOrganization(supabase, orgId);
    const known = new Set(programs.map((p) => p.key));

    const { data, error } = await supabase
        .from("program_offerings")
        .select("program_key")
        .eq("org_id", orgId);
    if (error) throw new Error(error.message);

    const orphans = new Set<string>();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const programKey = str(row.program_key);
        if (programKey && !known.has(programKey)) orphans.add(programKey);
    }
    return [...orphans].sort((a, b) => a.localeCompare(b));
}
