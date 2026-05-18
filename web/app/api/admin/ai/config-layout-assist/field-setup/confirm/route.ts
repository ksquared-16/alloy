import { NextRequest, NextResponse } from "next/server";

import {
    CONFIG_ASSIST_FIELD_TYPES,
    CONFIG_ASSIST_NEW_SECTION_VALUE,
    buildProposalFromFieldSetupConfirm,
    prepareConfigLayoutAssistFieldSetup,
    type ConfigAssistFieldType,
    type ConfigLayoutAssistFieldSetupConfirmV1,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistFieldSetup";
import {
    forbidUnlessGeneratePermission,
    loadConfigLayoutAssistAdminContext,
} from "@/lib/agent/configLayoutAssist/configurationProposalApiHelpers";
import { createConfigurationProposalRecord } from "@/lib/agent/configLayoutAssist/configurationProposalStore";
import { createAdminClient } from "@/lib/supabaseAdmin";

function parseFieldType(raw: unknown): ConfigAssistFieldType | null {
    if (typeof raw !== "string") return null;
    const t = raw.trim().toLowerCase();
    return (CONFIG_ASSIST_FIELD_TYPES as readonly string[]).includes(t)
        ? (t as ConfigAssistFieldType)
        : null;
}

function parseConfirmBody(
    body: Record<string, unknown>
): { ok: true; confirm: ConfigLayoutAssistFieldSetupConfirmV1 } | { ok: false; message: string } {
    const command = typeof body.command === "string" ? body.command.trim() : "";
    if (!command) return { ok: false, message: "command is required" };

    const field_type = parseFieldType(body.field_type);
    if (!field_type) return { ok: false, message: "Invalid field_type" };

    const required = body.required === true;

    const section_key_raw = typeof body.section_key === "string" ? body.section_key.trim() : "";
    const new_section_label =
        typeof body.new_section_label === "string" ? body.new_section_label.trim() : "";

    let section_selection: ConfigLayoutAssistFieldSetupConfirmV1["section_selection"];
    if (section_key_raw === CONFIG_ASSIST_NEW_SECTION_VALUE || body.section_is_new === true) {
        if (!new_section_label) {
            return { ok: false, message: "new_section_label is required for a new section" };
        }
        section_selection = { kind: "new", section_label: new_section_label };
    } else if (section_key_raw) {
        section_selection = { kind: "existing", section_key: section_key_raw };
    } else {
        return { ok: false, message: "section_key is required" };
    }

    return {
        ok: true,
        confirm: { command, field_type, required, section_selection },
    };
}

/**
 * POST — confirm field setup choices, build proposal, persist as draft.
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

    const parsed = parseConfirmBody(body);
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: "INVALID_BODY", message: parsed.message }, { status: 400 });
    }

    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim() : undefined;
    const supabase = createAdminClient();
    const prepared = await prepareConfigLayoutAssistFieldSetup({
        command: parsed.confirm.command,
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

    const built = buildProposalFromFieldSetupConfirm({
        draft: prepared.draft,
        confirm: parsed.confirm,
        sectionOptions: prepared.section_options,
        userId: admin.userId,
    });

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

    return NextResponse.json({
        ok: true,
        proposal: built.proposal,
        trace: built.trace,
        persisted_proposal_id: created.record.id,
        ready_summary: built.ready_summary,
    });
}
