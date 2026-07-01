import { NextRequest, NextResponse } from "next/server";

import { transitionConfigurationProposalState } from "@/lib/agent/configLayoutAssist/configurationProposalStore";
import {
    forbidUnlessTransitionPermission,
    loadConfigLayoutAssistAdminContext,
} from "@/lib/agent/configLayoutAssist/configurationProposalApiHelpers";
import {
    isConfigLayoutAssistProposalState,
    type ConfigLayoutAssistProposalState,
} from "@/lib/agent/configLayoutAssist/configurationProposalState";
import { isConfigLayoutAssistProposalId } from "@/lib/agent/configLayoutAssist/configurationProposalApiHelpers";
import { createAdminClient } from "@/lib/supabaseAdmin";

function parseStateBody(body: unknown):
    | { ok: false; error: string; message: string }
    | {
          ok: true;
          to_state: ConfigLayoutAssistProposalState;
          rejection_reason?: string | null;
          failed_reason?: string | null;
      } {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, error: "BAD_JSON_SHAPE", message: "Body must be a JSON object." };
    }
    const o = body as Record<string, unknown>;
    const allowed = new Set(["state", "to_state", "rejection_reason", "failed_reason"]);
    for (const k of Object.keys(o)) {
        if (!allowed.has(k)) {
            return { ok: false, error: "UNKNOWN_BODY_KEYS", message: `Unexpected key: ${k}` };
        }
    }
    const rawState = (typeof o.to_state === "string" ? o.to_state : typeof o.state === "string" ? o.state : "").trim();
    if (!rawState || !isConfigLayoutAssistProposalState(rawState)) {
        return { ok: false, error: "INVALID_STATE", message: "state / to_state must be a valid proposal lifecycle state." };
    }
    return {
        ok: true,
        to_state: rawState,
        rejection_reason: typeof o.rejection_reason === "string" ? o.rejection_reason : null,
        failed_reason: typeof o.failed_reason === "string" ? o.failed_reason : null,
    };
}

/**
 * PATCH — lifecycle transition only (no config mutation / no apply execution).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const admin = await loadConfigLayoutAssistAdminContext();
    if (!admin.ok) return admin.response;

    const { id } = await context.params;
    if (!id?.trim() || !isConfigLayoutAssistProposalId(id)) {
        return NextResponse.json({ ok: false, error: "INVALID_ID", message: "Proposal id must be a UUID." }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const parsed = parseStateBody(body);
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, message: parsed.message }, { status: 400 });
    }

    const forbidden = forbidUnlessTransitionPermission(admin, parsed.to_state);
    if (forbidden) return forbidden;

    const supabase = createAdminClient();
    const result = await transitionConfigurationProposalState({
        supabase,
        orgId: admin.orgId,
        userId: admin.userId,
        proposalId: id.trim(),
        input: {
            to_state: parsed.to_state,
            rejection_reason: parsed.rejection_reason,
            failed_reason: parsed.failed_reason,
        },
        actorRole: admin.role,
    });

    if (!result.ok) {
        return NextResponse.json(
            { ok: false, error: result.error, message: result.message },
            { status: result.status }
        );
    }

    return NextResponse.json({
        ok: true,
        proposal: result.record,
        permission_key: result.permission_key,
    });
}
