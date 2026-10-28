import { NextRequest } from "next/server";
import { formsReadScope, formsSubjectInActorScope, linkMetadataSubject } from "@/lib/forms/formSubmissionScope";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { validateFormSchema } from "@/lib/forms/schema";
import { resolveContextBackedPreviewPayload } from "@/lib/forms/preview/formPreviewOrchestration";

/** POST /api/admin/forms/preview-payload — operator context-backed form preview. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const formDefinitionId = typeof body.form_definition_id === "string" ? body.form_definition_id.trim() : "";
    const schemaJson = body.schema_json;
    const launchFksRaw = body.launch_fks;
    const linkMetadataRaw = body.link_metadata;

    if (!schemaJson) return Response.json({ error: "schema_json is required" }, { status: 400 });

    let schema;
    try {
        schema = validateFormSchema(schemaJson);
    } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "Invalid schema" }, { status: 400 });
    }

    const launchFks =
        launchFksRaw && typeof launchFksRaw === "object" && !Array.isArray(launchFksRaw)
            ? (launchFksRaw as {
                  customer_id?: string | null;
                  person_id?: string | null;
                  customer_member_id?: string | null;
                  opportunity_id?: string | null;
              })
            : {};

    const linkMetadata =
        linkMetadataRaw && typeof linkMetadataRaw === "object" && !Array.isArray(linkMetadataRaw)
            ? (linkMetadataRaw as Record<string, unknown>)
            : { form_context_mode: "existing_record" };

    const supabase = createServiceRoleClient();

    // R2: a preview prefilled from a record (launch_fks, or a subject named in link_metadata) only for a record inside the
    // caller's department/site scope — the prefill IS that record's data.
    const scope = await formsReadScope();
    const fks = { customer_id: launchFks.customer_id ?? null, person_id: launchFks.person_id ?? null, customer_member_id: launchFks.customer_member_id ?? null, opportunity_id: launchFks.opportunity_id ?? null };
    const named = [fks, linkMetadataSubject(linkMetadata)].filter((x): x is NonNullable<typeof x> => Boolean(x && (x.customer_id || x.person_id || x.customer_member_id || x.opportunity_id)));
    for (const subject of named) {
        if (!(await formsSubjectInActorScope(supabase, ctx.orgId, scope, subject))) return Response.json({ error: "Not found" }, { status: 404 });
    }

    let formDefinitionMetadata: Record<string, unknown> | null = null;
    if (formDefinitionId) {
        const { data } = await supabase
            .from("form_definitions")
            .select("metadata")
            .eq("id", formDefinitionId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const meta = (data as { metadata?: unknown } | null)?.metadata;
        formDefinitionMetadata =
            meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null;
    }

    const result = await resolveContextBackedPreviewPayload({
        supabase,
        orgId: ctx.orgId,
        schema,
        linkMetadata,
        formDefinitionMetadata,
        launchFks: {
            customer_id: launchFks.customer_id ?? null,
            person_id: launchFks.person_id ?? null,
            customer_member_id: launchFks.customer_member_id ?? null,
            opportunity_id: launchFks.opportunity_id ?? null,
        },
    });

    return Response.json({
        payload: result.payload,
        mode: result.mode,
        diagnostics: result.diagnostics,
    });
}
