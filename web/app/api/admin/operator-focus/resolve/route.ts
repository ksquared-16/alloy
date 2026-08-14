import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    resolveAttentionTarget,
    type AttentionIntent,
} from "@/lib/workUnits/operatorFocusTarget";

/**
 * POST `/api/admin/operator-focus/resolve`
 *
 * Answers the question the caller DECLARES about a record:
 *
 *   `intent: "operational"` (default) — **which Work Unit hosts this record's Focus Panel, for this
 *   operator?** `target: null` when no active unit holds it. Every pre-existing caller sends no
 *   intent and therefore receives exactly the answer it received before.
 *
 *   `intent: "durable_record"` — **open this record.** Resolves the durable subject whenever the
 *   record exists and the operator may reach it, carrying `operational_host` when a queue happens to
 *   hold it. A staff Person with no household and no case resolves here, and only here.
 *
 * The intent rides the request because the two questions have different right answers for the same
 * record. Inferring it from the entity type would silently hand one caller the other's answer — and
 * because `null` is a legitimate answer on the operational side, the mistake would be invisible.
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
        | { entity_type?: unknown; entity_id?: unknown; intent?: unknown }
        | null;
    const entityType = String(body?.entity_type ?? "").trim();
    const entityId = String(body?.entity_id ?? "").trim();
    const rawIntent = String(body?.intent ?? "").trim();

    if (!entityType || !entityId) {
        return NextResponse.json(
            { ok: false, error: "ENTITY_REQUIRED", message: "entity_type and entity_id are required." },
            { status: 400 }
        );
    }

    // Unknown intents fail closed onto the historical question rather than being rejected: an old
    // client that grows a typo must not lose the answer it has always had.
    const intent: AttentionIntent = rawIntent === "durable_record" ? "durable_record" : "operational";

    const supabase = createAdminClient();

    try {
        const resolution = await resolveAttentionTarget({
            supabase,
            orgId: ctx.orgId,
            dimensions: scopeDimensionsFromAccess(access),
            entityType,
            entityId,
        });

        // `target` stays the OPERATIONAL answer under every intent, so a client reading only `target`
        // — which is every client that predates this change — cannot be handed a durable subject it
        // has no surface for. Child members were never operationally resolvable and stay that way.
        const childGrain =
            entityType.toLowerCase() === "customer_members" || entityType.toLowerCase() === "child";
        const target = childGrain ? null : resolution?.operational_host ?? null;

        if (intent === "operational") {
            return NextResponse.json({ ok: true, target });
        }
        return NextResponse.json({ ok: true, target, resolution: resolution ?? null });
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
