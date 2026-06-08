import { NextRequest, NextResponse } from "next/server";

import {
    fieldSetupIntroMessage,
    prepareConfigLayoutAssistFieldSetup,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistFieldSetup";
import {
    forbidUnlessGeneratePermission,
    loadConfigLayoutAssistAdminContext,
} from "@/lib/agent/configLayoutAssist/configurationProposalApiHelpers";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST — start in-chat field setup (no proposal persisted).
 * Body: `{ command: string, entity_type?: string }`
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

    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim() : undefined;
    const supabase = createAdminClient();
    const prepared = await prepareConfigLayoutAssistFieldSetup({
        command,
        orgId: admin.orgId,
        supabase,
        default_entity_type: entity_type,
    });

    if (!prepared.ok) {
        return NextResponse.json(
            { ok: false, error: prepared.error, message: prepared.message },
            { status: 400 }
        );
    }

    return NextResponse.json({
        ok: true,
        draft: prepared.draft,
        section_options: prepared.section_options,
        intro_message: fieldSetupIntroMessage(prepared.draft),
    });
}
