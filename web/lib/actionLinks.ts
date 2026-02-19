import crypto from "crypto";
import { createAdminClient } from "@/lib/supabaseAdmin";

export interface CreateActionLinkParams {
    org_id: string | null;
    action_type: string;
    entity_type: string;
    entity_id: string;
    expires_in_minutes: number;
    metadata?: Record<string, unknown> | null;
}

export async function createActionLink(
    _supabase: unknown,
    params: {
        org_id: string | null;
        action_type: string;
        entity_type: string;
        entity_id: string | null;
        expires_in_minutes?: number;
        metadata?: unknown;
    }
): Promise<string | null> {
    const admin = createAdminClient();

    const token = crypto.randomBytes(24).toString("hex");

    const expiresIn = params.expires_in_minutes ?? 120;
    const expires_at = new Date(Date.now() + expiresIn * 60_000).toISOString();

    const { error } = await admin.from("action_links").insert({
        token,
        org_id: params.org_id,
        action_type: params.action_type,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        metadata: params.metadata ?? null,
        expires_at,
    });

    if (error) {
        console.error("[createActionLink] insert error:", error);
        return null;
    }

    return token;
}

export type ActionType = "vendor_accept_job" | "customer_reschedule" | "customer_cancel";
