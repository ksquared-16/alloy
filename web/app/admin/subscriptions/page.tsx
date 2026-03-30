import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import {
    displayLabelsFromDefinitions,
    fetchEffectiveStatusDefinitions,
    resolveDisplayFromLabelMap,
} from "@/lib/admin/statusDefinitionsResolve";
import SubscriptionsClient from "./SubscriptionsClient";
import { addWeeks, addMonths } from "date-fns";
import { formatFrequencyLabel } from "@/lib/adminFormatters";

export const dynamic = 'force-dynamic';

export default async function AdminSubscriptionsPage() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return <SubscriptionsClient initialData={[]} error="Unauthorized" />;
    }

    const supabase = createAdminClient();

    const { data: subs, error } = await supabase
        .from("customer_subscriptions")
        .select("id, created_at, customer_id, status, cadence, interval, start_date")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(500);

    if (error) {
        console.error("Error fetching subscriptions:", error);
        return (
            <SubscriptionsClient initialData={[]} error={error.message} />
        );
    }

    const list = subs ?? [];
    const customerIds = [...new Set(list.map((s) => s.customer_id).filter(Boolean))] as string[];

    let customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
        const { data: custRows } = await supabase
            .from("customers")
            .select("id, name")
            .in("id", customerIds);
        for (const c of custRows ?? []) {
            const row = c as { id: string; name: string | null };
            customerMap[row.id] = row.name ?? "";
        }
    }

    const subDefs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "subscriptions", { activeOnly: true });
    const subStatusLabels = displayLabelsFromDefinitions(subDefs);

    const { data: scheds } = await supabase
        .from("schedules")
        .select("customer_subscription_id, start_at, subscription_sequence")
        .in("customer_subscription_id", list.map((s) => s.id))
        .is("canceled_at", null);
    const lastBySub: Record<string, { start_at: string; sequence: number }> = {};
    for (const s of scheds ?? []) {
        const row = s as { customer_subscription_id: string; start_at: string; subscription_sequence: number };
        const cur = lastBySub[row.customer_subscription_id];
        if (!cur || (row.subscription_sequence ?? 0) > (cur.sequence ?? 0)) {
            lastBySub[row.customer_subscription_id] = { start_at: row.start_at, sequence: row.subscription_sequence ?? 0 };
        }
    }

    const rows = list.map((s) => {
        const cadence = (s as { cadence?: string }).cadence ?? "month";
        const interval = Math.max(1, Number((s as { interval?: number }).interval) || 1);
        const last = lastBySub[s.id];
        let nextPreview: string | null = null;
        if (last) {
            const lastDate = new Date(last.start_at);
            const next = cadence === "week" ? addWeeks(lastDate, interval) : addMonths(lastDate, interval);
            nextPreview = next.toISOString().slice(0, 10);
        } else if (s.start_date) {
            const startDate = new Date(s.start_date + "T12:00:00Z");
            const next = cadence === "week" ? addWeeks(startDate, interval) : addMonths(startDate, interval);
            nextPreview = next.toISOString().slice(0, 10);
        }
        const st = (s as { status?: string | null }).status != null ? String((s as { status: string }).status).trim() : "";
        const _status_display = resolveDisplayFromLabelMap(subStatusLabels, st || null, st || null);
        return {
            ...s,
            _status_display,
            _frequency_label: formatFrequencyLabel(cadence, interval),
            _customer_name: customerMap[s.customer_id] || null,
            _last_occurrence: last?.start_at ?? null,
            _next_preview: nextPreview,
        };
    });

    return (
        <SubscriptionsClient initialData={rows} error={undefined} />
    );
}
