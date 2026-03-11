"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const CACHE_KEY = "entity_labels_cache";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type EntityLabelEntry = { singular: string | null; plural: string | null };
export type EntityLabelsMap = Record<string, EntityLabelEntry>;

/** Default display labels when entity_labels has no override (DB entity type unchanged). */
const DEFAULT_ENTITY_LABELS: Record<string, { singular: string; plural: string }> = {
    vendors: { singular: "Vendor", plural: "Vendors" },
    jobs: { singular: "Job", plural: "Jobs" },
    schedules: { singular: "Schedule", plural: "Schedules" },
    customers: { singular: "Customer", plural: "Customers" },
    contacts: { singular: "Contact", plural: "Contacts" },
    customer_members: { singular: "Member", plural: "Members" },
    opportunities: { singular: "Opportunity", plural: "Opportunities" },
    workflows: { singular: "Workflow", plural: "Workflows" },
    locations: { singular: "Location", plural: "Locations" },
    subscriptions: { singular: "Subscription", plural: "Subscriptions" },
    payments: { singular: "Payment", plural: "Payments" },
    messages: { singular: "Message", plural: "Messages" },
    service_offerings: { singular: "Service Offering", plural: "Service Offerings" },
    service_plan_templates: { singular: "Plan Template", plural: "Plan Templates" },
    discount_redemptions: { singular: "Discount Redemption", plural: "Discount Redemptions" },
};

/**
 * Get display label for an entity type. Use for UI only; DB entity types stay vendors/jobs/etc.
 * @param labels - from useEntityLabels().labels
 * @param entityType - e.g. "vendors", "jobs"
 * @param form - "singular" or "plural"
 */
export function getEntityLabel(
    labels: EntityLabelsMap,
    entityType: string,
    form: "singular" | "plural"
): string {
    const entry = labels[entityType];
    const value = form === "singular" ? entry?.singular : entry?.plural;
    if (value != null && value.trim() !== "") return value.trim();
    const defaults = DEFAULT_ENTITY_LABELS[entityType];
    if (defaults) return defaults[form];
    const fallback = form === "singular" ? entityType.replace(/s$/, "") : entityType;
    return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

type EntityLabelsContextValue = {
    labels: EntityLabelsMap;
    loading: boolean;
    refreshEntityLabels: () => Promise<void>;
};

const EntityLabelsContext = createContext<EntityLabelsContextValue | null>(null);

function loadFromCache(): EntityLabelsMap | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { at, data } = JSON.parse(raw) as { at: number; data: { entity_type: string; singular: string | null; plural: string | null }[] };
        if (Date.now() - at > CACHE_TTL_MS) return null;
        const map: EntityLabelsMap = {};
        for (const row of data ?? []) {
            map[row.entity_type] = { singular: row.singular ?? null, plural: row.plural ?? null };
        }
        return map;
    } catch {
        return null;
    }
}

function saveToCache(effective: { entity_type: string; singular: string | null; plural: string | null }[]) {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: effective }));
    } catch (_) {}
}

function buildMap(effective: { entity_type: string; singular: string | null; plural: string | null }[]): EntityLabelsMap {
    const map: EntityLabelsMap = {};
    for (const row of effective) {
        map[row.entity_type] = { singular: row.singular ?? null, plural: row.plural ?? null };
    }
    return map;
}

export function useEntityLabels(): EntityLabelsContextValue {
    const ctx = useContext(EntityLabelsContext);
    if (!ctx) throw new Error("useEntityLabels must be used within EntityLabelsProvider");
    return ctx;
}

export function EntityLabelsProvider({ children }: { children: ReactNode }) {
    // Always start with {} so server and client first paint match (avoids hydration #418 when cache exists).
    const [labels, setLabels] = useState<EntityLabelsMap>(() => ({}));
    const [loading, setLoading] = useState(true);

    const refreshEntityLabels = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/entity-labels");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const effective = (json as { effective?: { entity_type: string; singular: string | null; plural: string | null }[] }).effective ?? [];
            const map = buildMap(effective);
            setLabels(map);
            saveToCache(effective);
        } catch (_) {
            // keep previous labels on error
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const cached = loadFromCache();
        if (Object.keys(cached ?? {}).length > 0) {
            setLabels(cached!);
            setLoading(false);
            refreshEntityLabels();
            return;
        }
        refreshEntityLabels();
    }, [refreshEntityLabels]);

    return (
        <EntityLabelsContext.Provider value={{ labels, loading, refreshEntityLabels }}>
            {children}
        </EntityLabelsContext.Provider>
    );
}
