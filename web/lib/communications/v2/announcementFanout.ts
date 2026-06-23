/**
 * Communications V2 — announcement fan-out PURE decision logic (Phase 1 / B7).
 *
 * Given the resolved recipient persons, the announcement's channels, and per-channel
 * provider availability, decide each (person, channel) outcome:
 *   - "scheduled" (needs an execution row in communication_scheduled_sends), or
 *   - "skipped" with a reason (provider_unavailable | no_address | opted_out | in_app_operator_only).
 *
 * Doctrine: Email/SMS without a provider binding → skipped/provider_unavailable, NEVER queued.
 * In-App is operator-side only (no parent-facing delivery) → always skipped/in_app_operator_only.
 *
 * Pure: NO Supabase, NO HTTP, NO writes, NO send. The IO that reads recipients and writes
 * the snapshot/execution rows lives in the schedule service.
 */

import type { AnnouncementChannel, AnnouncementSuppressedReason } from "@/lib/communications/v2/announcementSchema";

export type RecipientPerson = {
    person_id: string;
    email: string | null;
    phone: string | null;
    /** opted out of the `announcements` consent category. */
    opted_out: boolean;
};

/** Whether the org has an active outbound binding for each provider channel. */
export type ChannelAvailability = { email: boolean; sms: boolean };

export type FanoutOutcome = "scheduled" | "skipped";

export type FanoutRow = {
    person_id: string;
    channel: AnnouncementChannel;
    address: string | null;
    outcome: FanoutOutcome;
    suppressed_reason: AnnouncementSuppressedReason | null;
    /** true only when an execution row should be created in communication_scheduled_sends. */
    needs_scheduled_send: boolean;
};

function hasText(v: string | null | undefined): boolean {
    return typeof v === "string" && v.trim().length > 0;
}

function planProviderChannel(person: RecipientPerson, channel: "email" | "sms", available: boolean): FanoutRow {
    const base = { person_id: person.person_id, channel, address: null as string | null };
    // Consent first.
    if (person.opted_out) {
        return { ...base, outcome: "skipped", suppressed_reason: "opted_out", needs_scheduled_send: false };
    }
    // Provider availability (doctrine: no binding → skipped, never queued).
    if (!available) {
        return { ...base, outcome: "skipped", suppressed_reason: "provider_unavailable", needs_scheduled_send: false };
    }
    // Address present?
    const addr = channel === "email" ? person.email : person.phone;
    if (!hasText(addr)) {
        return { ...base, outcome: "skipped", suppressed_reason: "no_address", needs_scheduled_send: false };
    }
    return {
        person_id: person.person_id,
        channel,
        address: (addr as string).trim(),
        outcome: "scheduled",
        suppressed_reason: null,
        needs_scheduled_send: true,
    };
}

/**
 * Plan fan-out for every (person, channel) pair. One row per pair; persons are assumed
 * already de-duped by person_id.
 */
export function planAnnouncementFanout(
    persons: RecipientPerson[],
    channels: AnnouncementChannel[],
    availability: ChannelAvailability
): FanoutRow[] {
    const rows: FanoutRow[] = [];
    for (const person of persons) {
        for (const channel of channels) {
            if (channel === "in_app") {
                // Operator-side only — no parent-facing delivery, no execution row.
                rows.push({
                    person_id: person.person_id,
                    channel,
                    address: null,
                    outcome: "skipped",
                    suppressed_reason: "in_app_operator_only",
                    needs_scheduled_send: false,
                });
            } else if (channel === "email") {
                rows.push(planProviderChannel(person, "email", availability.email));
            } else {
                rows.push(planProviderChannel(person, "sms", availability.sms));
            }
        }
    }
    return rows;
}

export type FanoutSummary = {
    scheduled: number;
    skipped: number;
    by_reason: Record<string, number>;
    execution_rows: number;
};

/** Aggregate a fan-out plan for the schedule response (pure). */
export function summarizeFanout(rows: FanoutRow[]): FanoutSummary {
    const summary: FanoutSummary = { scheduled: 0, skipped: 0, by_reason: {}, execution_rows: 0 };
    for (const r of rows) {
        if (r.outcome === "scheduled") summary.scheduled++;
        else {
            summary.skipped++;
            const key = r.suppressed_reason ?? "unknown";
            summary.by_reason[key] = (summary.by_reason[key] ?? 0) + 1;
        }
        if (r.needs_scheduled_send) summary.execution_rows++;
    }
    return summary;
}
