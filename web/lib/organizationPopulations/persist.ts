import type { SupabaseClient } from "@supabase/supabase-js";
import {
    POPULATION_META_KEY,
    POPULATION_PREDICATES,
    slugifyPopulationKey,
    type OrganizationPopulation,
    type PopulationLifecycle,
    type PopulationPredicateId,
    type PopulationVersion,
} from "@/lib/organizationPopulations/types";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function newId(prefix: string): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto ?
            crypto.randomUUID()
        :   `${prefix}-${Date.now()}`;
}

export async function loadOrgMetadata(
    supabase: SupabaseClient,
    orgId: string,
): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    if (error) throw new Error(error.message);
    const meta = data?.metadata;
    return meta != null && typeof meta === "object" && !Array.isArray(meta) ?
            { ...(meta as Record<string, unknown>) }
        :   {};
}

export async function saveOrgMetadata(
    supabase: SupabaseClient,
    orgId: string,
    metadata: Record<string, unknown>,
): Promise<void> {
    const { error } = await supabase.from("org_settings").upsert(
        { org_id: orgId, metadata },
        { onConflict: "org_id" },
    );
    if (error) throw new Error(error.message);
}

function parseVersion(raw: unknown): PopulationVersion | null {
    if (!isRecord(raw) || typeof raw.id !== "string") return null;
    if (raw.predicate !== "expected_in_room_on_date") return null;
    return {
        id: raw.id,
        version_number: typeof raw.version_number === "number" ? raw.version_number : 1,
        immutable: Boolean(raw.immutable),
        predicate: raw.predicate,
        membership_summary:
            typeof raw.membership_summary === "string" ?
                raw.membership_summary
            :   POPULATION_PREDICATES.expected_in_room_on_date.summary,
        published_at: typeof raw.published_at === "string" ? raw.published_at : null,
        created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    };
}

export function parseOrganizationPopulations(metadata: unknown): OrganizationPopulation[] {
    if (!isRecord(metadata) || !Array.isArray(metadata[POPULATION_META_KEY])) return [];
    const out: OrganizationPopulation[] = [];
    for (const raw of metadata[POPULATION_META_KEY]) {
        if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") continue;
        const lifecycle = raw.lifecycle;
        if (lifecycle !== "draft" && lifecycle !== "published" && lifecycle !== "archived") continue;
        const versions = Array.isArray(raw.versions) ?
                raw.versions.map(parseVersion).filter((v): v is PopulationVersion => v != null)
            :   [];
        out.push({
            id: raw.id,
            key: typeof raw.key === "string" ? raw.key : slugifyPopulationKey(raw.name),
            name: raw.name,
            description: typeof raw.description === "string" ? raw.description : null,
            subject_grain: "room",
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

export function writeOrganizationPopulations(
    metadata: Record<string, unknown>,
    populations: OrganizationPopulation[],
): Record<string, unknown> {
    return { ...metadata, [POPULATION_META_KEY]: populations };
}

export function findPopulationVersion(
    populations: OrganizationPopulation[],
    versionId: string,
): { population: OrganizationPopulation; version: PopulationVersion } | null {
    for (const p of populations) {
        const version = p.versions.find((v) => v.id === versionId);
        if (version) return { population: p, version };
    }
    return null;
}

export async function listOrganizationPopulations(
    supabase: SupabaseClient,
    orgId: string,
): Promise<OrganizationPopulation[]> {
    return parseOrganizationPopulations(await loadOrgMetadata(supabase, orgId));
}

export async function createOrganizationPopulationDraft(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        userId: string | null;
        name: string;
        description?: string | null;
        predicate?: PopulationPredicateId;
    },
): Promise<OrganizationPopulation> {
    const now = new Date().toISOString();
    const predicate = args.predicate ?? "expected_in_room_on_date";
    const version: PopulationVersion = {
        id: newId("pop-v"),
        version_number: 1,
        immutable: false,
        predicate,
        membership_summary: POPULATION_PREDICATES[predicate].summary,
        published_at: null,
        created_at: now,
    };
    const population: OrganizationPopulation = {
        id: newId("pop"),
        key: slugifyPopulationKey(args.name),
        name: args.name.trim(),
        description: args.description?.trim() || null,
        subject_grain: "room",
        lifecycle: "draft",
        published_version_id: null,
        versions: [version],
        created_at: now,
        updated_at: now,
        created_by: args.userId,
    };
    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const existing = parseOrganizationPopulations(metadata);
    await saveOrgMetadata(supabase, args.orgId, writeOrganizationPopulations(metadata, [...existing, population]));
    return population;
}

export async function publishOrganizationPopulation(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null; id: string },
): Promise<OrganizationPopulation> {
    const metadata = await loadOrgMetadata(supabase, args.orgId);
    const list = parseOrganizationPopulations(metadata);
    const idx = list.findIndex((p) => p.id === args.id);
    if (idx < 0) throw new Error("Population not found");
    const population = list[idx]!;
    if (population.lifecycle === "archived") throw new Error("Cannot publish archived population");
    const draft = population.versions.find((v) => !v.immutable);
    if (!draft) throw new Error("No draft version to publish");
    const now = new Date().toISOString();
    const published: PopulationVersion = {
        ...draft,
        immutable: true,
        published_at: now,
    };
    const next: OrganizationPopulation = {
        ...population,
        lifecycle: "published",
        published_version_id: published.id,
        versions: population.versions.map((v) => (v.id === draft.id ? published : v)),
        updated_at: now,
    };
    const out = [...list];
    out[idx] = next;
    await saveOrgMetadata(supabase, args.orgId, writeOrganizationPopulations(metadata, out));
    return next;
}

/** Ensure seed populations exist (Active children). Returns published version id. */
export async function ensureDefaultActiveChildrenPopulation(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string | null },
): Promise<{ population: OrganizationPopulation; version: PopulationVersion }> {
    const list = await listOrganizationPopulations(supabase, args.orgId);
    const existing = list.find((p) => p.key === "active_children" || p.name === "Active children");
    if (existing?.published_version_id) {
        const version = existing.versions.find((v) => v.id === existing.published_version_id);
        if (version) return { population: existing, version };
    }
    let population =
        existing ??
        (await createOrganizationPopulationDraft(supabase, {
            orgId: args.orgId,
            userId: args.userId,
            name: "Active children",
            description: "Children expected in the room on the selected date from committed schedules.",
            predicate: "expected_in_room_on_date",
        }));
    if (!population.published_version_id) {
        population = await publishOrganizationPopulation(supabase, {
            orgId: args.orgId,
            userId: args.userId,
            id: population.id,
        });
    }
    const version = population.versions.find((v) => v.id === population.published_version_id)!;
    return { population, version };
}

export type { PopulationLifecycle };
