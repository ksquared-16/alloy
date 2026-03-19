/**
 * Admin multipart upload for `public.documents` + Supabase Storage.
 *
 * Supabase assumptions (validate in each environment):
 * - **Bucket**: exists and is writable by the **service role** used by `createAdminClient()`.
 *   Default bucket name: `org_documents`. Override with env **`ADMIN_DOCUMENTS_BUCKET`** if you use another name.
 * - **Path layout**: `{org_id}/{canonical_entity_type}/{entity_id}/{uuid}-{safe_filename}` — keeps objects org-scoped and easy to audit.
 * - **RLS**: service role bypasses RLS; row insert still sets **`org_id`** from admin context.
 * - **Signed URLs**: `GET /api/admin/documents/[id]/signed-url` uses the same bucket + `storage_path` on the row; bucket must allow **read** for the service role when creating signed URLs.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { normalizeDocumentRow } from "@/lib/admin/normalizeDocumentRow";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";

export const DEFAULT_ORG_DOCUMENTS_BUCKET = "org_documents";

/** Map UI / drawer entity types to canonical documents.entity_type values. */
const CANONICAL_ENTITY_TYPE: Record<string, string> = {
    customers: "customer",
    customer: "customer",
    contacts: "contact",
    contact: "contact",
    opportunities: "opportunity",
    opportunity: "opportunity",
    jobs: "job",
    job: "job",
    locations: "location",
    location: "location",
    customer_members: "customer_member",
    customer_member: "customer_member",
    vendors: "vendor",
    vendor: "vendor",
    persons: "person",
    person: "person",
};

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

async function assertEntityInOrg(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    canonicalType: string,
    entityId: string
): Promise<boolean> {
    switch (canonicalType) {
        case "customer": {
            const { data } = await supabase.from("customers").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "contact": {
            const { data } = await supabase.from("contacts").select("id, customer_id").eq("id", entityId).maybeSingle();
            if (!data) return false;
            const cid = (data as { customer_id?: string | null }).customer_id;
            if (!cid) return false;
            const { data: cust } = await supabase.from("customers").select("id").eq("id", cid).eq("org_id", orgId).maybeSingle();
            return !!cust;
        }
        case "opportunity": {
            const { data } = await supabase.from("opportunities").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "job": {
            const { data } = await supabase.from("jobs").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "location": {
            const { data } = await supabase.from("locations").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "customer_member": {
            const { data } = await supabase.from("customer_members").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "vendor": {
            const { data } = await supabase.from("vendors").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        case "person": {
            const { data } = await supabase.from("persons").select("id").eq("id", entityId).eq("org_id", orgId).maybeSingle();
            return !!data;
        }
        default:
            return false;
    }
}

/** POST multipart: file + entity_type + entity_id; optional doc_type, title. Admin only (matches canMutate). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden", code: "AUTH" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json({ error: "Expected multipart form data", code: "BAD_REQUEST" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
        return NextResponse.json({ error: "file is required", code: "MISSING_FILE" }, { status: 400 });
    }

    const entityTypeRaw = typeof formData.get("entity_type") === "string" ? (formData.get("entity_type") as string).trim() : "";
    const entityId = typeof formData.get("entity_id") === "string" ? (formData.get("entity_id") as string).trim() : "";
    const docType = typeof formData.get("doc_type") === "string" ? (formData.get("doc_type") as string).trim() || null : null;
    const titleRaw = typeof formData.get("title") === "string" ? (formData.get("title") as string).trim() || null : null;

    if (!entityTypeRaw || !entityId) {
        return NextResponse.json({ error: "entity_type and entity_id are required", code: "MISSING_ENTITY" }, { status: 400 });
    }

    const canonicalType = CANONICAL_ENTITY_TYPE[entityTypeRaw] ?? entityTypeRaw;
    if (!CANONICAL_ENTITY_TYPE[entityTypeRaw] && !Object.values(CANONICAL_ENTITY_TYPE).includes(canonicalType)) {
        return NextResponse.json({ error: "Unsupported entity_type", code: "UNSUPPORTED_ENTITY" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const okEntity = await assertEntityInOrg(supabase, ctx.orgId, canonicalType, entityId);
    if (!okEntity) {
        return NextResponse.json({ error: "Entity not found for this organization", code: "ENTITY_NOT_FOUND" }, { status: 404 });
    }

    const bucket = process.env.ADMIN_DOCUMENTS_BUCKET?.trim() || DEFAULT_ORG_DOCUMENTS_BUCKET;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const origName = file instanceof File && file.name ? file.name : "upload";
    const safeName = sanitizeFilename(origName);
    const objectId = randomUUID();
    const storagePath = `${ctx.orgId}/${canonicalType}/${entityId}/${objectId}-${safeName}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
    });

    if (upErr) {
        console.error("[DOCUMENTS_UPLOAD_STORAGE]", bucket, storagePath, upErr);
        const classified = classifySupabaseStorageError(upErr);
        return NextResponse.json(
            { error: classified.message, code: classified.code },
            { status: classified.httpStatus }
        );
    }

    const title = titleRaw ?? (origName !== "upload" ? origName : null);

    const { data: row, error: insErr } = await supabase
        .from("documents")
        .insert({
            org_id: ctx.orgId,
            entity_type: canonicalType,
            entity_id: entityId,
            doc_type: docType,
            title,
            original_filename: origName !== "upload" ? origName : null,
            mime_type: file.type || null,
            byte_size: buffer.length,
            bucket,
            storage_path: storagePath,
            status: "uploaded",
        })
        .select("*")
        .single();

    if (insErr) {
        console.error("[DOCUMENTS_UPLOAD_DB]", insErr);
        await supabase.storage.from(bucket).remove([storagePath]).catch((e) => console.error("[DOCUMENTS_UPLOAD_ROLLBACK]", e));
        const pgCode = insErr.code === "23505" ? "DOCUMENT_DUPLICATE" : "DOCUMENT_INSERT_FAILED";
        return NextResponse.json(
            {
                error: insErr.message || "Failed to save document record after upload.",
                code: pgCode,
            },
            { status: 500 }
        );
    }

    const document = normalizeDocumentRow(row as Record<string, unknown>);
    return NextResponse.json({ document, raw: row });
}
