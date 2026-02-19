import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";

const TOKEN_BYTES = 32;

function secureRandomToken(): string {
    const bytes = new Uint8Array(TOKEN_BYTES);
    if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < TOKEN_BYTES; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CreateActionLinkParams {
    org_id: string | null;
    action_type: string;
    entity_type: string;
    entity_id: string;
    expires_in_minutes: number;
    metadata?: Record<string, unknown> | null;
}

/**
 * Create a one-time action link row. Returns the token (for building the URL) or null on failure.
 */
export async function createActionLink(
    supabase: SupabaseClient,
    params: CreateActionLinkParams
): Promise<string | null> {
    const token = secureRandomToken();
    const expiresAt = new Date(Date.now() + params.expires_in_minutes * 60 * 1000).toISOString();
    const admin = createAdminClient();
    const { error } = await admin.from("action_links").insert({
        token,
        org_id: params.org_id,
        action_type: params.action_type,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        metadata: params.metadata ?? null,
        expires_at: expiresAt,
    });
    if (error) {
        console.error("[actionLinks] create failed", error);
        return null;
    }
    return token;
}

export type ActionType = "vendor_accept_job" | "customer_reschedule" | "customer_cancel";
