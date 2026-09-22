import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createCapacityRule,
    createCapacityRuleVersion,
    retireCapacityRule,
    voidScheduledCapacityRule,
} from "@/lib/childcareOperational/config/configRuleAuthoringService";
import { setObjectCapacity } from "@/lib/childcareOperational/config/objectCapacityService";
import { listCapacityRules } from "@/lib/childcareOperational/config/childcareConfigRuleService";
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

/**
 * Versioned authoring for childcare capacity rules (Operational Configuration V1,
 * Phase 3). Role-gated POST dispatching by `action`: create | version (supersede)
 * | retire | void | set_object_capacity. Effective-dated truth is never
 * overwritten in place. L1 configuration only — no expectations/attendance/
 * charges/GL writes.
 *
 * The first four actions are the rule console's vocabulary: the caller names the
 * kind, the scope and the effective date. `set_object_capacity` is the ordinary
 * one a director reaches through a classroom's own editor — it carries a number
 * and an object, and derives the rest. Both land in the same authoring service.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const action = String(body.action ?? "").trim();
    const supabase = createAdminClient();

    try {
        const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);

        if (action === "create") {
            const rule = await createCapacityRule(supabase, {
                orgId: ctx.orgId,
                scopeType: String(body.scope_type ?? ""),
                siteLocationId: body.site_location_id != null ? String(body.site_location_id) : null,
                programCategoryId: body.program_category_id != null ? String(body.program_category_id) : null,
                roomLocationId: body.room_location_id != null ? String(body.room_location_id) : null,
                ageGroupKey: body.age_group_key != null ? String(body.age_group_key) : null,
                capacityKind: String(body.capacity_kind ?? ""),
                capacity: Number(body.capacity),
                effectiveStart: String(body.effective_start ?? ""),
                effectiveEnd: body.effective_end != null ? String(body.effective_end) : null,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ rule }, { status: 201 });
        }

        if (action === "version") {
            const result = await createCapacityRuleVersion(supabase, {
                orgId: ctx.orgId,
                priorId: String(body.prior_id ?? ""),
                effectiveStart: String(body.effective_start ?? ""),
                capacity: body.capacity != null ? Number(body.capacity) : null,
                capacityKind: body.capacity_kind != null ? String(body.capacity_kind) : null,
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (action === "retire") {
            const rule = await retireCapacityRule(supabase, {
                orgId: ctx.orgId,
                id: String(body.id ?? ""),
                effectiveEnd: String(body.effective_end ?? ""),
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ rule }, { status: 200 });
        }

        if (action === "void") {
            const result = await voidScheduledCapacityRule(supabase, {
                orgId: ctx.orgId,
                id: String(body.id ?? ""),
                todayYmd,
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 200 });
        }

        /*
         * ORDINARY CAPACITY, AUTHORED ON THE OBJECT.
         *
         * One typed number from a Classroom or Physical space editor. The kind
         * is derived from the object's role and the lifecycle operation is
         * chosen by a pure planner, so this action adds a doorway rather than a
         * second capacity authority — every write still lands through the same
         * create / version / retire entry points used above.
         */
        if (action === "set_object_capacity") {
            const roomLocationId = String(body.room_location_id ?? "").trim();
            if (!roomLocationId) {
                return NextResponse.json(
                    { error: "room_location_id is required", code: "invalid_input" },
                    { status: 400 },
                );
            }
            const rawCapacity = body.capacity;
            const capacity =
                rawCapacity == null || String(rawCapacity).trim() === "" ? null : Number(rawCapacity);
            if (capacity != null && (!Number.isInteger(capacity) || capacity < 0)) {
                return NextResponse.json(
                    { error: "Capacity must be a whole number of children.", code: "invalid_input" },
                    { status: 400 },
                );
            }
            const role = body.unit_role != null ? (String(body.unit_role) as CanonicalUnitRole) : null;
            const rules = await listCapacityRules(supabase, ctx.orgId);
            const result = await setObjectCapacity(supabase, {
                orgId: ctx.orgId,
                roomLocationId,
                role,
                capacity,
                // The organization's calendar day, not the server's UTC date.
                todayYmd,
                rules,
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 200 });
        }

        return NextResponse.json(
            { error: `Unknown action: ${action || "(missing)"}`, code: "invalid_input" },
            { status: 400 },
        );
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
