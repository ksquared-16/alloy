import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import type { TemplateChannel } from "@/lib/communications/v2/templateSchema";
import {
    buildTemplateVersionInsertPayload,
    computeTemplateTokenPaths,
    formatTemplateDuplicateNameError,
    isTemplateNameUniqueConstraintError,
    mergeContent,
    nextVersionNumber,
    shouldCreateNewVersion,
    validatePatchTemplateInput,
} from "@/lib/communications/v2/templateService";

/**
 * Communications V2 — template fetch + update (Phase 1 / B2).
 * Pattern: requireAdminOrOps -> getAdminContextCached -> createAdminClient.
 * service_role writes; org_id enforced on every query.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;
const TEMPLATE_COLS =
    "id, org_id, name, description, category, channel, status, current_version_id, system_key, created_by, updated_by, created_at, updated_at";
const VERSION_COLS = "id, template_id, version_number, subject, body, token_paths, created_at";

/** GET /api/admin/communications/templates/[id] — template + current version + all versions. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid template id" }, { status: 400 });

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data: template, error } = await supabase
        .from("communication_templates")
        .select(TEMPLATE_COLS)
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const { data: versions, error: vErr } = await supabase
        .from("communication_template_versions")
        .select(VERSION_COLS)
        .eq("org_id", orgId)
        .eq("template_id", id)
        .order("version_number", { ascending: false });
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    const rows = versions ?? [];
    const currentId = (template as Record<string, unknown>).current_version_id;
    const currentVersion = rows.find((v) => String((v as Record<string, unknown>).id) === String(currentId)) ?? null;

    return NextResponse.json({ template, current_version: currentVersion, versions: rows });
}

/**
 * PATCH /api/admin/communications/templates/[id] — update metadata; if subject/body
 * changes, append a new version and repoint current_version_id (simple, no rollback).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid template id" }, { status: 400 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const orgId = ctx.orgId;
    const userId = ctx.userId;

    // Load the template (org-scoped) + its current version for content diffing.
    const { data: template, error: tErr } = await supabase
        .from("communication_templates")
        .select(TEMPLATE_COLS)
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const currentChannel = String((template as Record<string, unknown>).channel) as TemplateChannel;
    const parsed = validatePatchTemplateInput(body, currentChannel);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { meta, content, hasContentFields } = parsed.value;

    if (meta.name !== undefined) {
        const { data: nameConflict } = await supabase
            .from("communication_templates")
            .select("id")
            .eq("org_id", orgId)
            .eq("name", meta.name)
            .neq("id", id)
            .maybeSingle();
        if (nameConflict) {
            return NextResponse.json({ error: formatTemplateDuplicateNameError(meta.name) }, { status: 409 });
        }
    }

    // Current version content (for diffing + merge).
    let currentContent = { subject: null as string | null, body: "" };
    const currentVersionId = (template as Record<string, unknown>).current_version_id;
    if (typeof currentVersionId === "string" && currentVersionId.length > 0) {
        const { data: cv, error: cvErr } = await supabase
            .from("communication_template_versions")
            .select("subject, body")
            .eq("org_id", orgId)
            .eq("id", currentVersionId)
            .maybeSingle();
        if (cvErr) return NextResponse.json({ error: cvErr.message }, { status: 500 });
        if (cv) {
            const rec = cv as Record<string, unknown>;
            currentContent = {
                subject: rec.subject != null ? String(rec.subject) : null,
                body: rec.body != null ? String(rec.body) : "",
            };
        }
    }

    const makeVersion = shouldCreateNewVersion(currentContent, content, hasContentFields);

    let newVersion: Record<string, unknown> | null = null;
    if (makeVersion) {
        const merged = mergeContent(currentContent, content);
        const systemKey =
            typeof (template as Record<string, unknown>).system_key === "string"
                ? String((template as Record<string, unknown>).system_key)
                : null;
        const { validateTourSystemTemplateRequiredPlaceholders } = await import(
            "@/lib/tours/comms/tourSystemTemplates"
        );
        const requiredCheck = validateTourSystemTemplateRequiredPlaceholders({
            systemKey,
            subject: merged.subject,
            body: merged.body,
        });
        if (!requiredCheck.ok) {
            return NextResponse.json({ error: requiredCheck.error }, { status: 400 });
        }
        // Determine next version number from current max (org + template scoped).
        const { data: maxRow, error: maxErr } = await supabase
            .from("communication_template_versions")
            .select("version_number")
            .eq("org_id", orgId)
            .eq("template_id", id)
            .order("version_number", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (maxErr) return NextResponse.json({ error: maxErr.message }, { status: 500 });
        const nextNum = nextVersionNumber(
            maxRow ? Number((maxRow as Record<string, unknown>).version_number) : 0
        );

        const { data: inserted, error: insErr } = await supabase
            .from("communication_template_versions")
            .insert(
                buildTemplateVersionInsertPayload({
                    org_id: orgId,
                    template_id: id,
                    version_number: nextNum,
                    subject: merged.subject,
                    body: merged.body,
                    token_paths: computeTemplateTokenPaths(merged.subject, merged.body),
                    created_by: userId,
                })
            )
            .select(VERSION_COLS)
            .single();
        if (insErr || !inserted) {
            return NextResponse.json({ error: insErr?.message ?? "Failed to create version" }, { status: 500 });
        }
        newVersion = inserted as Record<string, unknown>;
    }

    // Build the template UPDATE (metadata + updated_by/at; current_version_id if versioned).
    const update: Record<string, unknown> = { updated_by: userId, updated_at: new Date().toISOString() };
    if (meta.name !== undefined) update.name = meta.name;
    if (meta.description !== undefined) update.description = meta.description;
    if (meta.category !== undefined) update.category = meta.category;
    if (meta.channel !== undefined) update.channel = meta.channel;
    if (meta.status !== undefined) update.status = meta.status;
    if (newVersion) update.current_version_id = String(newVersion.id);

    const { data: updated, error: uErr } = await supabase
        .from("communication_templates")
        .update(update)
        .eq("id", id)
        .eq("org_id", orgId)
        .select(TEMPLATE_COLS)
        .single();
    if (uErr || !updated) {
        if (uErr && meta.name !== undefined && isTemplateNameUniqueConstraintError(uErr.message)) {
            return NextResponse.json({ error: formatTemplateDuplicateNameError(meta.name) }, { status: 409 });
        }
        return NextResponse.json({ error: uErr?.message ?? "Failed to update template" }, { status: 500 });
    }

    return NextResponse.json({
        template: updated,
        current_version: newVersion ?? null,
        versioned: Boolean(newVersion),
    });
}
