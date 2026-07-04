/**
 * Commercial Execution — Export reader shared types.
 *
 * The Export layer PROJECTS frozen Commercial V1 into the canonical CommercialExport
 * contract. It reads; it never writes, evaluates, prices, or persists. Readers are
 * async pure functions of `(supabase, orgId)` — deterministic given the data, with
 * no caching and no side effects beyond the read.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §2, §4.
 * Phase 3 (Export readers) — no evaluation, no Billing concepts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Org-scoped read handle passed to every reader. */
export type ExportReadContext = {
    supabase: SupabaseClient;
    orgId: string;
    /** Resolution date used to stamp the config version (YYYY-MM-DD). */
    asOf: string;
};

/** Severity of an export validation finding. */
export type ExportIssueSeverity = "error" | "warning";

/**
 * A structured validation finding. `error` = a dangling reference or broken graph
 * edge that would make evaluation incorrect; `warning` = incomplete-but-expected
 * config (e.g. an unmapped revenue category). Never silently ignored.
 */
export type ExportValidationIssue = {
    code: string;
    severity: ExportIssueSeverity;
    message: string;
    /** The export entity kind the issue is about (e.g. "offering", "tuitionRate"). */
    entity: string;
    /** The offending row id. */
    id: string;
    /** The unresolved reference, when the issue is a dangling edge. */
    ref?: { entity: string; id: string };
};

/** The outcome of validating a composed export. `ok` is false iff any error exists. */
export type ExportValidation = {
    ok: boolean;
    issues: ExportValidationIssue[];
};

/** Coerce an unknown DB value to a trimmed string (empty when null/undefined). */
export function str(v: unknown): string {
    return v == null ? "" : String(v);
}

/** Coerce an unknown DB value to a nullable string. */
export function nstr(v: unknown): string | null {
    return v == null ? null : String(v);
}

/** Normalize a jsonb column to a plain object (never an array / scalar). */
export function obj(v: unknown): Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
