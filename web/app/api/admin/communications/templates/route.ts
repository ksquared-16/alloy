import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    buildTemplateVersionInsertPayload,
    computeTemplateTokenPaths,
    formatTemplateDuplicateNameError,
    isTemplateNameUniqueConstraintError,
    parseTemplateListFilters,
    validateCreateTemplateInput,
} from "@/lib/communications/v2/templateService";

/**
 * Communications V2 — template list + create (Phase 1 / B2).
 * Pattern: requireAdminOrOps -> getAdminContextCached -> createAdminClient.
 * service_role writes; org_id enforced on every query. No UI/announcements/provider.
 */

const TEMPLATE_COLS =
    "id, org_id, name, description, category, channel, status, current_version_id, system_key, created_by, updated_by, created_at, updated_at";
const VERSION_COLS = "id, template_id, version_number, subject, body, token_paths, created_at";

/** GET /api/admin/communications/templates — list org templates (optional category/channel/status filters). */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const parsed = parseTemplateListFilters({
        category: searchParams.get("category"),
        channel: searchParams.get("channel"),
        status: searchParams.get("status"),
    });
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 200);
    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    // Ensure Tour system templates exist before listing (idempotent seed).
    try {
        const { ensureOrgTourCommunicationTemplates } = await import("@/lib/tours/comms/tourSystemTemplates");
        await ensureOrgTourCommunicationTemplates({
            supabase,
            orgId,
            actorUserId: ctx.userId,
        });
    } catch (e) {
        console.warn("[templates] tour system provision skipped", e instanceof Error ? e.message : e);
    }

    let query = supabase
        .from("communication_templates")
        .select(TEMPLATE_COLS)
        .eq("org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(limit);

    if (parsed.value.category) query = query.eq("category", parsed.value.category);
    if (parsed.value.channel) query = query.eq("channel", parsed.value.channel);
    if (parsed.value.status) query = query.eq("status", parsed.value.status);

    const { data: templates, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = templates ?? [];

    // Attach current-version summary where available (org-scoped).
    const versionIds = rows
        .map((t) => (t as Record<string, unknown>).current_version_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0);

    const versionById = new Map<string, Record<string, unknown>>();
    if (versionIds.length > 0) {
        const { data: versions, error: vErr } = await supabase
            .from("communication_template_versions")
            .select(VERSION_COLS)
            .eq("org_id", orgId)
            .in("id", versionIds);
        if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
        for (const v of versions ?? []) {
            versionById.set(String((v as Record<string, unknown>).id), v as Record<string, unknown>);
        }
    }

    const out = rows.map((t) => {
        const rec = t as Record<string, unknown>;
        const cvId = typeof rec.current_version_id === "string" ? rec.current_version_id : null;
        return { ...rec, current_version: cvId ? versionById.get(cvId) ?? null : null };
    });

    return NextResponse.json({ templates: out });
}

/** POST /api/admin/communications/templates — create a template + its initial version. */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = validateCreateTemplateInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const input = parsed.value;
    const supabase = createAdminClient();
    const orgId = ctx.orgId;
    const userId = ctx.userId;

    const { data: existingName } = await supabase
        .from("communication_templates")
        .select("id")
        .eq("org_id", orgId)
        .eq("name", input.name)
        .maybeSingle();
    if (existingName) {
        return NextResponse.json({ error: formatTemplateDuplicateNameError(input.name) }, { status: 409 });
    }

    // 1) Insert the template container (current_version_id set after the version exists).
    const { data: template, error: tErr } = await supabase
        .from("communication_templates")
        .insert({
            org_id: orgId,
            name: input.name,
            description: input.description,
            category: input.category,
            channel: input.channel,
            status: input.status,
            created_by: userId,
            updated_by: userId,
        })
        .select(TEMPLATE_COLS)
        .single();
    if (tErr || !template) {
        if (tErr && isTemplateNameUniqueConstraintError(tErr.message)) {
            return NextResponse.json({ error: formatTemplateDuplicateNameError(input.name) }, { status: 409 });
        }
        return NextResponse.json({ error: tErr?.message ?? "Failed to create template" }, { status: 500 });
    }
    const templateId = String((template as Record<string, unknown>).id);

    // 2) Insert the initial version (version_number = 1).
    const tokenPaths = computeTemplateTokenPaths(input.subject, input.body);
    const { data: version, error: vErr } = await supabase
        .from("communication_template_versions")
        .insert(
            buildTemplateVersionInsertPayload({
                org_id: orgId,
                template_id: templateId,
                version_number: 1,
                subject: input.subject,
                body: input.body,
                token_paths: tokenPaths,
                created_by: userId,
            })
        )
        .select(VERSION_COLS)
        .single();
    if (vErr || !version) {
        return NextResponse.json({ error: vErr?.message ?? "Failed to create initial version" }, { status: 500 });
    }

    // 3) Point the template at its current version.
    const versionId = String((version as Record<string, unknown>).id);
    const { data: updated, error: uErr } = await supabase
        .from("communication_templates")
        .update({ current_version_id: versionId })
        .eq("id", templateId)
        .eq("org_id", orgId)
        .select(TEMPLATE_COLS)
        .single();
    if (uErr || !updated) {
        return NextResponse.json({ error: uErr?.message ?? "Failed to link current version" }, { status: 500 });
    }

    return NextResponse.json({ template: { ...(updated as Record<string, unknown>), current_version: version } }, { status: 201 });
}
