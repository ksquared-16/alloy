/**
 * Maintenance-only legacy status helpers (Phase 4).
 *
 * Import ONLY from scripts, migrations, backfill tools — never from admin/runtime loaders.
 */

import { LEGACY_TEXT_STATUS_COLUMNS } from "@/lib/fields/canonicalLegacyStatusWrite";

function trimStatus(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/**
 * Backfill / migration scripts: resolve status from status_key with legacy text fallback.
 * @deprecated Remove when legacy text status columns are dropped (Phase 5).
 */
export function resolveLegacyStatusKeyWithTextFallback(row: {
    status_key?: unknown;
    status?: unknown;
}): string | null {
    return trimStatus(row.status_key) ?? trimStatus(row.status);
}

/** Paths allowed to import maintenance legacy status helpers (source-contract tested). */
export const LEGACY_STATUS_MAINTENANCE_PATH_PREFIXES = [
    "web/scripts/",
    "supabase/migrations/",
    "supabase/sql/",
] as const;

/** Admin/runtime paths that must NOT read legacy entity text status columns. */
export const LEGACY_ENTITY_STATUS_FORBIDDEN_IN_PREFIXES = [
    "web/lib/admin/",
    "web/lib/adminV2/",
    "web/lib/communications/",
    "web/lib/agent/",
    "web/lib/queues/",
    "web/lib/lifecycle/",
    "web/lib/completion/",
    "web/app/api/admin/",
    "web/app/adminV2/",
] as const;

export const LEGACY_ENTITY_STATUS_TABLES = LEGACY_TEXT_STATUS_COLUMNS;

/** Detect legacy entity status column in a SELECT string (opportunities.status, not workflow status). */
export function selectStringReferencesLegacyEntityStatus(selectClause: string): boolean {
    const clause = selectClause.trim();
    if (!clause) return false;
    // Explicit legacy CRM columns in comma-separated select lists.
    if (/\bstatus,\s*status_key\b/.test(clause)) return true;
    if (/\bname,\s*status,\s*status_key\b/.test(clause)) return true;
    if (/\bopportunities"\)\.select\("[^"]*\bstatus,/.test(clause)) return true;
    if (/\bcustomers"\)\.select\("[^"]*\bstatus,/.test(clause)) return true;
    if (/\bpersons"\)\.select\("[^"]*\bstatus,/.test(clause)) return true;
    // select("*") on opportunities/persons/customers returns legacy status column.
    if (/from\("opportunities"\)[\s\S]*select\("\*"\)/i.test(clause)) return true;
    if (/from\("customers"\)[\s\S]*select\("\*"\)/i.test(clause)) return true;
    if (/from\("persons"\)[\s\S]*select\("\*"\)/i.test(clause)) return true;
    return false;
}
