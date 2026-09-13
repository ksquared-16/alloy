/**
 * Prepare-draft cache for Send Tour Invitation.
 *
 * THIS IS NO LONGER WARMED ON HOVER, AND MUST NOT BE.
 *
 * `prepare` is not a read. It calls `mintTourInvitation`, which creates a durable tour invitation
 * and its PUBLIC action tokens — select_tour_slot, view_tour_slots, decline_tour — each an
 * externally resolvable URL a parent can act on. Warming that on pointer-enter created a real
 * invitation every time focus crossed the action row, and because `fetchPrepareDraft` minted a
 * fresh `crypto.randomUUID()` idempotency key per call, the server's own replay dedupe could not
 * collapse them. It also sent `confirmation: { confirmed: true }` for a capability whose
 * `confirmationPolicy` is "confirm" — speculation asserting an operator decision nobody made.
 *
 * Nothing was lost by moving it behind intent. `useTourInvitationComposeSeed` already called
 * `provisionTourInvitationPrepare` when the composer opens, so the mint always happened there too;
 * the hover call only bought its latency. Recipients, thread and channel are still warmed on hover
 * by the family-workspace prefetch, and the composer chunk is still preloaded.
 *
 * The cache stays, and now earns its keep at the other end: the intent path SEEDS it, so reopening
 * the composer inside the TTL reuses the invitation already minted instead of superseding and
 * reissuing a second one.
 */

export type TourInvitationPrepareDraft = {
    invitationId: string | null;
    emailSubject: string;
    emailBody: string;
    smsBody: string;
    recipientDisplayName: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    recipientPersonId: string | null;
    invitationActionUrl: string | null;
};

type CacheEntry = {
    promise: Promise<TourInvitationPrepareDraft | null>;
    draft: TourInvitationPrepareDraft | null;
    at: number;
};

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(opportunityId: string): string {
    return String(opportunityId ?? "").trim();
}

/** Extract prepare detail whether the API nests `.detail` or returns detail as `execution_result`. */
export function tourInvitationDetailFromExecutePayload(json: unknown): Record<string, unknown> | null {
    if (!json || typeof json !== "object") return null;
    const data = (json as { data?: unknown }).data;
    if (!data || typeof data !== "object") return null;
    const execution = (data as { execution_result?: unknown }).execution_result;
    if (!execution || typeof execution !== "object") return null;
    const nested = (execution as { detail?: unknown }).detail;
    if (nested && typeof nested === "object") return nested as Record<string, unknown>;
    return execution as Record<string, unknown>;
}

export function tourInvitationDraftFromDetail(detail: Record<string, unknown> | null): TourInvitationPrepareDraft | null {
    if (!detail) return null;
    const draft = (detail.draft && typeof detail.draft === "object" ? detail.draft : null) as Record<
        string,
        unknown
    > | null;
    const invitationId =
        String(detail.invitation_id ?? draft?.invitationId ?? "").trim() || null;
    const emailSubject = String(draft?.emailSubject ?? "").trim();
    const emailBody = String(draft?.emailBody ?? "").trim();
    const smsBody = String(draft?.smsBody ?? "").trim();
    const invitationActionUrl = String(draft?.invitationActionUrl ?? "").trim() || null;
    // Guarantee the booking link appears in the email body when prepare minted one.
    let ensuredEmailBody = emailBody;
    if (invitationActionUrl && ensuredEmailBody && !ensuredEmailBody.includes(invitationActionUrl)) {
        ensuredEmailBody = `${ensuredEmailBody.trim()}\n\n${invitationActionUrl}`;
    } else if (invitationActionUrl && !ensuredEmailBody) {
        ensuredEmailBody = invitationActionUrl;
    }
    let ensuredSmsBody = smsBody;
    if (invitationActionUrl && ensuredSmsBody && !ensuredSmsBody.includes(invitationActionUrl)) {
        ensuredSmsBody = `${ensuredSmsBody.trim()} ${invitationActionUrl}`;
    } else if (invitationActionUrl && !ensuredSmsBody) {
        ensuredSmsBody = invitationActionUrl;
    }
    return {
        invitationId,
        emailSubject,
        emailBody: ensuredEmailBody,
        smsBody: ensuredSmsBody,
        recipientDisplayName: draft?.recipientDisplayName != null ? String(draft.recipientDisplayName) : null,
        recipientEmail: draft?.recipientEmail != null ? String(draft.recipientEmail) : null,
        recipientPhone: draft?.recipientPhone != null ? String(draft.recipientPhone) : null,
        recipientPersonId: draft?.recipientPersonId != null ? String(draft.recipientPersonId) : null,
        invitationActionUrl,
    };
}

