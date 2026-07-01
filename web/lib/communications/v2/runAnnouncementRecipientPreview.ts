import type { SupabaseClient } from "@supabase/supabase-js";

import { validateAnnouncementTargets } from "@/lib/communications/v2/announcementService";
import { resolveAudienceSpec, type ResolveTarget } from "@/lib/communications/v2/resolveAnnouncementAudience";
import { audiencePreviewResponse, resolveTargetsToSpec, type LegacyTargetRow } from "@/lib/communications/v2/audienceSpec";
import type { AnnouncementTargetType } from "@/lib/communications/v2/announcementSchema";

export type RecipientPreviewRunResult =
    | { ok: true; preview: ReturnType<typeof audiencePreviewResponse> }
    | { ok: false; status: number; error: string };

/**
 * Resolve announcement audience preview from POST body targets (read-only).
 * Used by both draft-scoped and stateless recipient-preview routes.
 */
export async function runAnnouncementRecipientPreview(
    supabase: SupabaseClient,
    orgId: string,
    body: unknown
): Promise<RecipientPreviewRunResult> {
    if (body == null || typeof body !== "object") {
        return { ok: false, status: 400, error: "Request body must include targets" };
    }

    const rawTargets = (body as Record<string, unknown>).targets;
    if (rawTargets === undefined) {
        return { ok: false, status: 400, error: "targets is required" };
    }

    const parsed = validateAnnouncementTargets(rawTargets);
    if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

    const targets: ResolveTarget[] = parsed.value.map((t) => ({
        target_type: t.target_type,
        target_ref: t.target_ref,
        rule: t.rule,
    }));

    const specRes = resolveTargetsToSpec(targets as LegacyTargetRow[]);
    if (!specRes.ok) return { ok: false, status: 400, error: specRes.error };

    const preview = await resolveAudienceSpec(supabase, orgId, specRes.spec);
    return { ok: true, preview: audiencePreviewResponse(preview) };
}

/** Map saved announcement_targets rows to ResolveTarget[]. */
export function mapSavedAnnouncementTargets(
    rows: Array<{ target_type: string; target_ref: string | null; rule: Record<string, unknown> | null }>
): ResolveTarget[] {
    return rows.map((r) => ({
        target_type: r.target_type as AnnouncementTargetType,
        target_ref: r.target_ref ?? null,
        rule: r.rule ?? null,
    }));
}
