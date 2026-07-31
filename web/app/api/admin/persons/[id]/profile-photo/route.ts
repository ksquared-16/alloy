import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";
import { resolveLatestProfilePhotoDocumentForPerson } from "@/lib/admin/person/resolvePersonProfilePhotoDocument";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    assertDocumentAccess,
    documentAccessHttp,
    signedUrlExpirySeconds,
} from "@/lib/documents/assertDocumentAccess";

/**
 * Phase 0 commit 6A.
 *
 * This was 60*60*24*7 — a SEVEN-DAY signed URL on a child's photograph. A
 * signed URL is a bearer credential; a week-long one outlives every revocation
 * this platform can perform. Expiry is now owned by the canonical helper and
 * capped at 15 minutes.
 *
 * KNOWN CONSEQUENCE (raised, not hidden): `persons.metadata.photo_url` caches
 * this URL, and 14 modules read that cache for avatars (drawers, focus panel,
 * household cards). With a short expiry those cached URLs go stale quickly.
 * Caching a signed URL across actors is itself disallowed, so the cache must be
 * replaced by on-render resolution — that is UI work beyond this commit and is
 * recorded in the closeout debt list.
 */
const SIGNED_URL_EXPIRES_IN_SECONDS = signedUrlExpirySeconds("preview");

/**
 * Canonical child/person profile photo — persistence + resolution WITHOUT a schema
 * migration. The canonical reference is `persons.metadata.profile_photo_document_id`
 * (existing `metadata` jsonb column); `metadata.photo_url` caches a signed URL so the
 * existing synchronous evidence resolvers (`resolveIdentityPhotoUrlFromRaw` /
 * `resolveChildPhotoUrlFromRaw`) keep working with no further plumbing.
 *
 * GET  → resolve the freshest URL for the person's canonical (or latest) profile_photo
 *        document — used for an authoritative refresh after upload.
 * POST → { document_id } — mark a just-uploaded document as the person's canonical
 *        profile photo; persists the pointer + a freshly-signed URL onto `persons.metadata`.
 */

async function loadPerson(supabase: ReturnType<typeof createAdminClient>, orgId: string, id: string) {
    const { data } = await supabase
        .from("persons")
        .select("id, metadata")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    return (data as { id: string; metadata?: Record<string, unknown> | null } | null) ?? null;
}

function metadataOf(person: { metadata?: unknown } | null): Record<string, unknown> {
    return person?.metadata && typeof person.metadata === "object" && !Array.isArray(person.metadata)
        ? (person.metadata as Record<string, unknown>)
        : {};
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const person = await loadPerson(supabase, ctx.orgId, id);
    if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 });

    const resolved = await resolveLatestProfilePhotoDocumentForPerson(supabase, ctx.orgId, id);
    if (resolved) {
        // Authorization BEFORE the document or its URL is disclosed. Previously
        // any org member reaching this route received the photo.
        const access = await getAdminAccessContextCached();
        const decision = await assertDocumentAccess({
            supabase,
            actor: {
                ok: ctx.ok,
                failureStatus: undefined,
                userId: ctx.userId,
                orgId: ctx.orgId,
                role: ctx.role,
                roleKeys: access.ok ? access.roleKeys : [],
                permissionKeys: access.ok ? access.permissionKeys : [],
            },
            documentId: resolved.documentId,
            operation: "preview",
        });
        if (decision.outcome !== "allowed") {
            const http = documentAccessHttp(decision);
            return NextResponse.json(http.body, { status: http.status });
        }
        return NextResponse.json({ photoUrl: resolved.photoUrl, documentId: resolved.documentId });
    }

    // No documents-backed photo — fall back to whatever URL (if any) metadata already carries.
    const meta = metadataOf(person);
    const cachedUrl = typeof meta.photo_url === "string" ? meta.photo_url.trim() || null : null;
    return NextResponse.json({
        photoUrl: cachedUrl,
        documentId: typeof meta.profile_photo_document_id === "string" ? meta.profile_photo_document_id : null,
    });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const documentId = typeof body.document_id === "string" ? body.document_id.trim() : "";
    if (!documentId) return NextResponse.json({ error: "document_id is required" }, { status: 400 });

    const supabase = createAdminClient();
    const person = await loadPerson(supabase, ctx.orgId, id);
    if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 });

    const { data: doc, error: docErr } = await supabase
        .from("documents")
        .select("id, org_id, entity_type, entity_id, doc_type, bucket, storage_path")
        .eq("id", documentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (docErr || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const row = doc as { entity_type: string | null; entity_id: string | null; bucket: string | null; storage_path: string | null };
    if (row.entity_type !== "person" || row.entity_id !== id) {
        return NextResponse.json({ error: "Document is not linked to this person" }, { status: 400 });
    }
    if (!row.bucket || !row.storage_path) {
        return NextResponse.json({ error: "Document has no stored file" }, { status: 400 });
    }

    const { data: signed, error: signErr } = await supabase.storage
        .from(row.bucket)
        .createSignedUrl(row.storage_path, SIGNED_URL_EXPIRES_IN_SECONDS);
    if (signErr || !signed?.signedUrl) {
        const classified = classifySupabaseStorageError(signErr);
        return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.httpStatus });
    }

    const nextMetadata = {
        ...metadataOf(person),
        profile_photo_document_id: documentId,
        photo_url: signed.signedUrl,
    };
    const { error: updateErr } = await supabase
        .from("persons")
        .update({ metadata: nextMetadata })
        .eq("id", id)
        .eq("org_id", ctx.orgId);
    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ photoUrl: signed.signedUrl, documentId });
}

/** Clear the canonical profile photo pointer (initials fallback). */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const person = await loadPerson(supabase, ctx.orgId, id);
    if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 });

    const meta = metadataOf(person);
    const nextMetadata = { ...meta };
    delete nextMetadata.profile_photo_document_id;
    delete nextMetadata.photo_url;

    const { error: updateErr } = await supabase
        .from("persons")
        .update({ metadata: nextMetadata })
        .eq("id", id)
        .eq("org_id", ctx.orgId);
    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ photoUrl: null, documentId: null });
}
