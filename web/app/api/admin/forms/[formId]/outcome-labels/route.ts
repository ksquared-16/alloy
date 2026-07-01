import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { loadAdminAccessBundleCached } from "@/lib/admin/getAdminAccessContext";
import { dbGetFormDefinition, dbListPublicLinksForForm } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { resolveOutcomeConfigLabelCatalog } from "@/lib/forms/resolveOutcomeConfigLabelCatalog";
import { resolveOutcomeConfigPickerOptions } from "@/lib/forms/resolveOutcomeConfigPickerOptions";
import { resolveShareByLocationSitePickerOptions } from "@/lib/forms/shareByLocationPresentation";

/** GET — display labels + optional routing pickers for outcome editor (IC-1b / IC-1c). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { formId: rawId } = await params;
    const formId = parseUuidParam(rawId, "formId");
    if (formId instanceof NextResponse) return formId;

    const includePickers = request.nextUrl.searchParams.get("include_picker_options") === "1";

    const supabase = createAdminClient();
    const { data: form, error: formErr } = await dbGetFormDefinition(supabase, ctx.orgId, formId);
    if (formErr) return NextResponse.json({ error: formErr.message }, { status: 500 });
    if (!form) return jsonError("Not found", 404);

    const { data: links, error: linksErr } = await dbListPublicLinksForForm(supabase, ctx.orgId, formId);
    if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 500 });

    const formRow = form as { metadata?: Record<string, unknown> };
    const linkRows = (links ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
            id: String(r.id),
            is_active: r.is_active === true,
            created_at: typeof r.created_at === "string" ? r.created_at : "",
            metadata:
                r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ?
                    (r.metadata as Record<string, unknown>)
                :   {},
        };
    });

    const accessBundle = await loadAdminAccessBundleCached();

    try {
        const catalog = await resolveOutcomeConfigLabelCatalog(supabase, ctx.orgId, {
            formMetadata: formRow.metadata ?? {},
            links: linkRows,
        });
        const pickerOptions =
            includePickers && ctx.role === "admin" ?
                await resolveOutcomeConfigPickerOptions(supabase, ctx.orgId)
            :   null;
        const shareByLocationSites =
            includePickers ?
                await resolveShareByLocationSitePickerOptions(supabase, ctx.orgId, {
                    allowedSiteLocationIds:
                        accessBundle.ok && accessBundle.siteScope === "restricted" ?
                            accessBundle.allowedSiteLocationIds
                        :   null,
                })
            :   null;
        return jsonData({ ...catalog, pickerOptions, shareByLocationSites });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Label resolve failed" }, { status: 500 });
    }
}
