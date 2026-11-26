import { NextRequest } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { FORMS_AUTHOR, requireFormsCapability } from "@/lib/access/formsAuthority";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { parseProcessingFolderList, PROCESSING_FOLDERS_SETTINGS_KEY } from "@/lib/pos/processingFolderPersistence";

/**
 * THE ORGANISATION'S FORMS FOLDERS.
 *
 * The folder model always named this route as its persistence seam (`processingFolderModel.ts`): folder
 * definitions are tenant configuration, and the V1 store kept them in one browser's localStorage under a
 * global key — so a folder an operator created existed for nobody else, on no other device. The store
 * adapter now reads and writes here; the model and its UI are unchanged.
 *
 * Stored on the organisation's own settings row (`org_settings.metadata.processing_folders`), merged so no
 * other setting is touched. A form's folder remains `form_definitions.metadata.admin_category`.
 *
 * GET  — any admin-context user: Work queues and the Forms library both show folder labels.
 * PATCH — Forms authors only: creating, renaming or reordering a folder is form configuration.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", ctx.orgId).maybeSingle();
    if (error) return jsonError(error.message, 500);
    const stored = ((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {})[PROCESSING_FOLDERS_SETTINGS_KEY];
    const parsed = stored === undefined ? null : parseProcessingFolderList((stored as { folders?: unknown })?.folders);
    return jsonData({ folders: parsed && parsed.ok ? parsed.folders : null });
}

export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireFormsCapability(ctx, FORMS_AUTHOR);
    if (denied) return denied;

    let body: { folders?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return jsonError("Invalid JSON", 400);
    }
    const parsed = parseProcessingFolderList(body.folders);
    if (!parsed.ok) return jsonError(parsed.error, 400);

    const supabase = createAdminClient();
    const { data: existing, error: readErr } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (readErr) return jsonError(readErr.message, 500);
    const currentMeta = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const metadata = { ...currentMeta, [PROCESSING_FOLDERS_SETTINGS_KEY]: { version: 1, folders: parsed.folders } };
    const { error: upsertErr } = await supabase
        .from("org_settings")
        .upsert({ org_id: ctx.orgId, metadata }, { onConflict: "org_id" });
    if (upsertErr) return jsonError(upsertErr.message, 500);
    return jsonData({ folders: parsed.folders });
}
