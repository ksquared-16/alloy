import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { requireOrganizationVocabularyCapability } from "@/lib/access/organizationVocabularyAuthority";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    listQualificationRequirements,
    listQualificationTypes,
    StaffQualificationError,
    upsertQualificationRequirement,
    upsertQualificationType,
} from "@/lib/staffQualifications/staffQualificationService";

/**
 * Staff qualification CONFIGURATION — the vocabulary an organization recognises,
 * and where each qualification is required.
 *
 * One route for both because they are one operator concept: "what we recognise,
 * and where it applies". Splitting them would make the requirement editor look
 * like a separate product from the types it references.
 *
 * Server-authoritative. Every write re-checks that the qualification type and the
 * scope target belong to the caller's organization — a requirement naming another
 * tenant's site would silently never apply, which is worse than an error because
 * it looks configured.
 */

function failure(err: unknown) {
    if (err instanceof StaffQualificationError) {
        const status =
            err.code === "not_found" ? 404 : err.code === "conflict" ? 409 : err.code === "invalid_input" ? 422 : 500;
        return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: "Configuration change failed.", code: "internal_error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "true";
    const supabase = createAdminClient();
    try {
        const [types, requirements] = await Promise.all([
            listQualificationTypes(supabase, ctx.orgId, { includeInactive }),
            listQualificationRequirements(supabase, ctx.orgId),
        ]);
        return NextResponse.json({ qualification_types: types, qualification_requirements: requirements });
    } catch (err) {
        return failure(err);
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    // A qualification type IS organization-wide operational vocabulary, and a
    // requirement is policy authored against it. requireAdminOrOps resolves
    // portal admission and no capability, so without this the configuration
    // would be reachable by any admitted principal — the accidental reach this
    // capability exists to close.
    const capabilityDenied = requireOrganizationVocabularyCapability(ctx);
    if (capabilityDenied) return capabilityDenied;

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const action = String(body.action ?? "").trim();
    const supabase = createAdminClient();
    try {
        if (action === "upsert_type") {
            const row = await upsertQualificationType(supabase, {
                orgId: ctx.orgId,
                id: body.id as string | null,
                key: body.key as string | null,
                label: String(body.label ?? ""),
                description: body.description as string | null,
                category: body.category as string | null,
                expirationExpected: body.expiration_expected as boolean | undefined,
                defaultValidityDays: body.default_validity_days as number | null | undefined,
                evidenceRequiredDefault: body.evidence_required_default as boolean | undefined,
                isActive: body.is_active as boolean | undefined,
            });
            return NextResponse.json({ qualification_type: row }, { status: body.id ? 200 : 201 });
        }
        if (action === "upsert_requirement") {
            const row = await upsertQualificationRequirement(supabase, {
                orgId: ctx.orgId,
                id: body.id as string | null,
                qualificationTypeId: String(body.qualification_type_id ?? ""),
                scopeType: String(body.scope_type ?? "organization") as never,
                scopeId: body.scope_id as string | null,
                requirementLevel: String(body.requirement_level ?? "required"),
                evidenceRequired: body.evidence_required as boolean | undefined,
                effectiveStart: body.effective_start as string | null,
                effectiveEnd: body.effective_end as string | null,
                isActive: body.is_active as boolean | undefined,
            });
            return NextResponse.json({ qualification_requirement: row }, { status: body.id ? 200 : 201 });
        }
        return NextResponse.json(
            { error: "action must be upsert_type or upsert_requirement", code: "invalid_input" },
            { status: 400 },
        );
    } catch (err) {
        return failure(err);
    }
}
