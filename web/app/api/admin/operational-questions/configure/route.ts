import { NextRequest, NextResponse } from "next/server";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    EQUIVALENT_CHILD_COUNT_QUESTION_KEY,
    FUTURE_ROOM_CAPACITY_QUESTION_KEY,
    ROOM_UTILIZATION_FTE_QUESTION_KEY,
    ROOM_UTILIZATION_QUESTION_KEY,
    isOperationalQuestionKey,
} from "@/lib/operationalQuestions/catalog";
import { configureFutureRoomCapacityMeasurement } from "@/lib/operationalQuestions/configureFutureRoomCapacity";
import { configureRoomUtilizationMeasurement } from "@/lib/operationalQuestions/configureRoomUtilization";
import {
    configureEquivalentChildCountMeasurement,
    configureRoomUtilizationFteMeasurement,
} from "@/lib/operationalQuestions/configurePopulationQuestions";
import type { OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export async function POST(req: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Expected object body" }, { status: 400 });

    const questionKeyRaw =
        typeof body.question_key === "string" ? body.question_key.trim() : FUTURE_ROOM_CAPACITY_QUESTION_KEY;
    if (!isOperationalQuestionKey(questionKeyRaw)) {
        return NextResponse.json({ error: "Unknown question_key" }, { status: 400 });
    }
    const entryPoint = body.entry_point === "bos" ? "bos" : "ui";

    try {
        const supabase = createAdminClient();

        if (questionKeyRaw === ROOM_UTILIZATION_QUESTION_KEY) {
            const countingMode =
                body.counting_mode === "fte" || body.countingMode === "fte" ? "fte" : "headcount";
            const result = await configureRoomUtilizationMeasurement(supabase, {
                orgId: ctx.orgId,
                userId: ctx.userId,
                name: typeof body.name === "string" ? body.name : "Room Utilization",
                targetMinPct:
                    typeof body.target_min_pct === "number" ? body.target_min_pct
                    : typeof body.target_min_pct === "string" && body.target_min_pct.trim() ?
                        Number(body.target_min_pct)
                    :   null,
                targetMaxPct:
                    typeof body.target_max_pct === "number" ? body.target_max_pct
                    : typeof body.target_max_pct === "string" && body.target_max_pct.trim() ?
                        Number(body.target_max_pct)
                    :   null,
                entryPoint,
                reuseExisting: body.reuse_existing !== false,
                countingMode,
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (questionKeyRaw === ROOM_UTILIZATION_FTE_QUESTION_KEY) {
            const result = await configureRoomUtilizationFteMeasurement(supabase, {
                orgId: ctx.orgId,
                userId: ctx.userId,
                name: typeof body.name === "string" ? body.name : "Room Utilization (FTE)",
                targetMinPct:
                    typeof body.target_min_pct === "number" ? body.target_min_pct
                    : typeof body.target_min_pct === "string" && body.target_min_pct.trim() ?
                        Number(body.target_min_pct)
                    :   75,
                targetMaxPct:
                    typeof body.target_max_pct === "number" ? body.target_max_pct
                    : typeof body.target_max_pct === "string" && body.target_max_pct.trim() ?
                        Number(body.target_max_pct)
                    :   95,
                entryPoint,
                reuseExisting: body.reuse_existing !== false,
            });
            return NextResponse.json(result, { status: 201 });
        }

        if (questionKeyRaw === EQUIVALENT_CHILD_COUNT_QUESTION_KEY) {
            const result = await configureEquivalentChildCountMeasurement(supabase, {
                orgId: ctx.orgId,
                userId: ctx.userId,
                name: typeof body.name === "string" ? body.name : "Equivalent Child Count",
                useFteWeighting: body.use_fte_weighting !== false,
                targetMin:
                    typeof body.target_min_seats === "number" ? body.target_min_seats
                    : typeof body.target_min_seats === "string" && body.target_min_seats.trim() ?
                        Number(body.target_min_seats)
                    :   null,
                entryPoint,
                reuseExisting: body.reuse_existing !== false,
            });
            return NextResponse.json(result, { status: 201 });
        }

        const productTypeId = (
            typeof body.product_type_id === "string" ? body.product_type_id : "capacity_lowest_physical_licensed"
        ) as OrgCalcProductTypeId;
        const result = await configureFutureRoomCapacityMeasurement(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            name: typeof body.name === "string" ? body.name : "Future Room Capacity",
            productTypeId,
            targetMinSeats:
                typeof body.target_min_seats === "number" ? body.target_min_seats
                : typeof body.target_min_seats === "string" && body.target_min_seats.trim() ?
                    Number(body.target_min_seats)
                :   null,
            entryPoint,
            reuseExisting: body.reuse_existing !== false,
        });
        return NextResponse.json(result, { status: 201 });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Configure failed" },
            { status: 500 },
        );
    }
}
