import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readCatalogChargeConfig, resolveCatalogChargeAccount } from "@/lib/financials/catalogCharges/catalogChargeOffer";
import {
    buildAnnualCatalogFeeSchedule,
    isAnnualCatalogFee,
    type AnnualFeeAgreement,
    type AnnualFeeExistingCharge,
    type AnnualFeeItemSchedule,
    type AnnualFeeTerm,
} from "@/lib/financials/catalogRecurring/annualCatalogFeeSchedule";

/**
 * The annual Catalog fee schedule for one organization, read from the database and judged by
 * `buildAnnualCatalogFeeSchedule`. READ ONLY — every call below is a select.
 *
 * Every list read is paged: PostgREST returns at most 1000 rows per request, and a schedule that
 * silently stopped at the 1000th agreement would leave children out of the answer.
 */
const PAGE = 1000;

async function readAll<T>(
    page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
    what: string,
): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await page(from, from + PAGE - 1);
        if (error) throw new Error(`${what}: ${error.message}`);
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < PAGE) return out;
    }
}

/** An `in (…)` read in chunks, so a long id list never becomes an over-long request. */
async function readByIds<T>(
    ids: readonly string[],
    query: (chunk: string[]) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
    what: string,
): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await query(ids.slice(i, i + 200));
        if (error) throw new Error(`${what}: ${error.message}`);
        out.push(...((data ?? []) as T[]));
    }
    return out;
}

export type AnnualCatalogFeeScheduleRead = {
    asOf: string;
    items: AnnualFeeItemSchedule[];
    names: { children: Record<string, string>; households: Record<string, string> };
};

export async function readAnnualCatalogFeeSchedule(
    supabase: SupabaseClient,
    orgId: string,
    asOf: string,
): Promise<AnnualCatalogFeeScheduleRead> {
    const config = await readCatalogChargeConfig(supabase, orgId, asOf);
    const annual = config.products.filter(isAnnualCatalogFee);
    if (annual.length === 0) return { asOf, items: [], names: { children: {}, households: {} } };

    const [agreements, terms, chargeRows] = await Promise.all([
        readAll<AnnualFeeAgreement>(
            (from, to) =>
                supabase
                    .from("child_enrollment_agreements")
                    .select("id, customer_member_id, customer_id, site_location_id, status, start_date, end_date")
                    .eq("org_id", orgId)
                    .order("created_at", { ascending: false })
                    .order("id", { ascending: true })
                    .range(from, to),
            "child_enrollment_agreements",
        ),
        readAll<AnnualFeeTerm>(
            (from, to) =>
                supabase
                    .from("enrollment_pricing_terms")
                    .select("enrollment_agreement_id, program_key, effective_start")
                    .eq("org_id", orgId)
                    .eq("term_kind", "tuition")
                    .is("superseded_at", null)
                    .not("enrollment_agreement_id", "is", null)
                    .order("id", { ascending: true })
                    .range(from, to),
            "enrollment_pricing_terms",
        ),
        readAll<{
            id: string;
            status: string | null;
            service_date: string | null;
            billable_source_type: string | null;
            billable_source_id: string | null;
            product_id: string | null;
            resolution_key: string | null;
        }>(
            (from, to) =>
                supabase
                    .from("charges")
                    .select(
                        "id, status, service_date, billable_source_type, billable_source_id, product_id:metadata->catalog_item->>product_id, resolution_key:metadata->>resolution_key",
                    )
                    .eq("org_id", orgId)
                    .in("metadata->catalog_item->>product_id", annual.map((p) => p.id))
                    .order("id", { ascending: true })
                    .range(from, to),
            "charges",
        ),
    ]);

    const charges: AnnualFeeExistingCharge[] = chargeRows.map((c) => ({
        id: c.id,
        status: c.status,
        service_date: c.service_date,
        billable_source_type: c.billable_source_type,
        billable_source_id: c.billable_source_id,
        product_id: c.product_id,
        /* A household-sourced charge for one child is keyed `…:<customer>:child:<member>`. */
        child_member_id: /:child:([0-9a-f-]{36})$/i.exec(c.resolution_key ?? "")?.[1] ?? null,
    }));

    const items = buildAnnualCatalogFeeSchedule({
        asOf,
        products: annual,
        agreements,
        terms,
        charges,
        accountFor: (product) => {
            const r = resolveCatalogChargeAccount(product, config);
            return r.ok ? { ok: true } : { ok: false, reason: r.reason };
        },
    });

    const childIds = [...new Set(items.flatMap((i) => [...i.recipients, ...i.excluded].map((r) => r.childMemberId)))];
    const householdIds = [...new Set(items.flatMap((i) => i.recipients.map((r) => r.customerId)).filter((v): v is string => Boolean(v)))];
    const [children, households] = await Promise.all([
        readByIds<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null }>(
            childIds,
            (ids) => supabase.from("customer_members").select("id, display_name, first_name, last_name").eq("org_id", orgId).in("id", ids),
            "customer_members",
        ),
        readByIds<{ id: string; name: string | null }>(
            householdIds,
            (ids) => supabase.from("customers").select("id, name").eq("org_id", orgId).in("id", ids),
            "customers",
        ),
    ]);
    return {
        asOf,
        items,
        names: {
            children: Object.fromEntries(
                children.map((c) => [c.id, (c.display_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed child").trim()]),
            ),
            households: Object.fromEntries(households.map((h) => [h.id, (h.name || "Unnamed household").trim()])),
        },
    };
}
