/**
 * Warm cache for Programs workspace chapters (Tuition / Catalog / …).
 * Inflight reuse + short TTL so Continuity soft-nav feels like Locations.
 */

import { fetchLocationProgramCategories } from "@/lib/admin/location/fetchLocationProgramCategories";

export const PROGRAMS_CHAPTER_CONTEXT_TTL_MS = 60_000;

export type ProgramsChapterContextSnapshot = {
    orgId: string;
    fetchedAtMs: number;
    locations: { id: string; name: string }[];
    programs: { key: string; label: string; siteCount: number }[];
    products: unknown[];
    categories: unknown[];
    revenueCategories: unknown[];
    cadences: unknown[];
};

const cache = new Map<string, ProgramsChapterContextSnapshot>();
const inflight = new Map<string, Promise<ProgramsChapterContextSnapshot>>();

function key(orgId: string): string {
    return `programs-chapter-context:v1:${orgId.trim()}`;
}

export function peekProgramsChapterContext(orgId: string): ProgramsChapterContextSnapshot | null {
    const id = orgId.trim();
    if (!id) return null;
    return cache.get(key(id)) ?? null;
}

export function isProgramsChapterContextFresh(
    snapshot: ProgramsChapterContextSnapshot | null,
    nowMs = Date.now(),
): boolean {
    if (!snapshot) return false;
    return nowMs - snapshot.fetchedAtMs <= PROGRAMS_CHAPTER_CONTEXT_TTL_MS;
}

async function fetchNetwork(orgId: string): Promise<ProgramsChapterContextSnapshot> {
    const [locRes, catRes, productsRes, catsRes, revRes, cadenceRes] = await Promise.all([
        fetch("/api/admin/locations", { credentials: "include" }),
        // Through the shared loader, not a raw fetch: the placement cascade requests this same
        // URL on every organization page and the two were duplicating it.
        fetchLocationProgramCategories(undefined, { includeInactive: true })
            .then((rows) => ({ ok: true, json: async () => ({ categories: rows }) }) as unknown as Response)
            .catch(() => ({ ok: false, json: async () => ({}) }) as unknown as Response),
        fetch("/api/admin/commercial/products", { credentials: "include" }),
        fetch("/api/admin/commercial/categories?include_inactive=true", { credentials: "include" }),
        fetch("/api/admin/commercial/revenue-categories", { credentials: "include" }),
        fetch("/api/admin/commercial/billing-cadences", { credentials: "include" }),
    ]);

    const locJson = (await locRes.json().catch(() => ({}))) as {
        locations?: Record<string, unknown>[];
    };
    const catJson = (await catRes.json().catch(() => ({}))) as {
        categories?: { key: string; label: string; is_active?: boolean }[];
    };
    const productsJson = (await productsRes.json().catch(() => ({}))) as { products?: unknown[] };
    const catsJson = (await catsRes.json().catch(() => ({}))) as { categories?: unknown[] };
    const revJson = (await revRes.json().catch(() => ({}))) as { revenue_categories?: unknown[] };
    const cadenceJson = (await cadenceRes.json().catch(() => ({}))) as { cadences?: unknown[] };

    const locations = (locJson.locations ?? [])
        .filter((row) => String(row.location_type ?? "") === "site")
        .map((row) => ({
            id: String(row.id ?? ""),
            name: String(row.name ?? row.label ?? "Unnamed site"),
        }))
        .filter((row) => row.id);

    const byKey = new Map<string, { label: string; siteCount: number }>();
    for (const row of catJson.categories ?? []) {
        if (!byKey.has(row.key)) byKey.set(row.key, { label: row.label, siteCount: 0 });
        if (row.is_active !== false) byKey.get(row.key)!.siteCount += 1;
    }
    const programs = Array.from(byKey.entries()).map(([programKey, value]) => ({
        key: programKey,
        label: value.label,
        siteCount: value.siteCount,
    }));

    return {
        orgId,
        fetchedAtMs: Date.now(),
        locations,
        programs,
        products: productsJson.products ?? [],
        categories: catsJson.categories ?? [],
        revenueCategories: revJson.revenue_categories ?? [],
        cadences: cadenceJson.cadences ?? [],
    };
}

export async function loadProgramsChapterContext(
    orgId: string,
    options?: { force?: boolean },
): Promise<ProgramsChapterContextSnapshot> {
    const id = orgId.trim();
    if (!id) throw new Error("orgId is required");

    const cacheKey = key(id);
    const existing = cache.get(cacheKey) ?? null;
    if (!options?.force && isProgramsChapterContextFresh(existing)) return existing!;

    const joined = inflight.get(cacheKey);
    if (joined) return joined;

    const promise = fetchNetwork(id)
        .then((snapshot) => {
            cache.set(cacheKey, snapshot);
            return snapshot;
        })
        .finally(() => {
            if (inflight.get(cacheKey) === promise) inflight.delete(cacheKey);
        });
    inflight.set(cacheKey, promise);
    return promise;
}

export function resetProgramsChapterContextForTests(): void {
    cache.clear();
    inflight.clear();
}
