/**
 * Communications V2 — announcements model (PKG-15). PURE, no I/O, no React, no send.
 *
 * Operator-first (Action Workspace doctrine), NOT a campaign/journey tool: audience resolution,
 * consent-gated delivery planning (consent decision injected — PKG-08 owns the gate), and tracking
 * aggregation. Planning shapes rows only; nothing is sent here.
 */

export type AudienceSpec = {
    locationId?: string | null;
    status?: string | null;
    program?: string | null;
};

export type AudienceCandidate = {
    personId: string;
    locationId?: string | null;
    status?: string | null;
    program?: string | null;
};

/** Resolve an audience from a target spec (AND of provided constraints). */
export function resolveAudience(spec: AudienceSpec, candidates: AudienceCandidate[]): {
    personIds: string[];
    count: number;
} {
    const personIds = candidates
        .filter((c) => {
            if (spec.locationId && c.locationId !== spec.locationId) return false;
            if (spec.status && c.status !== spec.status) return false;
            if (spec.program && c.program !== spec.program) return false;
            return true;
        })
        .map((c) => c.personId);
    return { personIds, count: personIds.length };
}

export type DeliveryPlanRow = {
    org_id: string;
    announcement_id: string;
    person_id: string;
    status: string;
};

/** Plan per-recipient deliveries, skipping anyone the injected consent decision blocks. */
export function planAnnouncementDeliveries(opts: {
    orgId: string;
    announcementId: string;
    personIds: string[];
    allow: (personId: string) => boolean;
}): { deliveries: DeliveryPlanRow[]; skipped: string[] } {
    const deliveries: DeliveryPlanRow[] = [];
    const skipped: string[] = [];
    for (const personId of opts.personIds) {
        if (opts.allow(personId)) {
            deliveries.push({ org_id: opts.orgId, announcement_id: opts.announcementId, person_id: personId, status: "queued" });
        } else {
            skipped.push(personId);
        }
    }
    return { deliveries, skipped };
}

/** Aggregate delivery/engagement tracking for an announcement. */
export function aggregateAnnouncementTracking(
    deliveries: { status?: string | null; delivered_at?: string | null; opened_at?: string | null; clicked_at?: string | null }[]
): { total: number; delivered: number; opened: number; clicked: number } {
    let delivered = 0;
    let opened = 0;
    let clicked = 0;
    for (const d of deliveries) {
        if (d.delivered_at) delivered += 1;
        if (d.opened_at) opened += 1;
        if (d.clicked_at) clicked += 1;
    }
    return { total: deliveries.length, delivered, opened, clicked };
}
