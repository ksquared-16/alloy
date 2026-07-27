import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import { apiOk, apiError } from "@/lib/api/apiResponse";
import { mergeRelationshipPresentationMetadata } from "@/lib/dataModel/relationshipVocabularyPresentation";

const ALLOWED_PATCH_KEYS = ["label", "description", "sort_order", "is_active"] as const;

/**
 * Update / delete a single person relationship type setting.
 *
 * Phase 2F contract (migrated): every response uses the standard envelope
 * (`apiOk` / `apiError`); PATCH success is `{ ok, data: { item } }`. HTTP status
 * codes are preserved (DELETE remains 405). @see docs/api/api-response-contract.md
 */

/** PATCH: update person_relationship_type_setting. Admin only. System types: key not editable. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return apiError(
            ctx.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            ctx.status === 401 ? "Unauthorized" : "Forbidden",
            ctx.status,
            undefined,
            { request }
        );
    }
    if (ctx.role !== "admin") {
        return apiError("FORBIDDEN", "Forbidden", 403, undefined, { request });
    }

    const { id } = await context.params;
    if (!id) return apiError("BAD_REQUEST", "Missing id", 400, undefined, { request });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return apiError("BAD_REQUEST", "Invalid JSON", 400, undefined, { request });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("person_relationship_type_settings")
        .select("id, org_id, is_system, key, label, description, metadata")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return apiError("NOT_FOUND", "Relationship type not found", 404, undefined, { request });
    }

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_PATCH_KEYS) {
        if (body[key] === undefined) continue;
        if (key === "label") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() || null : null;
            continue;
        }
        if (key === "description") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() || null : null;
            continue;
        }
        if (key === "sort_order") {
            const v = body[key];
            updates[key] = typeof v === "number" && !Number.isNaN(v) ? v : Number(v);
            continue;
        }
        if (key === "is_active") {
            updates[key] = !!body[key];
            continue;
        }
    }

    const wantsPresentation =
        body.label !== undefined ||
        body.plural_label !== undefined ||
        body.description !== undefined ||
        body.reset_to_default === true;
    if (wantsPresentation) {
        const merged = mergeRelationshipPresentationMetadata({
            existingMetadata: (existing as { metadata?: unknown }).metadata,
            existingLabel: String((existing as { label?: string }).label ?? ""),
            existingDescription: ((existing as { description?: string | null }).description ?? null) as string | null,
            nextLabel: typeof body.label === "string" ? body.label : undefined,
            nextPluralLabel:
                body.plural_label === undefined
                    ? undefined
                    : body.plural_label === null
                      ? null
                      : String(body.plural_label),
            nextDescription:
                body.description === undefined
                    ? undefined
                    : body.description === null
                      ? null
                      : String(body.description),
            resetToDefault: body.reset_to_default === true,
        });
        if (merged.error) {
            return apiError("BAD_REQUEST", merged.error, 400, undefined, { request });
        }
        updates.label = merged.label;
        updates.description = merged.description;
        updates.metadata = merged.metadata;
    }

    if (Object.keys(updates).length === 0) {
        return apiError("BAD_REQUEST", "No allowed fields to update", 400, undefined, { request });
    }

    const { data: updated, error: updateErr } = await supabase
        .from("person_relationship_type_settings")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();

    if (updateErr) {
        return apiError("BAD_REQUEST", updateErr.message, 400, undefined, { request });
    }
    if (!updated) {
        return apiError("NOT_FOUND", "Not found", 404, undefined, { request });
    }

    logAdminAudit({
        entity: "person_relationship_type_settings",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return apiOk({ item: updated }, { request });
}

/** DELETE: not implemented. Use is_active=false to deactivate. Records may reference key in person_relationships.relationship_type. */
export async function DELETE() {
    return apiError(
        "NOT_IMPLEMENTED",
        "Delete not supported. Set is_active to false to deactivate.",
        405
    );
}
