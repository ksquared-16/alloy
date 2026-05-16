import { NextRequest, NextResponse } from "next/server";

import {
    applyConfigurationProposal,
    assertProposalCanBeApplied,
} from "@/lib/agent/configLayoutAssist/apply/configurationProposalApply";
import { buildApplyVerificationResult } from "@/lib/agent/configLayoutAssist/apply/applyVerification";
import {
    forbidUnlessApplyPermission,
    isConfigLayoutAssistProposalId,
    loadConfigLayoutAssistAdminContext,
} from "@/lib/agent/configLayoutAssist/configurationProposalApiHelpers";
import { getConfigurationProposalRecord } from "@/lib/agent/configLayoutAssist/configurationProposalStore";
import { transitionConfigurationProposalState } from "@/lib/agent/configLayoutAssist/configurationProposalStore";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST — apply an approved proposal through authoritative adapters (human-approved only).
 */
export async function POST(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const admin = await loadConfigLayoutAssistAdminContext();
    if (!admin.ok) return admin.response;

    const forbidden = forbidUnlessApplyPermission(admin);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    if (!isConfigLayoutAssistProposalId(id)) {
        return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const cur = await getConfigurationProposalRecord({
        supabase,
        orgId: admin.orgId,
        proposalId: id,
    });
    if (!cur.ok) {
        return NextResponse.json({ ok: false, error: cur.error, message: cur.message }, { status: 404 });
    }

    if (cur.record.state !== "approved") {
        return NextResponse.json(
            {
                ok: false,
                error: "INVALID_STATE",
                message: `Proposal must be approved before apply (current: ${cur.record.state}).`,
            },
            { status: 409 }
        );
    }

    const canApply = assertProposalCanBeApplied(cur.record.proposal_json, cur.record.apply_mode);
    if (!canApply.ok) {
        return NextResponse.json(
            { ok: false, error: "NOT_APPLICABLE", message: canApply.message },
            { status: 409 }
        );
    }

    const applied = await applyConfigurationProposal({
        supabase,
        orgId: admin.orgId,
        userId: admin.userId,
        role: admin.role,
        proposal: cur.record.proposal_json,
        access: { permissionKeys: admin.permissionKeys, roleKeys: admin.roleKeys },
    });

    if (!applied.ok) {
        const status = applied.error === "NOT_APPLICABLE" ? 409 : 403;
        return NextResponse.json({ ok: false, error: applied.error, message: applied.message }, { status });
    }

    const verification = buildApplyVerificationResult({
        operations: cur.record.proposal_json.proposed_operations,
        applyResults: applied.results,
    });

    const proposal_json = {
        ...cur.record.proposal_json,
        metadata: {
            ...(cur.record.proposal_json.metadata ?? {}),
            apply_result: applied.results,
            apply_verification: verification,
            applied_at: new Date().toISOString(),
        },
    };

    await supabase
        .from("config_layout_assist_proposals")
        .update({ proposal_json })
        .eq("org_id", admin.orgId)
        .eq("id", id);

    if (!verification.success || applied.partial_failure) {
        const failed = await transitionConfigurationProposalState({
            supabase,
            orgId: admin.orgId,
            userId: admin.userId,
            proposalId: id,
            input: {
                to_state: "failed",
                failed_reason:
                    verification.failed_operations.length > 0
                        ? `Verification failed for: ${verification.failed_operations.join(", ")}`
                        : "One or more operations failed during apply.",
            },
            actorRole: admin.role,
        });
        return NextResponse.json(
            {
                ok: false,
                error: "APPLY_VERIFICATION_FAILED",
                verification,
                apply_results: applied.results,
                proposal: failed.ok ? failed.record : cur.record,
            },
            { status: 422 }
        );
    }

    const transitioned = await transitionConfigurationProposalState({
        supabase,
        orgId: admin.orgId,
        userId: admin.userId,
        proposalId: id,
        input: { to_state: "applied" },
        actorRole: admin.role,
    });

    if (!transitioned.ok) {
        return NextResponse.json(
            { ok: false, error: transitioned.error, message: transitioned.message, verification },
            { status: transitioned.status }
        );
    }

    return NextResponse.json({
        ok: true,
        verification,
        apply_results: applied.results,
        proposal: transitioned.record,
    });
}
