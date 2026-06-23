/**
 * Communications pack metrics — communication_messages + communication_delivery_events.
 */

import type { MetricResolveContext, ResolvedMetricValue } from "@/lib/metrics/types";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { buildMetricResultBase } from "@/lib/metrics/resolvers/metricResolveBase";
import { resolveMetricScopeFilter } from "@/lib/metrics/scopeFilter";

export type DeliveryEventRow = {
    event_type: string;
    message_id: string;
    occurred_at: string;
};

export type OutboundMessageRow = {
    id: string;
    direction: string;
    sent_at: string | null;
    replied_at: string | null;
    created_at: string;
};

export function computeDeliveryRate(
    messages: OutboundMessageRow[],
    deliveredMessageIds: Set<string>
): { rate: number | null; sent: number; delivered: number } {
    const sent = messages.filter((m) => m.direction === "outbound" && m.sent_at);
    const sentCount = sent.length;
    if (sentCount === 0) return { rate: null, sent: 0, delivered: 0 };
    const delivered = sent.filter((m) => deliveredMessageIds.has(m.id)).length;
    return { rate: delivered / sentCount, sent: sentCount, delivered };
}

export function computeReplyRate(messages: OutboundMessageRow[]): {
    rate: number | null;
    sent: number;
    replied: number;
} {
    const sent = messages.filter((m) => m.direction === "outbound" && m.sent_at);
    const sentCount = sent.length;
    if (sentCount === 0) return { rate: null, sent: 0, replied: 0 };
    const replied = sent.filter((m) => m.replied_at).length;
    return { rate: replied / sentCount, sent: sentCount, replied };
}

export function countFailedDeliveryEvents(events: DeliveryEventRow[]): number {
    return events.filter((e) => e.event_type === "failed" || e.event_type === "bounced").length;
}

async function loadOutboundMessagesInWindow(ctx: MetricResolveContext, windowStart: Date, windowEnd: Date) {
    let q = ctx.supabase
        .from("communication_messages")
        .select("id, direction, sent_at, replied_at, created_at")
        .eq("org_id", ctx.orgId)
        .eq("direction", "outbound")
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", windowEnd.toISOString());

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as OutboundMessageRow[];
}

export async function resolveCommsDeliveryRate(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("comms.delivery_rate");
    const now = ctx.now ?? new Date();
    const base = buildMetricResultBase(ctx, def, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);
    if (filter.impossible) {
        return { ...base, value: null, formattedValue: "—", meta: { sent: 0, delivered: 0 } };
    }

    const windowStart = new Date(base.windowStartIso);
    const windowEnd = new Date(base.windowEndIso);
    const messages = await loadOutboundMessagesInWindow(ctx, windowStart, windowEnd);

    const messageIds = messages.map((m) => m.id);
    let deliveredIds = new Set<string>();
    if (messageIds.length) {
        const { data: events, error } = await ctx.supabase
            .from("communication_delivery_events")
            .select("message_id, event_type, occurred_at")
            .eq("org_id", ctx.orgId)
            .eq("event_type", "delivered")
            .in("message_id", messageIds)
            .gte("occurred_at", windowStart.toISOString())
            .lte("occurred_at", windowEnd.toISOString());
        if (error) throw new Error(error.message);
        deliveredIds = new Set((events ?? []).map((e) => (e as { message_id: string }).message_id));
    }

    const { rate, sent, delivered } = computeDeliveryRate(messages, deliveredIds);
    return {
        ...base,
        value: rate,
        formattedValue: formatMetricValue(def.format, rate),
        meta: { sent, delivered },
    };
}

export async function resolveCommsReplyRate(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("comms.reply_rate");
    const now = ctx.now ?? new Date();
    const base = buildMetricResultBase(ctx, def, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);
    if (filter.impossible) {
        return { ...base, value: null, formattedValue: "—", meta: { sent: 0, replied: 0 } };
    }

    const windowStart = new Date(base.windowStartIso);
    const windowEnd = new Date(base.windowEndIso);
    const messages = await loadOutboundMessagesInWindow(ctx, windowStart, windowEnd);
    const { rate, sent, replied } = computeReplyRate(messages);

    return {
        ...base,
        value: rate,
        formattedValue: formatMetricValue(def.format, rate),
        meta: { sent, replied },
    };
}

export async function resolveCommsFailedDeliveryCount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("comms.failed_delivery_count");
    const now = ctx.now ?? new Date();
    const base = buildMetricResultBase(ctx, def, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);
    if (filter.impossible) {
        return { ...base, value: 0, formattedValue: "0", meta: { failed: 0 } };
    }

    const windowStart = base.windowStartIso;
    const windowEnd = base.windowEndIso;
    const { data, error } = await ctx.supabase
        .from("communication_delivery_events")
        .select("event_type, message_id, occurred_at")
        .eq("org_id", ctx.orgId)
        .in("event_type", ["failed", "bounced"])
        .gte("occurred_at", windowStart)
        .lte("occurred_at", windowEnd);

    if (error) throw new Error(error.message);
    const failed = countFailedDeliveryEvents((data ?? []) as DeliveryEventRow[]);

    return {
        ...base,
        value: failed,
        formattedValue: formatMetricValue(def.format, failed),
        meta: { failed },
    };
}
