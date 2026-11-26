"use client";

import { useEffect, useMemo, useState } from "react";
import {
    fetchOptionSetItemsBySetKey,
    mapOptionItemsToSelectOptions,
} from "@/lib/admin/location/locationDrawerFieldOptions";
import { uniqueOptionSetKeys } from "@/lib/fields/resolveSelectFieldBinding";
import { DEFAULT_PERSON_GENDER_OPTIONS } from "@/lib/admin/person/personDrawerGenderField";

export type SelectOptionChoice = { value: string; label: string };

/**
 * Instant local fallbacks for high-traffic Focus Panel selects so the editor
 * is usable while the option-set API is still in flight (first open was multi-second).
 * API results always replace these once they land.
 */
const OPTION_SET_SYNC_FALLBACKS: Readonly<Record<string, readonly SelectOptionChoice[]>> = {
    person_gender: DEFAULT_PERSON_GENDER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
};

function syncFallbacksFor(keys: readonly string[]): Record<string, SelectOptionChoice[]> {
    const out: Record<string, SelectOptionChoice[]> = {};
    for (const key of keys) {
        const fallback = OPTION_SET_SYNC_FALLBACKS[key];
        if (fallback?.length) out[key] = [...fallback];
    }
    return out;
}

/** Loads org option_set_items for admin create/intake select fields. */
export function useOptionSetSelectOptions(setKeys: readonly (string | null | undefined)[]): {
    optionsBySetKey: Record<string, SelectOptionChoice[]>;
    loading: boolean;
} {
    const normalizedKeys = useMemo(() => uniqueOptionSetKeys(setKeys), [setKeys]);
    const keysSignature = normalizedKeys.join("\0");
    const [optionsBySetKey, setOptionsBySetKey] = useState<Record<string, SelectOptionChoice[]>>(
        () => syncFallbacksFor(normalizedKeys),
    );
    // With sync fallbacks (e.g. person_gender), the editor is usable immediately —
    // do not report loading=true just because the network refresh is in flight.
    const [loading, setLoading] = useState(() => {
        if (normalizedKeys.length === 0) return false;
        const seeded = syncFallbacksFor(normalizedKeys);
        return normalizedKeys.some((k) => !seeded[k]?.length);
    });

    useEffect(() => {
        if (normalizedKeys.length === 0) {
            setOptionsBySetKey({});
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        const seeded = syncFallbacksFor(normalizedKeys);
        setOptionsBySetKey((prev) =>
            Object.keys(seeded).length > 0 ? { ...seeded, ...prev } : prev,
        );
        const needsNetwork = normalizedKeys.some((k) => !seeded[k]?.length);
        setLoading(needsNetwork);

        void (async () => {
            try {
                const init = { credentials: "include" as const };
                const entries = await Promise.all(
                    normalizedKeys.map(async (setKey) => {
                        const items = await fetchOptionSetItemsBySetKey(setKey, init);
                        const mapped = mapOptionItemsToSelectOptions(items);
                        const fallback = OPTION_SET_SYNC_FALLBACKS[setKey];
                        return [setKey, mapped.length > 0 ? mapped : fallback ? [...fallback] : []] as const;
                    }),
                );
                if (cancelled) return;
                setOptionsBySetKey(Object.fromEntries(entries));
            } catch {
                if (cancelled) return;
                setOptionsBySetKey(syncFallbacksFor(normalizedKeys));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            setLoading(false);
        };
        /**
         * `keysSignature` ONLY — deliberately not `normalizedKeys`.
         *
         * Callers pass an inline array: `IdentityFieldValue` builds
         * `editControl.kind === "select" && isEditing ? [optionSetKey] : []` during render, so
         * `setKeys` is a new reference every render and the `useMemo` above cannot hold. Listing
         * `normalizedKeys` here re-ran this effect on every render, and the effect setStates —
         * an unconditional render loop. Opening one Household identity field editor produced
         * 549 "Maximum update depth exceeded" errors, and another 372 while typing.
         *
         * The signature is the string join of those same keys, so it changes exactly when the
         * keys change and never when only their array identity does.
         */
        // eslint-disable-next-line react-hooks/exhaustive-deps -- keysSignature is normalizedKeys by value
    }, [keysSignature]);

    return { optionsBySetKey, loading };
}

/** Warm the option-set cache before the operator opens an inline Gender editor. */
export function prefetchOptionSetSelectOptions(setKeys: readonly string[]): void {
    for (const raw of setKeys) {
        const setKey = raw.trim();
        if (!setKey) continue;
        void fetchOptionSetItemsBySetKey(setKey, { credentials: "include" });
    }
}
