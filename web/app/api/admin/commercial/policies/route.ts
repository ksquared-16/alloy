import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    COMMERCIAL_POLICY_TYPES,
    isCommercialPolicyType,
    validateCommercialPolicyValue,
    type CommercialPolicyType,
} from "@/lib/commercial/execution/policy/policyTypes";
import { operatorFriendlyCommercialError } from "@/lib/commercial/operatorFriendlyCommercialError";

/**
 * Commercial Policies CRUD — operator authoring for the Commercial-owned
 * `commercial_policies` table (Phase 5 backend). Org-scoped, service-role client
 * (RLS is defense-in-depth). Resolution-time policy types only; value is validated
 * against the Commercial Policy Registry. No Billing, no posting.
 */

export const SELECT_COLS =
    "id, org_id, scope_type, location_id, program_key, offering_id, variant_id, policy_type, label, description, value, effective_start, effective_end, is_active, metadata, created_at, updated_at";

export type CommercialPolicyApiRow = {
    id: string;
    org_id: string;
    scope_type: string;
    location_id: string | null;
    program_key: string | null;
    offering_id: string | null;
    variant_id: string | null;
    policy_type: CommercialPolicyType;
    label: string | null;
    description: string | null;
    value: Record<string, unknown>;
    effective_start: string | null;
    effective_end: string | null;
    is_active: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

const SCOPE_TYPES = ["org", "location", "program", "offering", "variant"] as const;

export function mapPolicyRow(r: Record<string, unknown>): CommercialPolicyApiRow {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        scope_type: String(r.scope_type ?? "org"),
        location_id: (r.location_id as string | null | undefined) ?? null,
        program_key: (r.program_key as string | null | undefined) ?? null,
        offering_id: (r.offering_id as string | null | undefined) ?? null,
        variant_id: (r.variant_id as string | null | undefined) ?? null,
        policy_type: (r.policy_type as CommercialPolicyType) ?? "discount",
        label: (r.label as string | null | undefined) ?? null,
        description: (r.description as string | null | undefined) ?? null,
        value: r.value != null && typeof r.value === "object" && !Array.isArray(r.value) ? (r.value as Record<string, unknown>) : {},
        effective_start: (r.effective_start as string | null | undefined) ?? null,
        effective_end: (r.effective_end as string | null | undefined) ?? null,
        is_active: r.is_active !== false,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null | undefined) ?? null,
    };
}

/** Build + validate the scope columns from a request body. */
export function resolveScopeColumns(body: Record<string, unknown>):
    | { ok: true; cols: { scope_type: string; location_id: string | null; program_key: string | null; offering_id: string | null; variant_id: string | null } }
    | { ok: false; error: string } {
    const scopeType = String(body.scope_type ?? "org").trim();
    if (!(SCOPE_TYPES as readonly string[]).includes(scopeType)) return { ok: false, error: "invalid scope_type" };
    const cols = {
        scope_type: scopeType,
        location_id: scopeType === "location" ? (String(body.location_id ?? "").trim() || null) : null,
        program_key: scopeType === "program" ? (String(body.program_key ?? "").trim() || null) : null,
        offering_id: scopeType === "offering" ? (String(body.offering_id ?? "").trim() || null) : null,
        variant_id: scopeType === "variant" ? (String(body.variant_id ?? "").trim() || null) : null,
    };
    if (scopeType === "location" && !cols.location_id) return { ok: false, error: "location is required for a location-scoped policy" };
    if (scopeType === "program" && !cols.program_key) return { ok: false, error: "program is required for a program-scoped policy" };
    if (scopeType === "offering" && !cols.offering_id) return { ok: false, error: "offering is required for an offering-scoped policy" };
    if (scopeType === "variant" && !cols.variant_id) return { ok: false, error: "variant is required for a variant-scoped policy" };
    return { ok: true, cols };
}

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("include_inactive") === "true";
    const type = (searchParams.get("policy_type") ?? "").trim();

    const supabase = createAdminClient();
    let q = supabase.from("commercial_policies").select(SELECT_COLS).eq("org_id", ctx.orgId).order("policy_type").order("created_at", { ascending: false });
    if (!includeInactive) q = q.eq("is_active", true);
    if (type && isCommercialPolicyType(type)) q = q.eq("policy_type", type);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ policies: (data ?? []).map((r: Record<string, unknown>) => mapPolicyRow(r)), types: COMMERCIAL_POLICY_TYPES });
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: Record<string, unknown> = {};
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const policyType = String(body.policy_type ?? "").trim();
    if (!isCommercialPolicyType(policyType)) return NextResponse.json({ error: "invalid policy_type" }, { status: 400 });

    const scope = resolveScopeColumns(body);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: 400 });

    const rawValue = body.value != null && typeof body.value === "object" && !Array.isArray(body.value) ? (body.value as Record<string, unknown>) : {};
    const validated = validateCommercialPolicyValue(policyType, rawValue);
    if (!validated.ok) return NextResponse.json({ error: validated.error.message, field: validated.error.field }, { status: 400 });

    const effStart = String(body.effective_start ?? "").trim() || null;
    const effEnd = String(body.effective_end ?? "").trim() || null;
    if (effStart && effEnd && effEnd < effStart) return NextResponse.json({ error: "end date must be on or after the start date" }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("commercial_policies")
        .insert({
            org_id: ctx.orgId,
            ...scope.cols,
            policy_type: policyType,
            label: body.label != null ? String(body.label).trim() || null : null,
            description: body.description != null ? String(body.description).trim() || null : null,
            value: validated.value,
            effective_start: effStart ?? "2000-01-01",
            effective_end: effEnd,
            is_active: body.is_active !== false,
            metadata:
                body.metadata != null && typeof body.metadata === "object" && !Array.isArray(body.metadata)
                    ? (body.metadata as Record<string, unknown>)
                    : {},
        })
        .select(SELECT_COLS)
        .single();

    if (error) {
        return NextResponse.json(
            { error: operatorFriendlyCommercialError(error.message, "Could not create policy.") },
            { status: error.code === "23505" ? 409 : 400 },
        );
    }
    return NextResponse.json({ policy: mapPolicyRow(data as Record<string, unknown>) }, { status: 201 });
}
