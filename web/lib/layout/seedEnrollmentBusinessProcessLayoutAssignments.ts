/**
 * Seed default Enrollment BP layout assignments for an org.
 * References latest published layouts by surface default layout_key.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    LAYOUT_ASSIGNMENT_SURFACE_KEYS,
    layoutAssignmentSurfaceIdentity,
    type LayoutAssignmentSurfaceKey,
} from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import { layoutAssignmentSlotsForStage } from "@/lib/layout/layoutAssignmentSlots";
import type { LayoutSurface } from "@/lib/layout/layoutV2";
import { listDefaultLayouts, listOrgLayouts } from "@/lib/layout/entityLayoutsRepo";
import { upsertBusinessProcessLayoutAssignment } from "@/lib/layout/businessProcessLayoutAssignmentsRepo";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

async function latestPublishedLayoutKey(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    surface: LayoutSurface,
    layoutKey: string,
): Promise<{ layoutKey: string; entityLayoutId: string | null }> {
    const [orgRecords, defaultRecords] = await Promise.all([
        listOrgLayouts(supabase, orgId, entityType, surface),
        listDefaultLayouts(supabase, entityType, surface),
    ]);
    const combined = [...orgRecords, ...defaultRecords]
        .filter((r) => r.status === "published" && r.layoutKey === layoutKey)
        .sort((a, b) => b.version - a.version);
    const best = combined[0];
    return { layoutKey, entityLayoutId: best?.id ?? null };
}

export async function seedEnrollmentBusinessProcessLayoutAssignments(
    supabase: SupabaseClient,
    orgId: string,
    createdBy?: string | null,
): Promise<number> {
    let count = 0;

    for (const stageKey of LIFECYCLE_STAGE_ORDER) {
        const slots = layoutAssignmentSlotsForStage(stageKey);
        const seenSurfaces = new Set<LayoutAssignmentSurfaceKey>();
        for (const slot of slots) {
            if (seenSurfaces.has(slot.surfaceKey)) continue;
            seenSurfaces.add(slot.surfaceKey);
            const identity = layoutAssignmentSurfaceIdentity(slot.surfaceKey);
            const resolved = await latestPublishedLayoutKey(
                supabase,
                orgId,
                identity.entityType,
                identity.surface,
                identity.defaultLayoutKey,
            );
            await upsertBusinessProcessLayoutAssignment(supabase, {
                orgId,
                businessProcessKey: ENROLLMENT_PROCESS_KEY,
                stageKey,
                surfaceKey: slot.surfaceKey,
                layoutKey: resolved.layoutKey,
                entityLayoutId: resolved.entityLayoutId,
                createdBy: createdBy ?? null,
            });
            count += 1;
        }
    }

    // BP-wide surface defaults (no stage) for fallbacks
    for (const surfaceKey of LAYOUT_ASSIGNMENT_SURFACE_KEYS) {
        const identity = layoutAssignmentSurfaceIdentity(surfaceKey);
        const resolved = await latestPublishedLayoutKey(
            supabase,
            orgId,
            identity.entityType,
            identity.surface,
            identity.defaultLayoutKey,
        );
        await upsertBusinessProcessLayoutAssignment(supabase, {
            orgId,
            businessProcessKey: ENROLLMENT_PROCESS_KEY,
            stageKey: null,
            surfaceKey,
            layoutKey: resolved.layoutKey,
            entityLayoutId: resolved.entityLayoutId,
            createdBy: createdBy ?? null,
        });
        count += 1;
    }

    return count;
}
