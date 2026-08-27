import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";

/**
 * Public action-link entry point: `/a/<token-or-short-code>`.
 *
 * WHY THE SELECT LIST MATTERS HERE
 *
 * S-3 removed the plaintext bearer token from the database in two migrations —
 * `20260818220000` added `token_hash` and backfilled it, `20260818230000` DROPPED
 * `action_links.token`. The mint and every other reader moved to the digest. This page moved
 * its WHERE clause (`.eq("token_hash", …)`) but kept `token` in its SELECT list, and that half
 * was the whole defect: PostgREST rejects the ENTIRE query when one selected column does not
 * exist, so BOTH the by-hash and the by-short-code lookups failed, `row` stayed null, and every
 * action link fell through to `redirect("/")` — the marketing homepage.
 *
 * It presented as a routing or origin bug and was neither. A live probe showed
 * `x-matched-path: /a/[token]` with `307 → /`: the application owned the route and was
 * redirecting itself. It also looked environment-specific — localhost still worked — only
 * because a local database that had not taken the drop still had the column.
 *
 * So: never select a column this table no longer has, and never let a failed lookup and a
 * genuinely unknown token share a silent exit.
 */

/** Columns that still exist after S-3. `token` is deliberately absent — it was dropped. */
const ACTION_LINK_COLUMNS =
    "short_code, action_type, entity_type, entity_id, consumed_at, expires_at, metadata" as const;

export default async function ActionLinkPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    if (!token) redirect("/");

    const supabase = createServiceRoleClient();

    let row: Record<string, unknown> | null = null;
    /**
     * True when the caller presented the bearer token itself rather than a short code.
     *
     * This is the ONLY way to recover the plaintext after S-3: the digest is one-way, so the
     * token cannot be read back out of the row — it can only be recognised. When the hash
     * matched, the string the recipient presented IS the credential.
     */
    let presentedPlaintextToken = false;

    const byToken = await supabase
        .from("action_links")
        .select(ACTION_LINK_COLUMNS)
        .eq("token_hash", hashFormLinkToken(token))
        .maybeSingle();
    if (byToken.data && !byToken.error) {
        row = byToken.data as Record<string, unknown>;
        presentedPlaintextToken = true;
    } else {
        if (byToken.error) {
            // A malformed query here used to be indistinguishable from "no such link". It is not:
            // one is a bug and the other is a stranger with a bad URL.
            console.error("[action-link] lookup by token_hash failed", byToken.error.message);
        }
        const byShort = await supabase
            .from("action_links")
            .select(ACTION_LINK_COLUMNS)
            .eq("short_code", token)
            .maybeSingle();
        if (byShort.data && !byShort.error) {
            row = byShort.data as Record<string, unknown>;
        } else if (byShort.error) {
            console.error("[action-link] lookup by short_code failed", byShort.error.message);
        }
    }

    if (!row) redirect("/");
    if ((row as { consumed_at: string | null }).consumed_at) redirect("/a/used");
    const expiresAt = new Date((row as { expires_at: string }).expires_at);
    if (expiresAt <= new Date()) redirect("/a/expired");

    const actionType = (row as { action_type: string }).action_type;
    // Only meaningful when the recipient presented the token itself; a short code cannot be
    // exchanged for the plaintext any more.
    const resolvedToken = presentedPlaintextToken ? token : "";

    // Tour booking aliases: short code → same-origin `/tour-booking/…` path (no `/action` hop).
    // This branch needs no plaintext at all — the destination is carried in metadata — which is
    // why Tour is fully recoverable from a short code.
    if (actionType === "tour_booking_redirect") {
        const meta = (row as { metadata?: unknown }).metadata;
        const redirectPath =
            meta && typeof meta === "object" && !Array.isArray(meta)
                ? String((meta as Record<string, unknown>).redirect_path ?? "").trim()
                : "";
        if (
            redirectPath.startsWith("/tour-booking/")
            && !redirectPath.includes("://")
            && !redirectPath.includes("//")
            && !redirectPath.includes("\\")
        ) {
            redirect(redirectPath);
        }
        redirect("/");
    }

    if (!resolvedToken) {
        // A short code for an action type whose destination is built from the plaintext token.
        // S-3 made that unrecoverable by design. Logged rather than silently bounced, so this
        // shows up as the distinct condition it is instead of looking like an unknown link.
        console.error("[action-link] short code cannot yield a plaintext token after S-3", {
            action_type: actionType,
        });
        redirect("/");
    }

    const entityType = (row as { entity_type: string }).entity_type;

    if (actionType === "vendor_accept_job" && entityType === "job") {
        redirect(`/action/${encodeURIComponent(resolvedToken)}`);
    }
    if (actionType === "customer_reschedule" || actionType === "reschedule_schedule") {
        redirect(`/book-v2?reschedule_token=${encodeURIComponent(resolvedToken)}`);
    }
    if (actionType === "customer_cancel") {
        redirect(`/action/${encodeURIComponent(resolvedToken)}`);
    }

    // Unrecognised action type. Unchanged from before this repair — widening it would be
    // inventing routing, not fixing a dropped column.
    redirect("/");
}
