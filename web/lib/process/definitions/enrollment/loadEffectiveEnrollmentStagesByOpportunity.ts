/**
 * Batch-load Enrollment participant effective stages by opportunity (context) id.
 * One query for many family rows — no N+1.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { ENROLLMENT_PARTICIPATION_CONTRACT } from "@/lib/process/definitions/enrollment/enrollmentContract";
import { buildProcessParticipant } from "@/lib/process/engine/processParticipant";
import {
    composeLocationRollup,
    composeStageRollup,
    deriveEffectiveProcessPosition,
} from "@/lib/process/engine/effectiveProcessPosition";
import { piEffectiveStageKey } from "@/lib/queues/enrollmentEffectiveStageMembership";

export type EffectiveEnrollmentStagesByOpportunity = {
    stagesByOpportunityId: Map<string, string[]>;
    rollupLabelsByOpportunityId: Map<string, { stage: string | null; location: string | null }>;
};

/**
 * Load open Enrollment process instances for the given opportunity ids and derive
 * effective stage keys per family (context). Location ids come from PI metadata when present.
 *
 * Access/workspace scope MUST already restrict `opportunityIds` (or filter afterward).
 */
export async function loadEffectiveEnrollmentStagesByOpportunity(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityIds: readonly string[];
    /** Optional: keep only participants whose location is in this set (workspace / access). */
    allowedLocationIds?: ReadonlySet<string> | null;
    contextStageByOpportunityId?: ReadonlyMap<string, string | null>;
}): Promise<EffectiveEnrollmentStagesByOpportunity> {
    const stagesByOpportunityId = new Map<string, string[]>();
    const rollupLabelsByOpportunityId = new Map<string, { stage: string | null; location: string | null }>();
    const ids = [...new Set(params.opportunityIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) return { stagesByOpportunityId, rollupLabelsByOpportunityId };

    const { data, error } = await params.supabase
        .from("process_instances")
        .select("id, org_id, process_key, subject_type, subject_id, context_id, stage_key, state, close_reason_key, metadata")
        .eq("org_id", params.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .in("context_id", ids)
        .is("close_reason_key", null);

    if (error) {
        throw new Error(`effective enrollment stages query failed: ${error.message}`);
    }

    type PiRow = {
        id: string;
        org_id: string;
        process_key: string;
        subject_type: string;
        subject_id: string;
        context_id: string | null;
        stage_key: string | null;
        state: string | null;
        close_reason_key: string | null;
        metadata: Record<string, unknown> | null;
    };

    const byContext = new Map<string, PiRow[]>();
    for (const raw of (data ?? []) as PiRow[]) {
        const ctx = typeof raw.context_id === "string" ? raw.context_id.trim() : "";
        if (!ctx) continue;
        const list = byContext.get(ctx) ?? [];
        list.push(raw);
        byContext.set(ctx, list);
    }

    for (const opportunityId of ids) {
        const contextStage =
            params.contextStageByOpportunityId?.get(opportunityId) ?? null;
        const pis = byContext.get(opportunityId) ?? [];
        let participants = pis.map((pi) => {
            const metaLoc =
                typeof pi.metadata?.location_id === "string" && pi.metadata.location_id.trim()
                    ? pi.metadata.location_id.trim()
                    : null;
            return buildProcessParticipant(
                {
                    id: pi.id,
                    org_id: pi.org_id,
                    process_key: pi.process_key,
                    subject_type: pi.subject_type,
                    subject_id: pi.subject_id,
                    context_id: pi.context_id,
                    stage_key: pi.stage_key,
                    state: pi.state,
                    close_reason_key: pi.close_reason_key,
                },
                {
                    contextStageKey: contextStage,
                    scopeId: null,
                    attributes: { locationId: metaLoc },
                },
            );
        });

        if (params.allowedLocationIds && params.allowedLocationIds.size > 0) {
            participants = participants.filter((p) => {
                const loc = p.attributes.locationId;
                // Missing location: keep only when not enforcing site scope strictly would hide
                // inheriting children — prefer keep when no location, else require membership.
                if (!loc) return true;
                return params.allowedLocationIds!.has(loc);
            });
        }

        const position = deriveEffectiveProcessPosition({
            contextId: opportunityId,
            contextStageKey: contextStage,
            participants,
            contract: ENROLLMENT_PARTICIPATION_CONTRACT,
            locationOf: (p) => p.attributes.locationId,
        });

        const stageKeys = position.participants
            .map((p) => p.effectiveStageKey)
            .filter((k): k is string => Boolean(k));
        stagesByOpportunityId.set(opportunityId, stageKeys);

        // Humanize keys later in presentation; store raw keys joined for compact rollup.
        const stageRollup = composeStageRollup(stageKeys);
        const locRollup = composeLocationRollup(position.participants.map((p) => p.locationId));
        rollupLabelsByOpportunityId.set(opportunityId, {
            stage: stageRollup.compactLabel,
            location: locRollup.compactLabel,
        });
    }

    return { stagesByOpportunityId, rollupLabelsByOpportunityId };
}

/** Derive effective stages from Focus Panel `_inquiry_children` without a network round-trip. */
export function effectiveStagesFromInquiryChildren(
    record: Record<string, unknown>,
): { stageKeys: string[]; stageRollupLabel: string | null; locationIds: string[] } {
    const contextStage =
        typeof record.stage_key === "string" && record.stage_key.trim()
            ? record.stage_key.trim()
            : null;
    const children = record._inquiry_children;
    if (!Array.isArray(children) || children.length === 0) {
        return {
            stageKeys: contextStage ? [contextStage] : [],
            stageRollupLabel: contextStage,
            locationIds: [],
        };
    }
    const stageKeys: string[] = [];
    const locationIds: string[] = [];
    for (const child of children) {
        if (!child || typeof child !== "object") continue;
        const row = child as Record<string, unknown>;
        const childStage =
            typeof row.stage_key === "string" && row.stage_key.trim() ? row.stage_key.trim() : null;
        const effective = piEffectiveStageKey(childStage, contextStage);
        if (effective) stageKeys.push(effective);
        const loc =
            (typeof row.location_id === "string" && row.location_id.trim()
                ? row.location_id.trim()
                : null)
            || (typeof row.site_id === "string" && row.site_id.trim() ? row.site_id.trim() : null);
        if (loc) locationIds.push(loc);
    }
    const stageRollup = composeStageRollup(stageKeys);
    return {
        stageKeys,
        stageRollupLabel: stageRollup.compactLabel,
        locationIds,
    };
}
