import { NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { FORMS_AUTHOR, requireFormsCapability } from "@/lib/access/formsAuthority";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { buildProcessingFormFieldLibrary } from "@/lib/forms/processingFormFieldLibrary";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { loadOrgFieldDefinitionsForLifecycle } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";

/**
 * The canonical destination catalog, for a form that does not exist yet.
 *
 * The picker's authority already existed — `buildProcessingFormFieldLibrary` over the same palette
 * `/process → requirements` reads, including the org's own custom fields. It was reachable only through
 * `/api/admin/forms/<formId>/lifecycle-coverage`, which needs a form. An IMPORTED form has no form id
 * until the operator creates one, so that surface could never call it and silently fell back to the
 * 17-entry curated list — which is why "Child → Gender" was missing while Gender sits in the catalog.
 *
 * So the same authority is exposed org-scoped. One catalog, two callers: the imported form uses it
 * directly, and the builder uses it when the form-scoped call is unavailable. There is deliberately no
 * imported-only field list anywhere.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    // Choosing where a question's answer is stored IS form authoring, so it carries that authority.
    const denied = requireFormsCapability(ctx, FORMS_AUTHOR);
    if (denied) return denied;

    const supabase = createAdminClient();
    /*
     * The same loader the form-scoped payload uses, so the org's own custom fields are offered here too
     * rather than only the platform catalog.
     */
    const orgFieldDefinitions = await loadOrgFieldDefinitionsForLifecycle(supabase, ctx.orgId);

    /*
     * "lead" is the earliest stage, so its palette is the broadest offer a form can make — and the
     * required/recommended tiers are presentation only, which a form still being authored has no stage
     * to supply anyway.
     */
    const palette = mergeLifecycleFieldPaletteForStage("lead", orgFieldDefinitions);
    return NextResponse.json({ data: { field_library: buildProcessingFormFieldLibrary({ palette }) } });
}
