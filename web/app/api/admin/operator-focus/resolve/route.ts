import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveOperatorFocusTarget } from "@/lib/workUnits/operatorFocusTarget";

/**
 * POST `/api/admin/operator-focus/resolve`
 *
 * Answers ONE question: **which Work Unit hosts this record's Focus Panel, for this operator?**
 *
 * It exists because a client caller usually holds only a record id — a task's `entity_id`, an inbox
 * thread's subject, a registry action's target — and the honest destination cannot be derived on the
 * client. The Work Unit comes from the host record's own `work_unit_id`
 * (`@/lib/workUnits/hostWorkUnitResolver`), never from a process key, and never from a route guess.
 *
 * ── THIS ROUTE GRANTS NOTHING ──
 *
 * Navigation is not authorization. The answer is scoped to the caller's org and filtered through the
 * SAME access envelope Search uses, so a record outside the operator's reach resolves to
 * `{ ok: true, target: null }` — indistinguishable from a record no queue holds. The Work Unit
 * surface, the queue page evaluation and the record payload each enforce access again on arrival;
 * this endpoint is a lookup, and removing it would not weaken or strengthen any of them.
 *
 * `target: null` is a successful answer, not an error. Callers must treat it as "there is nowhere to
 * send the operator" and do nothing — never fall back to opening a modal.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: access.status });
    }

    const body = (await request.json().catch(() => null)) as
        | { entity_type?: unknown; entity_id?: unknown }
        | null;
    const entityType = String(body?.entity_type ?? "").trim();
    const entityId = String(body?.entity_id ?? "").trim();

    if (!entityType || !entityId) {
        return NextResponse.json(
            { ok: false, error: "ENTITY_REQUIRED", message: "entity_type and entity_id are required." },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();

    try {
        const target = await resolveOperatorFocusTarget({
            supabase,
            orgId: ctx.orgId,
            dimensions: scopeDimensionsFromAccess(access),
            entityType,
            entityId,
        });
        return NextResponse.json({ ok: true, target });
    } catch (e) {
        console.error("[operator-focus-resolve]", e);
        return NextResponse.json(
            {
                ok: false,
                error: "RESOLVE_FAILED",
                message: e instanceof Error ? e.message : "Focus target resolution failed",
            },
            { status: 500 }
        );
    }
}
