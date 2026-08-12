/**
 * Warm-on-intent cache for Send Tour Invitation prepare drafts.
 *
 * What's Next warms this on Tour intent so the centered compose host opens with
 * subject/body/link already available instead of blocking on mint + template.
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
    return fetchPrepareDraft(key);
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

export function prefetchTourInvitationPrepare(opportunityId: string | null | undefined): void {
    if (typeof window === "undefined") return;
    const key = cacheKey(opportunityId ?? "");
    if (!key) return;
    const existing = cache.get(key);
    if (existing && Date.now() - existing.at <= TTL_MS) return;
    const promise = fetchPrepareDraft(key)
        .then((draft) => {
            const cur = cache.get(key);
            if (cur) cur.draft = draft;
            return draft;
        })
        .catch(() => null);
    cache.set(key, { promise, draft: null, at: Date.now() });
}

export function invalidateTourInvitationPrepare(opportunityId: string | null | undefined): void {
    const key = cacheKey(opportunityId ?? "");
    if (!key) return;
    cache.delete(key);
}
