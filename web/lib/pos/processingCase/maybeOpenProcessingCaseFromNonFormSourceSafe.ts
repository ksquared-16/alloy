/**
 * POS-FP1c — generic on-ramp from a NON-FORM source (document / upload /
 * email_attachment / import / recreated_document).
 *
 * Proves the doctrine "POS is a processing engine, not a forms product": a
 * document/upload/import enters the SAME Processing Case spine as forms and
 * packets. No new engine, no new table, no new proposal model — this only adds a
 * caller for source kinds that the schema (`chk_pcs_source_kind`) and types
 * (`ProcessingCaseSourceKind`) already allow but that nothing wired yet.
 *
 * Reuses the FP1 service (`openProcessingCaseFromSource`): idempotent on the
 * primary source and one-primary-per-case, enforced at the DB by the unique index
 * `uq_pcs_primary_source_once (org_id, source_kind, source_id) WHERE role='primary'`.
 *
 * Best-effort wrapper: NEVER throws and must NEVER break the caller's flow
 * (mirrors `maybeOpenProcessingCaseFromFormSubmissionSafe`). Any failure is
 * logged and swallowed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessingCaseDeps, ProcessingCaseSourceKind } from "./types";
import { makeProcessingCaseDbDeps } from "./processingCaseDb";
import { openProcessingCaseFromSource, type OpenProcessingCaseResult } from "./openProcessingCaseFromSource";

/**
 * The non-form source kinds this on-ramp is responsible for. Form-backed kinds
 * (`form_submission`, `form_packet_session`) keep their own marker-gated on-ramps
 * and are intentionally excluded here so the two paths never compete.
 */
export const NON_FORM_PROCESSING_SOURCE_KINDS = [
    "document",
    "upload",
    "email_attachment",
    "import",
    "recreated_document",
] as const satisfies readonly ProcessingCaseSourceKind[];

export type NonFormProcessingSourceKind = (typeof NON_FORM_PROCESSING_SOURCE_KINDS)[number];

/** Pure guard: is this a non-form source kind handled by this on-ramp? Unit-testable without a DB. */
export function isNonFormProcessingSourceKind(kind: string): kind is NonFormProcessingSourceKind {
    return (NON_FORM_PROCESSING_SOURCE_KINDS as readonly string[]).includes(kind);
}

export interface OpenNonFormProcessingCaseArgs {
    orgId: string;
    sourceKind: ProcessingCaseSourceKind;
    sourceId: string;
    /** Optional classification hint persisted on the case (nullable; no inference here). */
    caseType?: string | null;
}

/**
 * Injectable core (DI over storage deps, like `openProcessingCaseFromSource`).
 * Validates that the kind is a NON-FORM kind so a form/packet source can't be
 * silently opened down the wrong path, then delegates to the shared FP1 opener.
 *
 * Throws on an invalid (form) kind or missing identifiers so the contract is
 * explicit; the `*Safe` wrapper catches and swallows for best-effort callers.
 */
export async function openNonFormProcessingCaseFromSource(
    deps: ProcessingCaseDeps,
    args: OpenNonFormProcessingCaseArgs
): Promise<OpenProcessingCaseResult> {
    if (!args.orgId) throw new Error("orgId is required");
    if (!args.sourceId) throw new Error("sourceId is required");
    if (!isNonFormProcessingSourceKind(args.sourceKind)) {
        throw new Error(
            `openNonFormProcessingCaseFromSource: "${args.sourceKind}" is not a non-form source kind. ` +
                `Use the form/packet on-ramp for form-backed sources.`
        );
    }
    return openProcessingCaseFromSource(deps, {
        orgId: args.orgId,
        sourceKind: args.sourceKind,
        sourceId: args.sourceId,
        caseType: args.caseType ?? null,
    });
}

/**
 * Best-effort, never-throws wrapper for server callers (e.g. the document upload
 * route). Returns the open result on success, or `null` when skipped/failed —
 * the caller's primary flow is never affected.
 */
export async function maybeOpenProcessingCaseFromNonFormSourceSafe(
    supabase: SupabaseClient,
    args: OpenNonFormProcessingCaseArgs
): Promise<OpenProcessingCaseResult | null> {
    try {
        if (!args.orgId || !args.sourceId) return null;
        if (!isNonFormProcessingSourceKind(args.sourceKind)) {
            console.warn(
                "[maybeOpenProcessingCaseFromNonFormSourceSafe] ignored non-handled source kind:",
                args.sourceKind
            );
            return null;
        }
        const deps = makeProcessingCaseDbDeps(supabase);
        return await openNonFormProcessingCaseFromSource(deps, args);
    } catch (e) {
        console.warn(
            "[maybeOpenProcessingCaseFromNonFormSourceSafe]",
            e instanceof Error ? e.message : e
        );
        return null;
    }
}
