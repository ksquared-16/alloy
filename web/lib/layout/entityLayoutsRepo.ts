/**
 * Layout V2 — persistence helpers for the `entity_layouts` table.
 *
 * Thin mapping layer used by the admin API routes. All reads/writes go through
 * the service-role client (RLS-bypassing, org-scoped in code), matching every
 * other /api/admin/* route. These helpers DO NOT touch any live runtime path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    invalidateLayoutResolution,
    invalidateLayoutResolutionForEntity,
} from "./layoutResolutionCache";
import type { EntityLayoutRecord, LayoutDoc, LayoutStatus, LayoutSurface } from "./layoutV2";

const TABLE = "entity_layouts";

const SELECT_COLS =
    "id, org_id, industry_key, entity_type, surface, layout_key, name, version, status, is_system_default, doc, metadata, created_by, created_at, updated_at, published_at";

type Row = {
    id: string;
    org_id: string | null;
    industry_key: string | null;
    entity_type: string;
    surface: string;
    layout_key: string;
    name: string;
    version: number;
    status: string;
    is_system_default: boolean;
    doc: unknown;
    metadata: Record<string, unknown> | null;
    created_by: string | null;
    created_at: string;
    updated_at: string | null;
    published_at: string | null;
};

export function rowToRecord(row: Row): EntityLayoutRecord {
    return {
        id: row.id,
        orgId: row.org_id,
        industryKey: row.industry_key,
        entityType: row.entity_type,
        surface: row.surface as LayoutSurface,
        layoutKey: row.layout_key,
        name: row.name,
        version: row.version,
        status: row.status as LayoutStatus,
        isSystemDefault: row.is_system_default,
        doc: row.doc as LayoutDoc,
        metadata: row.metadata,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        publishedAt: row.published_at,
    };
}

/** All org rows for an (entity_type, surface). */
export async function listOrgLayouts(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    surface: LayoutSurface,
): Promise<EntityLayoutRecord[]> {
    const { data, error } = await supabase
        .from(TABLE)
        .select(SELECT_COLS)
        .eq("org_id", orgId)
        .eq("entity_type", entityType)
        .eq("surface", surface)
        .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToRecord(r as Row));
}

/** All default (org_id NULL) rows for an (entity_type, surface). */
export async function listDefaultLayouts(
    supabase: SupabaseClient,
    entityType: string,
    surface: LayoutSurface,
): Promise<EntityLayoutRecord[]> {
    const { data, error } = await supabase
        .from(TABLE)
        .select(SELECT_COLS)
        .is("org_id", null)
        .eq("entity_type", entityType)
        .eq("surface", surface)
        .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToRecord(r as Row));
}

/** Every layout row visible to an org (its own + defaults), for the list UI. */
export async function listAllForOrg(supabase: SupabaseClient, orgId: string): Promise<EntityLayoutRecord[]> {
    const { data, error } = await supabase
        .from(TABLE)
        .select(SELECT_COLS)
        .or(`org_id.eq.${orgId},org_id.is.null`)
        .order("entity_type", { ascending: true })
        .order("surface", { ascending: true })
        .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToRecord(r as Row));
}

export async function getLayoutById(
    supabase: SupabaseClient,
    id: string,
): Promise<EntityLayoutRecord | null> {
    const { data, error } = await supabase.from(TABLE).select(SELECT_COLS).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToRecord(data as Row) : null;
}

export interface CreateLayoutInput {
    orgId: string;
    entityType: string;
    surface: LayoutSurface;
    layoutKey: string;
    name: string;
    doc: LayoutDoc;
    createdBy: string;
    metadata?: Record<string, unknown>;
}

/** Insert a new DRAFT at the next available version for its key. */
export async function createDraft(
    supabase: SupabaseClient,
    input: CreateLayoutInput,
): Promise<EntityLayoutRecord> {
    const existing = await listOrgLayouts(supabase, input.orgId, input.entityType, input.surface);
    const sameKey = existing.filter((r) => r.layoutKey === input.layoutKey);
    const nextVersion = sameKey.reduce((max, r) => Math.max(max, r.version), 0) + 1;

    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            org_id: input.orgId,
            entity_type: input.entityType,
            surface: input.surface,
            layout_key: input.layoutKey,
            name: input.name,
            version: nextVersion,
            status: "draft",
            doc: input.doc,
            metadata: input.metadata ?? {},
            created_by: input.createdBy,
        })
        .select(SELECT_COLS)
        .single();
    if (error) throw new Error(error.message);
    return rowToRecord(data as Row);
}

/** Update the doc/name/metadata of a DRAFT row. */
export async function updateDraft(
    supabase: SupabaseClient,
    id: string,
    patch: { name?: string; doc?: LayoutDoc; metadata?: Record<string, unknown> },
): Promise<EntityLayoutRecord> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.doc !== undefined) update.doc = patch.doc;
    if (patch.metadata !== undefined) update.metadata = patch.metadata;
    const { data, error } = await supabase.from(TABLE).update(update).eq("id", id).select(SELECT_COLS).single();
    if (error) throw new Error(error.message);
    return rowToRecord(data as Row);
}

/** Mark a row published. */
export async function publishLayout(
    supabase: SupabaseClient,
    id: string,
): Promise<EntityLayoutRecord> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from(TABLE)
        .update({ status: "published", published_at: now, updated_at: now })
        .eq("id", id)
        .select(SELECT_COLS)
        .single();
    if (error) throw new Error(error.message);
    const record = rowToRecord(data as Row);
    // Authored layout changes must reflect in runtime immediately (acceptance #5).
    if (record.orgId) {
        invalidateLayoutResolutionForEntity(record.orgId, record.entityType);
    } else {
        // A default (org_id NULL) publish can affect any org's resolution.
        invalidateLayoutResolution();
    }
    return record;
}

export async function deleteLayout(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
    // Conservatively drop all cached resolutions; deletes are rare admin operations.
    invalidateLayoutResolution();
}
