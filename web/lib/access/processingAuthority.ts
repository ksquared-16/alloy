import { NextResponse } from "next/server";

/**
 * PROCESSING AUTHORITY — what a caller may do, never what they are called.
 *
 * Processing arrived at this cleanup with two different problems, and they pulled in opposite
 * directions.
 *
 * Twelve routes asked `ctx.role !== "admin"`, and one shared helper asked
 * `ctx.role === "admin" || ctx.role === "ops"` on behalf of seven more. That is job-title authority:
 * an organization could not let someone work a Processing queue without also calling them an
 * administrator.
 *
 * The other problem was the opposite shape. Beside those gates sat real Processing mutations —
 * classifying a case, persisting operator decisions, committing a related-record proposal — that
 * asked NOTHING beyond portal admission. Anyone who could reach the shell could commit them.
 *
 * So this module is not a rename. Half of it replaces a job title with a capability, and half of it
 * puts authority where there was none.
 *
 * ── THE FOUR AUTHORITIES, AND WHY EACH IS SEPARATE ──
 *
 * `PROCESSING_OPERATE` is the ordinary work: advancing a case, identity planning and resolution,
 * classification, discovery decisions, committing a proposal. It is what `admin` and `ops` could
 * already do through the operator context, so both keep it.
 *
 * `PROCESSING_ARCHIVE` is taking a case out of the queue. It is admin-only today and stays that way.
 * It is NOT folded into operate, because `ops` receives operate — and folding would hand `ops` an
 * archive it has never had.
 *
 * `PROCESSING_DOCUMENTS_MANAGE` is the destructive half: renaming a source document, and deleting
 * one along with the Processing case it opened and the stored file. The catalog already has
 * `documents.write` and it would have been the obvious reuse — but `ops` holds `documents.write` in
 * every organization, so reusing it would have handed `ops` that deletion. The narrow key exists for
 * exactly that reason: a general documents authority must not silently become a Processing one.
 *
 * `PROCESSING_DEV_CLEANUP` is the test-data reset. It is not ordinary Processing authority and a
 * capability is not sufficient for it — see `processingDevCleanupEnvironment`. Production refuses it
 * whoever asks.
 *
 * Nothing implies anything else. A role that needs all four holds all four.
 */
export const PROCESSING_OPERATE = "processing.operate" as const;
export const PROCESSING_ARCHIVE = "processing.archive" as const;
export const PROCESSING_DOCUMENTS_MANAGE = "processing.documents.manage" as const;
export const PROCESSING_DEV_CLEANUP = "processing.dev_cleanup" as const;

export type ProcessingCapability =
    | typeof PROCESSING_OPERATE
    | typeof PROCESSING_ARCHIVE
    | typeof PROCESSING_DOCUMENTS_MANAGE
    | typeof PROCESSING_DEV_CLEANUP;

/** True when the caller's effective capabilities carry this Processing authority. */
export function hasProcessingCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: ProcessingCapability,
): boolean {
    return (ctx.permissionKeys ?? []).includes(capability);
}

/**
 * The refusal for a Processing operation the caller has no capability for.
 *
 * Returns `null` when the caller is authorized, so a handler reads as
 * `const denied = requireProcessingCapability(ctx, PROCESSING_OPERATE); if (denied) return denied;` —
 * the guard stays in front of the write and the capability is named at the point of use.
 */
export function requireProcessingCapability(
    ctx: { permissionKeys?: readonly string[] | null },
    capability: ProcessingCapability,
): NextResponse | null {
    if (hasProcessingCapability(ctx, capability)) return null;
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
