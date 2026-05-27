import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminAudit } from "@/lib/adminAuth";
import {
    buildPlacementOverridePayloadForInsert,
    parsePlacementOverridePayload,
    validatePlacementOverrideCreateBody,
} from "@/lib/orchestration/placement/placementOverridePayload";
import type { PlacementOverrideKind } from "@/lib/orchestration/placement/placementCandidateTypes";
import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";
import { emitPlacementManualOrderActivitySafe } from "@/lib/orchestration/placement/emitPlacementManualOrderActivity";

export type CreatePlacementOverrideInput = {
    orgId: string;
    userId: string;
    role: string;
    placementCandidateId: string;
    override_kind: PlacementOverrideKind;
    reason: string;
    payload?: Record<string, unknown> | null;
    expires_at?: string | null;
    profile?: PlacementProfile;
};

export type ReleasePlacementOverrideInput = {
    orgId: string;
    userId: string;
    role: string;
    placementCandidateId: string;
    overrideId: string;
    release_reason: string;
};

type CandidateRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    program_room_cohort_key: string;
    status: string;
};

async function loadCandidate(
    supabase: SupabaseClient,
    orgId: string,
    candidateId: string
): Promise<CandidateRow | null> {
    const { data, error } = await supabase
        .from("placement_candidates")
        .select("id, org_id, opportunity_id, program_room_cohort_key, status")
        .eq("org_id", orgId)
        .eq("id", candidateId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as CandidateRow | null) ?? null;
}

export async function createPlacementOverride(
    supabase: SupabaseClient,
    input: CreatePlacementOverrideInput
): Promise<{ ok: true; override: Record<string, unknown> } | { ok: false; status: number; error: string }> {
    const candidate = await loadCandidate(supabase, input.orgId, input.placementCandidateId);
    if (!candidate) return { ok: false, status: 404, error: "Placement candidate not found" };
    if (candidate.status !== "active") {
        return { ok: false, status: 409, error: "Overrides apply only to active placement candidates" };
    }

    const parsedPayload = parsePlacementOverridePayload(input.payload);
    const validationError = validatePlacementOverrideCreateBody({
        override_kind: input.override_kind,
        reason: input.reason,
        payload: parsedPayload,
        expires_at: input.expires_at,
        profile: input.profile,
    });
    if (validationError) return { ok: false, status: 400, error: validationError };

    if (input.override_kind === "pin") {
        const { data: existingPin } = await supabase
            .from("placement_overrides")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("placement_candidate_id", input.placementCandidateId)
            .eq("program_room_cohort_key", candidate.program_room_cohort_key)
            .eq("override_kind", "pin")
            .eq("is_active", true)
            .maybeSingle();
        if (existingPin?.id) {
            return { ok: false, status: 409, error: "Active pin override already exists — release it first" };
        }
    }

    const insertPayload = buildPlacementOverridePayloadForInsert(input.override_kind, parsedPayload);
    const { data, error } = await supabase
        .from("placement_overrides")
        .insert({
            org_id: input.orgId,
            placement_candidate_id: input.placementCandidateId,
            program_room_cohort_key: candidate.program_room_cohort_key,
            override_kind: input.override_kind,
            reason: input.reason.trim(),
            payload: insertPayload,
            expires_at: input.expires_at?.trim() || null,
            is_active: true,
            created_by: input.userId,
        })
        .select("*")
        .single();

    if (error) {
        return { ok: false, status: 500, error: error.message };
    }

    logAdminAudit({
        entity: "placement_override",
        id: String(data.id),
        changed_fields: ["create", input.override_kind],
        actor_user_id: input.userId,
        role: input.role,
    });

    return { ok: true, override: data as Record<string, unknown> };
}

export type UpsertPlacementPinOverrideInput = {
    orgId: string;
    userId: string;
    role: string;
    placementCandidateId: string;
    pin_ordinal: number;
    reason: string;
    direction?: "up" | "down" | null;
};

