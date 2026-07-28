import type { SupabaseClient } from "@supabase/supabase-js";
import {
    DEFAULT_DAYS_PER_WEEK_FACTORS,
    WEIGHTING_META_KEY,
    defaultFteWeightingSummary,
    slugifyWeightingKey,
    type OrganizationWeighting,
    type WeightingLifecycle,
    type WeightingSchemeId,
    type WeightingVersion,
} from "@/lib/organizationWeightings/types";
import {
    loadOrgMetadata,
    saveOrgMetadata,
} from "@/lib/organizationPopulations/persist";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function newId(prefix: string): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ?
            crypto.randomUUID()
        :   `${prefix}-${Date.now()}`;
}

function parseFactors(raw: unknown): Record<string, number> {
    if (!isRecord(raw)) return { ...DEFAULT_DAYS_PER_WEEK_FACTORS };
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : { ...DEFAULT_DAYS_PER_WEEK_FACTORS };
}

function parseVersion(raw: unknown): WeightingVersion | null {
    if (!isRecord(raw) || typeof raw.id !== "string") return null;
    const scheme = raw.scheme;
    if (scheme !== "unweighted" && scheme !== "days_per_week") return null;
    return {
        id: raw.id,
        version_number: typeof raw.version_number === "number" ? raw.version_number : 1,
        immutable: Boolean(raw.immutable),
        scheme,
        factors: scheme === "unweighted" ? { "1": 1 } : parseFactors(raw.factors),
        full_time_days:
            typeof raw.full_time_days === "number" && raw.full_time_days > 0 ? raw.full_time_days : 5,
        summary:
            typeof raw.summary === "string" ? raw.summary
            : scheme === "unweighted" ? "Each member counts as 1"
            : defaultFteWeightingSummary(),
        published_at: typeof raw.published_at === "string" ? raw.published_at : null,
        created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    };
}

export function parseOrganizationWeightings(metadata: unknown): OrganizationWeighting[] {
    if (!isRecord(metadata) || !Array.isArray(metadata[WEIGHTING_META_KEY])) return [];
    const out: OrganizationWeighting[] = [];
    for (const raw of metadata[WEIGHTING_META_KEY]) {
        if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") continue;
        const lifecycle = raw.lifecycle;
        if (lifecycle !== "draft" && lifecycle !== "published" && lifecycle !== "archived") continue;
        const versions = Array.isArray(raw.versions) ?
                raw.versions.map(parseVersion).filter((v): v is WeightingVersion => v != null)
            :   [];
        out.push({
            id: raw.id,
            key: typeof raw.key === "string" ? raw.key : slugifyWeightingKey(raw.name),
            name: raw.name,
            description: typeof raw.description === "string" ? raw.description : null,
            lifecycle,
            published_version_id:
                typeof raw.published_version_id === "string" ? raw.published_version_id : null,
            versions,
            created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
            updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
            created_by: typeof raw.created_by === "string" ? raw.created_by : null,
        });
    }
    return out;
}

export function writeOrganizationWeightings(
    metadata: Record<string, unknown>,
    weightings: OrganizationWeighting[],
): Record<string, unknown> {
    return { ...metadata, [WEIGHTING_META_KEY]: weightings };
}

export function findWeightingVersion(
    weightings: OrganizationWeighting[],
    versionId: string,
): { weighting: OrganizationWeighting; version: WeightingVersion } | null {
    for (const w of weightings) {
        const version = w.versions.find((v) => v.id === versionId);
        if (version) return { weighting: w, version };
    }
    return null;
}

export async function listOrganizationWeightings(
    supabase: SupabaseClient,
    orgId: string,
): Promise<OrganizationWeighting[]> {
    return parseOrganizationWeightings(await loadOrgMetadata(supabase, orgId));
}

