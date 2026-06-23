/**
 * Business Process Layout Assignments — persistence helpers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    BusinessProcessLayoutAssignmentRecord,
    LayoutAssignmentSurfaceKey,
} from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import {
    isLayoutAssignmentSurfaceKey,
    layoutAssignmentSurfaceIdentity,
} from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import type { LayoutSurface } from "@/lib/layout/layoutV2";

const TABLE = "business_process_layout_assignments";

const SELECT_COLS =
    "id, org_id, business_process_key, stage_key, status_key, surface_key, entity_type, surface, layout_key, entity_layout_id, priority, is_active, version, metadata, created_by, created_at, updated_at";

type Row = {
    id: string;
    org_id: string;
    business_process_key: string;
    stage_key: string | null;
    status_key: string | null;
    surface_key: string;
    entity_type: string;
    surface: string;
    layout_key: string;
    entity_layout_id: string | null;
    priority: number;
    is_active: boolean;
    version: number;
    metadata: Record<string, unknown> | null;
    created_by: string | null;
    created_at: string;
    updated_at: string | null;
};

export function rowToAssignment(row: Row): BusinessProcessLayoutAssignmentRecord {
    const surfaceKey = row.surface_key;
    if (!isLayoutAssignmentSurfaceKey(surfaceKey)) {
        throw new Error(`Invalid surface_key on assignment ${row.id}: ${surfaceKey}`);
    }
    return {
        id: row.id,
        orgId: row.org_id,
        businessProcessKey: row.business_process_key,
        stageKey: row.stage_key,
        statusKey: row.status_key,
        surfaceKey,
        entityType: row.entity_type,
        surface: row.surface as LayoutSurface,
        layoutKey: row.layout_key,
        entityLayoutId: row.entity_layout_id,
        priority: row.priority,
        isActive: row.is_active,
        version: row.version,
        metadata: row.metadata,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function listBusinessProcessLayoutAssignments(
    supabase: SupabaseClient,
    orgId: string,
    businessProcessKey?: string,
): Promise<BusinessProcessLayoutAssignmentRecord[]> {
    let q = supabase.from(TABLE).select(SELECT_COLS).eq("org_id", orgId).eq("is_active", true);
    if (businessProcessKey) {
        q = q.eq("business_process_key", businessProcessKey);
    }
    const { data, error } = await q.order("business_process_key").order("stage_key").order("surface_key");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => rowToAssignment(r as Row));
}

export async function upsertBusinessProcessLayoutAssignment(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        businessProcessKey: string;
        stageKey?: string | null;
        statusKey?: string | null;
        surfaceKey: LayoutAssignmentSurfaceKey;
        layoutKey: string;
        entityLayoutId?: string | null;
        createdBy?: string | null;
        metadata?: Record<string, unknown> | null;
    },
): Promise<BusinessProcessLayoutAssignmentRecord> {
    const identity = layoutAssignmentSurfaceIdentity(input.surfaceKey);
    const stageKey = input.stageKey?.trim() || null;
    const statusKey = input.statusKey?.trim() || null;

    const { data: existing, error: findErr } = await supabase
        .from(TABLE)
        .select(SELECT_COLS)
        .eq("org_id", input.orgId)
        .eq("business_process_key", input.businessProcessKey)
        .eq("surface_key", input.surfaceKey)
        .is("stage_key", stageKey)
        .is("status_key", statusKey)
        .eq("is_active", true)
        .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    const payload = {
        org_id: input.orgId,
        business_process_key: input.businessProcessKey,
        stage_key: stageKey,
        status_key: statusKey,
        surface_key: input.surfaceKey,
        entity_type: identity.entityType,
        surface: identity.surface,
        layout_key: input.layoutKey.trim() || identity.defaultLayoutKey,
        entity_layout_id: input.entityLayoutId ?? null,
        is_active: true,
        metadata: input.metadata ?? {},
        updated_at: new Date().toISOString(),
    };

    if (existing) {
        const row = existing as Row;
        const { data, error } = await supabase
            .from(TABLE)
            .update({ ...payload, version: row.version + 1 })
            .eq("id", row.id)
            .select(SELECT_COLS)
            .single();
        if (error) throw new Error(error.message);
        return rowToAssignment(data as Row);
    }

    const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...payload, created_by: input.createdBy ?? null, version: 1 })
        .select(SELECT_COLS)
        .single();
    if (error) throw new Error(error.message);
    return rowToAssignment(data as Row);
}

export async function clearBusinessProcessLayoutAssignment(
    supabase: SupabaseClient,
    assignmentId: string,
): Promise<void> {
    const { error } = await supabase
        .from(TABLE)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", assignmentId);
    if (error) throw new Error(error.message);
}
