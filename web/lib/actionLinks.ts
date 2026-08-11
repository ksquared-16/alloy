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

/**
 * Claim a single-use action link ATOMICALLY — `RL-32`, the replay leg.
 *
 * ## Why a read-then-write is not a consumption check
 *
 * All three `action_links` consumers used to establish "not yet used" by SELECTing `consumed_at`
 * and then UPDATEing by `id` alone. Those are two statements, and between them the row is
 * unguarded: two requests carrying the same token both read `consumed_at = null`, both pass the
 * check, and both proceed. The write does not fail, because `.eq("id", …)` matches a consumed row
 * exactly as happily as an unconsumed one — it simply overwrites the first request's timestamp.
 *
 * The observable cost is not a duplicate row in `action_links`; it is everything the routes do
 * AFTER the check. `consume-reschedule` moves the appointment and emits `action_link_consumed`;
 * `action/[token]/consume` emits the same event and runs every matching workflow. Run twice, that
 * is a schedule written twice and a second round of customer-facing SMS/email from one credential
 * the product calls single-use.
 *
 * `.is("consumed_at", null)` moves the predicate INTO the write, so the database decides the race:
 * the UPDATE matches the row only while it is still unclaimed, and `.select()` reports whether this
 * caller is the one that matched. Exactly one concurrent caller sees `claimed: true`.
 *
 * This is the pattern the tour family already uses (`consumeTourAction`,
 * `lib/tours/public/authorizeTourAction.ts`) — so this is an inconsistency inside the codebase
 * being closed, not a standard being invented here.
 *
 * ## How to use it
 *
 * Claim BEFORE the side effect, and treat a lost claim as a replay rather than an error: the
 * loser's user is not an attacker, they are someone who double-clicked or whose link was retried.
 * A caller that performs its side effect first and claims afterwards has not used this function to
 * gate anything.
 *
 * `patch` carries any additional columns to write in the same statement — keeping them here rather
 * than in a follow-up UPDATE means the winner's bookkeeping lands with the claim, not after it.
 */
export async function claimActionLink(
    supabase: {
        from: (table: string) => {
            update: (patch: Record<string, unknown>) => {
                eq: (col: string, val: string) => {
                    is: (col: string, val: null) => {
                        select: (cols: string) => {
                            maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
                        };
                    };
                };
            };
        };
    },
    linkId: string,
    patch: Record<string, unknown> = {}
): Promise<{ claimed: boolean }> {
    const { data, error } = await supabase
        .from("action_links")
        .update({ ...patch, consumed_at: new Date().toISOString() })
        .eq("id", linkId)
        .is("consumed_at", null)
        .select("id")
        .maybeSingle();

    // A failed write is NOT a claim. Returning false here means the caller refuses the side effect,
    // which is the safe direction: a link that was not consumed can be retried, whereas a side
    // effect performed against a failed claim cannot be taken back.
    if (error) return { claimed: false };
    return { claimed: Boolean(data) };
}
