/**
 * Communications V2 — audience resolver PURE helpers (Phase 1 / B6 → B8A).
 *
 * Pure, I/O-free building blocks for audience resolution: set algebra and channel
 * aggregation. The audience MODEL (grain + filters) lives in audienceSpec.ts; the
 * org-scoped DB reads live in resolveAnnouncementAudience.ts.
 *
 * B8A removed all fixed-bucket concepts (active/waitlist/lead/enrolled groups,
 * status-keyword/stage mapping). The resolver now operates on concrete operator-
 * selected criteria only. NO Supabase, NO writes, NO send, NO provider.
 */

export type PersonContact = { id: string; email: string | null; phone: string | null; archived?: boolean };

function hasText(v: string | null | undefined): boolean {
    return typeof v === "string" && v.trim().length > 0;
}

export type ChannelCounts = { email: number; sms: number; in_app: number; messageable: number };

/**
 * Aggregate per-channel reachability from person contact rows. Archived persons are
 * excluded; "messageable" = has an email OR phone (conservative adult proxy that drops
 * contactless children). in_app needs no address, so it equals the messageable count.
 */
export function aggregateChannelCounts(persons: PersonContact[]): ChannelCounts {
    const seen = new Set<string>();
    let email = 0;
    let sms = 0;
    let messageable = 0;
    for (const p of persons) {
        if (!p || typeof p.id !== "string" || p.archived) continue;
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        const e = hasText(p.email);
        const s = hasText(p.phone);
        if (!e && !s) continue;
        messageable++;
        if (e) email++;
        if (s) sms++;
    }
    return { email, sms, in_app: messageable, messageable };
}

/** Distinct union of id sets, order-preserving. */
export function unionDistinct(sets: string[][]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const set of sets) {
        for (const id of set) {
            if (typeof id !== "string" || !id || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
    }
    return out;
}

/** Distinct intersection of two id sets (AND across filters), order-preserving on `a`. */
export function intersectDistinct(a: string[], b: string[]): string[] {
    const setB = new Set(b);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of a) {
        if (typeof id !== "string" || !id) continue;
        if (setB.has(id) && !seen.has(id)) {
            seen.add(id);
            out.push(id);
        }
    }
    return out;
}

// ---- legacy back-compat preview shape (kept so the existing recipient-preview route +
//      B7 schedule path compile unchanged while B8A introduces the spec engine). ----

export type TargetResolution = {
    target_type: string;
    target_ref: string | null;
    status: "resolved" | "unresolved";
    family_count: number;
    detail: string;
};

export type RecipientPreview = {
    total_count: number;
    counts_by_target: TargetResolution[];
    counts_by_channel: ChannelCounts | null;
    excluded: { opted_out: number };
    unresolved: TargetResolution[];
    sample_recipients: { family: string }[];
    capped: boolean;
};

export function buildRecipientPreview(params: {
    perTarget: TargetResolution[];
    totalFamilies: number;
    channelCounts: ChannelCounts | null;
    optedOut: number;
    sampleFamilies: string[];
    capped: boolean;
}): RecipientPreview {
    return {
        total_count: params.totalFamilies,
        counts_by_target: params.perTarget,
        counts_by_channel: params.channelCounts,
        excluded: { opted_out: params.optedOut },
        unresolved: params.perTarget.filter((t) => t.status === "unresolved"),
        sample_recipients: params.sampleFamilies.slice(0, 5).map((family) => ({ family })),
        capped: params.capped,
    };
}
