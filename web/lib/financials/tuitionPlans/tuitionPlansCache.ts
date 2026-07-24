/**
 * Client cache for Tuition Plans collection snapshot.
 */

import type { ProgramOffering } from "@/lib/programs/programOfferings";
import type { ProgramOfferingVariant } from "@/lib/programs/programOfferingVariants";
import type { TuitionRateRow } from "@/lib/commercial/tuitionRates";
import type { BillingCadence } from "@/lib/commercial/billingCadences";

export const TUITION_PLANS_TTL_MS = 60_000;

export type TuitionPlansSnapshot = {
    orgId: string;
    fetchedAtMs: number;
    offerings: ProgramOffering[];
    variants: ProgramOfferingVariant[];
    rates: TuitionRateRow[];
    locations: { id: string; name: string; isActive?: boolean }[];
    programs: { key: string; label: string; siteCount: number }[];
    cadences: BillingCadence[];
    revenueCategories: { id: string; label: string; mapped_gl_account_id?: string | null }[];
};

const cache = new Map<string, TuitionPlansSnapshot>();
const inflight = new Map<string, Promise<TuitionPlansSnapshot>>();

function key(orgId: string): string {
    return `tuition-plans:v2:${orgId.trim()}`;
}

export function peekTuitionPlans(orgId: string): TuitionPlansSnapshot | null {
    const id = orgId.trim();
    if (!id) return null;
    return cache.get(key(id)) ?? null;
}

export function invalidateTuitionPlans(orgId: string): void {
    const id = orgId.trim();
    if (!id) return;
    cache.delete(key(id));
    inflight.delete(key(id));
}

async function fetchSnapshot(orgId: string): Promise<TuitionPlansSnapshot> {
    const res = await fetch("/api/admin/financials/tuition-plans", { credentials: "include" });
    if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "Could not load tuition plans.");
    }
    const json = (await res.json()) as {
        offerings?: ProgramOffering[];
        variants?: ProgramOfferingVariant[];
        rates?: TuitionRateRow[];
        locations?: { id: string; name: string; isActive?: boolean }[];
        programs?: { key: string; label: string; siteCount: number }[];
        cadences?: BillingCadence[];
        revenue_categories?: { id: string; label: string; mapped_gl_account_id?: string | null }[];
    };

    return {
        orgId,
        fetchedAtMs: Date.now(),
        offerings: json.offerings ?? [],
        variants: json.variants ?? [],
        rates: json.rates ?? [],
        locations: json.locations ?? [],
        programs: json.programs ?? [],
        cadences: json.cadences ?? [],
        revenueCategories: json.revenue_categories ?? [],
    };
}

export async function loadTuitionPlans(
    orgId: string,
    options?: { force?: boolean },
): Promise<TuitionPlansSnapshot> {
    const id = orgId.trim();
    if (!id) throw new Error("orgId is required");
    const cacheKey = key(id);
    const existing = cache.get(cacheKey) ?? null;
    if (!options?.force && existing && Date.now() - existing.fetchedAtMs <= TUITION_PLANS_TTL_MS) {
        return existing;
    }
    const pending = inflight.get(cacheKey);
    if (pending && !options?.force) return pending;

    const promise = fetchSnapshot(id)
        .then((snapshot) => {
            cache.set(cacheKey, snapshot);
            inflight.delete(cacheKey);
            return snapshot;
        })
        .catch((error) => {
            inflight.delete(cacheKey);
            throw error;
        });
    inflight.set(cacheKey, promise);
    return promise;
}
