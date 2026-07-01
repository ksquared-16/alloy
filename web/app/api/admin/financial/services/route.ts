import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createFinancialService,
    listFinancialServices,
    setFinancialServiceActive,
    updateFinancialService,
    type FinancialServiceInput,
} from "@/lib/financials/services/financialServicesStore";
import { SERVICE_CAPABILITIES, type ServiceCapabilityMap } from "@/lib/financials/services/serviceCapabilities";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";

/** Pull switchboard / revenue / program fields off the request body (operator-facing keys). */
function metadataFromBody(body: Record<string, unknown>): Pick<FinancialServiceInput, "capabilities" | "defaultChargeCategory" | "programs"> {
    const out: Pick<FinancialServiceInput, "capabilities" | "defaultChargeCategory" | "programs"> = {};
    if (body.capabilities && typeof body.capabilities === "object") {
        const src = body.capabilities as Record<string, unknown>;
        const caps: Partial<ServiceCapabilityMap> = {};
        for (const c of SERVICE_CAPABILITIES) if (typeof src[c] === "boolean") caps[c] = src[c] as boolean;
        out.capabilities = caps;
    }
    if (body.default_charge_category !== undefined) {
        out.defaultChargeCategory = body.default_charge_category != null ? String(body.default_charge_category) : null;
    }
    if (Array.isArray(body.programs)) {
        out.programs = (body.programs as unknown[]).filter((x): x is string => typeof x === "string");
    }
    return out;
}

/**
 * Financial Services catalog (Financial Configuration Convergence). What the
 * organization sells. GET lists; role-gated POST dispatches by `action`:
 * create | update | set_active. Persisted in org_settings.metadata.financials
 * (no new table). No posting/payments/charges.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    try {
        const services = await listFinancialServices(supabase, ctx.orgId);
        return NextResponse.json({ services });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
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
        if (action === "create") {
            const service = await createFinancialService(
                supabase,
                ctx.orgId,
                {
                    label: String(body.label ?? ""),
                    key: body.key != null ? String(body.key) : null,
                    serviceType: String(body.service_type ?? ""),
                    unit: body.unit != null ? String(body.unit) : null,
                    description: body.description != null ? String(body.description) : null,
                    ...metadataFromBody(body),
                },
                ctx.userId,
            );
            return NextResponse.json({ service }, { status: 201 });
        }

        if (action === "update") {
            const service = await updateFinancialService(
                supabase,
                ctx.orgId,
                {
                    id: String(body.id ?? ""),
                    label: String(body.label ?? ""),
                    key: body.key != null ? String(body.key) : null,
                    serviceType: String(body.service_type ?? ""),
                    unit: body.unit != null ? String(body.unit) : null,
                    description: body.description != null ? String(body.description) : null,
                    sortOrder: body.sort_order != null ? Number(body.sort_order) : null,
                    ...metadataFromBody(body),
                },
                ctx.userId,
            );
            return NextResponse.json({ service }, { status: 200 });
        }

        if (action === "set_active") {
            const service = await setFinancialServiceActive(
                supabase,
                ctx.orgId,
                String(body.id ?? ""),
                body.is_active !== false,
                ctx.userId,
            );
            return NextResponse.json({ service }, { status: 200 });
        }

        return NextResponse.json(
            { error: `Unknown action: ${action || "(missing)"}`, code: "invalid_input" },
            { status: 400 },
        );
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
