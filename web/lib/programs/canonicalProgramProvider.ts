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
    const { data: publicationRows, error: publicationError } = await supabase
        .from("configuration_publications")
        .select("subject_id, revision_id, revision_number")
        .eq("org_id", orgId)
        .eq("domain_key", "programs")
        .order("revision_number", { ascending: false });
    const publicationUnavailable =
        publicationError?.code === "42P01"
        || publicationError?.code === "PGRST205";
    if (publicationError && !publicationUnavailable) throw new Error(publicationError.message);

    const latestByProgram = new Map<string, Record<string, unknown>>();
    for (const row of (publicationRows ?? []) as Array<Record<string, unknown>>) {
        const programId = str(row.subject_id);
        if (programId && !latestByProgram.has(programId)) latestByProgram.set(programId, row);
    }
    const revisionIds = [...latestByProgram.values()]
        .map((row) => str(row.revision_id))
        .filter((id): id is string => id != null);
    if (revisionIds.length > 0) {
        const { data: revisionRows, error: revisionError } = await supabase
            .from("program_revisions")
            .select("id, program_id, revision_number, program_key, label, description")
            .eq("org_id", orgId)
            .in("id", revisionIds);
        if (revisionError) throw new Error(revisionError.message);
        return ((revisionRows ?? []) as Array<Record<string, unknown>>)
            .map((row): CanonicalProgram | null => {
                const key = str(row.program_key);
                const label = str(row.label);
                const id = str(row.id);
                if (!key || !label || !id) return null;
                return {
                    key,
                    label,
                    description: str(row.description),
                    status: "active",
                    source: "published_revision",
                    revisionId: id,
                    revisionNumber: intOr(row.revision_number, 1),
                };
            })
            .filter((program): program is CanonicalProgram => program != null)
            .sort((a, b) => a.label.localeCompare(b.label));
    }

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
        .select("id, org_id, location_id, key, label, sort_order, is_active, program_revision_id")
        .eq("org_id", orgId)
        .eq("location_id", locationId);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const revisionIds = [...new Set(
        rows.map((row) => str(row.program_revision_id)).filter((id): id is string => id != null),
    )];
    const revisionsById = new Map<string, Record<string, unknown>>();
    if (revisionIds.length > 0) {
        const { data: revisionRows, error: revisionError } = await supabase
            .from("program_revisions")
            .select("id, revision_number, program_key, label, description")
            .eq("org_id", orgId)
            .in("id", revisionIds);
        if (revisionError) throw new Error(revisionError.message);
        for (const row of (revisionRows ?? []) as Array<Record<string, unknown>>) {
            const id = str(row.id);
            if (id) revisionsById.set(id, row);
        }
    }

    return rows
        .map((row, index): CanonicalProgramAvailability | null => {
            const availabilityId = str(row.id);
            const revisionId = str(row.program_revision_id);
            const revision = revisionId ? revisionsById.get(revisionId) : undefined;
            const key = str(revision?.program_key) ?? str(row.key);
            const label = str(revision?.label) ?? str(row.label);
            const rowLocationId = str(row.location_id);
            // Defensive: a category row must belong to the requested location.
            if (!availabilityId || !key || !label || rowLocationId !== locationId) return null;
            const isActive = row.is_active !== false;
            if (!options.includeInactive && !isActive) return null;
            return {
                key,
                label,
                description: str(revision?.description),
                status: isActive ? "active" : "inactive",
                source: revision ? "published_revision" : "location_availability",
                revisionId: revisionId ?? undefined,
                revisionNumber: revision ? intOr(revision.revision_number, 1) : undefined,
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
