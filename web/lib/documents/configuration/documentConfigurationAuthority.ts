/**
 * D3 — who may read and who may change the Document Studio configuration.
 *
 * WRITE: `processing.documents.manage`. Document types carry policy that consumers act on — the default sensitivity
 * the database applies to new documents, and the review, replacement and validity policy D5–D7 will enforce — so the
 * authority is the Processing documents authority (admin-only by default), never `documents.write`, which `ops` holds
 * in every organization. No domain-specific configure key is minted: the platform's precedents refuse them.
 *
 * READ: `documents.read` (anyone who works with documents needs the vocabulary) or `processing.documents.manage`.
 *
 * Hiding Studio controls is presentation; these checks, server-side on every route, are the boundary.
 */
import { NextResponse } from "next/server";

import { PROCESSING_DOCUMENTS_MANAGE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { actorMayReadDocuments } from "@/lib/documents/assertDocumentAccess";

export const DOCUMENT_CONFIGURATION_READ = "documents.read" as const;
export const DOCUMENT_CONFIGURATION_WRITE = "processing.documents.manage" as const;

/** The write gate. Returns the refusal, or null when the caller may change configuration. */
export function requireDocumentConfigurationWrite(ctx: { permissionKeys?: readonly string[] | null }): NextResponse | null {
    return requireProcessingCapability(ctx, PROCESSING_DOCUMENTS_MANAGE);
}

/** The read gate. Returns the refusal, or null when the caller may read configuration. */
export function requireDocumentConfigurationRead(actor: { roleKeys?: readonly string[] | null; permissionKeys?: readonly string[] | null }): NextResponse | null {
    const keys = actor.permissionKeys ?? [];
    if (keys.includes(DOCUMENT_CONFIGURATION_WRITE) || keys.includes(DOCUMENT_CONFIGURATION_READ) || actorMayReadDocuments(actor)) return null;
    return NextResponse.json({ error: "Forbidden", required_permission: DOCUMENT_CONFIGURATION_READ }, { status: 403 });
}
