/**
 * Communications workspace — unified warm cache for modal tabs.
 * Orchestrates Command Center prefetch plus templates, campaigns, bindings, and audience metadata.
 */
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import type { InquiryChildPlacementHierarchyRow } from "@/lib/admin/location/inquiryChildPlacementOptions";
import { fetchCommunicationsBindingsCached } from "@/lib/communications/communicationsBindingsCache";
import { parseProgramOptionRowsFromApi } from "@/lib/communications/v2/audienceHierarchy";
import type { ProgramOptionRow } from "@/lib/communications/v2/audienceOptionLabels";
import {
    prefetchCommandCenterConversations,
    type CommandCenterCacheSnapshot,
} from "@/lib/communications/v2/commandCenterPrefetchCache";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";

const CACHE_TTL_MS = 90_000;

const TEMPLATES_API = "/api/admin/communications/templates";
const ANNOUNCEMENTS_API = "/api/admin/communications/announcements";
const PROGRAM_OPTIONS_API = "/api/admin/location-program-categories";
const STATUS_OPTIONS_API = "/api/admin/communications/status-options";
const LOCATION_HIERARCHY_API = "/api/admin/locations?hierarchy=1";

export type CommsWarmTemplateLibraryRow = {
    id: string;
    name: string;
    description: string | null;
    category: string;
    channel: string;
    status: string;
    current_version_id: string | null;
    updated_at: string | null;
};

export type CommsWarmActiveTemplateSummary = {
    id: string;
    name: string;
    channel: string;
};

export type CommsWarmAnnouncementRow = {
    id: string;
    title: string;
    status: string;
    channels: string[];
    template_id: string | null;
    subject: string | null;
    body: string;
    updated_at: string | null;
};

export type CommsWarmStatusOption = {
    status_key: string;
    label: string;
};

export type CommsWarmAudienceMetadata = {
    locationHierarchy: InquiryChildPlacementHierarchyRow[];
    programOptions: ProgramOptionRow[];
    familyStatusOptions: CommsWarmStatusOption[];
    childStatusOptions: CommsWarmStatusOption[];
};

export type CommunicationsWorkspaceWarmSnapshot = {
    fetchedAt: number;
    templatesLibrary: CommsWarmTemplateLibraryRow[] | null;
    activeTemplates: CommsWarmActiveTemplateSummary[] | null;
    announcements: CommsWarmAnnouncementRow[] | null;
    audienceMetadata: CommsWarmAudienceMetadata | null;
    bindingsChannels: string[] | null;
    error: string | null;
};

let snapshot: CommunicationsWorkspaceWarmSnapshot | null = null;
let inflight: Promise<CommunicationsWorkspaceWarmSnapshot> | null = null;
let warmScheduled = false;
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((l) => l());
}

function isFresh(entry: CommunicationsWorkspaceWarmSnapshot | null): entry is CommunicationsWorkspaceWarmSnapshot {
    return Boolean(entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS);
}

function emptySnapshot(partial?: Partial<CommunicationsWorkspaceWarmSnapshot>): CommunicationsWorkspaceWarmSnapshot {
    return {
        fetchedAt: Date.now(),
        templatesLibrary: null,
        activeTemplates: null,
        announcements: null,
        audienceMetadata: null,
        bindingsChannels: null,
        error: null,
        ...partial,
    };
}

export function getCommunicationsWorkspaceWarmSnapshot(): CommunicationsWorkspaceWarmSnapshot | null {
    return isFresh(snapshot) ? snapshot : null;
}

export function getCommunicationsWarmTemplatesLibrary(): CommsWarmTemplateLibraryRow[] | null {
    return getCommunicationsWorkspaceWarmSnapshot()?.templatesLibrary ?? null;
}

export function getCommunicationsWarmActiveTemplates(): CommsWarmActiveTemplateSummary[] | null {
    return getCommunicationsWorkspaceWarmSnapshot()?.activeTemplates ?? null;
}

export function getCommunicationsWarmAnnouncements(): CommsWarmAnnouncementRow[] | null {
    return getCommunicationsWorkspaceWarmSnapshot()?.announcements ?? null;
}

export function getCommunicationsWarmAudienceMetadata(): CommsWarmAudienceMetadata | null {
    return getCommunicationsWorkspaceWarmSnapshot()?.audienceMetadata ?? null;
}

