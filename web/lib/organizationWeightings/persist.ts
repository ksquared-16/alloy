import type { SupabaseClient } from "@supabase/supabase-js";
import {
    DEFAULT_CATEGORY_FACTORS,
    DEFAULT_DAYS_PER_WEEK_FACTORS,
    DEFAULT_FULL_TIME_HOURS,
    DEFAULT_SESSION_FACTORS,
    WEIGHTING_META_KEY,
    defaultCategorySummary,
    defaultDaysPerWeekSummary,
    defaultSessionSummary,
    defaultWeeklyHoursSummary,
    slugifyEquivalencyKey,
    type EquivalencySessionBasis,
    type EquivalencyStrategyId,
    type EquivalencyUnmatchedPolicy,
    type EquivalencyVersion,
    type OrganizationEquivalency,
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

const KNOWN_SCHEMES: EquivalencyStrategyId[] = [
    "unweighted",
    "days_per_week",
    "category",
    "session_or_day",
    "weekly_hours",
];

function parseFactors(raw: unknown, fallback: Record<string, number>): Record<string, number> {
    if (!isRecord(raw)) return { ...fallback };
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : { ...fallback };
}

function defaultFactorsForScheme(scheme: EquivalencyStrategyId): Record<string, number> {
    if (scheme === "unweighted") return { "1": 1 };
    if (scheme === "category") return { ...DEFAULT_CATEGORY_FACTORS };
    if (scheme === "weekly_hours") return {};
    if (scheme === "session_or_day") return { ...DEFAULT_DAYS_PER_WEEK_FACTORS };
    return { ...DEFAULT_DAYS_PER_WEEK_FACTORS };
}

function defaultSummaryFor(
    scheme: EquivalencyStrategyId,
    fullTimeHours: number | null,
    sessionBasis: EquivalencySessionBasis | null,
): string {
    if (scheme === "unweighted") return "Each child counts as 1";
    if (scheme === "category") return defaultCategorySummary();
    if (scheme === "weekly_hours") return defaultWeeklyHoursSummary(fullTimeHours ?? DEFAULT_FULL_TIME_HOURS);
    if (scheme === "session_or_day" && sessionBasis === "attendance_type") return defaultSessionSummary();
    return defaultDaysPerWeekSummary();
}

function parseUnmatched(raw: unknown): EquivalencyUnmatchedPolicy {
    if (raw === "unavailable" || raw === "proportional" || raw === "zero") return raw;
    return "proportional";
}

function parseSessionBasis(raw: unknown, scheme: EquivalencyStrategyId): EquivalencySessionBasis | null {
    if (raw === "days_per_week" || raw === "attendance_type") return raw;
    if (scheme === "days_per_week") return "days_per_week";
    if (scheme === "session_or_day") return "days_per_week";
    return null;
}

function parseVersion(raw: unknown): EquivalencyVersion | null {
    if (!isRecord(raw) || typeof raw.id !== "string") return null;
    const schemeRaw = raw.scheme;
    if (typeof schemeRaw !== "string" || !KNOWN_SCHEMES.includes(schemeRaw as EquivalencyStrategyId)) {
        return null;
    }
    const scheme = schemeRaw as EquivalencyStrategyId;
    const fullTimeHours =
        typeof raw.full_time_hours === "number" && raw.full_time_hours > 0 ? raw.full_time_hours
        : scheme === "weekly_hours" ? DEFAULT_FULL_TIME_HOURS
        : null;
    const sessionBasis = parseSessionBasis(raw.session_basis, scheme);
    const factorsFallback =
        scheme === "session_or_day" && sessionBasis === "attendance_type" ?
            DEFAULT_SESSION_FACTORS
        :   defaultFactorsForScheme(scheme);
    return {
        id: raw.id,
        version_number: typeof raw.version_number === "number" ? raw.version_number : 1,
        immutable: Boolean(raw.immutable),
        scheme,
        factors: scheme === "unweighted" ? { "1": 1 } : parseFactors(raw.factors, factorsFallback),
        full_time_days:
            typeof raw.full_time_days === "number" && raw.full_time_days > 0 ? raw.full_time_days : 5,
        full_time_hours: fullTimeHours,
        session_basis: sessionBasis,
        unmatched_policy: parseUnmatched(raw.unmatched_policy),
        summary:
            typeof raw.summary === "string" && raw.summary.trim() ?
                raw.summary
            :   defaultSummaryFor(scheme, fullTimeHours, sessionBasis),
        published_at: typeof raw.published_at === "string" ? raw.published_at : null,
        created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    };
}

export function parseOrganizationWeightings(metadata: unknown): OrganizationEquivalency[] {
    if (!isRecord(metadata) || !Array.isArray(metadata[WEIGHTING_META_KEY])) return [];
    const out: OrganizationEquivalency[] = [];
    for (const raw of metadata[WEIGHTING_META_KEY]) {
        if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") continue;
        const lifecycle = raw.lifecycle;
        if (lifecycle !== "draft" && lifecycle !== "published" && lifecycle !== "archived") continue;
        const versions = Array.isArray(raw.versions) ?
                raw.versions.map(parseVersion).filter((v): v is EquivalencyVersion => v != null)
            :   [];
        out.push({
            id: raw.id,
            key: typeof raw.key === "string" ? raw.key : slugifyEquivalencyKey(raw.name),
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

export const parseOrganizationEquivalencies = parseOrganizationWeightings;

export function writeOrganizationWeightings(
    metadata: Record<string, unknown>,
    weightings: OrganizationEquivalency[],
): Record<string, unknown> {
    return { ...metadata, [WEIGHTING_META_KEY]: weightings };
}

export const writeOrganizationEquivalencies = writeOrganizationWeightings;

export function findWeightingVersion(
    weightings: OrganizationEquivalency[],
    versionId: string,
): { weighting: OrganizationEquivalency; version: EquivalencyVersion } | null {
    for (const w of weightings) {
        const version = w.versions.find((v) => v.id === versionId);
        if (version) return { weighting: w, version };
    }
    return null;
}

export const findEquivalencyVersion = findWeightingVersion;

export async function listOrganizationWeightings(
    supabase: SupabaseClient,
    orgId: string,
): Promise<OrganizationEquivalency[]> {
    return parseOrganizationWeightings(await loadOrgMetadata(supabase, orgId));
}

export const listOrganizationEquivalencies = listOrganizationWeightings;

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
        fullTimeHours?: number | null;
        sessionBasis?: EquivalencySessionBasis | null;
        unmatchedPolicy?: EquivalencyUnmatchedPolicy;
        summary?: string;
    },
): Promise<OrganizationEquivalency> {
    const now = new Date().toISOString();
    const scheme = args.scheme ?? "session_or_day";
    const sessionBasis =
        args.sessionBasis
        ?? (scheme === "days_per_week" || scheme === "session_or_day" ? "days_per_week" : null);
    const fullTimeHours =
        scheme === "weekly_hours" ? (args.fullTimeHours ?? DEFAULT_FULL_TIME_HOURS) : (args.fullTimeHours ?? null);
    const factors =
        scheme === "unweighted" ? { "1": 1 }
        : args.factors ?? (
            scheme === "category" ? { ...DEFAULT_CATEGORY_FACTORS }
            : scheme === "session_or_day" && sessionBasis === "attendance_type" ?
                { ...DEFAULT_SESSION_FACTORS }
            : scheme === "weekly_hours" ? {}
            : { ...DEFAULT_DAYS_PER_WEEK_FACTORS }
        );
    const version: EquivalencyVersion = {
        id: newId("eq-v"),
        version_number: 1,
        immutable: false,
        scheme,
        factors,
        full_time_days: args.fullTimeDays ?? 5,
        full_time_hours: fullTimeHours,
        session_basis: sessionBasis,
        unmatched_policy: args.unmatchedPolicy ?? "proportional",
        summary: args.summary?.trim() || defaultSummaryFor(scheme, fullTimeHours, sessionBasis),
        published_at: null,
        created_at: now,
    };
    const weighting: OrganizationEquivalency = {
        id: newId("eq"),
        key: slugifyEquivalencyKey(args.name),
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

export const createOrganizationEquivalencyDraft = createOrganizationWeightingDraft;

export async function publishOrganizationWeighting(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null; id: string },
): Promise<OrganizationEquivalency> {
    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const list = parseOrganizationWeightings(metadata);
    const idx = list.findIndex((w) => w.id === args.id);
    if (idx < 0) throw new Error("Equivalency definition not found");
    const weighting = list[idx]!;
    if (weighting.lifecycle === "archived") throw new Error("Cannot publish archived equivalency");
    const draft = weighting.versions.find((v) => !v.immutable);
    if (!draft) throw new Error("No draft version to publish");
    const now = new Date().toISOString();
    const published: EquivalencyVersion = { ...draft, immutable: true, published_at: now };
    const next: OrganizationEquivalency = {
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

export const publishOrganizationEquivalency = publishOrganizationWeighting;

export async function ensureDefaultUnweightedWeighting(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null },
): Promise<{ weighting: OrganizationEquivalency; version: EquivalencyVersion }> {
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
            description: "Each matching child counts as 1.",
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
): Promise<{ weighting: OrganizationEquivalency; version: EquivalencyVersion }> {
    const list = await listOrganizationWeightings(supabase, args.orgId);
    const existing = list.find(
        (w) =>
            w.key === "full_time_equivalents"
            || w.name === "Full-time equivalents"
            || w.name === "Days per week",
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
            name: "Days per week",
            description: defaultDaysPerWeekSummary(),
            scheme: "session_or_day",
            sessionBasis: "days_per_week",
            factors: { ...DEFAULT_DAYS_PER_WEEK_FACTORS },
            fullTimeDays: 5,
            summary: defaultDaysPerWeekSummary(),
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

export async function ensureDefaultCategoryEquivalency(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null },
): Promise<{ weighting: OrganizationEquivalency; version: EquivalencyVersion }> {
    const list = await listOrganizationWeightings(supabase, args.orgId);
    const existing = list.find(
        (w) => w.key === "full_time_part_time" || w.name === "Full-time / Part-time",
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
            name: "Full-time / Part-time",
            description: defaultCategorySummary(),
            scheme: "category",
            factors: { ...DEFAULT_CATEGORY_FACTORS },
            summary: defaultCategorySummary(),
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

export async function ensureDefaultWeeklyHoursEquivalency(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null; fullTimeHours?: number },
): Promise<{ weighting: OrganizationEquivalency; version: EquivalencyVersion }> {
    const hours = args.fullTimeHours ?? DEFAULT_FULL_TIME_HOURS;
    const list = await listOrganizationWeightings(supabase, args.orgId);
    const existing = list.find(
        (w) => w.key === "weekly_scheduled_hours" || w.name === "Weekly scheduled hours",
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
            name: "Weekly scheduled hours",
            description: defaultWeeklyHoursSummary(hours),
            scheme: "weekly_hours",
            fullTimeHours: hours,
            summary: defaultWeeklyHoursSummary(hours),
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

export type { WeightingLifecycle, OrganizationWeighting, WeightingVersion, EquivalencyVersion };