async function fetchPrepareDraft(opportunityId: string): Promise<TourInvitationPrepareDraft | null> {
    const res = await fetch("/api/admin/actions/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action_key: "send_tour_invitation",
            entity_type: "opportunity",
            entity_id: opportunityId,
            context: { surface: "focus_panel", origin: "operator" },
            payload: {
                mode: "prepare",
                idempotency_key: `send_tour_invitation:prepare:${opportunityId}:${crypto.randomUUID()}`,
            },
            confirmation: { confirmed: true },
        }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json as { ok?: boolean }).ok === false) return null;
    return tourInvitationDraftFromDetail(tourInvitationDetailFromExecutePayload(json));
}

/**
 * Canonical Tour Invitation Link provisioning for both:
 * - Send Tour Invitation (automatic draft seed)
 * - Insert ▾ → Tour Invitation Link (manual)
 *
 * Always hits the server-owned prepare path (fresh mint/reissue semantics).
 * `forceFresh` bypasses the warm-on-intent cache so Insert never reuses a stale draft.
 */
export async function provisionTourInvitationPrepare(
    opportunityId: string | null | undefined,
    options?: { forceFresh?: boolean },
): Promise<TourInvitationPrepareDraft | null> {
    const key = cacheKey(opportunityId ?? "");
    if (!key) return null;
    if (options?.forceFresh) {
        cache.delete(key);
        return fetchPrepareDraft(key);
    }
    const warmed = takeTourInvitationPrepare(key);
    if (warmed) {
        const draft = await warmed;
        if (draft?.invitationActionUrl) return draft;
    }
    const peeked = peekTourInvitationPrepare(key);
    if (peeked?.invitationActionUrl) return peeked;
    /*
     * Seed the cache with what INTENT minted.
     *
     * Reopening the composer inside the TTL must not mint a second invitation. The server treats a
     * repeated prepare under one key as a replay it cannot re-derive tokens for, so it supersedes
     * and reissues — correct for a stale offer, wrong for an operator who closed the panel and
     * opened it again a moment later. Caching the first intent-driven result is what makes reopen
     * reuse rather than reissue. `forceFresh` (Insert ▾ → Tour Invitation Link) still bypasses this
     * deliberately, above.
     */
    const draft = await fetchPrepareDraft(key);
    if (draft) {
        cache.set(key, { promise: Promise.resolve(draft), draft, at: Date.now() });
    }
    return draft;
}

export function peekTourInvitationPrepare(opportunityId: string | null | undefined): TourInvitationPrepareDraft | null {
    const key = cacheKey(opportunityId ?? "");
    if (!key) return null;
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.draft;
}

export function takeTourInvitationPrepare(opportunityId: string | null | undefined): Promise<TourInvitationPrepareDraft | null> | null {
    const key = cacheKey(opportunityId ?? "");
    if (!key) return null;
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.promise;
}

/*
 * `prefetchTourInvitationPrepare` was removed, not disabled.
 *
 * It was the speculative entry point into a minting endpoint, and leaving it exported would let the
 * same defect be reintroduced by any future warmer that reached for the obvious name. The warm
 * paths now share `speculativeFetch`, which cannot express a POST at all; this function could not
 * have been written on top of it.
 */

export function invalidateTourInvitationPrepare(opportunityId: string | null | undefined): void {
    const key = cacheKey(opportunityId ?? "");
    if (!key) return;
    cache.delete(key);
}
