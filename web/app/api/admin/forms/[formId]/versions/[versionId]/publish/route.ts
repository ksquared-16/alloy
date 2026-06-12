import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { dbGetFormDefinition, dbGetVersion, dbPublishVersion } from "@/lib/admin/forms/formsAdminDb";
import { catchSchemaValidation, jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { isPosConnectedSurface } from "@/lib/forms/binding/posConnectedMarker";
import { loadOrgFieldDefinitionKeySet } from "@/lib/forms/binding/loadOrgFieldDefinitionKeySet";
import { evaluatePosConnectedBinding } from "@/lib/forms/binding/evaluatePosConnectedBinding";

/** POST /api/admin/forms/[formId]/versions/[versionId]/publish — draft → published (admin only). */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ formId: string; versionId: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: rawForm, versionId: rawVer } = await params;
    const formId = parseUuidParam(rawForm, "formId");
    if (formId instanceof NextResponse) return formId;
    const versionId = parseUuidParam(rawVer, "versionId");
    if (versionId instanceof NextResponse) return versionId;

    const supabase = createAdminClient();
    const { data: existing, error: loadErr } = await dbGetVersion(supabase, ctx.orgId, versionId);
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!existing) return jsonError("Not found", 404);
    if ((existing as { form_definition_id: string }).form_definition_id !== formId) {
        return jsonError("Not found", 404);
    }

    const row = existing as { status: string; schema_json: unknown; metadata?: unknown };
    if (row.status !== "draft") {
        return jsonError("Only draft versions can be published", 409);
    }

    let parsed: FormSchemaV1;
    try {
        parsed = validateFormSchema(row.schema_json);
        if (parsed.fields.length === 0) {
            return jsonError("Add at least one question before publishing", 400);
        }
    } catch (e) {
        const resp = catchSchemaValidation(e);
        if (resp) return resp;
        throw e;
    }

    // POS-FP0: POS-connected surfaces must bind every value-bearing field to the shared
    // field registry. Legacy (non-POS-connected) forms are not affected — the marker is
    // absent, so enforcement is skipped entirely.
    try {
        const { data: defRow } = await dbGetFormDefinition(supabase, ctx.orgId, formId);
        const posConnected = isPosConnectedSurface({
            definitionMetadata: (defRow as { metadata?: unknown } | null)?.metadata,
            versionMetadata: row.metadata,
        });
        if (posConnected) {
            const availableFieldKeys = await loadOrgFieldDefinitionKeySet(supabase, ctx.orgId);
            const binding = evaluatePosConnectedBinding({
                posConnected: true,
                schema: parsed,
                availableFieldKeys,
            });
            if (!binding.ok) {
                return jsonError(
                    "POS-connected form fields must bind to the shared field registry",
                    400,
                    { binding_violations: binding.violations }
                );
            }
        }
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "POS field-registry binding check failed" },
            { status: 500 }
        );
    }

    const { data, error } = await dbPublishVersion(supabase, ctx.orgId, versionId, ctx.userId);
    if (error) {
        if (error.code === "PGRST116") {
            return jsonError("Version is not in draft state or was modified concurrently", 409);
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonData(data);
}
