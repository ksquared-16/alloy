import crypto from "crypto";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getPublicAppOrigin } from "@/lib/publicAppUrl";

const SHORT_CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

function randomShortCode(length = 8): string {
    const bytes = crypto.randomBytes(length);
    let out = "";
    for (let i = 0; i < length; i++) {
        out += SHORT_CODE_CHARS[bytes[i]! % SHORT_CODE_CHARS.length];
    }
    return out;
}

/** Public path for SMS (uses short_code when present). */
export function buildShortActionLinkUrl(shortCode: string, originOverride?: string | null): string {
    const code = String(shortCode ?? "").trim();
    if (!code) return "";
    const override = String(originOverride ?? "")
        .trim()
        .replace(/\/$/, "");
    const root = override || getPublicAppOrigin() || "";
    return root ? `${root}/a/${code}` : `/a/${code}`;
}

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
): Promise<{ token: string; short_code: string } | null> {
    let admin: ReturnType<typeof createAdminClient>;
    try {
        admin = createAdminClient();
        console.log("[createActionLink] admin client created successfully");
    } catch (e) {
        console.error("[createActionLink] admin client failed", e);
        return null;
    }

    const token = crypto.randomBytes(24).toString("hex");

    const expiresIn = params.expires_in_minutes ?? 120;
    const expires_at = new Date(Date.now() + expiresIn * 60_000).toISOString();

    const baseRow = {
        token,
        org_id: params.org_id,
        action_type: params.action_type,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        metadata: (params.metadata ?? {}) as Record<string, unknown>,
        expires_at,
    };

    for (let attempt = 0; attempt < 8; attempt++) {
        const short_code = randomShortCode(8);
        const { error } = await admin.from("action_links").insert({
            ...baseRow,
            short_code,
        });

        if (!error) {
            return { token, short_code };
        }
        const msg = error.message ?? "";
        if (msg.includes("duplicate") || msg.includes("unique") || error.code === "23505") {
            continue;
        }
        console.error("[createActionLink] insert error:", error);
        return null;
    }

    console.error("[createActionLink] exhausted short_code retries");
    return null;
}

export type ActionType = "vendor_accept_job" | "customer_reschedule" | "customer_cancel";
