import { createAdminClient } from "@/lib/supabaseAdmin";
import SubscriptionsClient from "./SubscriptionsClient";
import { addWeeks, addMonths } from "date-fns";

export default async function AdminSubscriptionsPage() {
    const supabase = createAdminClient();

    const { data: subs, error } = await supabase
        .from("customer_subscriptions")
        .select("id, created_at, customer_id, status, pricing_frequency_id, start_date")
        .order("created_at", { ascending: false })
        .limit(500);

    if (error) {
        console.error("Error fetching subscriptions:", error);
        return (
            <SubscriptionsClient initialData={[]} error={error.message} />
        );
    }

    const list = subs ?? [];
    const pfIds = [...new Set(list.map((s) => s.pricing_frequency_id).filter(Boolean))] as string[];
    const customerIds = [...new Set(list.map((s) => s.customer_id).filter(Boolean))] as string[];

    let pfMap: Record<string, { frequency_label: string; recurrence_unit: string; recurrence_interval: number }> = {};
    if (pfIds.length > 0) {
        const { data: pfRows } = await supabase
            .from("pricing_frequencies")
            .select("id, frequency_label, recurrence_unit, recurrence_interval")
            .in("id", pfIds);
        for (const pf of pfRows ?? []) {
            const p = pf as { id: string; frequency_label: string; recurrence_unit?: string; recurrence_interval?: number };
            pfMap[p.id] = {
                frequency_label: p.frequency_label ?? "",
                recurrence_unit: p.recurrence_unit ?? "month",
                recurrence_interval: Math.max(1, Number(p.recurrence_interval) || 1),
            };
        }
    }

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
        const pf = pfMap[s.pricing_frequency_id];
        const last = lastBySub[s.id];
        let nextPreview: string | null = null;
        if (pf && last) {
            const lastDate = new Date(last.start_at);
            const next = pf.recurrence_unit === "week"
                ? addWeeks(lastDate, pf.recurrence_interval)
                : addMonths(lastDate, pf.recurrence_interval);
            nextPreview = next.toISOString().slice(0, 10);
        } else if (pf && s.start_date) {
            const startDate = new Date(s.start_date + "T12:00:00Z");
            const next = pf.recurrence_unit === "week"
                ? addWeeks(startDate, pf.recurrence_interval)
                : addMonths(startDate, pf.recurrence_interval);
            nextPreview = next.toISOString().slice(0, 10);
        }
        return {
            ...s,
            _frequency_label: pf?.frequency_label ?? "—",
            _customer_name: customerMap[s.customer_id] || null,
            _last_occurrence: last?.start_at ?? null,
            _next_preview: nextPreview,
        };
    });

    return (
        <SubscriptionsClient initialData={rows} error={undefined} />
    );
}