export function subscribeCommunicationsWorkspaceWarm(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function mapTemplateLibraryRows(raw: Record<string, unknown>[]): CommsWarmTemplateLibraryRow[] {
    return raw.map((t) => ({
        id: String(t.id),
        name: String(t.name ?? ""),
        description: t.description != null ? String(t.description) : null,
        category: String(t.category ?? ""),
        channel: String(t.channel ?? ""),
        status: String(t.status ?? ""),
        current_version_id: t.current_version_id != null ? String(t.current_version_id) : null,
        updated_at: t.updated_at != null ? String(t.updated_at) : null,
    }));
}

function mapActiveTemplateRows(raw: Record<string, unknown>[]): CommsWarmActiveTemplateSummary[] {
    return raw.map((t) => ({
        id: String(t.id),
        name: String(t.name ?? ""),
        channel: String(t.channel ?? ""),
    }));
}

function mapAnnouncementRows(raw: Record<string, unknown>[]): CommsWarmAnnouncementRow[] {
    return raw.map((a) => ({
        id: String(a.id),
        title: String(a.title ?? ""),
        status: String(a.status ?? ""),
        channels: Array.isArray(a.channels) ? a.channels.map(String) : [],
        template_id: a.template_id != null ? String(a.template_id) : null,
        subject: a.subject != null ? String(a.subject) : null,
        body: String(a.body ?? ""),
        updated_at: a.updated_at != null ? String(a.updated_at) : null,
    }));
}

async function fetchStatusOptions(grain: "family" | "child", ttlMs: number): Promise<CommsWarmStatusOption[]> {
    try {
        const res = await dedupeAdminFetchWithTtl(`${STATUS_OPTIONS_API}?grain=${grain}`, { credentials: "include" }, ttlMs);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(json.options)) return [];
        return (json.options as Record<string, unknown>[]).map((o) => ({
            status_key: String(o.status_key),
            label: String(o.label ?? o.status_key),
        }));
    } catch {
        return [];
    }
}

async function warmAudienceMetadata(ttlMs: number): Promise<CommsWarmAudienceMetadata> {
    const [progRes, hierarchyRes, familyStatus, childStatus] = await Promise.all([
        dedupeAdminFetchWithTtl(PROGRAM_OPTIONS_API, { credentials: "include" }, ttlMs),
        dedupeAdminFetchWithTtl(LOCATION_HIERARCHY_API, { credentials: "include" }, ttlMs),
        fetchStatusOptions("family", ttlMs),
        fetchStatusOptions("child", ttlMs),
    ]);
    const progJson = await progRes.json().catch(() => ({}));
    const hierarchyJson = await hierarchyRes.json().catch(() => ({}));
    const progArr = (progJson.categories ?? progJson.program_categories ?? progJson.location_program_categories) as
        | Record<string, unknown>[]
        | undefined;
    const hierarchyArr = hierarchyJson.locations as InquiryChildPlacementHierarchyRow[] | undefined;
    const locationHierarchy = hierarchyRes.ok && Array.isArray(hierarchyArr) ? hierarchyArr : [];
    const programOptions =
        progRes.ok && Array.isArray(progArr)
            ? parseProgramOptionRowsFromApi(progArr, locationHierarchy)
            : [];
    return {
        locationHierarchy,
        programOptions,
        familyStatusOptions: familyStatus,
        childStatusOptions: childStatus,
    };
}

/*
 * ── THE WARM CACHE AND ITS CONSUMERS SHARE ONE FETCH OWNER ──
 *
 * This module and the workspaces it warms were fetching the SAME six URLs independently, so every
 * resource arrived exactly twice — a warm prefetch and a component load, neither aware of the other.
 * That is two loader owners for one resource, which is the thing law 43 forbids; deduping only the
 * consumer side could never collapse it.
 *
 * Routing the warm fetches through the same dedupe owner makes whichever runs first win and the other
 * join it. `ttlMs` is threaded rather than fixed so a FORCED refresh passes 0 and is never served from
 * the coalescing layer — a force that a cache can satisfy is not a force.
 */
