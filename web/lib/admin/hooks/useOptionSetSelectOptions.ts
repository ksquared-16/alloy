"use client";

import { useEffect, useMemo, useState } from "react";
import {
    fetchOptionSetItemsBySetKey,
    mapOptionItemsToSelectOptions,
} from "@/lib/admin/location/locationDrawerFieldOptions";
import { uniqueOptionSetKeys } from "@/lib/fields/resolveSelectFieldBinding";

export type SelectOptionChoice = { value: string; label: string };

/** Loads org option_set_items for admin create/intake select fields. */
export function useOptionSetSelectOptions(setKeys: readonly (string | null | undefined)[]): {
    optionsBySetKey: Record<string, SelectOptionChoice[]>;
    loading: boolean;
} {
    const normalizedKeys = useMemo(() => uniqueOptionSetKeys(setKeys), [setKeys]);
    const keysSignature = normalizedKeys.join("\0");
    const [optionsBySetKey, setOptionsBySetKey] = useState<Record<string, SelectOptionChoice[]>>({});
    const [loading, setLoading] = useState(normalizedKeys.length > 0);

    useEffect(() => {
        if (normalizedKeys.length === 0) {
            setOptionsBySetKey({});
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        setLoading(true);

        void (async () => {
            try {
                const init = { credentials: "include" as const };
                const entries = await Promise.all(
                    normalizedKeys.map(async (setKey) => {
                        const items = await fetchOptionSetItemsBySetKey(setKey, init);
                        return [setKey, mapOptionItemsToSelectOptions(items)] as const;
                    }),
                );
                if (cancelled) return;
                setOptionsBySetKey(Object.fromEntries(entries));
            } catch {
                if (cancelled) return;
                setOptionsBySetKey({});
            } finally {
                // Always clear loading for this generation — a cancelled in-flight
                // request must not leave the select permanently disabled.
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            // Unmount / key change: drop the busy flag so a remounted editor is not
            // stuck disabled if the prior fetch never lands on this instance.
            setLoading(false);
        };
    }, [keysSignature, normalizedKeys]);

    return { optionsBySetKey, loading };
}