export async function createOrganizationWeightingDraft(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        userId: string | null;
        name: string;
        description?: string | null;
        scheme?: WeightingSchemeId;
        factors?: Record<string, number>;
        fullTimeDays?: number;
    },
): Promise<OrganizationWeighting> {
    const now = new Date().toISOString();
    const scheme = args.scheme ?? "days_per_week";
    const version: WeightingVersion = {
        id: newId("wgt-v"),
        version_number: 1,
        immutable: false,
        scheme,
        factors:
            scheme === "unweighted" ? { "1": 1 }
            : args.factors ?? { ...DEFAULT_DAYS_PER_WEEK_FACTORS },
        full_time_days: args.fullTimeDays ?? 5,
        summary:
            scheme === "unweighted" ? "Each member counts as 1" : defaultFteWeightingSummary(),
        published_at: null,
        created_at: now,
    };
    const weighting: OrganizationWeighting = {
        id: newId("wgt"),
        key: slugifyWeightingKey(args.name),
        name: args.name.trim(),
        description: args.description?.trim() || null,
        lifecycle: "draft",
        published_version_id: null,
        versions: [version],
        created_at: now,
        updated_at: now,
        created_by: args.userId,
    };
    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const existing = parseOrganizationWeightings(metadata);
    await saveOrgMetadata(supabase, args.orgId, writeOrganizationWeightings(metadata, [...existing, weighting]));
    return weighting;
}

export async function publishOrganizationWeighting(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null; id: string },
): Promise<OrganizationWeighting> {
    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const list = parseOrganizationWeightings(metadata);
    const idx = list.findIndex((w) => w.id === args.id);
    if (idx < 0) throw new Error("Weighting not found");
    const weighting = list[idx]!;
    if (weighting.lifecycle === "archived") throw new Error("Cannot publish archived weighting");
    const draft = weighting.versions.find((v) => !v.immutable);
    if (!draft) throw new Error("No draft version to publish");
    const now = new Date().toISOString();
    const published: WeightingVersion = { ...draft, immutable: true, published_at: now };
    const next: OrganizationWeighting = {
        ...weighting,
        lifecycle: "published",
        published_version_id: published.id,
        versions: weighting.versions.map((v) => (v.id === draft.id ? published : v)),
        updated_at: now,
    };
    const out = [...list];
    out[idx] = next;
    await saveOrgMetadata(supabase, args.orgId, writeOrganizationWeightings(metadata, out));
    return next;
}

export async function ensureDefaultUnweightedWeighting(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null },
): Promise<{ weighting: OrganizationWeighting; version: WeightingVersion }> {
    const list = await listOrganizationWeightings(supabase, args.orgId);
    const existing = list.find((w) => w.key === "count_each_as_one" || w.name === "Count each as one");
    if (existing?.published_version_id) {
        const version = existing.versions.find((v) => v.id === existing.published_version_id);
        if (version) return { weighting: existing, version };
    }
    let weighting =
        existing ??
        (await createOrganizationWeightingDraft(supabase, {
            orgId: args.orgId,
            userId: args.userId,
            name: "Count each as one",
            description: "Unweighted headcount — each matching member contributes 1.",
            scheme: "unweighted",
        }));
    if (!weighting.published_version_id) {
        weighting = await publishOrganizationWeighting(supabase, {
            orgId: args.orgId,
            userId: args.userId,
            id: weighting.id,
        });
    }
    const version = weighting.versions.find((v) => v.id === weighting.published_version_id)!;
    return { weighting, version };
}

export async function ensureDefaultFteWeighting(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null },
): Promise<{ weighting: OrganizationWeighting; version: WeightingVersion }> {
    const list = await listOrganizationWeightings(supabase, args.orgId);
    const existing = list.find(
        (w) => w.key === "full_time_equivalents" || w.name === "Full-time equivalents",
    );
    if (existing?.published_version_id) {
        const version = existing.versions.find((v) => v.id === existing.published_version_id);
        if (version) return { weighting: existing, version };
    }
    let weighting =
        existing ??
        (await createOrganizationWeightingDraft(supabase, {
            orgId: args.orgId,
            userId: args.userId,
            name: "Full-time equivalents",
            description: defaultFteWeightingSummary(),
            scheme: "days_per_week",
            factors: { ...DEFAULT_DAYS_PER_WEEK_FACTORS },
            fullTimeDays: 5,
        }));
    if (!weighting.published_version_id) {
        weighting = await publishOrganizationWeighting(supabase, {
            orgId: args.orgId,
            userId: args.userId,
            id: weighting.id,
        });
    }
    const version = weighting.versions.find((v) => v.id === weighting.published_version_id)!;
    return { weighting, version };
}

export type { WeightingLifecycle };
