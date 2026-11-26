import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createRatioRule,
    createRatioRuleVersion,
    retireRatioRule,
    voidScheduledRatioRule,
    type RatioTierInput,
} from "@/lib/childcareOperational/config/configRuleAuthoringService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";
import { setObjectRatio } from "@/lib/childcareOperational/config/objectRatioService";
import {
    listRatioRules,
    listRatioRuleTiers,
} from "@/lib/childcareOperational/config/childcareConfigRuleService";
import { validateRatioTiers, type RatioTierValue } from "@/lib/locations/objectRatio";

/**
 * Versioned authoring for childcare ratio rules + tiers (Operational
 * Configuration V1, Phase 3). Tiers version WITH the parent rule: a create or a
 * new version carries its own tier set. Role-gated POST dispatching by `action`:
 * create | version | retire | void. L1 configuration only.
 */
function parseTiers(value: unknown): RatioTierInput[] {
    if (!Array.isArray(value)) return [];
    return value.map((t) => {
        const tier = parseJsonObject(t);
        return {
            maxChildren: Number(tier.max_children),
            requiredStaff: Number(tier.required_staff),
            sortOrder: tier.sort_order != null ? Number(tier.sort_order) : undefined,
        };
    });
}

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
            const result = await createRatioRule(supabase, {
                orgId: ctx.orgId,
                scopeType: String(body.scope_type ?? ""),
                siteLocationId: body.site_location_id != null ? String(body.site_location_id) : null,
                programCategoryId: body.program_category_id != null ? String(body.program_category_id) : null,
                roomLocationId: body.room_location_id != null ? String(body.room_location_id) : null,
                ageGroupKey: body.age_group_key != null ? String(body.age_group_key) : null,
                jurisdictionKey: body.jurisdiction_key != null ? String(body.jurisdiction_key) : null,
                tiers: parseTiers(body.tiers),
                effectiveStart: String(body.effective_start ?? ""),
                effectiveEnd: body.effective_end != null ? String(body.effective_end) : null,
                metadata: parseJsonObject(body.metadata),
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (action === "version") {
            const tiers = body.tiers !== undefined ? parseTiers(body.tiers) : undefined;
            const result = await createRatioRuleVersion(supabase, {
                orgId: ctx.orgId,
                priorId: String(body.prior_id ?? ""),
                effectiveStart: String(body.effective_start ?? ""),
                jurisdictionKey:
                    body.jurisdiction_key !== undefined
                        ? body.jurisdiction_key != null
                            ? String(body.jurisdiction_key)
                            : null
                        : undefined,
                tiers: tiers && tiers.length > 0 ? tiers : undefined,
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (action === "retire") {
            const rule = await retireRatioRule(supabase, {
                orgId: ctx.orgId,
                id: String(body.id ?? ""),
                effectiveEnd: String(body.effective_end ?? ""),
                actorUserId: ctx.userId,
            });
            return NextResponse.json({ rule }, { status: 200 });
        }

        if (action === "void") {
            const result = await voidScheduledRatioRule(supabase, {
                orgId: ctx.orgId,
                id: String(body.id ?? ""),
                todayYmd,
                actorUserId: ctx.userId,
            });
            return NextResponse.json(result, { status: 200 });
        }

        /*
         * ORDINARY STAFFING RATIO, AUTHORED ON THE OPERATIONAL SPACE.
         *
         * The operator sends tiers in their own grammar — one staff for up to
         * five children is `{ requiredStaff: 1, maxChildren: 5 }` — and a pure
         * planner decides whether that is a create, a new version, a same-day
         * replacement or a retirement. A doorway onto the same authoring
         * service, never a second ratio authority.
         */
        if (action === "set_object_ratio") {
            const roomLocationId = String(body.room_location_id ?? "").trim();
            if (!roomLocationId) {
                return NextResponse.json(
                    { error: "room_location_id is required", code: "invalid_input" },
                    { status: 400 },
                );
            }
            const rawTiers = Array.isArray(body.tiers) ? body.tiers : [];
            const parsed: RatioTierValue[] = rawTiers.map((t) => {
                const tier = (t ?? {}) as Record<string, unknown>;
                return {
                    requiredStaff: Number(tier.requiredStaff ?? tier.required_staff),
                    maxChildren: Number(tier.maxChildren ?? tier.max_children),
                };
            });
            const check = validateRatioTiers(parsed);
            if (!check.ok) {
                return NextResponse.json({ error: check.message, code: "invalid_input" }, { status: 400 });
            }
            const [rules, tierRows] = await Promise.all([
                listRatioRules(supabase, ctx.orgId),
                listRatioRuleTiers(supabase, ctx.orgId),
            ]);
            const result = await setObjectRatio(supabase, {
                orgId: ctx.orgId,
                roomLocationId,
                tiers: check.tiers,
                todayYmd,
                rules,
                tierRows,
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
