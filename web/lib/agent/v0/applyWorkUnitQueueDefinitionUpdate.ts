/**
 * Shared apply path for `work_units.queue_definition` updates (admin PATCH + agent v0 orchestration).
 * Enforces strict v1 schema + optimistic concurrency. Org scoping is the caller's responsibility.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";
import {
    getQueueDefinitionStoredVersion,
    parseQueueDefinitionV1Strict,
    serializeQueueDefinitionV1,
} from "@/lib/rrs/queue/queueDefinitionV1";

function isPlainQueueDefinitionObject(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export type ApplyQueueDefinitionResult =
    | {
          ok: true;
          row: Record<string, unknown>;
      }
    | {
          ok: false;
          status: 400 | 404 | 409;
          error: string;
          code: "VALIDATION_FAILED" | "STALE_VERSION" | "NOT_FOUND";
    };

export type PrepareQueueDefinitionPatchResult =
    | { ok: true; nextQueueDefinition: Record<string, unknown> }
    | {
          ok: false;
          status: 400 | 409;
          error: string;
          code: "VALIDATION_FAILED" | "STALE_VERSION";
    };

/**
 * Pure validation + concurrency check for `queue_definition` PATCH (reusable from admin route merge).
 */
export function prepareQueueDefinitionPatch(
    currentRaw: unknown,
    incoming: unknown | null,
    expectedVersion: number
): PrepareQueueDefinitionPatchResult {
    const currentVersion = getQueueDefinitionStoredVersion(currentRaw);
    if (expectedVersion !== currentVersion) {
        return {
            ok: false,
            status: 409,
            error: "queue_definition version mismatch (stale expected_queue_definition_version)",
            code: "STALE_VERSION",
        };
    }

    if (incoming === null) {
        return { ok: true, nextQueueDefinition: {} };
    }

    if (isPlainQueueDefinitionObject(incoming) && Array.isArray(incoming.queues)) {
        try {
            const validated = validateQueueDefinition(incoming);
            return { ok: true, nextQueueDefinition: validated as unknown as Record<string, unknown> };
        } catch (e) {
            const msg = e instanceof Error && e.message ? e.message : "queue_definition is invalid";
            return {
                ok: false,
                status: 400,
                error: msg,
                code: "VALIDATION_FAILED",
            };
        }
    }

    const parsed = parseQueueDefinitionV1Strict(incoming);
    if (!parsed.ok) {
        return {
            ok: false,
            status: 400,
            error: parsed.error,
            code: "VALIDATION_FAILED",
        };
    }
    return { ok: true, nextQueueDefinition: serializeQueueDefinitionV1(parsed.value) };
}

/**
 * Update `queue_definition` for a work unit in org.
 * - `queue_definition === null` clears to `{}` in DB (no version field → stored version reads as 0).
 * - Object payload must pass `parseQueueDefinitionV1Strict`.
 */
export async function applyWorkUnitQueueDefinitionUpdate(
    supabase: SupabaseClient,
    orgId: string,
    workUnitId: string,
    input: {
        queue_definition: unknown | null;
        expected_queue_definition_version: number;
    }
): Promise<ApplyQueueDefinitionResult> {
    const { data: existing, error: fetchErr } = await supabase
        .from("work_units")
        .select("id, org_id, queue_definition")
        .eq("id", workUnitId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (fetchErr) {
        return { ok: false, status: 400, error: fetchErr.message, code: "VALIDATION_FAILED" };
    }
    if (!existing) {
        return { ok: false, status: 404, error: "Not found", code: "NOT_FOUND" };
    }

    const prep = prepareQueueDefinitionPatch(
        existing.queue_definition,
        input.queue_definition,
        input.expected_queue_definition_version
    );
    if (!prep.ok) {
        return {
            ok: false,
            status: prep.status,
            error: prep.error,
            code: prep.code,
        };
    }

    const updates: Record<string, unknown> = {
        queue_definition: prep.nextQueueDefinition,
        updated_at: new Date().toISOString(),
    };

    const { data: updated, error: updateErr } = await supabase
        .from("work_units")
        .update(updates)
        .eq("id", workUnitId)
        .eq("org_id", orgId)
        .select()
        .single();

    if (updateErr) {
        return {
            ok: false,
            status: 400,
            error: updateErr.message,
            code: "VALIDATION_FAILED",
        };
    }

    return { ok: true, row: updated as Record<string, unknown> };
}