async function warmWorkspaceDatasets(
    prev: CommunicationsWorkspaceWarmSnapshot | null,
    ttlMs: number
): Promise<CommunicationsWorkspaceWarmSnapshot> {
    const [templatesLibRes, activeTemplatesRes, announcementsRes, bindingsResult, audienceMetadata] = await Promise.all([
        dedupeAdminFetchWithTtl(TEMPLATES_API, { credentials: "include" }, ttlMs),
        dedupeAdminFetchWithTtl(`${TEMPLATES_API}?status=active`, { credentials: "include" }, ttlMs),
        dedupeAdminFetchWithTtl(ANNOUNCEMENTS_API, { credentials: "include" }, ttlMs),
        fetchCommunicationsBindingsCached(),
        warmAudienceMetadata(ttlMs),
    ]);

    const templatesJson = await templatesLibRes.json().catch(() => ({}));
    const activeJson = await activeTemplatesRes.json().catch(() => ({}));
    const announcementsJson = await announcementsRes.json().catch(() => ({}));

    const templatesLibrary =
        templatesLibRes.ok && Array.isArray(templatesJson.templates)
            ? mapTemplateLibraryRows(templatesJson.templates as Record<string, unknown>[])
            : (prev?.templatesLibrary ?? []);

    const activeTemplates =
        activeTemplatesRes.ok && Array.isArray(activeJson.templates)
            ? mapActiveTemplateRows(activeJson.templates as Record<string, unknown>[])
            : (prev?.activeTemplates ?? []);

    const announcements =
        announcementsRes.ok && Array.isArray(announcementsJson.announcements)
            ? mapAnnouncementRows(announcementsJson.announcements as Record<string, unknown>[])
            : (prev?.announcements ?? []);

    const bindingsChannels =
        bindingsResult.ok && Array.isArray(bindingsResult.json.channels_available)
            ? bindingsResult.json.channels_available.map(String)
            : (prev?.bindingsChannels ?? []);

    return {
        fetchedAt: Date.now(),
        templatesLibrary,
        activeTemplates,
        announcements,
        audienceMetadata,
        bindingsChannels,
        error: null,
    };
}

/** Full workspace warm — Command Center queue plus tab datasets. */
/** Coalescing window shared with the workspaces; a forced refresh passes 0 and bypasses it. */
const WARM_COALESCE_TTL_MS = 10_000;

export async function prefetchCommunicationsWorkspaceWarm(opts?: {
    force?: boolean;
}): Promise<CommunicationsWorkspaceWarmSnapshot> {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        const empty = emptySnapshot({
            templatesLibrary: [],
            activeTemplates: [],
            announcements: [],
            audienceMetadata: {
                locationHierarchy: [],
                programOptions: [],
                familyStatusOptions: [],
                childStatusOptions: [],
            },
            bindingsChannels: [],
        });
        snapshot = empty;
        notify();
        return empty;
    }

    const fresh = getCommunicationsWorkspaceWarmSnapshot();
    if (fresh && !opts?.force) {
        void prefetchCommandCenterConversations();
        void warmWorkspaceDatasets(fresh, WARM_COALESCE_TTL_MS)
            .then((next) => {
                snapshot = next;
                notify();
            })
            .catch(() => {
                /* stale-while-revalidate */
            });
        return fresh;
    }

    if (inflight && !opts?.force) return inflight;

    inflight = (async () => {
        try {
            await prefetchCommandCenterConversations();
            const prev = getCommunicationsWorkspaceWarmSnapshot() ?? snapshot;
            const next = await warmWorkspaceDatasets(prev, opts?.force ? 0 : WARM_COALESCE_TTL_MS);
            snapshot = next;
            notify();
            return next;
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to warm communications workspace";
            const next = emptySnapshot({
                ...(snapshot ?? {}),
                fetchedAt: snapshot?.fetchedAt ?? Date.now(),
                templatesLibrary: snapshot?.templatesLibrary ?? null,
                activeTemplates: snapshot?.activeTemplates ?? null,
                announcements: snapshot?.announcements ?? null,
                audienceMetadata: snapshot?.audienceMetadata ?? null,
                bindingsChannels: snapshot?.bindingsChannels ?? null,
                error: message,
            });
            snapshot = next;
            notify();
            return next;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

/** Intent / hover / modal open — reuses in-flight warm when present. */
export function warmCommunicationsWorkspaceModal(): Promise<CommunicationsWorkspaceWarmSnapshot> {
    return prefetchCommunicationsWorkspaceWarm();
}

/** Also warms Command Center conversations — convenience alias for CC-only callers. */
export function warmCommunicationsWorkspaceCommandCenter(): Promise<CommandCenterCacheSnapshot> {
    void prefetchCommunicationsWorkspaceWarm();
    return prefetchCommandCenterConversations();
}

/** Deferred warm pass — after primary workspace surface is ready. */
export function scheduleCommunicationsWorkspaceWarm(): void {
    if (typeof window === "undefined" || warmScheduled) return;
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) return;
    warmScheduled = true;
    runWhenAdminV2PrimarySurfaceReady(() => {
        void prefetchCommunicationsWorkspaceWarm();
    }, "communications_workspace_warm");
}

/** Test-only reset. */
export function resetCommunicationsWorkspaceWarmCacheForTests(): void {
    snapshot = null;
    inflight = null;
    warmScheduled = false;
    listeners.clear();
}
