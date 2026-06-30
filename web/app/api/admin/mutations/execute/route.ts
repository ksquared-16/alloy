import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { executeMutation } from "@/lib/mutations/runtime";
import type { DecisionIntent, MutationDomainKey, MutationOrigin } from "@/lib/mutations/types";
import { resolveDomainForCommand } from "@/lib/mutations/domainRegistry";
import { revalidateTag } from "next/cache";
import { adminActionsOrgTag } from "@/lib/admin/actions/cacheTags";

type ExecuteBody = {
    command_key?: string;
    subject_id?: string;
    subject_type?: string;
    target_state?: string;
    context_payload?: Record<string, unknown>;
    /** previewOnly=true returns preview without committing. Used by command surface. */
    preview_only?: boolean;
    context?: {
        department_id?: string | null;
        work_unit_id?: string | null;
    };
};

/** POST /api/admin/mutations/execute — execute an operational mutation through the mutation runtime. */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: ExecuteBody;
    try {
        body = (await request.json()) as ExecuteBody;
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const commandKey = body.command_key != null ? String(body.command_key).trim() : "";
    const subjectId = body.subject_id != null ? String(body.subject_id).trim() : "";
    const subjectType = body.subject_type != null ? String(body.subject_type).trim() : "";
    const targetState = body.target_state != null ? String(body.target_state).trim() : "";

    if (!commandKey || !subjectId || !targetState) {
        return NextResponse.json(
            { ok: false, error: "command_key, subject_id, and target_state are required" },
            { status: 400 }
        );
    }

    // Resolve domain so we can reject unknown commands early
    const domain = resolveDomainForCommand(commandKey);
    if (!domain) {
        return NextResponse.json(
            { ok: false, error: `Unknown mutation command: ${commandKey}` },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();

    const intent: DecisionIntent = {
        commandKey,
        subjectId,
        subjectType: subjectType || domain.subjectType,
        domain: domain.key as MutationDomainKey,
        targetState,
        contextPayload: body.context_payload,
        operatorId: ctx.userId ?? undefined,
        origin: "operator" as MutationOrigin,
    };

    const result = await executeMutation(
        {
            supabase,
            orgId: ctx.orgId,
            departmentId: body.context?.department_id ?? null,
            workUnitId: body.context?.work_unit_id ?? null,
        },
        intent,
        { previewOnly: body.preview_only === true }
    );

    if (result.status === "committed") {
        // Invalidate action resolution cache so queue rows reflect new status
        revalidateTag(adminActionsOrgTag(ctx.orgId));
    }

    return NextResponse.json({ ok: result.status === "committed" || result.status === "previewed", result });
}
