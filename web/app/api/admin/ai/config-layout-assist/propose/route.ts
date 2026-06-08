import { NextRequest, NextResponse } from "next/server";

import { buildDeterministicConfigurationProposal } from "@/lib/agent/configLayoutAssist/configLayoutAssistPropose";
import {
    forbidUnlessGeneratePermission,
    loadConfigLayoutAssistAdminContext,
} from "@/lib/agent/configLayoutAssist/configurationProposalApiHelpers";
import { createConfigurationProposalRecord } from "@/lib/agent/configLayoutAssist/configurationProposalStore";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST — deterministic Configuration / Layout Assist proposal (proposal-only, no apply).
 * Body: `{ command: string, persist?: boolean, entity_type?: string }`
 */
export async function POST(request: NextRequest) {
    const admin = await loadConfigLayoutAssistAdminContext();
    if (!admin.ok) return admin.response;

    const forbidden = forbidUnlessGeneratePermission(admin);
    if (forbidden) return forbidden;

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const command = typeof body.command === "string" ? body.command.trim() : "";
    if (!command) {
        return NextResponse.json({ ok: false, error: "COMMAND_REQUIRED" }, { status: 400 });
    }

    const persist = body.persist === true;
    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim() : undefined;

    const supabase = createAdminClient();
    const built = await buildDeterministicConfigurationProposal({
        command,
        orgId: admin.orgId,
        userId: admin.userId,
        supabase,
        default_entity_type: entity_type,
    });

    let persisted_proposal_id: string | null = null;
    if (persist) {
        const created = await createConfigurationProposalRecord({
            supabase,
            orgId: admin.orgId,
            userId: admin.userId,
            proposal: { ...built.proposal, created_by: admin.userId },
            createdByRole: admin.role,
        });
        if (!created.ok) {
            return NextResponse.json(
                {
                    ok: false,
                    error: created.error,
                    message: created.message,
                    proposal: built.proposal,
                    trace: built.trace,
                },
                { status: created.error === "PROPOSAL_VALIDATION_FAILED" ? 422 : 400 }
            );
        }
        persisted_proposal_id = created.record.id;
    }

    return NextResponse.json({
        ok: true,
        proposal: built.proposal,
        trace: built.trace,
        persisted_proposal_id,
    });
}
