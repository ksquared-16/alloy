/** Operational health derivations for Communications workspace nav bands (Doctrine V3). */

import type { CommsInboxKpiMetrics } from "@/lib/communications/v2/communicationsWorkspaceKpiModel";

export type CommsTemplateHealthRow = {
    status: string;
    updated_at: string | null;
    has_version?: boolean;
};

export type CommsAnnouncementHealthRow = {
    status: string;
    updated_at: string | null;
    failed_recipient_count?: number;
};

export type CommsInboxOperationalHealth = {
    needsReply: number;
    unread: number;
    scheduled: number;
    needsReview: number;
};

export type CommsAnnouncementOperationalHealth = {
    draft: number;
    scheduled: number;
    sentToday: number;
    failed: number;
};

export type CommsTemplateOperationalHealth = {
    active: number;
    draft: number;
    needsReview: number;
    recentlyUpdated: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isToday(iso: string | null): boolean {
    if (!iso) return false;
    const at = Date.parse(iso);
    if (Number.isNaN(at)) return false;
    const d = new Date(at);
    const now = new Date();
    return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    );
}

function isWithinDays(iso: string | null, days: number): boolean {
    if (!iso) return false;
    const at = Date.parse(iso);
    if (Number.isNaN(at)) return false;
    return Date.now() - at <= days * DAY_MS;
}

export function computeInboxOperationalHealth(
    metrics: CommsInboxKpiMetrics | null,
    scheduledCount: number,
): CommsInboxOperationalHealth {
    return {
        needsReply: metrics?.requiresResponse ?? 0,
        unread: metrics?.unread ?? 0,
        scheduled: scheduledCount,
        needsReview: metrics?.unclassified ?? 0,
    };
}

export function computeAnnouncementOperationalHealth(
    rows: CommsAnnouncementHealthRow[],
): CommsAnnouncementOperationalHealth {
    let draft = 0;
    let scheduled = 0;
    let sentToday = 0;
    let failed = 0;
    for (const row of rows) {
        const status = row.status.toLowerCase();
        if (status === "draft") draft += 1;
        else if (status === "scheduled") scheduled += 1;
        else if (status === "sent" && isToday(row.updated_at)) sentToday += 1;
        failed += row.failed_recipient_count ?? 0;
    }
    return { draft, scheduled, sentToday, failed };
}

export function computeTemplateOperationalHealth(rows: CommsTemplateHealthRow[]): CommsTemplateOperationalHealth {
    let active = 0;
    let draft = 0;
    let needsReview = 0;
    let recentlyUpdated = 0;
    for (const row of rows) {
        const status = row.status.toLowerCase();
        if (status === "active") active += 1;
        if (status === "draft") {
            draft += 1;
            if (row.has_version) needsReview += 1;
        }
        if (isWithinDays(row.updated_at, 7)) recentlyUpdated += 1;
    }
    return { active, draft, needsReview, recentlyUpdated };
}
