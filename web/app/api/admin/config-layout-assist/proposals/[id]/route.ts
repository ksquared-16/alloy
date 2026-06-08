import { NextRequest, NextResponse } from "next/server";

import { getConfigurationProposalRecord } from "@/lib/agent/configLayoutAssist/configurationProposalStore";
import {
    isConfigLayoutAssistProposalId,
    loadConfigLayoutAssistAdminContext,
} from "@/lib/agent/configLayoutAssist/configurationProposalApiHelpers";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET — single proposal with full proposal_json and lifecycle metadata.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const admin = await loadConfigLayoutAssistAdminContext();
    if (!admin.ok) return admin.response;

    const { id } = await context.params;
    if (!id?.trim() || !isConfigLayoutAssistProposalId(id)) {
        return NextResponse.json({ ok: false, error: "INVALID_ID", message: "Proposal id must be a UUID." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const got = await getConfigurationProposalRecord({
        supabase,
        orgId: admin.orgId,
        proposalId: id.trim(),
    });

    if (!got.ok) {
        return NextResponse.json({ ok: false, error: got.error, message: got.message }, { status: got.status });
    }

    return NextResponse.json({ ok: true, proposal: got.record });
}