/** Create or update active pin override for manual waitlist position (Card 5.1). */
export async function upsertPlacementPinOverride(
    supabase: SupabaseClient,
    input: UpsertPlacementPinOverrideInput
): Promise<{ ok: true; override: Record<string, unknown> } | { ok: false; status: number; error: string }> {
    const reason = input.reason.trim();
    if (!reason) return { ok: false, status: 400, error: "reason is required" };

    const pinOrdinal = Math.trunc(input.pin_ordinal);
    if (pinOrdinal < 1 || pinOrdinal > 999) {
        return { ok: false, status: 400, error: "pin_ordinal must be between 1 and 999" };
    }

    const candidate = await loadCandidate(supabase, input.orgId, input.placementCandidateId);
    if (!candidate) return { ok: false, status: 404, error: "Placement candidate not found" };
    if (candidate.status !== "active") {
        return { ok: false, status: 409, error: "Manual adjustment applies only to active placement candidates" };
    }

    const { data: existingPin, error: findErr } = await supabase
        .from("placement_overrides")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("placement_candidate_id", input.placementCandidateId)
        .eq("program_room_cohort_key", candidate.program_room_cohort_key)
        .eq("override_kind", "pin")
        .eq("is_active", true)
        .maybeSingle();

    if (findErr) return { ok: false, status: 500, error: findErr.message };

    const payload = { pin_ordinal: pinOrdinal };

    if (existingPin?.id) {
        const priorPayload =
            existingPin.payload != null && typeof existingPin.payload === "object" && !Array.isArray(existingPin.payload)
                ? (existingPin.payload as Record<string, unknown>)
                : {};
        const { data, error } = await supabase
            .from("placement_overrides")
            .update({
                reason,
                payload: { ...priorPayload, ...payload },
            })
            .eq("org_id", input.orgId)
            .eq("id", existingPin.id)
            .select("*")
            .single();

        if (error) return { ok: false, status: 500, error: error.message };

        logAdminAudit({
            entity: "placement_override",
            id: String(existingPin.id),
            changed_fields: ["update", "manual_position"],
            actor_user_id: input.userId,
            role: input.role,
        });

        await emitPlacementManualOrderActivitySafe(supabase, {
            orgId: input.orgId,
            actorUserId: input.userId,
            placementCandidateId: input.placementCandidateId,
            placementOverrideId: String(existingPin.id),
            action: "updated",
            reason,
            direction: input.direction ?? null,
            pinOrdinal,
        });

        return { ok: true, override: data as Record<string, unknown> };
    }

    const created = await createPlacementOverride(supabase, {
        orgId: input.orgId,
        userId: input.userId,
        role: input.role,
        placementCandidateId: input.placementCandidateId,
        override_kind: "pin",
        reason,
        payload,
    });
    if (created.ok) {
        await emitPlacementManualOrderActivitySafe(supabase, {
            orgId: input.orgId,
            actorUserId: input.userId,
            placementCandidateId: input.placementCandidateId,
            placementOverrideId: String(created.override.id),
            action: "created",
            reason,
            direction: input.direction ?? null,
            pinOrdinal,
        });
    }
    return created;
}

/** Release active pin override(s) for manual position reset. */
export async function releaseManualPositionOverrides(
    supabase: SupabaseClient,
    input: Omit<ReleasePlacementOverrideInput, "overrideId"> & { release_reason: string }
): Promise<{ ok: true; released_ids: string[] } | { ok: false; status: number; error: string }> {
    const candidate = await loadCandidate(supabase, input.orgId, input.placementCandidateId);
    if (!candidate) return { ok: false, status: 404, error: "Placement candidate not found" };

    const { data: pins, error: findErr } = await supabase
        .from("placement_overrides")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("placement_candidate_id", input.placementCandidateId)
        .eq("program_room_cohort_key", candidate.program_room_cohort_key)
        .eq("override_kind", "pin")
        .eq("is_active", true);

    if (findErr) return { ok: false, status: 500, error: findErr.message };
    if (!pins?.length) return { ok: false, status: 404, error: "No manual adjustment to reset" };

    const released: string[] = [];
    for (const pin of pins) {
        const result = await releasePlacementOverride(supabase, {
            orgId: input.orgId,
            userId: input.userId,
            role: input.role,
            placementCandidateId: input.placementCandidateId,
            overrideId: pin.id,
            release_reason: input.release_reason,
        });
        if (!result.ok) return result;
        released.push(pin.id);
    }

    await emitPlacementManualOrderActivitySafe(supabase, {
        orgId: input.orgId,
        actorUserId: input.userId,
        placementCandidateId: input.placementCandidateId,
        placementOverrideId: released[0]!,
        action: "released",
        reason: input.release_reason,
    });

    return { ok: true, released_ids: released };
}

export async function releasePlacementOverride(
    supabase: SupabaseClient,
    input: ReleasePlacementOverrideInput
): Promise<{ ok: true; override: Record<string, unknown> } | { ok: false; status: number; error: string }> {
    const releaseReason = input.release_reason.trim();
    if (!releaseReason) return { ok: false, status: 400, error: "release_reason is required" };

    const candidate = await loadCandidate(supabase, input.orgId, input.placementCandidateId);
    if (!candidate) return { ok: false, status: 404, error: "Placement candidate not found" };

    const { data: existing, error: fetchErr } = await supabase
        .from("placement_overrides")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("id", input.overrideId)
        .eq("placement_candidate_id", input.placementCandidateId)
        .maybeSingle();

    if (fetchErr) return { ok: false, status: 500, error: fetchErr.message };
    if (!existing) return { ok: false, status: 404, error: "Override not found" };
    if (existing.is_active !== true) {
        return { ok: false, status: 409, error: "Override is already released" };
    }

    const nowIso = new Date().toISOString();
    const priorPayload =
        existing.payload != null && typeof existing.payload === "object" && !Array.isArray(existing.payload)
            ? (existing.payload as Record<string, unknown>)
            : {};
    const { data, error } = await supabase
        .from("placement_overrides")
        .update({
            is_active: false,
            released_by: input.userId,
            released_at: nowIso,
            payload: { ...priorPayload, release_reason: releaseReason },
        })
        .eq("org_id", input.orgId)
        .eq("id", input.overrideId)
        .select("*")
        .single();

    if (error) return { ok: false, status: 500, error: error.message };

    logAdminAudit({
        entity: "placement_override",
        id: input.overrideId,
        changed_fields: ["release"],
        actor_user_id: input.userId,
        role: input.role,
    });

    return { ok: true, override: data as Record<string, unknown> };
}
