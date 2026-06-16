/**
 * Layout Gallery — pure helpers (surface registry ↔ entity_layouts rows).
 */

import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import type { SurfaceLayoutIdentity } from "@/lib/layout/surfaceLayoutRegistry";

export type SurfaceLayoutRecordsSummary = {
    orgVersions: EntityLayoutRecord[];
    systemVersions: EntityLayoutRecord[];
    published: EntityLayoutRecord | null;
    latestDraft: EntityLayoutRecord | null;
    /** Best row id for POST …/duplicate (prefers system default). */
    duplicateSourceId: string | null;
    /** Row id to open in editor when org already has a draft or published copy. */
    editTargetId: string | null;
};

export function layoutIdentityMatches(
    record: EntityLayoutRecord,
    identity: SurfaceLayoutIdentity,
    orgId?: string | null,
): boolean {
    if (record.entityType !== identity.entityType) return false;
    if (record.surface !== identity.surface) return false;
    if (record.layoutKey !== identity.layoutKey) return false;
    if (orgId === undefined) return true;
    if (orgId === null) return record.orgId === null;
    return record.orgId === orgId;
}

/** Summarize org + system rows for one surface identity. */
export function summarizeSurfaceLayoutRecords(
    records: EntityLayoutRecord[],
    orgId: string,
    identity: SurfaceLayoutIdentity,
): SurfaceLayoutRecordsSummary {
    const orgVersions = records
        .filter((r) => layoutIdentityMatches(r, identity, orgId))
        .sort((a, b) => b.version - a.version);

    const systemVersions = records
        .filter((r) => layoutIdentityMatches(r, identity, null))
        .sort((a, b) => b.version - a.version);

    const published = orgVersions.find((r) => r.status === "published") ?? null;
    const latestDraft = orgVersions.find((r) => r.status === "draft") ?? null;
    const systemDefault =
        systemVersions.find((r) => r.status === "published") ?? systemVersions[0] ?? null;

    const duplicateSourceId = systemDefault?.id ?? published?.id ?? latestDraft?.id ?? null;
    const editTargetId = latestDraft?.id ?? published?.id ?? null;

    return {
        orgVersions,
        systemVersions,
        published,
        latestDraft,
        duplicateSourceId,
        editTargetId,
    };
}

export type GalleryEditLayoutAction =
    | { mode: "open"; layoutId: string }
    | { mode: "duplicate_then_open"; sourceLayoutId: string };

/**
 * Gallery edit routing — never open a published row directly for mutation.
 * Prefer existing draft; otherwise duplicate published (or edit target) into a new draft.
 */
export function resolveGalleryEditLayoutAction(
    summary: SurfaceLayoutRecordsSummary,
): GalleryEditLayoutAction | null {
    if (summary.latestDraft) {
        return { mode: "open", layoutId: summary.latestDraft.id };
    }
    if (summary.published) {
        return { mode: "duplicate_then_open", sourceLayoutId: summary.published.id };
    }
    return null;
}

/** Published versions eligible for rollback (older than current published). */
export function rollbackCandidateVersions(
    orgVersions: EntityLayoutRecord[],
    currentPublished: EntityLayoutRecord | null,
): EntityLayoutRecord[] {
    if (!currentPublished) return orgVersions.filter((r) => r.status === "published").sort((a, b) => b.version - a.version);
    return orgVersions
        .filter((r) => r.status === "published" && r.version < currentPublished.version)
        .sort((a, b) => b.version - a.version);
}

export type SurfaceRegistryApiEntry = {
    surface_key: string;
    availability: "enabled" | "coming_soon";
    label: string;
    description: string;
    identity: SurfaceLayoutIdentity | null;
    layout_zones: readonly string[];
};

export type SurfaceRegistryApiResponse = {
    contract_version: number;
    enabled: SurfaceRegistryApiEntry[];
    coming_soon: SurfaceRegistryApiEntry[];
};
