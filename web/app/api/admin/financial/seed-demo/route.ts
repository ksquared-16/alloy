import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { computePriorRowCloseDate } from "@/lib/childcareOperational/effectiveDating";
import { buildFinancialConfigDemoDataset } from "@/lib/financials/demo/financialConfigDemoDataset";
import {
    createFinancialService,
    listFinancialServices,
} from "@/lib/financials/services/financialServicesStore";

/**
 * Idempotent demo-data seed for the Financials configuration screens (Financial
 * Configuration Convergence). Admin/ops-gated POST that fills the CURRENT org
 * with representative Services, GL accounts/mappings, and multi-version Rate
 * Plans so QA never sees an empty screen. Safe to re-run: every entity is
 * skipped if it already exists. Demo/seed tooling only — not a product write
 * flow; no posting/payments/charges.
 */
async function seedGlAccounts(
    supabase: SupabaseClient,
    orgId: string,
    accounts: { code: string; name: string; type: string; currency: string }[],
): Promise<{ created: number; byCode: Map<string, string> }> {
    const { data: existing } = await supabase.from("gl_accounts").select("id, code").eq("org_id", orgId);
    const byCode = new Map<string, string>();
    for (const a of (existing ?? []) as { id: string; code: string }[]) byCode.set(a.code, a.id);
    let created = 0;
    for (const acct of accounts) {
        if (byCode.has(acct.code)) continue;
        const { data, error } = await supabase
            .from("gl_accounts")
            .insert({ org_id: orgId, code: acct.code, name: acct.name, type: acct.type, currency: acct.currency, metadata: { seed: true } })
            .select("id")
            .single();
        if (error || !data) continue;
        byCode.set(acct.code, (data as { id: string }).id);
        created += 1;
    }
    return { created, byCode };
}

async function seedGlMappings(
    supabase: SupabaseClient,
    orgId: string,
    mappings: { key: string; accountCode: string }[],
    accountByCode: Map<string, string>,
): Promise<number> {
    const { data: existing } = await supabase.from("gl_account_mappings").select("key").eq("org_id", orgId);
    const existingKeys = new Set((existing ?? []).map((m) => (m as { key: string }).key));
    let created = 0;
    for (const m of mappings) {
        if (existingKeys.has(m.key)) continue;
        const accountId = accountByCode.get(m.accountCode);
        if (!accountId) continue;
        const { error } = await supabase
            .from("gl_account_mappings")
            .insert({ org_id: orgId, key: m.key, gl_account_id: accountId, metadata: { seed: true } });
        if (!error) created += 1;
    }
    return created;
}

async function seedRatePlans(
    supabase: SupabaseClient,
    orgId: string,
    plans: ReturnType<typeof buildFinancialConfigDemoDataset>["ratePlans"],
): Promise<{ plans: number; rules: number }> {
    const { data: existing } = await supabase.from("childcare_rate_plans").select("plan_key").eq("org_id", orgId);
    const existingKeys = new Set((existing ?? []).map((p) => (p as { plan_key: string }).plan_key));
    // Resolve Service keys → ids so seeded plans attach to their Service (Commercial Model).
    const { data: svcRows } = await supabase.from("financial_services").select("id, service_key").eq("org_id", orgId);
    const serviceIdByKey = new Map<string, string>(
        ((svcRows ?? []) as { id: string; service_key: string }[]).map((s) => [s.service_key, s.id]),
    );
    let planCount = 0;
    let ruleCount = 0;

    for (const plan of plans) {
        if (existingKeys.has(plan.planKey)) continue;
        const serviceId = plan.serviceKey ? serviceIdByKey.get(plan.serviceKey) ?? null : null;
        let priorId: string | null = null;
        const versions = [...plan.versions].sort((a, b) => (a.effectiveStart < b.effectiveStart ? -1 : 1));
        for (let i = 0; i < versions.length; i++) {
            const v = versions[i];
            const next = versions[i + 1];
            const effectiveEnd = next ? computePriorRowCloseDate(next.effectiveStart) : null;
            const planRow: Record<string, unknown> = {
                org_id: orgId,
                scope_type: plan.scopeType,
                site_location_id: null,
                program_category_id: null,
                room_location_id: null,
                age_group_key: null,
                plan_key: plan.planKey,
                service_id: serviceId,
                label: plan.label,
                currency_code: plan.currencyCode,
                billing_basis: v.billingBasis,
                calculation_strategy: plan.calculationStrategy,
                is_active: true,
                effective_start: v.effectiveStart,
                effective_end: effectiveEnd,
                source_key: "seed",
                metadata: priorId ? { seed: true, supersedes_id: priorId } : { seed: true },
            };
            const { data: insertedPlan, error: planErr } = await supabase
                .from("childcare_rate_plans")
                .insert(planRow)
                .select("id")
                .single();
            if (planErr || !insertedPlan) break;
            const planId = (insertedPlan as { id: string }).id;
            priorId = planId;
            planCount += 1;

            const ruleRows = v.rules.map((r) => ({
                org_id: orgId,
                rate_plan_id: planId,
                schedule_basis: r.scheduleBasis,
                rate_basis: r.rateBasis,
                age_group_key: r.ageGroupKey ?? null,
                amount_cents: r.amountCents,
                effective_start: v.effectiveStart,
                effective_end: null,
                source_key: "seed",
                metadata: { seed: true },
            }));
            const { error: ruleErr } = await supabase.from("childcare_rate_rules").insert(ruleRows);
            if (!ruleErr) ruleCount += ruleRows.length;
        }
    }
    return { plans: planCount, rules: ruleCount };
}

