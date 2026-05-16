import { NextRequest, NextResponse } from "next/server";

import {
    createConfigurationProposalRecord,
    listConfigurationProposalRecords,
} from "@/lib/agent/configLayoutAssist/configurationProposalStore";
import {
    forbidUnlessGeneratePermission,
    loadConfigLayoutAssistAdminContext,
} from "@/lib/agent/configLayoutAssist/configurationProposalApiHelpers";
import { deserializeConfigurationProposal } from "@/lib/agent/configLayoutAssist/configurationProposalSerialize";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET — list durable config/layout proposals (org-scoped).
 * Query: state?, category?, limit?
 */
export async function GET(request: NextRequest) {
    const admin = await loadConfigLayoutAssistAdminContext();
    if (!admin.ok) return admin.response;

    const url = new URL(request.url);
    const state = url.searchParams.get("state")?.trim() || undefined;
    const category = url.searchParams.get("category")?.trim() || undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const supabase = createAdminClient();
    const listed = await listConfigurationProposalRecords({
        supabase,
        orgId: admin.orgId,
        filters: { state, category, limit: Number.isFinite(limit) ? limit : undefined },
    });

    if (!listed.ok) {
        return NextResponse.json({ ok: false, error: listed.error, message: listed.message }, { status: 400 });
    }

    return NextResponse.json({
        ok: true,
        proposals: listed.records.map((r) => ({
            id: r.id,
            state: r.state,
            category: r.category,
            summary: r.summary,
            risk_level: r.risk_level,
            apply_mode: r.apply_mode,
            permission_requirements: r.permission_requirements,
            proposal_hash: r.proposal_hash,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })),
    });
}

/**
 * POST — validate, normalize, and persist proposal in `draft` state.
 * Body: `{ proposal: ConfigurationProposalV1 }` or raw proposal object.
 */
export async function POST(request: NextRequest) {
    const admin = await loadConfigLayoutAssistAdminContext();
    if (!admin.ok) return admin.response;

    const forbidden = forbidUnlessGeneratePermission(admin);
    if (forbidden) return forbidden;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const rawProposal =
        body != null && typeof body === "object" && !Array.isArray(body) && "proposal" in (body as object)
            ? (body as { proposal: unknown }).proposal
            : body;

    const parsed = deserializeConfigurationProposal(rawProposal as Record<string, unknown>);
    if (!parsed.ok) {
        return NextResponse.json(
            {
                ok: false,
                error: "PROPOSAL_INVALID",
                message: parsed.error,
                validation: parsed.validation ?? null,
            },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const created = await createConfigurationProposalRecord({
        supabase,
        orgId: admin.orgId,
        userId: admin.userId,
        proposal: { ...parsed.proposal, created_by: admin.userId },
        createdByRole: admin.role,
    });

    if (!created.ok) {
        const status = created.error === "PROPOSAL_VALIDATION_FAILED" ? 422 : 400;
        return NextResponse.json(
            {
                ok: false,
                error: created.error,
                message: created.message,
                validation: created.validation ?? null,
            },
            { status }
        );
    }

    return NextResponse.json({ ok: true, proposal: created.record }, { status: 201 });
}
