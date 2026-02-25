"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

export type EntityLabelSet = { singular?: string; plural?: string };

export type EntityLabelsMap = Record<string, EntityLabelSet>;

type EntityLabelsContextValue = {
    labels: EntityLabelsMap;
    loading: boolean;
    getLabel: (entityType: string, kind: "singular" | "plural") => string;
};

const EntityLabelsContext = createContext<EntityLabelsContextValue | null>(null);

const DEFAULT_LABELS: EntityLabelsMap = {
    customer_members: { singular: "Member", plural: "Members" },
};

export function EntityLabelsProvider({ children }: { children: ReactNode }) {
    const [labels, setLabels] = useState<EntityLabelsMap>(DEFAULT_LABELS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/admin/entity-labels")
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { labels?: EntityLabelsMap } | null) => {
                if (cancelled || !data?.labels) return;
                setLabels((prev) => ({ ...DEFAULT_LABELS, ...prev, ...data.labels }));
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const getLabel = useCallback(
        (entityType: string, kind: "singular" | "plural"): string => {
            const set = labels[entityType];
            const value = set?.[kind];
            if (value) return value;
            return kind === "plural" ? "Items" : "Item";
        },
        [labels]
    );

    const value = useMemo(
        () => ({ labels, loading, getLabel }),
        [labels, loading, getLabel]
    );

    return (
        <EntityLabelsContext.Provider value={value}>
            {children}
        </EntityLabelsContext.Provider>
    );
}

export function useEntityLabels(): EntityLabelsContextValue {
    const ctx = useContext(EntityLabelsContext);
    if (!ctx) {
        return {
            labels: DEFAULT_LABELS,
            loading: false,
            getLabel: (entityType: string, kind: "singular" | "plural") => {
                const set = DEFAULT_LABELS[entityType];
                const value = set?.[kind];
                if (value) return value;
                return kind === "plural" ? "Items" : "Item";
            },
        };
    }
    return ctx;
}