async function seedChargeTemplates(
    supabase: SupabaseClient,
    orgId: string,
    templates: ReturnType<typeof buildFinancialConfigDemoDataset>["chargeTemplates"],
    today: string,
): Promise<number> {
    const { data: existing } = await supabase.from("financial_charge_templates").select("template_key").eq("org_id", orgId);
    const existingKeys = new Set((existing ?? []).map((t) => (t as { template_key: string }).template_key));
    const { data: svcRows } = await supabase.from("financial_services").select("id, service_key").eq("org_id", orgId);
    const serviceIdByKey = new Map<string, string>(
        ((svcRows ?? []) as { id: string; service_key: string }[]).map((s) => [s.service_key, s.id]),
    );
    const effectiveStart = `${today.slice(0, 4)}-01-01`;
    let created = 0;
    for (const t of templates) {
        if (existingKeys.has(t.templateKey)) continue;
        const { error } = await supabase.from("financial_charge_templates").insert({
            org_id: orgId,
            service_id: t.serviceKey ? serviceIdByKey.get(t.serviceKey) ?? null : null,
            template_key: t.templateKey,
            label: t.label,
            charge_category: t.chargeCategory,
            trigger_type: t.triggerType,
            amount_strategy: t.amountStrategy,
            amount_cents: t.amountStrategy === "fixed" ? t.amountCents ?? 0 : null,
            currency_code: "USD",
            occurs_on_strategy: t.occursOn,
            billable_on_strategy: t.billableOn,
            billable_offset_days: t.billableOn === "offset_days" ? t.billableOffsetDays ?? 0 : null,
            review_required: t.reviewRequired === true,
            is_active: true,
            effective_start: effectiveStart,
            effective_end: null,
            source_key: "seed",
            metadata: { seed: true },
        });
        if (!error) created += 1;
    }
    return created;
}

export async function POST() {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    try {
        const today = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const pivotYear = Number(today.slice(0, 4));
        const dataset = buildFinancialConfigDemoDataset(pivotYear);

        // Services (skip if any already exist).
        const existingServices = await listFinancialServices(supabase, ctx.orgId);
        let servicesCreated = 0;
        if (existingServices.length === 0) {
            for (const s of dataset.services) {
                await createFinancialService(supabase, ctx.orgId, s);
                servicesCreated += 1;
            }
        }

        const gl = await seedGlAccounts(supabase, ctx.orgId, dataset.glAccounts);
        const mappings = await seedGlMappings(supabase, ctx.orgId, dataset.glMappings, gl.byCode);
        const ratePlans = await seedRatePlans(supabase, ctx.orgId, dataset.ratePlans);
        const chargeTemplates = await seedChargeTemplates(supabase, ctx.orgId, dataset.chargeTemplates, today);

        return NextResponse.json({
            seeded: {
                services: servicesCreated,
                glAccounts: gl.created,
                glMappings: mappings,
                ratePlans: ratePlans.plans,
                rateRules: ratePlans.rules,
                chargeTemplates,
            },
            idempotent: true,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Seed failed";
        return NextResponse.json({ error: message, code: "internal_error" }, { status: 500 });
    }
}
