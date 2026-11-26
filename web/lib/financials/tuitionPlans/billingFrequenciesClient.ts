import type { BillingCadence } from "@/lib/commercial/billingCadences";

const OPTION_SET_KEY = "commercial_billing_cadence";

export async function fetchBillingCadences(): Promise<BillingCadence[]> {
    const res = await fetch("/api/admin/commercial/billing-cadences", { credentials: "include" });
    if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "Could not load billing frequencies.");
    }
    const json = (await res.json()) as { cadences?: BillingCadence[] };
    return json.cadences ?? [];
}

export async function createBillingFrequency(input: {
    itemKey: string;
    label: string;
    description?: string | null;
    intervalLabel?: string | null;
    sortOrder?: number;
}): Promise<BillingCadence> {
    const metadata: Record<string, unknown> = { active: true };
    if (input.description?.trim()) metadata.description = input.description.trim();
    if (input.intervalLabel?.trim()) metadata.interval_label = input.intervalLabel.trim();

    const res = await fetch(`/api/admin/option-sets/${encodeURIComponent(OPTION_SET_KEY)}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            item_key: input.itemKey,
            label: input.label.trim(),
            sort_order: input.sortOrder ?? 0,
            metadata,
        }),
    });
    const json = (await res.json()) as {
        id?: string;
        item_key?: string;
        label?: string;
        sort_order?: number;
        metadata?: Record<string, unknown>;
        error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Could not create billing frequency.");
    return {
        id: String(json.id),
        item_key: String(json.item_key),
        label: String(json.label),
        sort_order: Number(json.sort_order ?? 0),
        metadata: json.metadata ?? {},
    };
}

export async function updateBillingFrequency(
    id: string,
    input: {
        label?: string;
        description?: string | null;
        intervalLabel?: string | null;
        active?: boolean;
        sortOrder?: number;
        metadata?: Record<string, unknown>;
    },
): Promise<BillingCadence> {
    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
    if (input.description !== undefined) {
        if (input.description?.trim()) metadata.description = input.description.trim();
        else delete metadata.description;
    }
    if (input.intervalLabel !== undefined) {
        if (input.intervalLabel?.trim()) metadata.interval_label = input.intervalLabel.trim();
        else delete metadata.interval_label;
    }
    if (input.active !== undefined) metadata.active = input.active;

    const body: Record<string, unknown> = { metadata };
    if (input.label !== undefined) body.label = input.label.trim();
    if (input.sortOrder !== undefined) body.sort_order = input.sortOrder;

    const res = await fetch(
        `/api/admin/option-sets/${encodeURIComponent(OPTION_SET_KEY)}/items/${encodeURIComponent(id)}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
        },
    );
    const json = (await res.json()) as {
        id?: string;
        item_key?: string;
        label?: string;
        sort_order?: number;
        metadata?: Record<string, unknown>;
        error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Could not update billing frequency.");
    return {
        id: String(json.id),
        item_key: String(json.item_key),
        label: String(json.label),
        sort_order: Number(json.sort_order ?? 0),
        metadata: json.metadata ?? {},
    };
}
