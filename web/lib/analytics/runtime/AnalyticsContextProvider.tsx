"use client";

/**
 * AnalyticsContextProvider — one React context at the Analytics surface shell.
 *
 * Reads filter state from the URL (linkable, back-button safe) and merges it with
 * server-trusted scope (orgId, accessScope) passed as props. Heavy codec logic lives
 * in `analyticsContextUrl.ts` and is unit-tested there; this provider is thin wiring.
 *
 * Doctrine: docs/platform/core/operational-calculations.md
 */

import { createContext, useCallback, useContext, useMemo, type ReactElement, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import type { AnalyticsContext } from "@/lib/analytics/runtime/types";
import {
    decodeAnalyticsFilters,
    encodeAnalyticsFiltersString,
    type AnalyticsFilterState,
} from "@/lib/analytics/runtime/analyticsContextUrl";

/** Server-trusted scope — never derived from the URL. */
export type AnalyticsContextScope = {
    orgId: string;
    accessScope: AdminAccessScopeDimensions;
    surfaceId: string;
    surfaceKey?: string;
};

export type AnalyticsContextValue = {
    context: AnalyticsContext;
    filters: AnalyticsFilterState;
    /** Replace the entire filter state (pushes a new history entry). */
    setFilters: (next: AnalyticsFilterState) => void;
    /** Merge a partial change into the current filter state. */
    patchFilters: (patch: Partial<AnalyticsFilterState>) => void;
};

/** Merge server-trusted scope with URL filter state into a full AnalyticsContext. */
export function buildAnalyticsContext(
    scope: AnalyticsContextScope,
    filters: AnalyticsFilterState,
): AnalyticsContext {
    return {
        orgId: scope.orgId,
        accessScope: scope.accessScope,
        surfaceId: scope.surfaceId,
        surfaceKey: scope.surfaceKey,
        dateRange: filters.dateRange,
        comparisonPeriod: filters.comparisonPeriod,
        siteLocationIds: filters.siteLocationIds ?? null,
        departmentId: filters.departmentId ?? null,
        programIds: filters.programIds ?? null,
        roomLocationIds: filters.roomLocationIds ?? null,
        businessProcessKey: filters.businessProcessKey ?? null,
        workUnitId: filters.workUnitId ?? null,
        stageKeys: filters.stageKeys ?? null,
        staffIds: filters.staffIds ?? null,
        accountCategory: filters.accountCategory ?? null,
        agingBucket: filters.agingBucket ?? null,
        drillSelection: filters.drillSelection ?? null,
    };
}

const AnalyticsContextReactContext = createContext<AnalyticsContextValue | null>(null);

export function AnalyticsContextProvider({
    scope,
    children,
}: {
    scope: AnalyticsContextScope;
    children: ReactNode;
}): ReactElement {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const filters = useMemo(
        () => decodeAnalyticsFilters(searchParams ?? new URLSearchParams()),
        [searchParams],
    );

    const setFilters = useCallback(
        (next: AnalyticsFilterState) => {
            const qs = encodeAnalyticsFiltersString(next);
            const path = pathname ?? "";
            router.push(qs ? `${path}?${qs}` : path);
        },
        [router, pathname],
    );

    const patchFilters = useCallback(
        (patch: Partial<AnalyticsFilterState>) => {
            setFilters({ ...filters, ...patch });
        },
        [filters, setFilters],
    );

    const value = useMemo<AnalyticsContextValue>(
        () => ({
            context: buildAnalyticsContext(scope, filters),
            filters,
            setFilters,
            patchFilters,
        }),
        [scope, filters, setFilters, patchFilters],
    );

    return (
        <AnalyticsContextReactContext.Provider value={value}>
            {children}
        </AnalyticsContextReactContext.Provider>
    );
}

export function useAnalyticsContext(): AnalyticsContextValue {
    const value = useContext(AnalyticsContextReactContext);
    if (!value) {
        throw new Error("useAnalyticsContext must be used within an AnalyticsContextProvider");
    }
    return value;
}
