import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { extractBoundPerson } from "@/lib/pos/processingCase/approveHandoff";
import { resolveIntakeIdentity, type IntakeIdentityResolverDeps } from "@/lib/forms/intake/resolveIntakeIdentity";
import {
    getPersonLabels,
    listPersonIdsByEmail,
    listPersonIdsByPhone,
} from "@/lib/forms/intake/intakeIdentityLookups";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/processing/cases/[caseId]/recommendation — POS-FP8a (READ-ONLY).
 *
 * Returns the match-first recommendation (link / create / route) for a case's
 * primary form-submission source, computed from the bound person fields via the
 * non-mutating identity resolver. Writes nothing; promotion happens later at
 * approval (FP8c). Other source kinds return a clear unsupported response.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();

    try {
        const { data: caseRow, error: caseErr } = await supabase
            .from("processing_cases")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseErr) throw new Error(caseErr.message);
        if (!caseRow) return jsonError("Not found", 404);

        const { data: src, error: srcErr } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id")
            .eq("org_id", ctx.orgId)
            .eq("processing_case_id", caseId)
            .eq("role", "primary")
            .maybeSingle();
        if (srcErr) throw new Error(srcErr.message);
        const source = (src as { source_kind: string; source_id: string } | null) ?? null;

        if (!source) {
            return jsonData({ supported: false, reason: "Case has no primary source." });
        }
        if (source.source_kind !== "form_submission") {
            return jsonData({
                supported: false,
                sourceKind: source.source_kind,
                reason: `Recommendations support form submissions; ${source.source_kind} is not supported yet.`,
            });
        }

        const { data: sub, error: subErr } = await supabase
            .from("form_submissions")
            .select("payload, form_definition_version_id")
            .eq("org_id", ctx.orgId)
            .eq("id", source.source_id)
            .maybeSingle();
        if (subErr) throw new Error(subErr.message);
        const subRow = sub as { payload?: Record<string, unknown>; form_definition_version_id?: string | null } | null;
        if (!subRow) return jsonData({ supported: false, reason: "Submission not found." });

        const valuesRaw = subRow.payload?.values;
        const values =
            valuesRaw && typeof valuesRaw === "object" && !Array.isArray(valuesRaw)
                ? (valuesRaw as Record<string, unknown>)
                : {};

        let schemaJson: unknown = null;
        if (subRow.form_definition_version_id) {
            const { data: ver, error: verErr } = await supabase
                .from("form_definition_versions")
                .select("schema_json")
                .eq("org_id", ctx.orgId)
                .eq("id", subRow.form_definition_version_id)
                .maybeSingle();
            if (verErr) throw new Error(verErr.message);
            schemaJson = (ver as { schema_json?: unknown } | null)?.schema_json ?? null;
        }

        const bound = extractBoundPerson(schemaJson, values);

        const deps: IntakeIdentityResolverDeps = {
            listPersonIdsByEmail: (orgId, e) => listPersonIdsByEmail(supabase, orgId, e),
            listPersonIdsByPhone: (orgId, p) => listPersonIdsByPhone(supabase, orgId, p),
            getPersonLabels: (orgId, ids) => getPersonLabels(supabase, orgId, ids),
        };

        const recommendation = await resolveIntakeIdentity(deps, {
            orgId: ctx.orgId,
            person: { email: bound.email, phone: bound.phone, firstName: bound.firstName, lastName: bound.lastName },
        });

        const mappedPersonValues = [bound.email, bound.phone, bound.firstName, bound.lastName].filter(Boolean).length;
        return jsonData({
            supported: true,
            recommendation,
            source: { kind: source.source_kind, hasEmailBinding: bound.hasEmailBinding, mappedPersonValues },
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to build recommendation" },
            { status: 500 }
        );
    }
}
